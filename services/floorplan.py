"""
LH 평면도 추천 — 라이프스타일에 맞는 집 구조.

원안은 "라이프스타일에 맞는 집 구조 추천"이었고, 시간이 부족해 "아파트를 골랐을 때 '이런 구조·방 수의
집은 어때요'로 도면 3~4장 보여 주기"로 줄였다(기획자). 이 파일이 그 줄인 것이다.

읽는 것   data/LH평면도_속성.csv — 그림이 있는 LH 공공주택 도면 223장. 한 줄에 경로 · 전용면적 · 사업지구 ·
          구조(침실 · 욕실 · 알파룸 · 드레스룸 · 팬트리 · 주방 · 발코니 · 거실). 구조는 2026-10-08 에 그림을 보고 적었다.
          브로슈어 통째·입체도 42장은 이 CSV 에 없다 — 그러니 여기 있는 건 전부 카드에 띄울 수 있다.
입력      면적(슬라이더) + 검색어·설문 글(가족 말, 재택, 취미) + 1차 집 조건 키워드(housePicks)
출력      find_floorplans() → {"plans": [{path, caption, tags}], "note": 한 줄, "mode": "layout" | "area"}
          가구 구성을 하나도 못 읽으면 mode="area" — 면적만으로 고르고 그렇다고 적는다.
LLM 은 안 부른다. 비회원이 슬라이더를 바꿔 가며 눌러도 공짜여야 한다.
"""

import csv
import os

# 이 파일은 services/ 안에 있으므로 두 단계 올라가야 프로젝트 뿌리다
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
ATTR_CSV_PATH = os.path.join(DATA_DIR, "LH평면도_속성.csv")

INT_COLUMNS = ("침실", "욕실", "알파룸", "드레스룸", "팬트리", "주방", "발코니", "거실")


def _load() -> list:
    """속성 CSV → 줄마다 dict. 숫자 칸은 int, 면적은 float."""
    try:
        with open(ATTR_CSV_PATH, encoding="utf-8-sig", newline="") as f:
            rows = list(csv.DictReader(f))
    except OSError as e:
        print("❌ LH 평면도 속성 CSV 로드 실패:", e)
        return []
    for r in rows:
        r["전용면적"] = float(r["전용면적"])
        for c in INT_COLUMNS:
            r[c] = int(r[c])
    print(f"✅ LH 평면도 속성 로드 완료! ({len(rows)}장)")
    return rows


PLANS = _load()

AREA_SPAN = 10          # 면적 ±10㎡ 안에서 고른다
AREA_SPAN_WIDE = 25     # "넓은 게 최고인" 이면 위로 더 넓게
AREA_MIN, AREA_MAX = 25, 115    # 자료의 전용면적 범위


# ============================================================
# 글에서 가구 구성 읽기
#   검색어("아이 둘이랑 살 조용한 동네")도, 2차 설문 15개 답을 이은 글도 같은 함수로 읽는다 —
#   설문은 /api/predict 에 답을 통째로 이어 보내므로(search.js runSurveyIfPending) 문항별로 못 받는다.
#   낱말은 persona_type.extract_household 와 같은 것을 쓴다. 한쪽을 바꾸면 다른 쪽도 본다
# ============================================================
HOUSEHOLD_WORDS = {
    "family": ("아이", "자녀", "딸", "아들", "육아", "애들", "애기", "아기", "유치원", "초등", "중학", "고등"),
    "parent": ("부모님", "어머니", "아버지", "장인", "장모", "시어머니", "시아버지", "모시"),
    "couple": ("아내", "남편", "배우자", "둘이", "부부", "신혼", "와이프"),
    "single": ("혼자", "1인", "자취", "독립", "싱글"),
}
CHILD_WORDS = {
    "infant": ("영유아", "아기", "애기", "어린이집", "태어", "신생아", "돌"),
    "elementary": ("초등", "유치원"),
    "secondary": ("중학", "고등", "수능", "학원"),
}
# "방이 더 필요하다"는 신호 — 2차 설문 f2(아쉬운 점) · h1(취미)에서 나온다. 침실 수를 올리는 게 아니라 알파룸을 우선한다(침실 4 는 2장뿐)
EXTRA_ROOM_WORDS = ("재택", "작업실", "서재", "취미", "운동기구", "악기", "피아노", "수납", "짐이 많", "방이 부족", "방이 좁", "좁아",
                    "컴퓨터", "게임", "작업 공간", "맥시멀")
