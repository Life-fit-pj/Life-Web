# Last updated: 2026-09-09
"""
추천 엔진(Life-Embed-jh) 호출부.

이 파일만 엔진 저장소를 안다. 다른 파일은 몰라도 된다.
엔진을 바꾸더라도 여기만 고치면 된다.

REFACTOR.md 결정 이후로는 sys.path 로 코드를 직접 불러오지 않고, Life-Embed-jh가
자체적으로 띄운 FastAPI 서버(app.main:app)를 httpx 로 호출한다 — 무거운 임베딩
의존성(sentence-transformers 등)을 이 프로세스에 같이 싣지 않고, 동기 임베딩
추론이 이 서버의 이벤트 루프를 막지 않게 하려는 것이다(자세한 배경은
Life-Embed-jh/docs/REFACTOR.md ADR-0001).

바뀐 건 "함수를 어떻게 부르나"뿐이다. 함수 이름·인자·반환값·예외(InvalidPatch,
없으면 None)는 예전 sys.path 직접 호출 때와 그대로다 — routers/*.py 는 한 줄도
안 고쳐도 된다.
"""

import os
from urllib.parse import quote

import httpx
from dotenv import load_dotenv
from pathlib import Path

# Life-Web/.env 를 읽는다 (main.py 가 어느 위치에서 실행되든 경로가 고정되도록)
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

EMBED_API_BASE = os.environ.get("EMBED_API_BASE", "http://127.0.0.1:8000")

# 커넥션 재사용 — 요청마다 새로 만들지 않는다 (ADR-0001 부정적 영향 항목 참고)
_client = httpx.Client(base_url=EMBED_API_BASE, timeout=30.0)


class InvalidPatch(Exception):
    """값이 규칙에 안 맞을 때. Life-Embed-jh 가 422 + {"detail": {칸: 이유}} 로 응답하면 여기로 바꾼다.

    admin.py 라우터가 예전부터 잡던 예외라 이름·필드(.errors)를 그대로 유지한다.
    """
    def __init__(self, errors: dict):
        self.errors = errors
        super().__init__(str(errors))


def _call(method: str, path: str, *, json=None, params=None, headers=None, none_on=(), patch_error_on=()):
    """엔진 API 공통 호출.

    none_on: 이 상태코드들은 예외 대신 None 을 돌려준다("없다"는 뜻이었던 기존 계약).
    patch_error_on: 이 상태코드들은 InvalidPatch(detail) 를 던진다.
    그 외 4xx/5xx 는 httpx.HTTPStatusError 그대로 올라간다 — 엔진 서버가 죽었다는 뜻이라
    조용히 삼키면 더 위험하다.
    """
    resp = _client.request(method, path, json=json, params=params, headers=headers)
    if resp.status_code in none_on:
        return None
    if resp.status_code in patch_error_on:
        raise InvalidPatch(resp.json()["detail"])
    resp.raise_for_status()
    if resp.status_code == 204:
        return None
    return resp.json()


print(f"✅ 엔진 API 연결 대상: {EMBED_API_BASE}")


# 프론트는 영문 키, 엔진은 한국어 지표명을 쓴다.
# 경계에서 한 번만 변환한다
KEY_MAP = {
    'greenery': '녹지',
    'safety': '안전',
    'transport': '교통',
    'commercial': '상권',
    'medical': '의료',
    'education': '교육',
    'culture': '문화',
}


def to_korean_weights(user_prefs):
    """프론트의 영문 슬라이더 값을 한국어 가중치 딕셔너리로 바꾼다."""
    weights = {}
    for eng, kor in KEY_MAP.items():
        try:
            weights[kor] = float(user_prefs.get(eng, 3))
        except (ValueError, TypeError):
            weights[kor] = 3.0
    return weights


