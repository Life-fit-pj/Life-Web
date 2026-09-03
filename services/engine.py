"""
추천 엔진(life-fit-embed) 호출부.

이 파일만 엔진 저장소를 안다. 다른 파일은 몰라도 된다.
엔진을 바꾸더라도 여기만 고치면 된다 —
조원이 만든 다른 엔진을 붙일 때도 이 파일의 import 두 줄만 바꾸면 된다..
"""

import os
import sys

# 추천 엔진은 형제 폴더에 있다.
#   Life-fit-main/
#   ├── Life-Embed-jh/    ← 두뇌
#   └── Life-Web/      ← 여기
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EMBED_DIR = os.path.abspath(os.path.join(BASE_DIR, '..', 'Life-Embed-jh'))
sys.path.insert(0, EMBED_DIR)

from app.core.db import add_like, remove_like, add_search_history, list_search_history, add_chat_history, list_chat_history
from app.core.db import facilities, facility_counts, region_extras
from app.core.db import customer_one
from app.features.pipeline_api import search, recommend_by_weights, recommend_by_weights_explained
from app.features.region_explain import region_explain_cached
from app.features.chat import chat as chat_engine
from app.features.scoring import score_survey 
from app.features import analysis as analysis_engine
from app.features.admin import (
    get_member, list_members, get_region, list_regions,
    update_member, update_region, preview_member, similar_members, InvalidPatch, health,
    clear_caches, privacy_preview, dashboard, recent_logs, create_member,   # ← 추가
)
from app.features.auth import (
    login as auth_login, backfill_logins,
    id_exists as auth_id_exists, signup as auth_signup,
)


print("✅ LLM 파이프라인 연결 성공!")


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


def get_customer(customer_id):
    """회원 기본정보(이름, 이메일, 가입일 등). 마이페이지에서 쓴다."""
    return customer_one(customer_id)


def check_login_id(login_id: str) -> bool:
    """아이디 중복확인. 이미 쓰이고 있으면 True."""
    return auth_id_exists(login_id)


def signup(login_id: str, password: str, payload: dict):
    """아이디+비밀번호+회원정보로 새 계정을 만든다. 이미 있는 아이디면 None.

    payload 는 기본정보(name/gender/age/city/city_dong/work_city/work_dong/
    phone/email) + 희망조건 7지표(한국어 키) + persona 9칸을 한데 담은 딕셔너리다.
    """
    return auth_signup(login_id, password, payload)


def get_facilities(gu, dong, limit=5):
    """행정동 하나의 시설 정보를 돌려준다. 지도 핀을 눌렀을 때 쓴다."""
    return {
        "counts": facility_counts(gu, dong),
        "items": facilities(gu, dong, limit=limit),
        "extras": region_extras(gu, dong),
    }


def get_region_explain(gu, dong, query="", weights=None, scores=None, housing=None):
    """동네 하나에 대한 LLM 설명을 만든다. 지도 핀을 눌렀을 때 쓴다.

    housing 이 있으면 엔진이 설명문에 "원하시는 가격대보다 조금 높은 편입니다"
    같은 문장을 넣는다. None 이면 프롬프트에 "가격 이야기를 꺼내지 마라"가
    들어가므로, 가격 조건이 없을 때 억지로 기본값을 만들어 넣지 말 것
    """
    return region_explain_cached(gu, dong, query, weights, scores, housing)

def get_chat_answer(question, regions=None, weights=None, history=None):
    """추천 결과에 대한 후속 질문에 답한다."""
    return chat_engine(question, regions=regions, weights=weights, history=history)

# => 좋아요
def like_region(anon_id, gu, dong):
    """지도 핀에서 좋아요 클릭시 호출한다."""
    add_like(anon_id, gu, dong)

def unlike_region(anon_id, gu, dong):
    """좋아요를 취소하면 호출한다."""
    remove_like(anon_id, gu, dong)

# => 검색
def save_search(anon_id, query):
    """검색어를 기록한다. 검색창에 입력한 문장이 있을 때만 부른다."""
    add_search_history(anon_id, query)

def save_chat(anon_id, question, answer):
    """후속 질문/답변을 기록한다."""
    add_chat_history(anon_id, question, answer)

def get_history(anon_id):
    """메뉴 > 검색 및 대화 기록 저장소에서 부른다."""
    return {
        "searches": list_search_history(anon_id),
        "chats": list_chat_history(anon_id),
    }

if __name__ == "__main__":
    w, r, e, h = get_regions({"query": "애들 학원 보내기 좋은 곳"})
    print(w)
    for x in r:
        print(f"   {x['name']} {x['total']}")
    print(e[:120])
    print("housing:", h)
    print()
    print(get_facilities("노원구", "중계1동")["counts"])