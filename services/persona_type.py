"""
2차 라이프스타일 유형 판정 — 서술형 설문 15문항.

1차(services/lifetype.py, 키워드 클릭)와 축 체계(EI/BQ/TP/WD, 16유형, 7지표 가중치
계수)를 그대로 공유한다. 그 표들을 여기서 다시 적지 않고 lifetype 에서 그대로
가져와 쓴다 — 두 파일이 따로 놀면 언젠가 어긋난다(Lifestyle-type/2차유형.py 가
독립된 사본을 갖고 있다가 실제로 한 곳(키워드 텍스트)이 어긋난 적이 있다).

[1차와 다른 점]
  1차는 키워드 3개 이상을 표에서 찾아 축을 채운다(즉시, 정확).
  2차는 자유 문장 15개를 규칙 기반으로 채점한다(느슨함, 대신 정보량이 많다).
  같은 lifetype.type_of()/to_weights() 를 거치므로 결과 모양은 동일하다.

[LLM을 안 쓰는 이유]
  Life-Embed-jh 쪽에 이미 검색어 하나를 LLM 이 가중치로 바꾸는 경로(ask_claude,
  app/engine/weights.py)가 있다. 하지만 그건 "장소를 찾는 문장" 을 위해 만든
  프롬프트라 15개 답변을 통째로 넣으면 품질이 떨어진다(실제로 지금 프론트가
  그렇게 하고 있다 — search.js 의 survey 처리 부분).
  설문은 이미 구조화돼 있어(문항마다 축이 정해짐) 규칙 기반으로도 축 점수가
  바로 나온다. LLM 추정을 아예 건너뛸 수 있다는 뜻이라 무료·즉시 응답이다.
  build_llm_prompt/parse_llm_scores 는 나중에 LLM 채점을 얹고 싶을 때 쓰라고
  남겨 둔다(2차유형.py 의 원안 그대로) — 지금 profile() 은 규칙 기반만 쓴다.
"""

from __future__ import annotations

import re

from services import lifetype as lt