def to_housing(prefs):
    """화면의 건물유형·거래유형·예산 슬라이더를 엔진의 housing 형태로 바꾼다.

    '가격 상관없음'이면 bldgType/dealType 이 이미 None 으로 온다
    (frontend/ui/result.js 의 isPriceAny() 처리 — 그대로 유지).
    """
    bldg = prefs.get("bldgType")
    deal = prefs.get("dealType")
    if not bldg or bldg == "ANY" or not deal:
        return None

    if deal == "매매":
        예산 = prefs.get("salePrice")
    elif deal == "전세":
        예산 = prefs.get("jeonseDeposit")
    else:  # 월세
        예산 = prefs.get("wolseRent")

    if not 예산:
        return None

    targets = {"예산": 예산}
    if deal == "월세" and prefs.get("wolseDeposit"):
        targets["보증금"] = prefs["wolseDeposit"]

    return {"건물유형": bldg, "거래유형": deal, "targets": targets}


# ── 추천 ─────────────────────────────────────────

def search(query, top_k=5, housing_override=None, weights_override=None):
    """검색어 → 가중치 + TOP 5 + 설명문."""
    return _call("POST", "/search", json={
        "query": query, "top_k": top_k,
        "housing_override": housing_override, "weights_override": weights_override,
    })


def recommend_by_weights(weights, top_k=5, housing=None):
    """가중치 → TOP 5."""
    return _call("POST", "/recommend", json={
        "weights": weights, "top_k": top_k, "housing": housing,
    })


def recommend_by_weights_explained(weights, persona_query, top_k=5, housing=None):
    """가중치 + 사람 묘사 문장 → TOP 5 + 설명문."""
    return _call("POST", "/recommend/explained", json={
        "weights": weights, "persona_query": persona_query,
        "top_k": top_k, "housing": housing,
    })


def get_regions(user_prefs, weights_override=None):
    """추천 TOP 5 를 만든다.

    weights_override 는 "화면이 이미 확정한 가중치"다 —
    1차 유형 카드가 키워드로 만든 7개 값. 이게 있으면 엔진이 검색어를 다시
    읽어 만든 가중치 대신 이걸 쓴다. 반드시 search() 안으로 넘겨야 한다 —
    반환값의 weights 만 바꾸면 regions·explanation 은 옛 가중치로 만들어진
    상태로 남아 응답이 서로 다른 기준을 가리키게 된다
    """
    query = (user_prefs.get('query') or '').strip()
    housing = to_housing(user_prefs)

    # "순위를 매길 때 실제로 쓰인" housing. 두 경로 모두에서 채운다.
    #
    # 예전에는 검색어 경로에서만 채우고 슬라이더 경로는 None 으로 뒀다 —
    # "화면이 만든 값이니 되돌려줄 필요 없다"는 판단이었는데, 핀 모달의
    # 동네 설명(/api/region/explain)이 이 값을 다시 받아야 하게 되면서
    # 슬라이더로만 조건을 준 사용자는 시세 이야기를 못 듣게 됐다.
    # 순위 기준과 설명 기준이 다르면 앞뒤가 안 맞는 말을 하게 된다
    used_housing = None

    if query:
        result = search(query, top_k=5, housing_override=housing,
                        weights_override=weights_override)
        weights = result["weights"]
        regions = result["regions"]
        explanation = result["explanation"]
        # search() 는 housing_override 가 있으면 그걸 그대로,
        # 없으면 검색어에서 뽑아낸 조건을 돌려준다 — 어느 쪽이든 "실제로 쓰인" 값
        used_housing = result.get("housing")
    else:
        # 슬라이더 경로에도 같은 규칙을 적용한다 — 화면이 확정한 값이 우선
        weights = weights_override or to_korean_weights(user_prefs)
        regions = recommend_by_weights(weights, top_k=5, housing=housing)
        explanation = ""
        used_housing = housing        # ← 이 한 줄이 빠져 있었다

    return weights, regions, explanation, used_housing


def get_survey_recommendation(weights_kor, persona_query, housing=None, top_k=5):
    """서술형 설문(2차 유형)에서 이미 뽑은 가중치로 추천한다.

    /api/predict 의 검색어 경로와 달리 ask_claude() 의 LLM 가중치 추정을
    건너뛴다 — 설문은 services/persona_type.py 가 이미 구조화된 축 점수로
    가중치를 계산해 뒀기 때문이다.
    """
    return recommend_by_weights_explained(weights_kor, persona_query,
                                           top_k=top_k, housing=housing)


