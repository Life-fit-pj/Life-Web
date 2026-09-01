"""
1차 라이프스타일 유형 판정.

키워드를 3개 이상 고르면 4개 축 점수를 내고, 16유형 중 하나로 이름 붙인다.
회원가입 전 비회원에게 보여주는 맛보기라 LLM 을 쓰지 않는다.
키워드 -> 축 매핑이 전부 표에 들어 있어 즉시 계산된다.

[4개 축]  2차 설문과 그대로 공유한다
  E/I  나가는 ↔ 머무는   External / Internal
  B/Q  번화한 ↔ 조용한   Busy / Quiet
  T/P  어울리는 ↔ 혼자인 Together / Private
  W/D  걷는 ↔ 타는       Walk / Drive

[설계 원칙]
  모든 키워드가 최소 2개 축을 건드린다.
  단일 축만 건드리면 같은 계열 3개를 골랐을 때
  (주차가 편한 + 차로 움직이는 + 대형마트가 가까운)
  나머지 3축이 전부 중립으로 남아 근거 없는 유형이 나온다.
"""

from __future__ import annotations

import random

# ============================================================
# 축
# ============================================================
AXES = {
    "EI": {"pos": ("E", "외출"), "neg": ("I", "집콕")},
    "BQ": {"pos": ("B", "활기찬"), "neg": ("Q", "조용한")},
    "TP": {"pos": ("T", "이웃교류"), "neg": ("P", "혼자")},
    "WD": {"pos": ("W", "도보생활"), "neg": ("D", "차량이동")},
}

# ============================================================
# 키워드 26개 + 집 조건 4개
#   값은 축별 점수. 주 축이 2, 보조 축이 1.
#   house=True 인 것은 유형 판정에서 빼고 2페이지 조건으로만 넘긴다
# ============================================================
KEYWORDS = {
    # 모든 키워드가 4축 중 3축을 건드린다.
    # 2축만 건드리면 3개를 골라도 남은 축이 비어 부분 유형이 되기 쉽다.
    # 주축은 ±2, 보조축은 ±1.

    # --- 나가는 ↔ 머무는 (6) ---
    "주말엔 무조건 외출":   {"EI": 2, "BQ": 1, "WD": 1},
    "약속으로 꽉 찬 주말":  {"EI": 2, "TP": 1, "BQ": 1},
    "핫플 카페 도장 깨기":  {"EI": 1, "WD": 1, "BQ": 1},
    "완벽한 집순이 집돌이": {"EI": -2, "BQ": -1, "TP": -1},
    "퇴근하면 바로 귀가":   {"EI": -2, "TP": -1, "WD": -1},
    "내 방이 최고의 힐링":  {"EI": -2, "TP": -1, "BQ": -1},

    # --- 번화한 ↔ 조용한 (8) ---
    "슬리퍼 신고 쇼핑몰":   {"BQ": 2, "EI": 1, "WD": 1},
    "맛집 탐방이 일상":     {"BQ": 2, "WD": 1, "TP": 1},
    "24시간 밝은 거리":     {"BQ": 2, "EI": 1, "TP": -1},
    "지하철역이 코앞":      {"BQ": 2, "WD": 1, "EI": 1},
    "소음 없는 한적한 곳":  {"BQ": -2, "EI": -1, "TP": -1},
    "흙길 따라 걷는 산책":  {"BQ": -2, "WD": 1, "EI": 1},
    "창문 열면 녹지":     {"BQ": -2, "TP": -1, "WD": -1},
    "공원이 앞마당인 집":   {"BQ": -2, "EI": 1, "WD": 1},

    # --- 어울리는 ↔ 혼자인 (6) ---
    "단골집 사장님과 수다": {"TP": 2, "WD": 1, "BQ": 1},
    "오가며 인사하는 이웃": {"TP": 2, "BQ": -1, "WD": 1},
    "동네 모임이 활발한":   {"TP": 2, "EI": 1, "WD": 1},
    "혼자만의 고요한 시간": {"TP": -2, "EI": -1, "BQ": -1},
    "마주칠 일 없는 동네":  {"TP": -2, "BQ": -1, "EI": -1},
    "조용히 지내고 싶은":   {"TP": -2, "BQ": -1, "EI": -1},

    # --- 걷는 ↔ 타는 (6) ---
    "모든 걸 걸어서 해결":  {"WD": 2, "BQ": 1, "EI": 1},
    "1분 컷 편의점 필수":   {"WD": 2, "BQ": 1, "EI": -1},
    "장 보러 걸어가는 길":  {"WD": 2, "TP": 1, "BQ": -1},
    "주차 걱정 없는 동네":  {"WD": -2, "BQ": -1, "EI": -1},
    # 차로 다니면서 사람도 만나는 조합이 없으면
    # '홈파티 호스트' '주말 나들이러' 유형이 거의 안 나온다
    "친구 만나러 드라이브": {"WD": -2, "TP": 1, "EI": 1},
    "대형마트는 차로 한 번": {"WD": -2, "EI": -1, "TP": -1},
}

