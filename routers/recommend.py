"""
POST /api/predict          검색어/슬라이더 → 추천 TOP 5
POST /api/region           행정동 하나의 시설 정보
POST /api/region/explain   행정동 하나의 LLM 설명
POST /api/chat             추천 결과 후속 질문
"""

from fastapi import APIRouter
from pydantic import BaseModel

from services.coords import lookup_coords
from services.engine import get_regions, get_facilities, get_region_explain, get_chat_answer
from services.floorplan import find_floorplan

router = APIRouter(prefix="/api", tags=["추천"])


# ==========================================
# 요청 형태
# ==========================================
# 어떤 값이 어떤 타입으로 오는지 미리 적어 두면 FastAPI 가 검증해 준다.
# Flask 때는 int(body.get('area', 59)) 처럼 매번 방어해야 했다
class PredictRequest(BaseModel):
    query: str | None = None

    greenery: int = 3
    safety: int = 3
    transport: int = 3
    commercial: int = 3
    medical: int = 3
    education: int = 3
    culture: int = 3

    area: int = 59
    bldgType: str | None = None

    dealType: str | None = None
    salePrice: int | None = None
    jeonseDeposit: int | None = None
    wolseDeposit: int | None = None
    wolseRent: int | None = None


class RegionRequest(BaseModel):
    gu: str
    dong: str
    # 설명을 만들려면 "무엇을 찾던 사람인지" 가 필요하다
    query: str | None = None
    weights: dict | None = None
    scores: dict | None = None


class ChatRequest(BaseModel):
    question: str
    # 지금 화면에 떠 있는 추천 결과를 같이 받는다.
    # 서버는 요청 사이에 아무것도 기억하지 않기 때문이다
    regions: list | None = None
    weights: dict | None = None
    # 대화 기록. 지금은 안 쓰지만 자리를 열어 둔다 —
    # 로그인·저장 기능을 붙이면 여기로 들어온다
    history: list | None = None


# ==========================================
# API 라우트: 예측 및 추천 수행
# ==========================================

@router.post("/predict")      # @app.post("/api/predict") 였던 것
def predict(body: PredictRequest):
    """추천 요청을 처리한다.

    query 가 있으면 LLM 을, 없으면 슬라이더 값을 쓴다.
    분기는 services/engine.py 가 담당한다
    """
    # services 는 사전을 기대하므로 모델을 사전으로 바꿔 넘긴다
    prefs = body.model_dump()

    weights, regions, explanation, extracted_housing = get_regions(prefs)
    
    top_regions = []
    for idx, r in enumerate(regions):
        gu, dong = r["name"].split(" ", 1)
        lat, lng = lookup_coords(gu, dong)

        top_regions.append({
            "rank": idx + 1,
            "name": f"서울특별시 {r['name']}",
            "lat": lat,
            "lng": lng,
            "score": r["total"],
            "scores": r["scores"],
            "price": r.get("price"),   # housing 조건이 없었으면 None — 프론트에서 탭을 숨기거나 안내문으로 대체
        })

    # 가중치 합이 클수록 높은 점수
    base_score = 40 + sum(weights.values()) * 1.3
    if body.area >= 59:
        base_score += 5

    return {
        "score": round(min(98.5, max(30.0, base_score)), 1),
        "query": body.query or "",
        "topRegions": top_regions,
        "floorplanPath": find_floorplan(body.area),
        "fallback": False,
        "explanation": explanation,
        "weights": weights,
        "housing": extracted_housing,   # {"건물유형":"아파트","거래유형":"매매","targets":{"예산":40000}} 또는 null
    }


@router.post("/region")
def region_detail(body: RegionRequest):
    """행정동 하나의 시설 정보를 돌려준다. 지도 핀을 눌렀을 때 부른다."""
    return {
        "gu": body.gu,
        "dong": body.dong,
        **get_facilities(body.gu, body.dong, limit=5),
    }


@router.post("/region/explain")
def region_explain_api(body: RegionRequest):
    """동네 하나에 대한 LLM 설명을 만든다.

    /api/region 과 나눈 이유 —
    시설 정보는 즉시 나오지만 설명은 3~5초 걸린다.
    한 요청으로 묶으면 빠른 쪽까지 기다리게 된다
    """
    return {
        "explanation": get_region_explain(
            body.gu, body.dong,
            query=body.query or "",
            weights=body.weights,
            scores=body.scores,
        )
    }


@router.post("/chat")
def chat_api(body: ChatRequest):
    """추천 결과에 대한 후속 질문에 답한다."""
    return {
        "answer": get_chat_answer(
            body.question,
            regions=body.regions,
            weights=body.weights,
            history=body.history,
        )
    }