# ── 동네 설명/대화 ────────────────────────────────

def get_facilities(gu, dong, limit=5):
    """행정동 하나의 시설 정보를 돌려준다. 지도 핀을 눌렀을 때 쓴다."""
    return _call("GET", f"/regions/{quote(gu)}/{quote(dong)}/facilities", params={"limit": limit})


def get_region_explain(gu, dong, query="", weights=None, scores=None, housing=None):
    """동네 하나에 대한 LLM 설명을 만든다. 지도 핀을 눌렀을 때 쓴다.

    housing 이 있으면 엔진이 설명문에 "원하시는 가격대보다 조금 높은 편입니다"
    같은 문장을 넣는다. None 이면 프롬프트에 "가격 이야기를 꺼내지 마라"가
    들어가므로, 가격 조건이 없을 때 억지로 기본값을 만들어 넣지 말 것
    """
    out = _call("POST", f"/regions/{quote(gu)}/{quote(dong)}/explain", json={
        "query": query, "weights": weights, "scores": scores, "housing": housing,
    })
    return out["explanation"]


def get_chat_answer(question, regions=None, weights=None, history=None):
    """추천 결과에 대한 후속 질문에 답한다."""
    out = _call("POST", "/chat", json={
        "question": question, "regions": regions, "weights": weights, "history": history,
    })
    return out["answer"]


# ── 회원/설문 ─────────────────────────────────────

def get_customer(customer_id):
    """회원 기본정보(이름, 이메일, 가입일 등). 마이페이지에서 쓴다."""
    return _call("GET", f"/customers/{quote(customer_id)}", none_on=(404,))


def score_survey(prompt):
    """설문 프롬프트를 Claude 에게 채점시킨다."""
    return _call("POST", "/survey/score", json={"prompt": prompt})["result"]


# ── 인증 ─────────────────────────────────────────
# Life-Embed-jh 의 /auth/* 는 id/password 가 아니라 Supabase access token(Bearer)을
# 받는다(2026-09-09 계약 변경) — 검증은 그쪽 supabase_auth.verify_token() 이 한다.

def _bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def auth_login(token: str):
    """Supabase 로 로그인한 사용자를 customer_id 에 연결한다. 가입 전이면 None."""
    out = _call("POST", "/auth/login", headers=_bearer(token), none_on=(404,))
    return out["customer_id"] if out else None


def signed_up(token: str) -> bool:
    """이 Supabase 사용자가 이미 customer 로 가입돼 있나. 회원가입 화면에서 로그인으로
    돌릴지 판단하는 데 쓴다."""
    return _call("GET", "/auth/signed-up", headers=_bearer(token))["signed_up"]


def signup(token: str, payload: dict):
    """Supabase 인증 + 회원정보로 새 계정을 만든다. 이미 가입돼 있으면 None.

    payload 는 기본정보(name/gender/age/city/city_dong/work_city/work_dong/
    phone/email) + 희망조건 7지표(한국어 키) + persona 9칸을 한데 담은 딕셔너리다.
    """
    out = _call("POST", "/auth/signup", json={"payload": payload},
                headers=_bearer(token), none_on=(409,))
    return out["customer_id"] if out else None


# ── 좋아요/기록 ────────────────────────────────────

def like_region(anon_id, gu, dong):
    """지도 핀에서 좋아요 클릭시 호출한다."""
    _call("POST", "/likes", json={"anon_id": anon_id, "gu": gu, "dong": dong})


def unlike_region(anon_id, gu, dong):
    """좋아요를 취소하면 호출한다."""
    _call("DELETE", "/likes", json={"anon_id": anon_id, "gu": gu, "dong": dong})


def save_search(anon_id, query):
    """검색어를 기록한다. 검색창에 입력한 문장이 있을 때만 부른다."""
    _call("POST", "/history", json={"anon_id": anon_id, "kind": "search", "query": query})


def save_chat(anon_id, question, answer):
    """후속 질문/답변을 기록한다."""
    _call("POST", "/history", json={
        "anon_id": anon_id, "kind": "chat", "question": question, "answer": answer,
    })


