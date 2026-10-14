"""글에서 가구 구성 읽기 — 2차 설문(persona_type)과 평면도(floorplan)가 같이 쓴다.

낱말 표가 두 곳에 따로 있으면 한쪽에 "조카"를 더할 때 다른 쪽은 모른다(2026-10-09 까지 그랬다). 1차 유형의 자유 입력 사전
(lifetype.LEXICON)은 여기 안 넣는다 — 거기는 낱말을 네 축으로 보내는 표라 목적이 다르다.
"""

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
# "방이 더 필요하다"는 신호 — 2차 설문 f2(아쉬운 점) · h1(취미)에서 나온다. 평면도가 알파룸 가점으로 쓴다
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
