"""
1차 유형에 어울리는 동네 고르기.

[데이터]
  life.db 의 master_dataset_v3 (427행) 하나만 읽는다.
  행정동별 시설 수와 밀도가 전부 들어 있어 별도 집계 테이블이 필요 없다.

  예전에는 region_score(집계 완료본)를 읽었는데, 팀에서 쓰는 life.db 에는
  그 테이블이 없고 원본 격인 master_dataset_v3 만 있었다.
  밀도까지 들어 있어 오히려 이쪽이 더 정확하다.

[점수 만드는 법]
  '밀도' 를 쓴다. 개수를 그대로 쓰면 면적 넓은 동이 무조건 이긴다.
  427개 동을 지표별로 백분위(0~100)로 바꿔 서로 비교 가능하게 만든다.

[매칭 실패가 없는 이유]
  검색이 아니라 채점이다. 427개 동 전부가 점수를 갖게 되므로
  가중치만 있으면 반드시 순위가 나온다.

[하드코딩 금지]
  DB 를 못 읽었을 때 지역 몇 곳을 코드에 박아 두면
  "항상 같은 동네가 나온다" 는 문제가 되고, 정작 DB 가 없다는 사실은
  화면에 드러나지 않는다. 가짜로 정상인 척하는 편보다 비어 있는 편이 낫다.
"""

from __future__ import annotations

import csv
import os
import sqlite3

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")

TABLE = "master_dataset_v3"


def _find(*names):
    """
    파일을 여러 후보 폴더에서 찾는다.

    life.db 는 Life-Web/data 에 있을 수도 있고,
    옆 저장소인 Life-Embed-jh/data 에 있을 수도 있다.
    둘 중 어디에 두든 돌아가야 팀원마다 폴더 구조가 달라도 안 깨진다.
    """
    parent = os.path.dirname(BASE_DIR)          # life-fit-pj
    cands = [DATA_DIR]
    # 형제 폴더 중 Life-Embed 로 시작하는 것들
    try:
        for d in sorted(os.listdir(parent)):
            if d.lower().startswith("life-embed"):
                cands.append(os.path.join(parent, d, "data"))
    except OSError:
        pass

    for d in cands:
        for n in names:
            path = os.path.join(d, n)
            if os.path.exists(path):
                return path
    return os.path.join(DATA_DIR, names[0])     # 못 찾으면 기본 경로


# 환경변수가 있으면 그게 최우선. 없으면 자동 탐색
DB_PATH = os.environ.get("LIFE_DB_PATH") or _find("life.db")

# DB 가 없어도 CSV 하나만 있으면 돌아간다.
# master_dataset_v3.csv 는 211KB 라 어디에 두든 부담이 없다
MASTER_CSV = _find("master_dataset_v3.csv")

# 시세 밴드에 쓸 칸. master_dataset_v3 안에 이미 있어서 따로 읽을 파일이 없다.
# 칸 이름 규칙({건물유형}_{거래유형}_{금액종류})은 엔진의
# app/engine/housing.py 의 DEAL_COLUMNS 와 같다
PRICE_COLUMN = "아파트_전세_보증금"

WEIGHT_KEYS = ["녹지", "안전", "교통", "상권", "의료", "교육", "문화"]

# 7개 지표를 만들 원본 컬럼과 방향.
#   +1 이면 값이 클수록 좋고, -1 이면 클수록 나쁘다(소음·범죄).
#   여러 컬럼을 섞을 때는 평균을 낸다.
#
# 엔진(Life-Embed-jh/app/engine/recommend.py 의 INDICATOR_COLUMNS)과 반드시 같은
# 컬럼 조합이어야 한다. 컬럼이 다르면 같은 가중치를 넣어도 동네별 원점수 자체가
# 달라져 1차에서 본 동네가 2차 순위에서 통째로 밀려난다(실측: 1차 top-8 안에
# 들어 있던 동네가 2차 top5 밖으로 사라짐)
INDICATOR_COLS = {
    "녹지": [("공원_밀도", 1)],
    "안전": [("CCTV_밀도", 1), ("경찰관서_밀도", 1)],
    "교통": [("지하철역_밀도", 1), ("버스정류장_밀도", 1)],
    "상권": [("점포_밀도", 1), ("대형점포_밀도", 1)],
    "의료": [("의료기관_밀도", 1)],
    "교육": [("학교_밀도", 1), ("학원_밀도", 1)],
    "문화": [("문화시설_밀도", 1), ("도서관_밀도", 1)],
}

