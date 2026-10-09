"""
POST /api/predict          검색어/슬라이더 → 추천 TOP 5
POST /api/region           행정동 하나의 시설 정보
POST /api/region/explain   행정동 하나의 LLM 설명
POST /api/chat             추천 결과 후속 질문
GET  /api/regions/gudong   구 → 동 목록 (회원가입 2단 드롭다운용)
GET  /api/history          검색·대화 기록 조회 (anonId 기준)
GET  /api/quota            오늘 남은 AI 질문 횟수
"""

from collections import defaultdict

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from services.coords import COORDS, lookup_coords
from services.engine import (
    KEY_MAP, get_regions, get_facilities, get_region_explain, get_chat_answer,
    save_search, save_chat, get_history, ANON_ID,
)
from services import quota
from services.floorplan import find_floorplans

router = APIRouter(prefix="/api", tags=["추천"])


# ==========================================
# 요청 형태
# ==========================================
# 어떤 값이 어떤 타입으로 오는지 미리 적어 두면 FastAPI 가 검증해 준다.
# Flask 때는 int(body.get('area', 59)) 처럼 매번 방어해야 했다
class PredictRequest(BaseModel):
    query: str | None = None
    anonId: str | None = None      # 기기 단위 익명 ID. 검색어 기록에 쓴다

    greenery: int = 3
    safety: int = 3
    transport: int = 3
    commercial: int = 3
    medical: int = 3
    education: int = 3
    culture: int = 3

    area: int = 59
    bldgType: str | None = None
    housePicks: list[str] | None = None   # 1차 집 조건 키워드("방이 많은" 등). 평면도 고를 때만 쓴다

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
    anonId: str | None = None      # 기기 단위 익명 ID. 대화 기록에 쓴다


# ==========================================
# API 라우트: 예측 및 추천 수행
# ==========================================

def _member_persona_text(request: Request) -> str:
    """로그인한 회원이면 저장된 가입 설문 글 중 다섯 칸. 손님이거나 못 받으면 빈 글.

    글은 quota 가 토큰을 확인할 때 같이 받아 둔 것이다(엔진 /auth/me, 토큰마다 한 번) — 여기서 엔진을 다시 부르지 않는다.
    못 받았으면(만료 토큰 · 엔진 꺼짐) 평면도를 못 고르는 게 아니라 가구 구성을 모르는 것뿐이므로 빈 글로 간다"""
    persona = quota.persona(request)
    # 엔진 app/core/config.py 의 CHUNK_COLUMNS 에 있는 이름만. 저장소가 둘이라 import 못 하니 이름을 지어내지 않게 거기를 보고 적는다.
    # 평면도가 읽는 낱말이 흩어져 있다 — 가족은 family, "운동기구"는 sports, "악기·피아노"(취미 답 h1 도 여기)는 arts,
    # "요리·집밥"은 culinary, "재택·작업실"은 professional. 없는 이름을 적으면 .get() 이 조용히 빈 글을 준다(10-08 에 그랬다)
    columns = ("family_persona", "sports_persona", "arts_persona", "culinary_persona", "professional_persona")
    return " ".join(persona.get(k) or "" for k in columns)


def _floorplan_fields(body: PredictRequest, request: Request) -> dict:
    """응답의 평면도 칸 셋. 아파트일 때만 고른다 — 가격 조건을 끈 검색(bldgType None)은 화면 기본값이 아파트라 같이 친다.
    글(검색어 — 설문 답을 이어 보낸 것도 여기로 온다 — 와 회원의 저장된 가족·취미 글)에서 가구 구성을 읽고,
    1차 집 조건 키워드를 더해 도면 3~4장을 고른다"""
    if body.bldgType not in (None, "아파트"):
        return {"floorplans": [], "floorplanNote": "", "floorplanMode": "off"}
    text = f"{body.query or ''} {_member_persona_text(request)}"
    got = find_floorplans(body.area, text=text, house_picks=body.housePicks)
    return {"floorplans": got["plans"], "floorplanNote": got["note"], "floorplanMode": got["mode"]}


@router.post("/predict")      # @app.post("/api/predict") 였던 것
def predict(body: PredictRequest, request: Request):
    """추천 요청을 처리한다.

    query 가 있으면 LLM 을, 없으면 슬라이더 값을 쓴다.
    분기는 services/engine.py 가 담당한다
    """
    # services 는 사전을 기대하므로 모델을 사전으로 바꿔 넘긴다
    prefs = body.model_dump()

    # 검색어가 있을 때만 Claude 를 부르므로 그때만 한도를 쓴다
    if body.query:
        quota.consume(request)

    # 남의 회원 번호로는 기록하지 않는다 — 기록은 그 회원의 성향 제안의 재료가 된다
    if body.query and body.anonId and quota.own(request, body.anonId):
        save_search(body.anonId, body.query)

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

    # 1차에서 보여 준 동네가 2차 목록에 있으면 표시해 준다.
    # 예산 때문에 빠졌다면 그것도 알려 준다 — 사라진 이유를 알아야 납득한다.
    # name 은 "서울특별시 구 동" 이므로 마지막 조각이 동 이름이다
    first_names = {s.get("dong") for s in (body.firstSpots or [])
                   if isinstance(s, dict) and s.get("dong")}
    for r in top_regions:
        r["fromFirst"] = r["name"].split(" ")[-1] in first_names
    dropped = sorted(first_names - {r["name"].split(" ")[-1] for r in top_regions})

    return {
        # 1위 동네의 종합 점수(엔진 recommend 의 total). 전에는 가중치 합으로 만든 가짜 숫자였다(2026-10-06 까지)
        "score": round(top_regions[0]["score"], 1) if top_regions else None,
        "query": body.query or "",
        "topRegions": top_regions,
        "firstTypeName": body.typeName or "",
        "droppedFromFirst": dropped,
        **_floorplan_fields(body, request),
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
def chat_api(body: ChatRequest, request: Request):
    """추천 결과에 대한 후속 질문에 답한다."""
    remaining = quota.consume(request)["remaining"]
    answer = get_chat_answer(
        body.question,
        regions=body.regions,
        weights=body.weights,
        history=body.history,
        # 회원 전용 도구(좋아요 · 닮은 회원)는 토큰으로 확인한 회원에게만 연다. body.anonId 를 그대로 넘기면
        # 로그아웃한 사람이 남의 회원 번호를 적어 보내 그 회원 기준의 답을 받을 수 있다
        anon_id=quota.member_id(request),
    )

    if body.anonId and quota.own(request, body.anonId):
        save_chat(body.anonId, body.question, answer)

    return {"answer": answer, "remaining": remaining}


@router.get("/quota")
def quota_api(request: Request):
    """오늘 남은 AI 질문 횟수. 채팅창이 열릴 때 부른다."""
    return quota.status(request)


@router.get("/history")
def history_api(request: Request, anonId: str = Query(pattern=ANON_ID)):
    """메뉴 > 검색 및 대화 기록 저장소에서 부른다. 회원 번호로 쌓인 기록은 본인만 본다"""
    if not quota.own(request, anonId):
        raise HTTPException(403, "본인 기록만 볼 수 있다")
    return get_history(anonId)