# ============================================================
# 문항 15개 — signup.html 의 15개 입력 id(p1,p2,s1,s2,...)와 정확히 대응한다.
# id/placeholder 는 Lifestyle-type/2차유형.py 원안과 글자 그대로 같다.
# ============================================================
QUESTIONS = [
    {
        "id": "p1", "column": "professional_persona", "axis": "WD",
        "prompt": "무슨 일을 하시나요? 일터까지는 어떻게 다니시는지도 알려주세요.",
        "keywords": [("차로", -1.5), ("자차", -1.5), ("운전", -1.2), ("주차", -1.0),
                     ("지하철", 0.5), ("버스", 0.3),
                     ("걸어", 1.8), ("도보", 1.8), ("재택", 1.0), ("가까", 1.2)],
        "extract": "commute",
    },
    {
        "id": "p2", "column": "professional_persona", "axis": "EI",
        "prompt": "일과가 끝나면 보통 어떻게 하시나요?",
        "keywords": [("바로 집", -1.8), ("뻗", -1.5), ("피곤", -1.2), ("쉬", -1.0),
                     ("야근", -0.8), ("약속", 1.5), ("만나", 1.2),
                     ("운동", 0.8), ("모임", 1.5), ("술", 1.2)],
    },
    {
        "id": "s1", "column": "sports_persona", "axis": "WD",
        "prompt": "몸을 움직이는 활동을 하신다면 주로 어디서 하시나요?",
        "keywords": [("차", -1.5), ("골프", -1.2), ("멀", -1.2),
                     ("집에서", -0.3), ("홈트", -0.3),
                     ("집 앞", 1.8), ("동네", 1.5), ("하천", 1.5), ("공원", 1.5),
                     ("산책", 1.2), ("러닝", 1.0), ("걸어", 1.5)],
    },
    {
        "id": "s2", "column": "sports_persona", "axis": "EI",
        "prompt": "야외 활동과 실내 활동 중 어느 쪽이 더 편하세요? 이유도 적어주세요.",
        "keywords": [("실내", -1.5), ("집에서", -1.5), ("무릎", -1.0),
                     ("힘들", -1.0), ("귀찮", -1.2),
                     ("야외", 1.5), ("밖", 1.3), ("등산", 1.5),
                     ("자전거", 1.2), ("산", 1.3)],
        "extract": "mobility",
    },
    {
        "id": "a1", "column": "arts_persona", "axis": "EI",
        "prompt": "쉴 때 뭘 보고 듣고 하시나요?",
        "keywords": [("집에서", -1.5), ("넷플릭스", -1.5), ("TV", -1.5),
                     ("유튜브", -1.3), ("책", -0.8), ("게임", -1.3),
                     ("전시", 1.5), ("공연", 1.5), ("영화관", 1.2),
                     ("미술관", 1.5), ("나가", 1.2)],
    },
    {
        "id": "a2", "column": "arts_persona", "axis": "BQ",
        "prompt": "문화생활을 하러 간다면 어떤 분위기의 장소가 좋으세요?",
        "keywords": [("조용", -1.8), ("한적", -1.5), ("부담", -1.2),
                     ("사람 많", 1.5), ("북적", 1.8), ("활기", 1.5),
                     ("번화", 1.5), ("붐비", 1.2)],
    },
    {
        "id": "t1", "column": "travel_persona", "axis": "BQ",
        "prompt": "여행을 간다면 어떤 곳으로 가시나요?",
        "keywords": [("조용", -1.8), ("한적", -1.8), ("시골", -1.5),
                     ("자연", -1.2), ("산", -1.2), ("고즈넉", -1.5),
                     ("도시", 1.5), ("번화", 1.8), ("관광", 1.0), ("쇼핑", 1.5)],
    },
    {
        "id": "t2", "column": "travel_persona", "axis": "WD",
        "prompt": "여행지에서는 주로 어떻게 다니세요?",
        "keywords": [("렌터카", -1.8), ("차", -1.5), ("운전", -1.5),
                     ("짐", -1.0), ("택시", -1.0),
                     ("걸어", 1.8), ("도보", 1.8), ("뚜벅", 1.8),
                     ("대중교통", 0.8), ("지하철", 0.5)],
    },
    {
        "id": "c1", "column": "culinary_persona", "axis": "WD",
        "prompt": "평소 끼니는 어떻게 해결하세요?",
        "keywords": [("배달", -1.5), ("차로", -1.5), ("쿠팡", -1.3),
                     ("밀키트", -0.8), ("집에서 해", -0.3),
                     ("동네", 1.5), ("걸어", 1.8), ("근처", 1.3),
                     ("시장", 1.3), ("골목", 1.3)],
    },
    {
        "id": "c2", "column": "culinary_persona", "axis": "TP",
        "prompt": "자주 가는 가게가 있나요? 어떤 곳인지 알려주세요.",
        "keywords": [("매번 다른", -1.8), ("없", -1.2), ("배달", -1.0),
                     ("혼자", -1.0), ("말은 안", -1.5),
                     ("단골", 1.8), ("사장님", 1.8), ("얼굴", 1.2),
                     ("알아", 0.8), ("자주", 1.0)],
    },
    {
        "id": "f1", "column": "family_persona", "axis": None,
        "prompt": "누구와 함께 사시나요? 앞으로 2년 안에 달라질 예정이 있다면 함께 적어주세요.",
        "keywords": [],
        "extract": "household",
    },
    {
        # 새것↔넓이(NS)는 축이 아니다 — 지역 가중치를 안 움직이는 집 취향이라
        # space_pref 로만 뽑는다(2페이지 건물유형·면적 조건으로 전달, 여기서는 미사용).
        "id": "f2", "column": "family_persona", "axis": None,
        "prompt": "지금 집에서 아쉬운 점이 있다면 무엇인가요?",
        "keywords": [("좁", -1.8), ("짐", -1.3), ("방", -1.3),
                     ("수납", -1.5), ("넓", -1.5),
                     ("낡", 1.5), ("오래", 1.2), ("곰팡이", 1.5), ("벌레", 1.5),
                     ("엘리베이터", 1.5), ("주차", 1.3), ("옵션", 1.2)],
        # '아쉬운 점'을 묻는 질문이라 "짐 둘 데가 없어요"의 '없다'는 부정이 아니라
        # 결핍(=그걸 원한다는 신호)이다. 부정어로 뒤집지 않는다
        "no_negate": True,
        "extract": "space_pref",
    },
    {
        "id": "g1", "column": "cultural_background", "axis": "TP",
        "prompt": "어떤 동네에서 자라셨나요? 그때 동네 분위기는 어땠는지도 알려주세요.",
        "keywords": [("몰랐", -1.5), ("삭막", -1.5), ("인사만", -0.8),
                     ("모르", -1.2), ("혼자", -1.0),
                     ("알고 지냈", 1.5), ("이웃", 1.2), ("정겹", 1.5),
                     ("시장", 1.0), ("왁자", 1.5), ("가족처럼", 1.8)],
    },
    {
        "id": "g2", "column": "cultural_background", "axis": "BQ",
        "prompt": "지금까지 살아본 동네 중 가장 편했던 곳은 어디였나요? 왜 편했는지도 알려주세요.",
        "keywords": [("조용", -1.8), ("골목", -1.3), ("차 소리", -1.5),
                     ("공원", -1.2), ("한적", -1.5),
                     ("가까", 1.3), ("편의", 1.3), ("역", 1.2),
                     ("활기", 1.5), ("번화", 1.5)],
    },
    {
        # 취미 — 채점 안 함. persona_query 에만 얹혀 임베딩 매칭 품질을 높인다
        "id": "h1", "column": "hobbies_and_interests_list", "axis": None,
        "prompt": "요즘 빠져 있는 것이나 즐겨 하는 일이 있나요? 자유롭게 적어주세요.",
        "keywords": [],
    },
]
QMAP = {q["id"]: q for q in QUESTIONS}

