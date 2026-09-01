"""
POST /api/predict          검색어/슬라이더 → 추천 TOP 5
POST /api/region           행정동 하나의 시설 정보
POST /api/region/explain   행정동 하나의 LLM 설명
POST /api/chat             추천 결과 후속 질문
GET  /api/regions/gudong   구 → 동 목록 (회원가입 2단 드롭다운용)
"""

from collections import defaultdict

from fastapi import APIRouter
from pydantic import BaseModel

from services.coords import COORDS, lookup_coords
from services.engine import KEY_MAP, get_regions, get_facilities, get_region_explain, get_chat_answer
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

    # --- 1차 유형 카드에서 넘어온 값 ---
    # 1차와 2차가 완전히 다른 동네를 보여 주면
    # "아까 그 동네는 어디 갔지" 가 된다. 뿌리를 이어 준다
    firstWeights: dict | None = None   # 1차 유형이 만든 7개 가중치
    firstSpots: list | None = None     # 1차에서 보여 준 동네 이름들
    typeName: str | None = None        # "골목 마당발형"


class RegionRequest(BaseModel):
    gu: str
    dong: str
    # 설명을 만들려면 "무엇을 찾던 사람인지" 가 필요하다
    query: str | None = None
    weights: dict | None = None
    scores: dict | None = None
    # 순위를 매길 때 실제로 쓰인 가격 조건. /api/predict 응답의 housing 을
    # 프론트가 그대로 실어 보낸다 — 프론트에서 새로 조립하지 않는다.
    # 가격 조건이 없었으면 None (엔진이 시세 이야기를 안 꺼낸다)
    housing: dict | None = None


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

    # 1차 유형 카드에서 넘어왔고 슬라이더를 직접 만지지 않았으면,
    # 1차 가중치를 "확정값"으로 엔진에 넘긴다. 이게 없으면 1차에서 본 동네가
    # 2차에서 전부 사라진다(실측: fromFirst 전부 False).
    # 영문↔한국어 대응은 services/engine.py 의 KEY_MAP 하나만 쓴다 —
    # 여기서 다시 적으면 언젠가 어긋난다
    fixed_weights = None
    if body.firstWeights:
        touched = any(prefs.get(eng, 3) != 3 for eng in KEY_MAP)
        if not touched:
            fixed_weights = {kor: float(body.firstWeights[kor])
                             for kor in KEY_MAP.values() if kor in body.firstWeights}

    weights, regions, explanation, used_housing = get_regions(
        prefs, weights_override=fixed_weights)
    
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

    # 1차에서 보여 준 동네가 2차 목록에 있으면 표시해 준다.
    # 예산 때문에 빠졌다면 그것도 알려 준다 — 사라진 이유를 알아야 납득한다.
    # name 은 "서울특별시 구 동" 이므로 마지막 조각이 동 이름이다
    first_names = {s.get("dong") for s in (body.firstSpots or [])
                   if isinstance(s, dict) and s.get("dong")}
    for r in top_regions:
        r["fromFirst"] = r["name"].split(" ")[-1] in first_names
    dropped = sorted(first_names - {r["name"].split(" ")[-1] for r in top_regions})

    return {
        "score": round(min(98.5, max(30.0, base_score)), 1),
        "query": body.query or "",
        "topRegions": top_regions,
        "firstTypeName": body.typeName or "",
        "droppedFromFirst": dropped,
        "floorplanPath": find_floorplan(body.area),
        "fallback": False,
        "explanation": explanation,
        "weights": weights,
        "housing": used_housing,   # {"건물유형":"아파트","거래유형":"매매","targets":{"예산":40000}} 또는 null
    }


@router.post("/region")
def region_detail(body: RegionRequest):
    """행정동 하나의 시설 정보를 돌려준다. 지도 핀을 눌렀을 때 부른다."""
    return {
        "gu": body.gu,
        "dong": body.dong,
        **get_facilities(body.gu, body.dong, limit=5),
    }


@router.get("/regions/gudong")
def region_gudong():
    """구 → 그 구에 속한 동 목록. 회원가입 화면의 2단 드롭다운이 쓴다.

    427개를 한 번에 늘어놓으면 고르기 어려우니 구(25개)를 먼저 고르게 한다.
    프론트에 목록을 하드코딩하면 data/동_좌표.csv 와 두 벌이 되어 언젠가
    어긋나므로, 이미 메모리에 올라와 있는 COORDS 를 그대로 재사용한다
    """
    gudong = defaultdict(list)
    for gu, dong in COORDS:
        gudong[gu].append(dong)

    return {gu: sorted(dongs) for gu, dongs in sorted(gudong.items())}


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
            housing=body.housing,
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
