"""
POST /api/lifetype           1차 라이프스타일 유형 판정 + 어울리는 동네 2곳
GET  /api/lifetype/keywords  첫 화면에 뿌릴 키워드 목록

1차(여기)와 2차(routers/recommend.py 의 /api/predict)를 나눈 이유는
lifetype_api() 의 주석에 적어 두었다.
"""

from fastapi import APIRouter
from pydantic import BaseModel

from services import lifetype, typespot

router = APIRouter(prefix="/api/lifetype", tags=["1차 유형"])


class LifeTypeRequest(BaseModel):
    """1차 유형 판정. 검색창 문자열 하나만 받는다"""
    query: str = ""


@router.post("")
def lifetype_api(body: LifeTypeRequest):
    """
    1차 라이프스타일 유형을 판정하고 어울리는 동네 2곳을 붙인다.

    LLM 을 쓰지 않는다. 두 가지 이유다.
      - 1차는 '즉시 나오는 맛보기'다. 비회원이 키워드를 바꿔 가며
        여러 번 눌러 보게 하려면 빠르고 무료여야 한다.
      - 지역은 검색이 아니라 채점이다. 427개 동 전부가 지표 점수를
        갖고 있어, 가중치만 있으면 반드시 순위가 나온다. 매칭 실패가 없다.

    정밀 추천(예산·면적 반영)은 2차, 가입 후 LLM 이 맡는다.
    """
    p = lifetype.profile(body.query)
    spots = typespot.recommend(p["weights"], show=2) if p["picked"] else []
    return {**p, "spots": spots, "budgetApplied": False,
            "dataStatus": typespot.status()}


@router.get("/keywords")
def lifetype_keywords(n: int = 14):
    """배경에 뿌릴 키워드. 서버가 목록을 쥐고 있어야 프론트와 안 어긋난다"""
    return {"keywords": lifetype.sample_keywords(n),
            "all": lifetype.ALL_KEYWORDS,
            "minPick": lifetype.MIN_PICK}