# 설문 문항 -> persona 9칸(청킹용). frontend/signup.html 의 PERSONA_MAP(자바스크립트)과
# 글자 하나까지 같아야 한다 — 둘이 어긋나면 화면에서 보여주는 요약과 실제로 저장되는
# persona 문장이 달라진다. persona/career_goals_and_ambitions 는 대응 문항이 없어 비운다.
PERSONA_MAP = {
    "professional_persona": ["p1", "p2"],
    "sports_persona":       ["s1", "s2"],
    "arts_persona":         ["a1", "a2", "h1"],
    "travel_persona":       ["t1", "t2"],
    "culinary_persona":     ["c1", "c2"],
    "family_persona":       ["f1", "f2"],
    "cultural_background":  ["g1", "g2"],
}


# Life-Embed-jh app/core/config.py 의 MIN_LENGTH 와 같은 값이다. persona_type.py는
# 그 저장소를 몰라도 되게 만든 파일(services/engine.py만 안다)이라 값만 그대로 옮겨
# 적었다 — 저쪽 값이 바뀌면 여기도 같이 고쳐야 한다.
_MIN_LENGTH = 20


def answers_to_persona(answers: dict) -> dict:
    """설문 답변 -> persona 9칸. 합친 글자 수가 _MIN_LENGTH 미만인 칸은 아예 뺀다 —
    그대로 보내면 create_member() 가 "짧다"며 가입 자체를 막아버리기 때문이다
    (그 검사는 관리자가 손으로 입력한 칸을 위한 것이라 설문 자동 매핑에는 안 맞는다).
    질문 라벨은 붙이지 않는다(signup.html 과 같은 이유)."""
    persona = {}
    for column, ids in PERSONA_MAP.items():
        text = " ".join(t for qid in ids if (t := str(answers.get(qid) or "").strip()))
        if len(text) >= _MIN_LENGTH:
            persona[column] = text
    return persona

NEGATORS = ("안 ", "않", "못 ", "없", "별로", "아니", "싫", "질색", "힘들")