# 화면에 붙일 한 줄 설명. 정규화 점수보다 실제 개수가 와닿는다
BLURB_COLS = {
    "녹지": [("공원_수", "공원 {n}개")],
    "안전": [("CCTV_수", "CCTV {n}대"), ("경찰관서_수", "경찰관서 {n}개")],
    "교통": [("지하철역_수", "지하철역 {n}개"), ("버스정류장_수", "버스정류장 {n}개")],
    "상권": [("대형점포_수", "대형점포 {n}개"), ("점포_수", "상권 밀집")],
    "의료": [("의료기관_수", "병의원 {n}개")],
    "교육": [("학교_수", "학교 {n}개"), ("학원_수", "학원 {n}개")],
    "문화": [("문화시설_수", "문화시설 {n}개"), ("도서관_수", "도서관 {n}개")],
}

# 서울 전세 중앙값 대비 이 범위에서만 뽑는다.
# 예산을 아직 안 받았으므로, 아무나 못 가는 동네를 보여 주면 나중에 실망한다
BAND_LOW, BAND_HIGH = 0.65, 1.35
USE_PRICE_BAND = True

SHOW = 2      # 상위 몇 곳을 보여줄지

_ROWS = None      # [(구, 동, {컬럼: 값})]
_SCORES = None    # {(구, 동): {지표: 0~100}}
_PRICE = None


# ============================================================
# 로드
# ============================================================
def _load_rows():
    global _ROWS
    if _ROWS is not None:
        return _ROWS

    _ROWS = []

    # 1순위: sqlite
    if os.path.exists(DB_PATH):
        con = sqlite3.connect(DB_PATH)
        try:
            cols = [r[1] for r in con.execute(f"PRAGMA table_info({TABLE})")]
            if cols:
                for row in con.execute(f"SELECT * FROM {TABLE}"):
                    d = dict(zip(cols, row))
                    gu = str(d.get("구") or "").strip()
                    dong = str(d.get("행정동명") or "").strip()
                    if gu and dong:
                        _ROWS.append((gu, dong, d))
            else:
                print(f"[typespot] {DB_PATH} 에 {TABLE} 테이블이 없습니다")
        except sqlite3.Error as e:
            print(f"[typespot] {TABLE} 읽기 실패: {e}")
        finally:
            con.close()

    # 2순위: CSV. DB 를 못 찾거나 테이블이 없을 때
    if not _ROWS and os.path.exists(MASTER_CSV):
        try:
            with open(MASTER_CSV, encoding="utf-8-sig") as f:
                for d in csv.DictReader(f):
                    gu = str(d.get("구") or "").strip()
                    dong = str(d.get("행정동명") or "").strip()
                    if gu and dong:
                        _ROWS.append((gu, dong, d))
            print(f"[typespot] CSV 로 대체: {MASTER_CSV}")
        except OSError as e:
            print(f"[typespot] CSV 읽기 실패: {e}")

    if _ROWS:
        print(f"[typespot] {len(_ROWS)}개 동 로드")
    else:
        print("[typespot] 지역 데이터를 찾지 못했습니다")
        print(f"  찾아본 DB  : {DB_PATH}")
        print(f"  찾아본 CSV : {MASTER_CSV}")
        print("  life.db 나 master_dataset_v3.csv 를 data/ 에 두거나")
        print("  .env 에 LIFE_DB_PATH 를 넣으세요")
    return _ROWS


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _percentile_map(values):
    """
    값 목록 -> 0~100 백분위.
    지표마다 단위가 제각각이라(개수, 밀도, dB) 그대로 더할 수 없다.
    순위로 바꾸면 서로 비교 가능해진다.
    """
    valid = sorted(v for v in values if v is not None)
    if not valid:
        return lambda v: 50.0
    n = len(valid)

    def rank(v):
        if v is None:
            return 50.0
        lo, hi = 0, n
        while lo < hi:                       # bisect_left
            mid = (lo + hi) // 2
            if valid[mid] < v:
                lo = mid + 1
            else:
                hi = mid
        return lo / (n - 1) * 100 if n > 1 else 50.0

    return rank


