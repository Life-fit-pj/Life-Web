"""
POST /api/survey   서술형 설문(15문항) → 2차 유형 판정 + 개인 맞춤 동네 TOP 5

1차(routers/lifetype.py)와 완전히 같은 축 체계(EI/BQ/TP/WD, 16유형, 7지표
가중치 계수)를 쓴다 — 둘 다 services/lifetype.py 의 표를 그대로 가져다 쓰므로
유형 이름·가중치 계산 방식이 어긋나지 않는다.

가중치가 나온 다음부터는 /api/predict 의 검색어 경로와 같은 자리(엔진의
recommend → explain)를 쓴다. 다만 ask_claude()(LLM 이 가중치를 추정하는 단계)를
건너뛴다 — 설문은 이미 문항마다 축이 정해져 있어 추정이 필요 없다
(services/engine.py 의 get_survey_recommendation 참고).
"""

from fastapi import APIRouter
from pydantic import BaseModel

from services.coords import lookup_coords
from services.engine import get_survey_recommendation, score_survey
from services import persona_type

router = APIRouter(prefix="/api", tags=["2차 유형"])


class SurveyRequest(BaseModel):
    answers: dict[str, str]
    # 1차 유형 카드에서 이미 축 점수가 나와 있으면 보강한다(덮어쓰지 않음)
    firstAxes: dict[str, float] | None = None


@router.post("/survey")
def survey_api(body: SurveyRequest):
    # ① 규칙으로 먼저 채점해 본다 (무료·즉시)
    p = persona_type.profile(body.answers, first_axes=body.firstAxes)

    # ② 규칙이 절반도 못 채웠으면 그때만 LLM 에게 물어본다.
    #    매번 부르면 응답이 3~5초 느려지고 돈도 든다
    if p["scored"] * 2 < p["scorable"]:
        prompt = persona_type.build_llm_prompt(body.answers)
        raw = score_survey(prompt)                       # engine.py 통로
        llm_scores = persona_type.parse_llm_scores(raw)
        if llm_scores:                                    # 파싱 실패하면 ①을 그대로 쓴다
            p = persona_type.profile(body.answers,
                                     first_axes=body.firstAxes,
                                     llm_scores=llm_scores)

    result = get_survey_recommendation(p["weights"], p["personaQuery"])

    top_regions = []
    for idx, r in enumerate(result["regions"], start=1):
        gu, dong = r["name"].split(" ", 1)
        lat, lng = lookup_coords(gu, dong)
        top_regions.append({
            "rank": idx,
            "name": f"서울특별시 {r['name']}",
            "lat": lat,
            "lng": lng,
            "score": r["total"],
            "scores": r["scores"],
            "price": r.get("price"),
        })

    return {
        "typeCode": p["typeCode"],
        "typeName": p["typeName"],
        "typeDesc": p["typeDesc"],
        "axisScores": p["axisScores"],
        "filledAxes": p["filledAxes"],
        "confidence": p["confidence"],
        "weak": p["weak"],
        "household": p["household"],
        "weights": p["weights"],
        "topRegions": top_regions,
        "explanation": result["explanation"],
        "housing": result["housing"],
    }





