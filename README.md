# LIFE,FIT — 웹

서울 427개 행정동 중 라이프스타일에 맞는 동네를 추천하는 서비스의 화면·서버입니다.

추천 계산과 LLM 호출은 형제 저장소 `Life-Embed-jh`가 담당합니다.
이 저장소는 요청을 받아 그쪽에 넘기고, 결과를 지도와 카드로 보여주는 역할만 합니다.

서버는 FastAPI + uvicorn으로 돌아갑니다 (예전에는 Flask였습니다).

---

## 폴더 배치

두 저장소를 **나란히** 두어야 합니다. 웹이 `../Life-Embed-jh`를 찾아 쓰기 때문입니다.

```
Life-fit-main/
├── Life-Embed-jh/      추천 엔진 (DB, LLM, 파이프라인)
└── Life-Web/           이 저장소 (화면, FastAPI 서버)
```

다음과 같이 파일을 구성한 것은 조원들이 스스로 만든 엔진을 유용하게 탈부착 하기 위한 목적입니다.
해당 리포지토리의 main.py에 엔진의 파이프라인이 어떤 형식으로 연결되어있는지를 확인한 후 규칙에 맞추어 각자의 엔진 파이프라인을 구성하신다면 쉽게 접목이 가능합니다. 

---

## 다른 엔진 붙이기

이 웹은 엔진이 무엇으로 만들어졌는지 모릅니다.
아래 **함수 두 개**만 약속대로 만들면 어떤 엔진이든 붙습니다.
LangChain을 쓰든 OpenAI를 쓰든, 안에서 무엇을 하든 상관없습니다.

### 1. 폴더를 나란히 둡니다

```
Life-fit-main/
├── Life-Embed-jh/      기본 엔진
├── my-engine/          내가 만든 엔진
└── Life-Web/           이 저장소
```

### 2. 함수 두 개를 만듭니다

엔진 폴더 안에 진입점 파일을 하나 두고, 아래 두 함수를 만듭니다.
파일 위치와 이름은 자유입니다 (예: `my-engine/api.py`).

```python
def search(query, top_k=5):
    """검색어 하나로 전체 추천을 만든다."""
    ...

def recommend_by_weights(weights, top_k=5):
    """가중치만 받아 추천한다. 검색어 없이 슬라이더로 왔을 때 쓴다."""
    ...
```

### 3. 돌려주는 모양을 맞춥니다

#### `search(query)` 의 반환값

```python
{
    "weights": {
        "녹지": 3.2, "안전": 3.3, "교통": 2.6, "상권": 3.2,
        "의료": 3.0, "교육": 4.6, "문화": 2.6
    },
    "regions": [
        {
            "name": "노원구 중계1동",        # "구 행정동명" — 공백 하나로 구분
            "total": 78.7,                   # 종합 점수
            "scores": {                      # 7개 지표 백분위 (0~100)
                "녹지": 88, "안전": 84, "교통": 48, "상권": 68,
                "의료": 70, "교육": 98, "문화": 25
            }
        },
        # ... top_k 개
    ],
    "explanation": "중계1동은 교육 98점으로 ..."   # 없으면 빈 문자열
}
```

#### `recommend_by_weights(weights)` 의 반환값

`search`의 `regions` 부분과 같은 목록입니다.

```python
[
    {"name": "노원구 중계1동", "total": 78.7, "scores": {...}},
    # ...
]
```

### 4. 지켜야 할 규칙

| 항목 | 규칙 |
|---|---|
| 지표 이름 | 한국어 7개 고정 — `녹지 안전 교통 상권 의료 교육 문화` |
| `name` | `"구 행정동명"` 형태. `서울특별시`를 붙이지 않습니다 |
| `scores` | 0~100 숫자. 백분위가 아니어도 되지만 클수록 좋은 값이어야 합니다 |
| `weights` | 1~5 범위 숫자. 소수점 가능 |
| `explanation` | 없으면 빈 문자열 `""`. `None`은 안 됩니다 |

**`name`의 공백이 중요합니다.** 웹이 `split(" ", 1)`로 구와 동을 나눠
지도 좌표를 찾기 때문입니다. `"노원구 중계1동"`은 되지만
`"노원구중계1동"`이나 `"서울특별시 노원구 중계1동"`은 좌표를 못 찾습니다.

