"""
LIFE,FIT 웹 서버 (FastAPI)

추천 계산과 LLM 은 life-fit-embed 가 담당한다.
이 파일은 요청을 받아 services/ 에 넘기고, 결과를 화면 형식으로 바꿔 돌려준다.

실행:  uvicorn main:app --reload --port 5000
"""

import os
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# ==========================================
# 1. 폴더 절대 경로 설정
# ==========================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, 'data')
FRONTEND_DIR = os.path.join(BASE_DIR, 'frontend')

app = FastAPI(title="LIFE,FIT")


# ==========================================
# 2. 데이터셋 로드 (data/ 폴더 내부 참조)
# ==========================================

from services.coords import lookup_coords
from services.engine import get_regions, get_facilities, get_region_explain, get_chat_answer
from services.floorplan import find_floorplan


# ==========================================
# 3. 요청 형태
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
    builtYear: int = 2015
    bldgType: str = "1"


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
# 4. API 라우트: 예측 및 추천 수행
# ==========================================
@app.post("/api/predict")
def predict(body: PredictRequest):
    """추천 요청을 처리한다.

    query 가 있으면 LLM 을, 없으면 슬라이더 값을 쓴다.
    분기는 services/engine.py 가 담당한다
    """
    # services 는 사전을 기대하므로 모델을 사전으로 바꿔 넘긴다
    prefs = body.model_dump()

    weights, regions, explanation = get_regions(prefs)

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
        })

    # 가중치 합이 클수록 높은 점수
    base_score = 40 + sum(weights.values()) * 1.3
    if body.area >= 59:
        base_score += 5
    if body.builtYear >= 2015:
        base_score += 5

    return {
        "score": round(min(98.5, max(30.0, base_score)), 1),
        "query": body.query or "",
        "topRegions": top_regions,
        "floorplanPath": find_floorplan(body.area),
        "fallback": False,
        "explanation": explanation,
        "weights": weights,
    }


@app.post("/api/region")
def region_detail(body: RegionRequest):
    """행정동 하나의 시설 정보를 돌려준다. 지도 핀을 눌렀을 때 부른다."""
    return {
        "gu": body.gu,
        "dong": body.dong,
        **get_facilities(body.gu, body.dong, limit=5),
    }


@app.post("/api/region/explain")
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


@app.post("/api/chat")
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

# ==========================================
# 5. 프론트엔드 정적 서빙 라우트
# ==========================================
@app.get("/")
def serve_index():
    return FileResponse(os.path.join(FRONTEND_DIR, 'index.html'))


# 평면도는 data/ 안에 있어 따로 길을 열어 준다
app.mount("/LH평면도", StaticFiles(directory=os.path.join(DATA_DIR, 'LH평면도')))

# frontend 전체를 뿌린다. 맨 마지막에 둬야 위의 경로들을 가로채지 않는다
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True))