# 유형 판정에 안 쓰고 2페이지(건물유형·면적) 조건으로만 넘긴다
HOUSE_KEYWORDS = {
    "면적은 작아도 분리된": {"rooms": "separated"},
    "새 집이면 좋겠는":     {"age": "new"},
    "방이 많은":           {"rooms": "many"},
    "넓은 게 최고인":       {"size": "large"},
}

ALL_KEYWORDS = list(KEYWORDS) + list(HOUSE_KEYWORDS)

# ============================================================
# 16유형
# ============================================================
TYPES = {
    "EBTW": ("골목 마당발", "걸어서 번화가를 누비며 사람을 만나요"),
    "EBTD": ("약속 부자", "차를 몰고 어디든 사람 만나러 가요"),
    "EBPW": ("도심 유랑자", "북적이는 거리를 혼자 걷는 게 좋아요"),
    "EBPD": ("밤거리 드라이버", "차를 타고 혼자 도심을 돌아요"),
    "EQTW": ("동네 마실꾼", "조용한 골목을 걸으며 이웃과 인사해요"),
    "EQTD": ("주말 나들이러", "차를 타고 근교로 나가는 걸 즐겨요"),
    "EQPW": ("숲길 산책자", "혼자 걷는 조용한 길이 필요해요"),
    "EQPD": ("근교 방랑자", "훌쩍 떠나는 주말이 좋아요"),
    "IBTW": ("단골집 주인공", "집 앞 가게 사장님과 안부를 나눠요"),
    "IBTD": ("홈파티 호스트", "집으로 사람을 부르는 걸 좋아해요"),
    "IBPW": ("편의점 5분권", "필요한 게 걸어서 다 있어야 해요"),
    "IBPD": ("배달앱 마스터", "집에서 다 해결하는 편이에요"),
    "IQTW": ("옆집 인사형", "조용한 동네에서 가볍게 어울려요"),
    "IQTD": ("가족 중심형", "집과 가족이 생활의 중심이에요"),
    "IQPW": ("골목 은둔가", "조용히 걸어서 조용히 돌아와요"),
    "IQPD": ("언덕 위 은둔가", "방해받지 않는 나만의 공간이 필요해요"),
}

# ============================================================
# 축 -> 7개 지표 가중치 (2차와 동일)
# ============================================================
AXIS_TO_WEIGHT = {
    "EI": {"녹지": -0.8, "상권": 1.2, "문화": 1.2, "교통": 0.6, "안전": -0.3},
    "BQ": {"녹지": -1.0, "상권": 1.3, "문화": 0.8, "안전": -0.6, "교통": 0.5},
    "TP": {"문화": 0.6, "상권": 0.5, "녹지": 0.2},
    "WD": {"상권": 1.0, "의료": 0.7, "교육": 0.5, "교통": -0.6, "녹지": 0.3},
}
WEIGHT_KEYS = ["녹지", "안전", "교통", "상권", "의료", "교육", "문화"]

MIN_PICK = 3          # 이보다 적으면 축이 대부분 비어 유형이 아무 데나 떨어진다
NEUTRAL = 0.25        # 이보다 작으면 '모르는 축'으로 본다


