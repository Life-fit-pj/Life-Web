"""1차 유형에 어울리는 동네 고르기.

[어디서 오나]
  엔진(:8000)의 POST /recommend 하나다. 순위도 카드 문구의 원본 개수(counts)도 거기서 온다.
  예전에는 life.db 나 CSV 사본을 직접 읽고 여기서 백분위를 다시 계산했다 —
  같은 규칙이 두 곳에 있으면 반드시 갈린다. 이제 채점은 엔진 한 곳에서만 한다.

  ★ 동네마다 /facilities 를 부르지 않는다. 그 경로는 지도 핀용이라 시설 5표를 읽어
    한 번에 1.6초다 — 1차는 "즉시 나오는 맛보기"(routers/lifetype.py 주석)라 안 맞는다.

[가격]
  예산을 아직 안 받으므로 housing 없이 부른다. 그러면 엔진이 시세를 8번째 신호로
  얹어 "저렴한 동네를 살짝 우대" 한다 — 2차 화면의 "고려안함(ANY)" 과 같은 동작이다
  (services/engine.py to_housing 의 주석). 옛 중앙값 ±35% 밴드는 없앴다.
  카드의 price 는 None 이다. 화면이 "가격 미정" 으로 그린다.

[데이터가 없을 때]
  엔진이 안 떠 있으면 빈 목록을 돌려주고 status() 가 그 사실을 화면에 드러낸다.
  가짜로 정상인 척하는 편보다 비어 있는 편이 낫다 — 옛 주석의 판단을 그대로 지킨다.
"""

from services import engine

SHOW = 2      # 상위 몇 곳을 보여줄지

# 화면에 붙일 한 줄 설명. 정규화 점수보다 실제 개수가 와닿는다.
# ★ 여기 적힌 칸은 엔진 app/engine/recommend.py 의 COUNT_COLUMNS 와 짝이다.
#   한쪽만 고치면 문구가 조용히 빈다
BLURB_COLS = {

    "녹지": [("공원_수", "공원 {n}개")],
    "안전": [("CCTV_수", "CCTV {n}대"), ("경찰관서_수", "경찰관서 {n}개")],
    "교통": [("지하철역_수", "지하철역 {n}개"), ("버스정류장_수", "버스정류장 {n}개")],
    "상권": [("대형점포_수", "대형점포 {n}개"), ("점포_수", "상권 밀집")],
    "의료": [("의료기관_수", "병의원 {n}개")],
    "교육": [("학교_수", "학교 {n}개"), ("학원_수", "학원 {n}개")],
    "문화": [("문화시설_수", "문화시설 {n}개"), ("도서관_수", "도서관 {n}개")],
}

# ★ 키 이름을 바꾸지 않는다. frontend/ui/lifetype.js:46 noSpotReason() 이
#   dbFound · regions 두 키로 "왜 비었나" 를 판단한다. 바꾸려면 프론트도 같이
_STATUS = {"source": "engine-api", "dbFound": None, "regions": 0, "error": None}


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _blurb(d, weights):
    """가중치가 높은 지표 위주로 실제 개수를 보여 준다"""
    top = sorted(weights.items(), key=lambda x: -x[1])[:3]
    bits = []
    for key, _ in top:
        for col, tmpl in BLURB_COLS.get(key, []):
            n = _num(d.get(col))
            if n and n >= 1:
                bits.append(tmpl.format(n=int(n)))
                break
        if len(bits) == 2:
            break
    return " · ".join(bits) if bits else "생활 여건이 고른 편"


def _to_card(r, weights):
    """엔진의 한 줄(name·total·scores·counts·price)을 화면 카드 모양으로.

    counts 는 /recommend 응답에 같이 실려 온다 — 동네마다 따로 물어보지 않는다.
    예전에는 /facilities 를 동네마다 불렀는데, 그 경로는 지도 핀용이라 시설 5표를
    통째로 읽어 한 번에 1.6초였다(교안 study3.md 0-3). 1차는 연달아 누르는 화면이다
    """
    gu, dong = r["name"].split(" ", 1)
    return {
        "gu": gu,
        "dong": dong,
        "name": f"서울특별시 {gu} {dong}",
        "score": r["total"],
        "blurb": _blurb(r.get("counts", {}), weights),
        "price": None,          # 예산을 아직 안 받았다 — 파일 머리 [가격] 참고
    }


def recommend(weights: dict, show: int = SHOW) -> list:
    """가중치 7개 -> 어울리는 동네 show 곳.

    무작위 없이 상위 show 를 그대로 돌려준다 — 2차(엔진의 recommend_by_weights)도
    무작위 없이 순수 top5 라, 같은 가중치면 1차·2차가 겹칠 확률이 높아진다
    (옛 주석의 "아까 그 동네는 어디 갔지" 를 막는 결정을 그대로 지킨다)
    """
    try:
        rows = engine.recommend_by_weights(weights, top_k=show)
    except Exception as e:                       # 연결 거부(ConnectError)·4xx/5xx 둘 다
        _STATUS.update(dbFound=False, regions=0, error=f"{type(e).__name__}: {e}")
        return []

    _STATUS.update(dbFound=True, regions=len(rows), error=None)
    return [_to_card(r, weights) for r in rows]


def status():
    """무엇이 준비됐는지. /api/lifetype 응답에 실어 화면에서 원인을 볼 수 있게 한다."""
    return dict(_STATUS)


if __name__ == "__main__":
    print(status())
    for name, w in [
        ("조용·도보", {"녹지": 5, "안전": 4, "교통": 2, "상권": 2, "의료": 3, "교육": 3, "문화": 2}),
        ("번화·문화", {"녹지": 2, "안전": 3, "교통": 4, "상권": 5, "의료": 3, "교육": 3, "문화": 5}),
    ]:
        print(f"\n--- {name} ---")
        for x in recommend(w, show=5):
            print(f"  {x['gu']} {x['dong']}  {x['score']}  ({x['blurb']})")
    print("\n", status())