def _load_scores():
    """master_dataset_v3 -> {(구, 동): {7개 지표: 0~100}}"""
    global _SCORES
    if _SCORES is not None:
        return _SCORES

    rows = _load_rows()
    _SCORES = {}
    if not rows:
        return _SCORES

    # 지표별로 원본 컬럼을 백분위로 바꾼 뒤 평균을 낸다
    per_col = {}
    for parts in INDICATOR_COLS.values():
        for col, _sign in parts:
            if col in per_col:
                continue
            vals = [_num(d.get(col)) for _, _, d in rows]
            per_col[col] = (_percentile_map(vals), vals)

    for i, (gu, dong, d) in enumerate(rows):
        ind = {}
        for key, parts in INDICATOR_COLS.items():
            acc = []
            for col, sign in parts:
                rank_fn, vals = per_col[col]
                p = rank_fn(vals[i])
                acc.append(p if sign > 0 else 100.0 - p)
            ind[key] = round(sum(acc) / len(acc), 2) if acc else 50.0
        _SCORES[(gu, dong)] = ind

    return _SCORES


def _load_price():
    """아파트 전세 보증금 -> {(구, 동): 만원}

    파일 맨 위 [데이터] 에 적은 대로 master_dataset_v3 하나만 읽는다.
    시세도 그 안에 동마다 한 줄로 들어 있어 따로 열 파일이 없다.

    예전에는 Life-Web/data 의 시세 CSV 를 따로 읽었는데 두 가지가 잘못돼 있었다.
      - 원본이 Life-Embed-jh/data 에 있는데 사본을 만들어 두 벌이 됐다
      - 없는 칸('기준금액')을 읽어 매 줄이 걸러졌고, 그래서 _PRICE 가 늘 비어
        recommend() 의 시세 밴드가 한 번도 돌지 않았다
    """
    global _PRICE
    if _PRICE is not None:
        return _PRICE

    _PRICE = {}
    for gu, dong, d in _load_rows():
        v = _num(d.get(PRICE_COLUMN))
        if v is not None and v > 0:
            _PRICE[(gu, dong)] = v

    return _PRICE


def status():
    """무엇이 준비됐는지. /api/lifetype 응답에 실어 화면에서 원인을 볼 수 있게 한다.

    파일이 있는지(*Found)와 값이 실렸는지(*Loaded)를 따로 알린다 —
    파일만 보고 "된다" 고 판단하면, 칸 이름이 바뀌어 한 줄도 못 읽는
    상태를 정상으로 착각하게 된다 (실제로 그런 적이 있다)
    """
    return {
        "dbPath": DB_PATH,
        "dbFound": os.path.exists(DB_PATH),
        "csvPath": MASTER_CSV,
        "csvFound": os.path.exists(MASTER_CSV),
        "table": TABLE,
        "priceColumn": PRICE_COLUMN,
        "priceLoaded": len(_load_price()),
        "regions": len(_load_scores()),
    }


# ============================================================
# 한 줄 설명
# ============================================================
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