# ============================================================
# 판정
# ============================================================
# ============================================================
# 자유 입력 사전
#   키워드를 안 누르고 직접 타이핑한 문장에서도 축을 뽑는다.
#   "조용한 데 살고 싶어요" 같은 입력이 0점이 되면 안 된다.
#
#   어간만 넣는다. '조용한/조용해서/조용했으면' 을 다 적을 수 없으니
#   '조용' 하나로 잡는다. 활용형이 뒤에 붙어도 걸린다.
# ============================================================
LEXICON = {
    # 나가는 ↔ 머무는
    "외출": {"EI": 2}, "나가": {"EI": 1}, "약속": {"EI": 2, "TP": 1},
    "모임": {"EI": 1, "TP": 2}, "번화가": {"EI": 1, "BQ": 2},
    "집순이": {"EI": -2}, "집돌이": {"EI": -2}, "집콕": {"EI": -2},
    "집에서": {"EI": -2}, "넷플": {"EI": -2}, "귀가": {"EI": -1},
    "재택": {"EI": -1, "WD": 1},

    # 번화한 ↔ 조용한
    "쇼핑": {"BQ": 2, "EI": 1}, "맛집": {"BQ": 2, "WD": 1},
    "카페": {"BQ": 1, "EI": 1}, "역세권": {"BQ": 2, "WD": 1},
    "지하철": {"BQ": 1, "WD": 1}, "밤늦": {"BQ": 1, "EI": 1},
    "화려": {"BQ": 2},
    "조용": {"BQ": -2}, "한적": {"BQ": -2}, "고요": {"BQ": -2, "TP": -1},
    "소음": {"BQ": -2}, "시끄": {"BQ": -2}, "공원": {"BQ": -1, "EI": 1},
    "산책": {"BQ": -1, "WD": 2}, "숲": {"BQ": -2}, "자연": {"BQ": -2},
    "녹지": {"BQ": -2},

    # 어울리는 ↔ 혼자인
    "이웃": {"TP": 2}, "단골": {"TP": 2, "WD": 1}, "사장님": {"TP": 2},
    "동네 사람": {"TP": 2}, "인사": {"TP": 1},
    "혼자": {"TP": -2}, "프라이버시": {"TP": -2}, "사생활": {"TP": -2},
    "마주치": {"TP": -1}, "간섭": {"TP": -2}, "조용히 지내": {"TP": -2},

    # 걷는 ↔ 타는
    "걸어": {"WD": 2}, "도보": {"WD": 2}, "걸을": {"WD": 2},
    "편의점": {"WD": 1, "BQ": 1}, "가까": {"WD": 1},
    "차로": {"WD": -2}, "자차": {"WD": -2}, "운전": {"WD": -2},
    "주차": {"WD": -2}, "드라이브": {"WD": -2}, "대형마트": {"WD": -2},
    "배달": {"WD": -1, "EI": -1},
}

# 부정어. 한국어는 부정이 뒤에 오는 일이 많다 — "조용한 건 별로"
NEGATORS = ("안 ", "않", "못 ", "없", "별로", "아니", "싫", "말고", "보다")


def score_free_text(text: str) -> dict:
    """
    키워드로 안 잡힌 문장에서 축 점수를 뽑는다.

    LLM 을 쓰지 않는다. 1차는 즉시 응답해야 하고,
    비회원이 여러 번 눌러 보게 하려면 무료여야 한다.
    """
    t = str(text or "")
    if len(t.strip()) < 2:
        return {}

    bucket = {}
    for word, axes in LEXICON.items():
        pos = t.find(word)
        if pos < 0:
            continue
        # 앞 6글자 + 뒤 8글자에서 부정어를 찾아 점수를 뒤집는다
        head = t[max(0, pos - 6):pos]
        tail = t[pos + len(word):pos + len(word) + 8]
        sign = -1 if any(n in head or n in tail for n in NEGATORS) else 1
        for a, v in axes.items():
            bucket.setdefault(a, []).append(v * sign)
    return bucket