def get_history(anon_id):
    """메뉴 > 검색 및 대화 기록 저장소에서 부른다."""
    return _call("GET", f"/history/{quote(anon_id)}")


# ── 관리자 ────────────────────────────────────────

def get_member(customer_id):
    return _call("GET", f"/admin/members/{quote(customer_id)}", none_on=(404,))


def list_members():
    return _call("GET", "/admin/members")


def create_member(payload: dict):
    return _call("POST", "/admin/members", json=payload, patch_error_on=(422,))


def update_member(customer_id, patch):
    return _call("PATCH", f"/admin/members/{quote(customer_id)}", json=patch,
                 none_on=(404,), patch_error_on=(422,))


def get_region(gu, dong):
    return _call("GET", f"/admin/regions/{quote(gu)}/{quote(dong)}", none_on=(404,))


def list_regions():
    return _call("GET", "/admin/regions")


def update_region(gu, dong, patch):
    return _call("PATCH", f"/admin/regions/{quote(gu)}/{quote(dong)}", json=patch,
                 none_on=(404,), patch_error_on=(422,))


def preview_member(customer_id):
    """이 회원의 희망조건으로 추천 TOP 5를 뽑아본다. 아무것도 안 고친다."""
    return _call("GET", f"/admin/members/{quote(customer_id)}/preview", none_on=(404,))


def similar_members(customer_id, top_k=5):
    """이 회원과 페르소나가 비슷한 회원들."""
    return _call("GET", f"/admin/members/{quote(customer_id)}/similar",
                 params={"top_k": top_k}, none_on=(404,))


def privacy_preview(customer_id):
    """이 회원의 페르소나 9칸을 원본과 가린 것으로 나란히 준다."""
    return _call("GET", f"/admin/members/{quote(customer_id)}/privacy-preview", none_on=(404,))


def health():
    return _call("GET", "/admin/health")


def clear_caches():
    return _call("POST", "/admin/clear-caches")


def dashboard():
    return _call("GET", "/admin/dashboard")


def recent_logs(limit=8):
    return _call("GET", "/admin/recent-logs", params={"limit": limit})


def backfill_logins():
    return _call("POST", "/admin/backfill-logins")


class _AnalysisEngine:
    """예전엔 `from app.features import analysis as analysis_engine` 로 모듈 자체를
    이름표만 바꿔 썼다. HTTP 로는 모듈을 못 받아오므로 같은 4개 메서드를 낸
    자리표시자 객체로 대신한다 — admin.py 라우터의 `analysis_engine.ask(...)`
    호출부는 그대로 둔다."""

    def ask(self, question: str) -> dict:
        """빈 질문이면 422 대신 {"error": ...} 를 돌려준다 — 예전 app.features.analysis.ask()
        의 계약(예외가 아니라 dict)을 그대로 지킨다. admin.py 라우터가 이 dict 를 본다."""
        resp = _client.post("/admin/analysis/ask", json={"question": question})
        if resp.status_code == 422:
            return {"error": resp.json()["detail"]}
        resp.raise_for_status()
        return resp.json()

    def list_chats(self, limit: int = 50) -> list:
        return _call("GET", "/admin/analysis/chats", params={"limit": limit})

    def get_chat(self, chat_id: int):
        return _call("GET", f"/admin/analysis/chats/{chat_id}", none_on=(404,))

    def delete_chat(self, chat_id: int) -> int:
        out = _call("DELETE", f"/admin/analysis/chats/{chat_id}", none_on=(404,))
        return out["deleted"] if out else 0


analysis_engine = _AnalysisEngine()


if __name__ == "__main__":
    # 스모크 체크 — Life-Embed-jh 가 이 주소에 떠 있어야 한다:
    #   (Life-Embed-jh 저장소에서) uvicorn app.main:app --port 8000
    w, r, e, h = get_regions({"query": "애들 학원 보내기 좋은 곳"})
    print(w)
    for x in r:
        print(f"   {x['name']} {x['total']}")
    print(e[:120])
    print("housing:", h)
    print()
    print(get_facilities("노원구", "중계1동")["counts"])
