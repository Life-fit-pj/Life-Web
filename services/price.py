"""시세 조회와 예산 비교.

추천 순위는 엔진이 만족도로 정한다. 여기서는 그 결과에
"예산에 맞는가" 를 얹어 조정하고, 화면에 보여줄 시세를 붙인다.
금액 단위는 전부 만원이다.
"""

import csv
import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(BASE_DIR, "data", "시세_지역별.csv")

# 예산을 넘었을 때 깎을 최대 비율과 기울기.
# 총점의 절대 크기를 모르므로 비율로 깎는다 —
# 엔진이 점수 체계를 바꿔도 이 값은 그대로 쓸 수 있다
MAX_PENALTY = 0.25    # 아무리 비싸도 25% 까지만
SLOPE = 0.5           # 예산 대비 50% 초과 → 25% 감점

_TABLE = None


def _load():
    """CSV 를 한 번만 읽어 (구, 동, 용도, 거래유형) 사전으로 들고 있는다."""
    global _TABLE
    if _TABLE is not None:
        return _TABLE

    table = {}
    with open(CSV_PATH, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            key = (row["자치구명"], row["지역명"],
                   row["건물용도"], row["거래유형"])
            table[key] = row
    _TABLE = table
    return table


def _num(v):
    """빈 칸과 0 을 None 으로 통일한다. 해당 없는 칸이 0 으로 읽히면 안 된다."""
    try:
        x = float(v)
        return x if x > 0 else None
    except (TypeError, ValueError):
        return None


def lookup(gu, dong, bldg, deal):
    """동네 하나의 시세를 돌려준다. 없으면 None."""
    row = _load().get((gu, dong, bldg, deal))
    if not row:
        return None

    info = {
        "거래유형": deal,
        "건물용도": bldg,
        "거래건수": row["거래건수"],
        "신뢰등급": row["신뢰등급"],
        "출처": row["출처"],
        "면적_중앙값": _num(row["면적_중앙값"]),
    }

    if deal == "월세":
        info["보증금"] = _num(row["보증금"])
        info["월임대료"] = _num(row["월임대료"])
    else:
        col = "매매가" if deal == "매매" else "보증금"
        info["금액"] = _num(row[col])
        info["금액_25"] = _num(row[f"{col}_25"])
        info["금액_75"] = _num(row[f"{col}_75"])

    return info


def over_ratio(info, prefs):
    """예산을 얼마나 넘었는지 비율로 돌려준다.

    예산 안이면 0. 싼 것은 감점하지 않는다 —
    "예산보다 저렴한 동네" 를 밀어낼 이유가 없다
    """
    if not info:
        return 0.0

    deal = info["거래유형"]

    if deal == "월세":
        # 보증금과 임대료를 각각 비교해 평균낸다.
        # 월환산으로 합치지 않는 이유는 컬럼설명.md 참고
        gaps = []
        for key, pref_key in (("보증금", "wolseDeposit"),
                              ("월임대료", "wolseRent")):
            시세 = info.get(key)
            내예산 = prefs.get(pref_key)
            if 시세 and 내예산:
                gaps.append(max(0.0, (시세 - 내예산) / 내예산))
        return sum(gaps) / len(gaps) if gaps else 0.0

    시세 = info.get("금액")
    내예산 = prefs.get("salePrice" if deal == "매매" else "jeonseDeposit")
    if not 시세 or not 내예산:
        return 0.0
    return max(0.0, (시세 - 내예산) / 내예산)


def apply_budget(regions, prefs, top_k=5):
    """추천 목록에 시세를 붙이고 예산 초과분만큼 감점해 다시 정렬한다."""
    deal = prefs.get("dealType") or "전세"
    bldg = prefs.get("bldgType") or "아파트"

    for r in regions:
        gu, dong = r["name"].split(" ", 1)
        info = lookup(gu, dong, bldg, deal)
        gap = over_ratio(info, prefs)

        r["price"] = info          # 화면 표시용
        r["priceGap"] = round(gap, 3)
        r["totalRaw"] = r["total"]  # 감점 전 점수도 남겨 둔다

        if gap > 0:
            r["total"] = round(r["total"] * (1 - min(MAX_PENALTY, gap * SLOPE)), 2)

    regions.sort(key=lambda r: r["total"], reverse=True)
    return regions[:top_k]