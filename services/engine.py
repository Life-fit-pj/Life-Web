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

from app.features.pipeline_api import search, recommend_by_weights
from app.core.db import facilities, facility_counts, region_extras
from app.features.region_explain import region_explain_cached
from app.features.chat import chat as chat_engine

from .price import apply_budget

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


# 예산 감점 뒤에도 5개를 채우려면 후보가 넉넉해야 한다.
# 5개만 받아 오면 그 5개 안에서 순서만 바뀐다
CANDIDATE_K = 25


def get_regions(user_prefs):
    query = (user_prefs.get('query') or '').strip()

    if query:
        result = search(query, top_k=CANDIDATE_K)
        weights = result["weights"]
        regions = result["regions"]
        explanation = result["explanation"]
    else:
        weights = to_korean_weights(user_prefs)
        regions = recommend_by_weights(weights, top_k=CANDIDATE_K)
        explanation = ""

    regions = apply_budget(regions, user_prefs, top_k=5)
    return weights, regions, explanation


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
    w, r, e = get_regions({"query": "애들 학원 보내기 좋은 곳"})
    print(w)
    for x in r:
        print(f"   {x['name']} {x['total']}")
    print(e[:120])
    print()
    print(get_facilities("노원구", "중계1동")["counts"])