def parse_picks(text: str) -> tuple[list, list, str]:
    """
    검색창 문자열에서 아는 키워드를 골라내고, 남은 문장을 돌려준다.

    남은 문장은 자유 입력으로 따로 채점한다.
    키워드로 이미 잡힌 부분을 지우지 않으면
    "혼자만의 고요한 시간" 이 키워드로 한 번, '혼자'·'고요' 로 또 한 번
    이중 계산된다.
    """
    t = str(text or "")
    picks, house = [], []
    rest = t

    for k in KEYWORDS:
        if k in rest:
            picks.append(k)
            rest = rest.replace(k, " ")
    for k in HOUSE_KEYWORDS:
        if k in rest:
            house.append(k)
            rest = rest.replace(k, " ")
    return picks, house, rest


def score_axes(picks: list, free: dict | None = None) -> dict:
    """
    키워드 목록 -> 축 점수(-1.0 ~ +1.0).

    ※ 평균이 아니라 '합산 후 완만한 정규화' 를 쓴다.
      평균을 내면 주축(±2) 하나가 보조축(±1) 여러 개에 묻힌다.
      실제로 '흙길 산책(E+1)' + '혼자만의 시간(I-1)' 이 상쇄돼
      EI 축이 정확히 0 이 되는 일이 잦았다.

      합산하면 방향이 살아남고, 나누는 값을 개수가 아니라
      sqrt(개수) 로 두면 키워드를 많이 골랐다고 점수가 물타기 되지 않는다.
    """
    bucket = {a: [] for a in AXES}
    for k in picks:
        for axis, val in KEYWORDS.get(k, {}).items():
            if axis in bucket:
                bucket[axis].append(val)

    # 자유 입력에서 뽑은 값도 같은 통에 넣는다.
    # 다만 어간 매칭은 키워드 클릭보다 근거가 약하므로 절반만 반영한다
    for axis, vals in (free or {}).items():
        if axis in bucket:
            bucket[axis].extend(v * 0.5 for v in vals)

    out = {}
    for axis, vals in bucket.items():
        if not vals:
            out[axis] = 0.0
            continue
        # 합을 sqrt(n)로 나눠 완만하게 줄인 뒤 -1~+1 로 자른다.
        # 문항 점수가 ±2 이므로 2로 한 번 더 나눈다
        raw = sum(vals) / (len(vals) ** 0.5) / 2
        out[axis] = round(max(-1.0, min(1.0, raw)), 3)
    return out


def type_of(axis: dict) -> dict:
    """
    축 점수 -> 유형.

    ※ 이름은 '항상' 16유형 중 하나를 준다.
      3개 키워드로 4축을 다 채우는 조합은 절반이 안 된다.
      나머지에게 "차로 다니는 조용한형" 같은 조합 이름을 주면
      재미가 없고 공유할 마음도 안 생긴다. 이름은 주되,
      확실하지 않은 축은 설명 문장에서 빼서 과장하지 않는다.

    confidence 로 몇 축이 확실한지 함께 알려 준다.
    화면에서 낮으면 "키워드를 더 고르면 정확해져요" 를 띄우면 된다.
    """
    filled = [a for a in AXES if abs(axis.get(a, 0)) >= NEUTRAL]
    code = "".join(
        (AXES[a]["pos"] if axis.get(a, 0) >= 0 else AXES[a]["neg"])[0]
        for a in AXES)
    name, desc = TYPES[code]
    return {
        "code": code,
        "name": name,
        "desc": desc,
        "filled": filled,
        "confidence": round(len(filled) / len(AXES), 2),
        # 축이 2개도 안 차면 이름을 믿기 어렵다. 화면에서 톤을 낮춘다
        "weak": len(filled) < 2,
    }