# ============================================================
# 규칙 기반 채점
# ============================================================
def score_text_rule(qid: str, text: str) -> float | None:
    q = QMAP.get(qid)
    if not q or not q.get("keywords") or not text:
        return None
    t = str(text).strip()
    if len(t) < 2:
        return None

    no_neg = q.get("no_negate", False)
    # 부정어는 같은 절 안에 있을 때만 그 단어를 부정한다.
    # "재택이라 안 나가요" 의 '안'은 재택을 부정하는 게 아니라 재택이라서 생긴 결과다
    parts = [p.strip() for p in re.split(r"[,.!?]|(?<=라)\s|(?<=서)\s|(?<=고)\s|(?<=며)\s|(?<=만)\s", t) if p.strip()]

    total, hits = 0.0, 0
    for word, val in q["keywords"]:
        for part in parts:                      # 절마다 찾는다
            pos = part.find(word)
            if pos < 0:
                continue
            sign = 1
            if not no_neg:
                head = part[max(0, pos - 6):pos]
                tail = part[pos + len(word):pos + len(word) + 10]
                if any(n in head or n in tail for n in NEGATORS):
                    sign = -1
            total += val * sign
            hits += 1
            break                               # 이 단어는 찾았으니 다음 단어로

    return max(-2.0, min(2.0, total / hits ** 0.5)) if hits else None


# ============================================================
# LLM 채점 (선택 사항 — 지금 profile() 은 안 부른다. 나중에 붙일 자리)
# ============================================================
def build_llm_prompt(answers: dict) -> str:
    items = []
    for q in QUESTIONS:
        if not q["axis"]:
            continue
        text = (answers.get(q["id"]) or "").strip()
        if text:
            items.append(f'- id: {q["id"]}\n  질문: {q["prompt"]}\n  답변: "{text}"')
    if not items:
        return ""
    return (
        "아래는 주거 성향 파악을 위한 생활 설문의 서술형 답변이다.\n"
        "각 답변을 읽고 -2(부정 극단) 부터 +2(긍정 극단) 사이 정수로 점수를 매겨라.\n"
        "판단할 근거가 없으면 null. 설명 없이 JSON만 출력하라.\n\n"
        + "\n".join(items)
    )


def parse_llm_scores(raw: str) -> dict:
    if not raw:
        return {}
    t = re.sub(r"```(?:json)?|```", "", str(raw)).strip()
    m = re.search(r"\{.*\}", t, re.S)
    if not m:
        return {}
    import json
    try:
        data = json.loads(m.group(0))
    except json.JSONDecodeError:
        return {}
    out = {}
    for k, v in data.items():
        if k in QMAP and v is not None:
            try:
                out[k] = max(-2.0, min(2.0, float(v)))
            except (TypeError, ValueError):
                continue
    return out


# ============================================================
# 답변에서 가구·통근 정보 뽑기 (7지표 가중치 보정에 쓴다)
# ============================================================
def extract_household(answers: dict) -> dict:
    h = {}
    fam = answers.get("f1") or ""
    if any(w in fam for w in ("혼자", "1인", "자취")):
        h["household"] = "single"
    elif any(w in fam for w in ("아이", "자녀", "딸", "아들", "육아")):
        h["household"] = "family"
    elif any(w in fam for w in ("아내", "남편", "배우자", "둘이", "부부")):
        h["household"] = "couple"
    elif any(w in fam for w in ("부모님", "어머니", "아버지")):
        h["household"] = "parent"

    if any(w in fam for w in ("영유아", "아기", "돌", "어린이집", "태어")):
        h["child"] = "infant"
    elif any(w in fam for w in ("초등", "유치원")):
        h["child"] = "elementary"
    elif any(w in fam for w in ("중학", "고등", "수능", "학원")):
        h["child"] = "secondary"

    if any(w in fam for w in ("부모님", "어머니", "아버지", "장인", "시어머니")):
        h["elder"] = True

    work = answers.get("p1") or ""
    if "재택" in work:
        h["wfh"] = True
    if any(w in work for w in ("지하철", "버스", "대중교통")):
        h["commute"] = "transit"
    elif any(w in work for w in ("차로", "자차", "운전")):
        h["commute"] = "car"

    body = answers.get("s2") or ""
    if any(w in body for w in ("무릎", "허리", "관절", "다리가")):
        h["care"] = "monthly"

    space = score_text_rule("f2", answers.get("f2", ""))
    if space is not None and abs(space) >= 0.25:
        h["space_pref"] = "new" if space > 0 else "area"

    return h


