"""
추천 엔진(life-fit-embed) 호출부.

이 파일만 엔진 저장소를 안다. 다른 파일은 몰라도 된다.
엔진을 바꾸더라도 여기만 고치면 된다 —
조원이 만든 다른 엔진을 붙일 때도 이 파일의 import 두 줄만 바꾸면 된다.
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

from app.core.db import facilities, facility_counts, region_extras
from app.features.pipeline_api import search, recommend_by_weights, recommend_by_weights_explained
from app.features.region_explain import region_explain_cached
from app.features.chat import chat as chat_engine
from app.features.admin import get_member, list_members, get_region, list_regions, update_member, update_region


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


def get_regions(user_prefs):
    query = (user_prefs.get('query') or '').strip()
    housing = to_housing(user_prefs)
    extracted_housing = None   # 검색어 경로에서만 채워진다

    if query:
        result = search(query, top_k=5, housing_override=housing)
        weights = result["weights"]
        regions = result["regions"]
        explanation = result["explanation"]
        extracted_housing = result.get("housing")
    else:
        # 슬라이더 경로는 애초에 화면 값 그대로 housing을 만들었으니
        # 다시 화면에 되돌려줄 필요가 없다 (이미 일치함)
        weights = to_korean_weights(user_prefs)
        regions = recommend_by_weights(weights, top_k=5, housing=housing)
        explanation = ""

    return weights, regions, explanation, extracted_housing


def get_survey_recommendation(weights_kor, persona_query, housing=None, top_k=5):
    """서술형 설문(2차 유형)에서 이미 뽑은 가중치로 추천한다.

    /api/predict 의 검색어 경로와 달리 ask_claude() 의 LLM 가중치 추정을
    건너뛴다 — 설문은 services/persona_type.py 가 이미 구조화된 축 점수로
    가중치를 계산해 뒀기 때문이다.
    """
    return recommend_by_weights_explained(weights_kor, persona_query,
                                           top_k=top_k, housing=housing)


def get_facilities(gu, dong, limit=5):
    """행정동 하나의 시설 정보를 돌려준다. 지도 핀을 눌렀을 때 쓴다."""
    return {
        "counts": facility_counts(gu, dong),
        "items": facilities(gu, dong, limit=limit),
        "extras": region_extras(gu, dong),
    }


def get_region_explain(gu, dong, query="", weights=None, scores=None):
    """동네 하나에 대한 LLM 설명을 만든다. 지도 핀을 눌렀을 때 쓴다."""
    return region_explain_cached(gu, dong, query, weights, scores)


def get_chat_answer(question, regions=None, weights=None, history=None):
    """추천 결과에 대한 후속 질문에 답한다."""
    return chat_engine(question, regions=regions, weights=weights, history=history)


if __name__ == "__main__":
    w, r, e, h = get_regions({"query": "애들 학원 보내기 좋은 곳"})
    print(w)
    for x in r:
        print(f"   {x['name']} {x['total']}")
    print(e[:120])
    print("housing:", h)
    print()
    print(get_facilities("노원구", "중계1동")["counts"])