### 5. services/engine.py 의 import 두 줄을 고칩니다

엔진 저장소를 아는 파일은 `main.py`가 아니라 `services/engine.py` 하나뿐입니다.

```python
# 기본 엔진
EMBED_DIR = os.path.abspath(os.path.join(BASE_DIR, '..', 'Life-Embed-jh'))
sys.path.insert(0, EMBED_DIR)
from app.features.pipeline_api import search, recommend_by_weights

# 내 엔진으로 바꾸려면
EMBED_DIR = os.path.abspath(os.path.join(BASE_DIR, '..', 'my-engine'))
sys.path.insert(0, EMBED_DIR)
from api import search, recommend_by_weights
```

### 6. 붙이기 전에 확인하기

웹에 붙이기 전에 엔진 단독으로 돌려 보세요.
모양이 틀리면 화면에서 원인을 찾기 어렵습니다.

```python
if __name__ == "__main__":
    r = search("애들 학원 보내기 좋은 곳")

    assert set(r["weights"]) == {"녹지","안전","교통","상권","의료","교육","문화"}
    assert len(r["regions"]) == 5
    assert " " in r["regions"][0]["name"]
    assert isinstance(r["explanation"], str)

    print(r["weights"])
    for x in r["regions"]:
        print(x["rank"] if "rank" in x else "", x["name"], x["total"])
    print(r["explanation"])
```

전부 통과하면 웹에 붙여도 됩니다.

### 7. 두 엔진을 비교하고 싶다면

`services/engine.py`에서 둘 다 불러 두고 요청마다 고를 수 있습니다.

```python
ENGINES = {}

try:
    sys.path.insert(0, os.path.abspath(os.path.join(BASE_DIR, '..', 'Life-Embed-jh')))
    from app.features.pipeline_api import search as search_default
    ENGINES["default"] = search_default
except ImportError:
    pass

try:
    sys.path.insert(0, os.path.abspath(os.path.join(BASE_DIR, '..', 'my-engine')))
    from api import search as search_mine
    ENGINES["mine"] = search_mine
except ImportError:
    pass
```

```python
    # predict() 안에서
    engine = body.get('engine') or 'default'
    result = ENGINES[engine](query, top_k=5)
```

프론트에 선택 버튼을 하나 두면 같은 검색어로 두 엔진의 결과를
나란히 비교할 수 있습니다.

### 자주 나는 문제

**지도에 마커가 안 찍힘**
→ `name`이 `"구 행정동명"` 형태인지 확인하세요. 공백이 하나여야 합니다.

**추천 사유 카드의 점이 다 비어 있음**
→ `scores`의 키가 한국어 7개와 정확히 일치하는지 확인하세요.

**슬라이더가 안 움직임**
→ `weights`의 키가 한국어인지, 값이 숫자인지 확인하세요.
문자열 `"4.6"`이 아니라 숫자 `4.6`이어야 합니다.

---

## 설치

### 1. 패키지

```bash
py -m pip install fastapi uvicorn pydantic pandas numpy
```

엔진 쪽 패키지도 필요합니다. `Life-Embed-jh`의 README를 참고하세요.

### 2. 엔진 준비

`Life-Embed-jh`에 아래 두 가지가 있어야 합니다.

| 파일 | 설명 |
|---|---|
| `.env` | `ANTHROPIC_API_KEY=sk-ant-...` — 팀에서 따로 전달 |
| `data/life.db` | 216MB. 깃에 없으므로 따로 전달받거나 직접 생성 |

직접 만들려면 `Life-Embed-jh`에서:

```bash
py -m pipeline.schema          # 표 생성 + 데이터 적재
py -m pipeline.embed_kb        # 지식베이스 임베딩 (약 5분)
py -m pipeline.embed_member    # 회원 임베딩 (약 30초)
```

### 3. 카카오 지도