COOK_WORDS = ("요리", "직접 해", "해 먹", "집밥", "주방")


def household_from_text(text: str) -> dict:
    """글에서 가구 구성·신호를 뽑는다. 못 읽은 칸은 없다(키가 없다).

    먼저 걸리는 종류를 쓰되, 가족·부모님이 1인보다 우선한다 — "혼자 키우는 아이"는 family 다.
    """
    t = str(text or "")
    h = {}
    for kind in ("family", "parent", "couple", "single"):
        if any(w in t for w in HOUSEHOLD_WORDS[kind]):
            h["household"] = kind
            break
    for kind in ("infant", "elementary", "secondary"):
        if any(w in t for w in CHILD_WORDS[kind]):
            h["child"] = kind
            break
    if any(w in t for w in EXTRA_ROOM_WORDS):
        h["extra_room"] = True
    if any(w in t for w in COOK_WORDS):
        h["cook"] = True
    return h


# ============================================================
# 가구 구성 → 원하는 구조
#   라벨링 분포(223장): 침실 3 · 욕실 2 가 156장이라 그것만으로는 못 가른다.
#   가르는 건 면적 · 알파룸(45) · 팬트리(97) · 욕실 1(29). 소형(침실 0~1)은 6장뿐이라 1인 가구는 침실 2 까지 받는다
# ============================================================
HOUSE_PICK_SIGNALS = {
    "방이 많은": "extra_room",
    "면적은 작아도 분리된": "separated",
    "넓은 게 최고인": "wide",
    "새 집이면 좋겠는": None,          # 구조와 무관 — 안 쓴다
}


def wanted_layout(household: dict, house_picks: list | None = None) -> dict:
    """{"bed": (lo, hi), "bath_min", "prefer": {칸: 가점}, "span": 면적 폭, "known": 가구를 읽었나, "note": 문장}"""
    h = dict(household or {})
    for pick in house_picks or ():
        sig = HOUSE_PICK_SIGNALS.get(pick)
        if sig:
            h[sig] = True

    kind = h.get("household")
    prefer = {}
    if kind == "single":
        bed, bath_min = (0, 2), 0
        prefer["욕실1"] = 1
        note = "혼자 살면 방 하나에 작업 공간 하나면 충분해요"
    elif kind == "couple":
        bed, bath_min = (2, 3), 0
        prefer["드레스룸"] = 1
        note = "둘이면 침실 둘 — 하나는 옷방이나 서재로 쓰기 좋아요"
    elif kind == "family":
        bed, bath_min = (3, 4), 2
        if h.get("child") == "infant":
            prefer["알파룸"] = 1
            note = "아이가 어리면 거실 옆 작은 방이 놀이방이 돼요"
        else:
            prefer["팬트리"] = 1
            note = "아이 방이 따로 필요한 때라 방 셋에 욕실 둘을 골랐어요"
    elif kind == "parent":
        bed, bath_min = (3, 4), 2
        prefer["욕실3"] = 1
        note = "세대가 함께 살면 욕실 둘은 있어야 해요"
    else:
        bed, bath_min = (0, 4), 0
        note = "입력한 면적에 가까운 도면이에요"

    if h.get("extra_room"):
        prefer["알파룸"] = prefer.get("알파룸", 0) + 1
        if kind == "single":
            bed = (1, 2)
    if h.get("separated"):
        prefer["알파룸"] = prefer.get("알파룸", 0) + 1
        prefer["드레스룸"] = prefer.get("드레스룸", 0) + 1
    if h.get("cook"):
        prefer["팬트리"] = prefer.get("팬트리", 0) + 1

    return {"bed": bed, "bath_min": bath_min, "prefer": prefer,
            "span": AREA_SPAN_WIDE if h.get("wide") else AREA_SPAN,
            "known": kind is not None, "note": note}