# ============================================================
# 축 점수 · 병합 (lifetype.AXES 를 그대로 쓴다)
# ============================================================
def score_axes(answers: dict, llm_scores: dict | None = None) -> dict:
    llm_scores = llm_scores or {}
    bucket = {a: [] for a in lt.AXES}
    for q in QUESTIONS:
        if not q["axis"]:
            continue
        val = llm_scores.get(q["id"])
        if val is None:
            val = score_text_rule(q["id"], answers.get(q["id"], ""))
        if val is not None:
            bucket[q["axis"]].append(val)
    return {a: (round(sum(v) / len(v) / 2, 3) if v else 0.0)
            for a, v in bucket.items()}


def merge_axes(first: dict | None, second: dict) -> dict:
    """1차 축 점수를 2차가 보강한다. 덮어쓰지 않는다.

    1차에서 비어 있던 축은 2차 값을 그대로 채택, 둘 다 있으면 2차에 2배
    가중치를 준다(서술형 15문항이 키워드 3개보다 근거가 많다).
    """
    out = {}
    for a in lt.AXES:
        f = (first or {}).get(a, 0.0)
        s = second.get(a, 0.0)
        if abs(f) < 0.01:
            out[a] = round(s, 3)
        elif abs(s) < 0.01:
            out[a] = round(f, 3)
        else:
            out[a] = round((f + s * 2) / 3, 3)
    return out


# ============================================================
# 축 -> 7지표 가중치. lifetype.AXIS_TO_WEIGHT/WEIGHT_KEYS 를 그대로 쓰고,
# 가구 정보로 한 번 더 보정한다(1차에는 없는, 서술형이라 가능한 보정)
# ============================================================
def to_weights(axis: dict, household: dict | None = None) -> dict:
    """축 점수 + 가구 정보 -> 7개 지표 가중치(1.0~5.0).

    정수로 반올림하지 않는다 — lifetype.to_weights() 와 같은 이유다.
    엔진의 recommend() 가 (w/평균)**6 으로 차이를 증폭하는데, round() 로 접으면
    그 차이가 사라진다. 게다가 commute=car(-0.5), care=monthly(+0.8) 같은
    작은 보정이 반올림에 통째로 묻혀 "뽑아놓고 안 쓰는" 상태가 된다
    """

    w = {k: 3.0 for k in lt.WEIGHT_KEYS}
    for a, eff in lt.AXIS_TO_WEIGHT.items():
        s = axis.get(a, 0.0)
        for key, coef in eff.items():
            w[key] += s * coef

    h = household or {}
    child = h.get("child")
    if child == "infant":
        w["교육"] += 1.2; w["안전"] += 1.0; w["의료"] += 1.0; w["녹지"] += 0.5
    elif child == "elementary":
        w["교육"] += 1.5; w["안전"] += 1.2; w["녹지"] += 0.5
    elif child == "secondary":
        w["교육"] += 2.0; w["교통"] += 0.5

    if h.get("elder"):
        w["의료"] += 1.5; w["녹지"] += 0.5; w["상권"] += 0.3
    if h.get("care") == "monthly":
        w["의료"] += 0.8
    if h.get("wfh"):
        w["교통"] -= 1.0; w["상권"] += 0.5; w["녹지"] += 0.5
    if h.get("commute") == "transit":
        w["교통"] += 1.0
    elif h.get("commute") == "car":
        w["교통"] -= 0.5

    return {k: round(max(1.0, min(5.0, v)), 2) for k, v in w.items()}


