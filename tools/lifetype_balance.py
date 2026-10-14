"""1차 유형 16가지가 얼마나 고르게 나오는지 잰다. LLM 도 서버도 안 쓴다 — 2초.

    py -m tools.lifetype_balance          # 저장소 뿌리에서

키워드에서 3개 · 4개 · 5개를 고르는 모든 조합을 돌려 유형을 센다.
"사람이 실제로 고르는 조합"은 아니다 — 사람은 뜻이 통하는 키워드끼리 고르고, 화면에는 20개만 떠 있다.
그러니 아래 범위(3~12%)는 목표가 아니라 **표가 한쪽으로 기울었는지 보는 경보기**다. 숫자를 맞추려고
키워드의 뜻을 바꾸면 주객이 바뀐다.

보는 것 셋 — ① 축마다 +쪽 · -쪽 키워드의 수와 점수 합(같아야 균형) ② 유형 16개의 비율(균등이면 6.25%)
③ 글자 쌍의 비율(E:I 같은 것, 50:50 이면 균형).

2026-10-08 고치기 전: EBTW 24.2% · IBTD 0.8% · W:D 77:23. 고친 뒤: 최대 14.3% · 최소 3.2% · 글자 쌍 전부 53:47 안.
"""

import collections
import itertools

from services import lifetype as lt

LOW, HIGH = 3.0, 12.0      # 유형 비율의 경보 범위(%)


def axis_balance() -> None:
    kws = list(lt.KEYWORDS)
    print("축별 키워드 — +쪽 점수합/개수  vs  -쪽 점수합/개수")
    for a in lt.AXES:
        pos = sum(v for k in kws for ax, v in lt.KEYWORDS[k].items() if ax == a and v > 0)
        neg = sum(-v for k in kws for ax, v in lt.KEYWORDS[k].items() if ax == a and v < 0)
        npos = sum(1 for k in kws if lt.KEYWORDS[k].get(a, 0) > 0)
        nneg = sum(1 for k in kws if lt.KEYWORDS[k].get(a, 0) < 0)
        flag = "" if abs(pos - neg) <= 2 and abs(npos - nneg) <= 2 else "   ← 기울었다"
        print(f"  {a}  +{pos:2d}/{npos:2d}개   -{neg:2d}/{nneg:2d}개{flag}")


def type_distribution(n: int) -> None:
    kws = list(lt.KEYWORDS)
    count = collections.Counter()
    zero = collections.Counter()
    total = 0
    for combo in itertools.combinations(kws, n):
        axis = lt.score_axes(list(combo))
        count[lt.type_of(axis)["code"]] += 1
        total += 1
        for a in lt.AXES:
            if axis.get(a, 0) == 0:
                zero[a] += 1

    dist = sorted(count.items(), key=lambda x: -x[1])
    print(f"\n키워드 {n}개 조합 {total:,}가지 — 유형 비율 (균등이면 {100 / len(lt.TYPES):.2f}%)")
    for code, c in dist:
        pct = 100 * c / total
        flag = "" if LOW <= pct <= HIGH else "   ← 범위 밖"
        print(f"  {code} {lt.TYPES[code][0]:<9s} {pct:5.1f}%{flag}")
    missing = [c for c in lt.TYPES if c not in count]
    if missing:
        print("  한 번도 안 나온 유형:", missing)

    letters = collections.Counter()
    for code, c in count.items():
        for ch in code:
            letters[ch] += c
    pairs = "  ".join(f"{lt.AXES[a]['pos'][0]}:{lt.AXES[a]['neg'][0]} = "
                      f"{100 * letters[lt.AXES[a]['pos'][0]] / total:.0f}:{100 * letters[lt.AXES[a]['neg'][0]] / total:.0f}"
                      for a in lt.AXES)
    print("  글자 쌍:", pairs)
    print("  축이 정확히 0 인 비율:", "  ".join(f"{a} {100 * zero[a] / total:.0f}%" for a in lt.AXES))


if __name__ == "__main__":
    axis_balance()
    for n in (3, 4, 5):
        type_distribution(n)