`frontend/index.html`에 앱키가 들어 있습니다.
[카카오 개발자 콘솔](https://developers.kakao.com)에서 플랫폼 → Web에
`http://127.0.0.1:5000`을 등록해야 지도가 보입니다.

---

## 실행

```bash
py -m uvicorn main:app --reload --port 5000
```

터미널에 아래가 뜨면 정상입니다.

```
✅ LLM 파이프라인 연결 성공!
✅ LH 평면도 데이터 로드 완료! (총 281개 행)
✅ 동_좌표.csv 로드 완료! (총 427개 동)
INFO:     Uvicorn running on http://127.0.0.1:5000
INFO:     Application startup complete.
```

브라우저에서 `http://127.0.0.1:5000`을 엽니다.

---

## 사용법

### 검색으로 시작하기

첫 화면의 검색창에 원하는 조건을 자연어로 적습니다.

```
애들 학원 보내기 좋은 곳
조용하고 공원 많은 동네
병원이 가까운 곳
```

LLM이 검색어를 읽고 7개 지표(녹지·안전·교통·상권·의료·교육·문화)의
가중치를 만들어 슬라이더에 자동으로 반영합니다.

배경에 떠다니는 단어를 클릭하면 검색창에 들어갑니다. 여러 개를 조합할 수도 있습니다.

### 슬라이더로 직접 조절하기

"직접 설정할게요"를 누르면 검색을 건너뜁니다.
슬라이더를 조절하고 **AI 분석 실행**을 누르면 됩니다.

### 결과 보기

| 동작 | 결과 |
|---|---|
| 오른쪽 목록 클릭 | 지도가 그 위치로 이동 |
| **지도 핀 클릭** | 추천 사유 카드가 열림 |
| 오른쪽 위 🔍 | 검색 화면으로 돌아감 |

추천 사유 카드는 사용자가 설정한 기대 수준과 그 동네의 실제 수준을 비교해
"넉넉해요 / 딱 맞아요 / 조금 아쉬워요"로 보여줍니다.

---

## 확인된 동작

```
검색어: 애들 학원 보내기 좋은 곳
→ 교육 4.6, 나머지 2.6~3.3
→ 방이1동 · 중계1동 · 쌍문제4동 · 대치1동 · 염리동
```

서울의 실제 학원가가 상위에 나오면 정상입니다.

---

## 폴더 구조

```
Life-Web/
├── main.py            FastAPI 서버 (라우트 + /api/predict, /api/region)
├── services/          기능별 분리
│   ├── coords.py        행정동 좌표 조회
│   ├── engine.py        엔진 호출 + 한↔영 키 변환 + 시설 정보 조회
│   └── floorplan.py     LH 평면도 선택
├── frontend/
│   ├── index.html
│   ├── style.css        결과 화면
│   ├── script.js        지도 · 추천 사유 카드
│   ├── search.css       첫 검색 화면
│   └── search.js        떠다니는 단어 · 검색 요청
└── data/
    ├── 동_좌표.csv                    427개 행정동 위경도
    ├── 0. 한국토지주택공사...csv        평면도 목록
    └── LH평면도/                      평면도 이미지
```

---

## 자주 나는 문제

**`ModuleNotFoundError: No module named 'app'`**
→ `Life-Embed-jh`가 형제 폴더에 있는지, 폴더 이름이 정확한지 확인하세요.

**`RuntimeError: API 키가 없다`**
→ `Life-Embed-jh/.env` 파일이 있는지 확인하세요. 웹 쪽이 아니라 엔진 쪽입니다.

**첫 검색이 10초 넘게 걸림**
→ 정상입니다. 서버가 벡터 22,500개를 처음 불러오는 시간입니다.
   두 번째부터는 3~5초입니다.

**지도가 안 보임**
→ 카카오 개발자 콘솔에 `http://127.0.0.1:5000`을 등록했는지 확인하세요.

**`file is not a database`**
→ `Life-Embed-jh/data/life.db`가 216MB인지 확인하세요.
   작으면 Git LFS 포인터이거나 빈 파일입니다.

---

## 아직 안 된 것

- 동네별 개별 LLM 설명
- 결과 화면에서의 추가 질문 (2차 채팅)
- LH 평면도를 가구원수 기준으로 추천
- 폴백 표시 (`fallback: true`를 화면에 반영)