def _build_persona_query(answers: dict) -> str:
    """사람 묘사 문장 하나로 합친다. kb_persona/member_chunk 도 같은 문체(1인칭
    사람 묘사)라 임베딩 매칭에 바로 쓸 수 있다 — ask_claude 처럼 LLM 으로
    다시 바꿀 필요가 없다(search.js 가 지금 하는, 머리말만 붙여 통째로 보내는
    방식보다 이쪽이 본래 kb_persona 문체에 더 가깝다)."""
    texts = [(answers.get(q["id"]) or "").strip() for q in QUESTIONS]
    return " ".join(t for t in texts if t)


# ============================================================
# 메인 진입점
# ============================================================
def profile(answers: dict, first_axes: dict | None = None,
            llm_scores: dict | None = None) -> dict:
    """서술형 답변 -> 2차 유형 + 7지표 가중치 + 추천용 persona 문장.

    first_axes 를 주면 1차 결과를 보강한 값으로 계산한다(merge_axes).
    """
    axis2 = score_axes(answers, llm_scores)
    axis = merge_axes(first_axes, axis2) if first_axes else axis2

    household = extract_household(answers)
    weights = to_weights(axis, household)
    t = lt.type_of(axis)   # 1차와 완전히 같은 함수 — 이름·설명·confidence·weak

    llm_scores = llm_scores or {}
    scorable = [q for q in QUESTIONS if q["axis"]]
    scored = sum(1 for q in scorable
                 if llm_scores.get(q["id"]) is not None
                 or score_text_rule(q["id"], answers.get(q["id"], "")) is not None)
    written = sum(1 for q in QUESTIONS if (answers.get(q["id"]) or "").strip())

    return {
        "axisScores": axis,
        "typeCode": t["code"],
        "typeName": t["name"],
        "typeDesc": t["desc"],
        "filledAxes": t["filled"],
        "confidence": t["confidence"],
        "weak": t["weak"],
        "weights": weights,
        "household": household,
        "personaQuery": _build_persona_query(answers),
        "written": written,
        "scored": scored,
        "scorable": len(scorable),
        "total": len(QUESTIONS),
    }


if __name__ == "__main__":
    sample = {
        "p1": "강남에서 디자인 일을 해요. 지하철로 40분쯤 걸려요",
        "p2": "야근이 잦아서 집에 오면 바로 뻗어요",
        "s1": "집 앞 하천 따라 러닝해요",
        "s2": "무릎이 안 좋아서 밖에 오래 있는 건 힘들어요",
        "a1": "집에서 넷플릭스 봐요",
        "t1": "관광지보다 한적한 시골 마을이 좋아요",
        "c1": "주로 배달 시켜요",
        "c2": "동네 국숫집 사장님이 제 얼굴을 아세요",
        "f1": "아내와 둘이 살고 내년에 아이가 태어나요",
        "f2": "짐 둘 데가 없어요. 방이 하나 더 있으면 좋겠어요",
        "g2": "골목 안쪽이라 차 소리가 없어서 좋았어요",
    }
    p = profile(sample)
    print(f"유형   {p['typeCode']}  ({p['typeName']})")
    print(f"       {p['typeDesc']}")
    print("축     " + "  ".join(f"{a}:{s:+.2f}" for a, s in p["axisScores"].items()))
    print("가중치 " + "  ".join(f"{k}{v}" for k, v in p["weights"].items()))
    print(f"확신도 {p['confidence']}  weak={p['weak']}  "
          f"작성 {p['written']}/{p['total']}  채점 {p['scored']}/{p['scorable']}")
    print(f"가구   {p['household']}")
    print(f"질문   {p['personaQuery'][:80]}...")

    print("\n=== 1차 결과를 2차가 보강 ===")
    first = {"EI": 0.5, "BQ": -0.8, "TP": 0.0, "WD": 0.6}
    p2 = profile(sample, first_axes=first)
    print(f"1차: {first}")
    print(f"보강 후 유형 {p2['typeCode']} ({p2['typeName']})  축 {p2['axisScores']}")