def describe(axis: dict) -> list:
    """
    유형을 세 줄로 푼다. 이름만으로는 왜 그런지 모른다.
    중립인 축은 넣지 않는다. 모르는 걸 단정하면 신뢰를 잃는다.
    """
    PHRASE = {
        "EI": ("나가서 시간을 보내는 편이고", "집 안에서 보내는 시간이 많고"),
        "BQ": ("북적이는 곳을 편하게 느끼며", "조용한 주거지를 선호하며"),
        "TP": ("동네 사람과 어울리는 걸 좋아해요", "혼자만의 공간을 중요하게 여겨요"),
        "WD": ("생활 반경을 걸어서 채워요", "차로 이동하는 일이 많아요"),
    }
    out = []
    for a, (pos, neg) in PHRASE.items():
        s = axis.get(a, 0.0)
        if abs(s) < NEUTRAL:
            continue
        out.append(pos if s > 0 else neg)
    return out


def to_weights(axis: dict) -> dict:
    """축 점수 -> 7개 지표 가중치(1.0~5.0). 지역 정렬에 쓴다.

    정수로 반올림하지 않는다 —
    축 점수가 완만하게 정규화되어 있어(score_axes 참고) 가중치 차이가 보통
    ±0.5 안쪽인데, round() 로 접으면 그 차이가 통째로 사라져 7개가 전부
    3(=조건 없음)이 된다. "조용한 곳"을 고른 사용자에게 중구 명동이 추천되던
    원인이었다. 받는 쪽(typespot.recommend, 엔진의 recommend_by_weights)은
    둘 다 실수를 그대로 처리하므로 정수로 만들 이유가 없다
    """
    w = {k: 3.0 for k in WEIGHT_KEYS}
    for a, eff in AXIS_TO_WEIGHT.items():
        s = axis.get(a, 0.0)
        for key, coef in eff.items():
            w[key] += s * coef
    return {k: round(max(1.0, min(5.0, v)), 2) for k, v in w.items()}


def profile(text: str) -> dict:
    """검색창 문자열 하나로 전부 계산한다. 키워드 클릭과 자유 입력을 함께 본다."""
    picks, house, rest = parse_picks(text)
    free = score_free_text(rest)
    axis = score_axes(picks, free)
    t = type_of(axis)

    # 자유 입력만으로도 축이 잡히면 '고른 것' 으로 친다.
    # 안 그러면 문장을 길게 쓴 사람이 "키워드를 고르세요" 를 계속 본다
    free_axes = len([a for a, v in free.items() if v])
    picked = len(picks)
    effective = picked + (1 if free_axes >= 2 else 0) + (1 if free_axes >= 3 else 0)

    return {
        "picks": picks,
        "housePicks": house,
        "freeText": rest.strip(),
        "freeAxes": free_axes,
        "axisScores": axis,
        "typeCode": t["code"],
        "typeName": t["name"],
        "typeDesc": t["desc"],
        "confidence": t["confidence"],
        "weak": t["weak"],
        "filledAxes": t["filled"],
        "lines": describe(axis),
        "weights": to_weights(axis),
        "enough": effective >= MIN_PICK,
        "picked": effective,
        "minPick": MIN_PICK,
    }


def sample_keywords(n: int = 14) -> list:
    """배경에 뿌릴 키워드를 섞어서 n개 고른다."""
    pool = ALL_KEYWORDS[:]
    random.shuffle(pool)
    return pool[:n]


if __name__ == "__main__":
    cases = [
        "산책하기 좋은 혼자가 편한 걸어서 다 되는",
        "주차가 편한 차로 움직이는 대형마트가 가까운",   # 같은 계열만 3개
        "쇼핑 거리가 있는 밤에도 밝은 약속이 많은 단골집이 생기는",
        "공원이 가까운",                                  # 1개만
    ]
    for c in cases:
        p = profile(c)
        print(f"\n--- {c} ---")
        print(f"  고른 키워드 {p['picked']}개  (충분: {p['enough']})")
        print("  축   " + "  ".join(f"{a}:{s:+.2f}"
                                   for a, s in p["axisScores"].items()))
        print(f"  유형 {p['typeCode']}  {p['typeName']}"
              f"{'  (부분)' if p['partial'] else ''}")
        if p["typeDesc"]:
            print(f"       {p['typeDesc']}")
        for line in p["lines"]:
            print(f"       · {line}")
        print("  가중치 " + " ".join(f"{k}{v}" for k, v in p["weights"].items()))