# ============================================================
# 추천
# ============================================================
def recommend(weights: dict, show: int = SHOW) -> list:
    """
    가중치로 427개 동을 채점해 상위 show 곳을 돌려준다.

    예전엔 상위 8곳 중 2곳을 무작위로 뽑았다("같은 조합이면 늘 같은 결과가
    나와 김이 샌다"는 이유였다). 그런데 2차(엔진의 recommend_by_weights)는
    무작위 없이 순수 top5를 보여주므로, 1차가 무작위로 상위권 밖을 집으면
    "아까 그 동네는 어디 갔지"가 된다. 그래서 여기도 무작위 없이 top show를
    그대로 돌려준다 — 같은 가중치면 1차·2차가 겹칠 확률이 훨씬 높아진다
    """
    scores = _load_scores()
    if not scores:
        return []   # 왜 비었는지는 status() 가 알려 준다

    rows = {(gu, dong): d for gu, dong, d in _load_rows()}
    price = _load_price()

    band = None
    if USE_PRICE_BAND and price:
        vals = sorted(price.values())
        mid = vals[len(vals) // 2]
        band = (mid * BAND_LOW, mid * BAND_HIGH)

    # 가중치를 "배점"이 아니라 "차이"로 쓴다.
    #
    # 절대점수 가중합만 쓰면 모든 지표가 높은 동네(명동·역삼1동)가 어떤
    # 가중치에서도 이긴다 — 상권을 1점으로 낮춰도 상권 100점이 100x1 을
    # 그대로 벌기 때문이다. 그래서 엔진(app/engine/recommend.py)과 같은
    # 두 장치를 쓴다.
    #   (1) 특기 점수 : 그 동네 7개 평균보다 얼마나 높은 지표인가
    #   (2) 증폭      : 가중치가 평균(3)에서 벗어난 만큼을 지수로 키운다
    # 두 상수는 반드시 엔진과 같아야 한다 — 1차와 2차가 다른 규칙으로
    # 채점하면 "아까 그 동네는 어디 갔지"가 된다
    MIX, SHARPEN = 0.5, 6

    mean_w = sum(max(0.0, weights.get(k, 3)) for k in WEIGHT_KEYS) / len(WEIGHT_KEYS)
    amp = {k: (max(0.0, weights.get(k, 3)) / mean_w) ** SHARPEN for k in WEIGHT_KEYS}
    total = sum(amp.values()) or 1.0

    def rank_all(use_band):
        out = []
        for (gu, dong), ind in scores.items():
            if use_band and band:
                pr = price.get((gu, dong))
                # 시세를 모르는 동은 남긴다. 아는데 범위 밖이면 뺀다
                if pr is not None and not (band[0] <= pr <= band[1]):
                    continue

            # 이 동네 자기 평균. 특기 점수의 기준선이 된다
            own = sum(ind.get(k, 50.0) for k in WEIGHT_KEYS) / len(WEIGHT_KEYS)

            sc = 0.0
            for k in WEIGHT_KEYS:
                p = ind.get(k, 50.0)
                sc += (p * MIX + (p - own + 50) * (1 - MIX)) * amp[k]
            out.append((sc / total, gu, dong))
        return out

    # 시세 필터로 후보가 다 걸러지면 필터 없이 다시. 빈손보다 낫다
    ranked = rank_all(True)
    if not ranked:
        ranked = rank_all(False)
    if not ranked:
        return []

    ranked.sort(reverse=True)
    picked = ranked[:show]

    return [{
        "gu": gu,
        "dong": dong,
        "name": f"서울특별시 {gu} {dong}",
        "score": round(sc, 1),
        "blurb": _blurb(rows.get((gu, dong), {}), weights),
        "price": price.get((gu, dong)),
    } for sc, gu, dong in picked]


if __name__ == "__main__":
    print("DB:", DB_PATH, os.path.exists(DB_PATH))
    print(status())
    for name, w in [
        ("조용·도보", {"녹지": 5, "안전": 4, "교통": 2,
                     "상권": 2, "의료": 3, "교육": 3, "문화": 2}),
        ("번화·문화", {"녹지": 2, "안전": 3, "교통": 4,
                     "상권": 5, "의료": 3, "교육": 3, "문화": 5}),
    ]:
        print(f"\n--- {name} ---")
        r = recommend(w, show=5)
        print("  " + " / ".join(
            f"{x['gu']} {x['dong']}({x['blurb']})" for x in r))