def _score(plan: dict, wanted: dict, area: float) -> float:
    """조건을 얼마나 맞추나. 면적이 가까울수록, 우선 칸이 있을수록 높다."""
    s = 0.0
    for key, weight in wanted["prefer"].items():
        if key == "욕실1":
            s += weight if plan["욕실"] == 1 else 0
        elif key == "욕실3":
            s += weight if plan["욕실"] >= 3 else 0
        else:
            s += weight * plan[key]
    s -= abs(plan["전용면적"] - area) / 10       # 10㎡ 멀어질 때마다 가점 하나만큼 깎는다
    return s


def _caption(plan: dict) -> str:
    parts = [f"방 {plan['침실']}" if plan["침실"] else "원룸형", f"욕실 {plan['욕실']}"]
    for k in ("알파룸", "드레스룸", "팬트리"):
        if plan[k]:
            parts.append(k)
    return " · ".join(parts) + f" — 전용 {plan['전용면적']:.0f}㎡ · LH {plan['사업지구']}"


def find_floorplans(area: float, text: str = "", house_picks: list | None = None, n: int = 4) -> dict:
    """면적 + 글 → 도면 n 장. 지역은 안 본다.

    1) 면적 ±span 안 · 침실 범위 · 욕실 하한으로 거른다
    2) 모자라면 조건을 하나씩 푼다 — 욕실 하한 → 침실 범위 → 면적 폭 두 배 → 전부
    3) 점수 순으로, 같은 사업지구는 하나씩 n 장
    """
    if not PLANS:
        return {"plans": [], "note": "", "mode": "area"}
    area = float(area or 59)
    wanted = wanted_layout(household_from_text(text), house_picks)

    def pick(span, bed, bath_min):
        lo, hi = bed
        return [p for p in PLANS
                if abs(p["전용면적"] - area) <= span and lo <= p["침실"] <= hi and p["욕실"] >= bath_min]

    span, bed, bath_min = wanted["span"], wanted["bed"], wanted["bath_min"]
    steps = [(span, bed, bath_min), (span, bed, 0), (span, (0, 4), 0), (span * 2, (0, 4), 0), (999, (0, 4), 0)]
    chosen = []
    for s, b, bm in steps:
        chosen = pick(s, b, bm)
        if len(chosen) >= 3:
            break

    # 점수 순으로 뽑되 같은 사업지구는 하나씩 — 같은 단지의 A·B 타입만 넉 장 나오면 비교할 게 없다
    chosen.sort(key=lambda p: -_score(p, wanted, area))
    top, seen = [], set()
    for p in chosen:
        if p["사업지구"] in seen:
            continue
        top.append(p)
        seen.add(p["사업지구"])
        if len(top) == n:
            break
    for p in chosen:                                  # 지구가 모자라면 같은 지구라도 채운다
        if len(top) == n:
            break
        if p not in top:
            top.append(p)

    note = wanted["note"]
    if not wanted["known"] and wanted["prefer"]:
        note = "입력한 면적 근처에서 방이 넉넉한 구조를 골랐어요"
    if not AREA_MIN <= area <= AREA_MAX:
        note += f" (자료가 {AREA_MIN}~{AREA_MAX}㎡ 까지라 가장 가까운 것을 골랐어요)"
    return {
        "plans": [{"path": p["path"], "caption": _caption(p),
                   "tags": {k: p[k] for k in INT_COLUMNS}} for p in top],
        "note": note,
        "mode": "layout" if wanted["known"] else "area",
    }


def find_floorplan(area: float) -> str:
    """면적만으로 한 장. 옛 호출처를 위해 남긴다 — 새 코드는 find_floorplans() 를 쓴다."""
    got = find_floorplans(area, n=1)
    return got["plans"][0]["path"] if got["plans"] else ""


if __name__ == "__main__":
    cases = [
        (59, "아이 둘이랑 조용한 동네", None),
        (59, "혼자 살고 재택근무", None),
        (46, "신혼부부", None),
        (84, "부모님 모시고 살 곳", None),
        (59, "", ["방이 많은"]),
        (30, "혼자", None),
        (120, "", ["넓은 게 최고인"]),
    ]
    for area, text, picks in cases:
        got = find_floorplans(area, text, picks)
        print(f"\n--- {area}㎡ · '{text}' · {picks} → {got['mode']} · {got['note']}")
        for p in got["plans"]:
            print("   ", p["caption"])
