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
def search(query, top_k=5, housing_override=None):
    """검색어 하나로 전체 추천을 만든다.

    housing_override 가 오면 검색어에서 읽어낸 가격 조건 대신 그것을 쓴다
    (사용자가 슬라이더로 예산을 직접 정한 경우).
    """
    ...

def recommend_by_weights(weights, top_k=5, housing=None):
    """가중치만 받아 추천한다. 검색어 없이 슬라이더로 왔을 때 쓴다."""
    ...
```

`housing` 의 모양은 아래와 같습니다. 가격 조건이 없으면 `None` 입니다.

```python
{"건물유형": "아파트", "거래유형": "월세",
 "targets": {"예산": 70, "보증금": 3000}}   # 단위는 만원
```

**예산 감점은 엔진의 몫입니다.** 웹은 조건을 넘겨줄 뿐 점수를 다시 깎지
않습니다. 양쪽에서 처리하면 예산이 두 번 반영되어 조용히 틀어집니다.

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
    "explanation": "중계1동은 교육 98점으로 ...",  # 없으면 빈 문자열
    "housing": None            # 검색어에서 읽어낸 가격 조건. 없으면 None
}
```

`regions` 의 각 항목에 `price` 를 함께 담아 주면 결과 화면의 시세 탭이 채워집니다.
없으면 `None` 이고, 프론트가 알아서 탭을 숨깁니다.

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

### 5. services/engine.py 의 import 를 고칩니다

엔진 저장소를 아는 파일은 `main.py`가 아니라 `services/engine.py` 하나뿐입니다.

> **최소 계약은 함수 둘(`search` · `recommend_by_weights`)이지만, 지금 `engine.py`가
> 실제로 가져오는 줄은 그보다 많습니다.** 추천 말고도 좋아요·검색기록·로그인·관리자
> 화면이 엔진의 DB를 같이 쓰기 때문입니다. 추천만 갈아 끼울 거면 아래 두 줄만 고치고,
> 나머지 줄은 기본 엔진(`Life-Embed-jh`)을 계속 가리키게 두면 됩니다.
>
> ```python
> from app.tables.history import add_like, ...      # 좋아요·기록
> from app.tables.regions  import facilities, ...   # 시설 정보
> from app.tables.members  import customer_one      # 회원 조회
> from app.features.search import search, ...       # ← 추천. 여기를 바꾼다
> from app.features.admin  import ...               # 관리자 화면
> from app.features.auth   import ...               # 로그인
> ```
>
> 엔진의 SQL은 2026-09-07부터 `app/tables/` 네 파일에 모여 있습니다
> (예전엔 `app/core/db.py` 한 파일이었습니다). 자세한 계층은 엔진 저장소의
> `README.md` "폴더 구조" 참고.

```python
# 기본 엔진
EMBED_DIR = os.path.abspath(os.path.join(BASE_DIR, '..', 'Life-Embed-jh'))
sys.path.insert(0, EMBED_DIR)
from app.features.search import search, recommend_by_weights

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
    from app.features.search import search as search_default
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
| `data/life.db` | 약 42MB. Git LFS 로 관리 — 체크아웃 직후 133바이트면 `git lfs pull` 먼저 |

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
✅ 동_좌표.csv 로드 완료! (총 427개 동)
✅ LLM 파이프라인 연결 성공!
✅ LH 평면도 데이터 로드 완료! (총 281개 행)
INFO:     Uvicorn running on http://127.0.0.1:5000
INFO:     Application startup complete.
```

브라우저에서 `http://127.0.0.1:5000`을 엽니다.

---

## 사용법

### 검색으로 시작하기 — 1차 유형 → 2차 추천

첫 화면은 두 단계로 나뉩니다.

**1차** — 배경에 떠다니는 단어를 누르면 검색창 안에 태그로 쌓입니다.
직접 문장을 적어도 되고, 태그와 섞어도 됩니다.

```
애들 학원 보내기 좋은 곳
조용하고 공원 많은 동네
병원이 가까운 곳
```

**찾기**를 누르면 `/api/lifetype` 이 라이프스타일 유형과 어울리는 동네 2곳을
보여 줍니다. **LLM을 쓰지 않아 즉시 나옵니다** — 키워드를 바꿔 가며 여러 번
눌러 볼 수 있습니다. 3개 미만을 고르면 축이 대부분 비어 유형이 흔들리므로
"3개 이상 고르면 더 정확해요" 안내가 뜹니다.

**2차** — 카드에서 **내게 맞는 동네 5곳 보기**를 누르면 `/api/predict` 로 갑니다.
LLM이 7개 지표(녹지·안전·교통·상권·의료·교육·문화) 가중치를 만들어 슬라이더에
반영하고 지도를 채웁니다. 1차에서 만든 가중치와 동네 목록이 함께 넘어가서,
1차에 있던 동네에는 표시가 붙고 빠진 동네는 `droppedFromFirst` 로 알려 줍니다.

### 회원가입 설문으로 시작하기

우측 상단 **로그인 → 회원가입 → 설문 시작하기**를 누르면 `signup.html` 의
15문항 설문으로 갑니다. 제출하면 답을 persona 칸(추천 엔진의 `CHUNK_COLUMNS`)
형태로 묶어 첫 화면으로 돌아온 뒤 곧바로 2차 추천을 돌립니다.

아직 서버에 저장하지는 않습니다 — 아래 "아직 안 된 것" 참고.

### 슬라이더로 직접 조절하기

"직접 설정할게요"를 누르면 검색을 건너뜁니다.
슬라이더를 조절하고 **AI 분석 실행**을 누르면 됩니다.

좌측 패널의 건축 정보(건물 유형, 거래 유형 — 매매/전세/월세, 매매가·보증금·
월세, 건축 면적)도 함께 반영됩니다. 예산을 넘는 지역은 만족도 순위가 그만큼
낮아집니다 — 계산은 웹이 아니라 **엔진**이 합니다(`search(housing_override=…)`).

슬라이더를 직접 만졌다면 1차 가중치보다 슬라이더가 우선합니다.

### 결과 보기

| 동작 | 결과 |
|---|---|
| 오른쪽 목록 클릭 | 지도가 그 위치로 이동 |
| **지도 핀 클릭** | 추천 사유 카드가 열림 |
| 카드 안 "로드뷰" 탭 | 그 위치의 카카오 로드뷰 |
| 오른쪽 위 🔍 | 검색 화면으로 돌아감 |
| 오른쪽 위 ☰ | 메뉴(로그인 등, 개발용 임시 구현) |
| 화면 아래 💬 | 결과에 대해 추가로 물어보는 채팅 패널 |

추천 사유 카드는 사용자가 설정한 기대 수준과 그 동네의 실제 수준을 비교해
"넉넉해요 / 딱 맞아요 / 조금 아쉬워요"로 보여주고, 그 동네가 왜 맞는지에 대한
개별 LLM 설명도 함께 채워집니다.

### 관리자 페이지

`http://127.0.0.1:5000/admin.html` 입니다. 첫 화면에서 관리자 토큰
(`.env` 의 `ADMIN_TOKEN`)을 입력하면 들어갑니다. 토큰은 브라우저에 저장되어
다음부터는 묻지 않고, 서버가 401을 주면 다시 입력 화면으로 돌아옵니다.

왼쪽 내비게이션으로 네 화면을 오갑니다.

| 화면 | 무엇을 보나 |
|---|---|
| **대시보드** | 회원·행정동·페르소나 청크 수, 월별 가입 추이, 희망 조건 7지표 평균, 연령대·성별·희망 거래형태, 회원이 사는 자치구, 최근 수정 이력 |
| **회원** | 왼쪽 목록(이름·아이디 검색) / 오른쪽 상세 — 기본정보 · 희망조건 슬라이더 7개 · 페르소나 9칸 |
| **행정동** | 자치구 필터 + 동 이름 검색 / 지표 12개와 427개 동 중 백분위 막대 |
| **시스템** | DB·캐시·쓰기 스위치 상태, 캐시 비우기, 페르소나 칸별 평균 길이, 수정 이력 전체 |

대시보드는 `GET /api/admin/summary` **한 번**으로 위 숫자를 전부 받습니다.
화면이 표를 여덟 번 세는 대신 엔진의 `dashboard()` 가 한 번에 세서 넘깁니다.

회원 상세에는 버튼 세 개가 더 있습니다 — **추천 돌려보기**(이 회원 조건으로
TOP 5를 뽑아 봅니다), **비슷한 회원**(페르소나 벡터로 이웃을 찾습니다),
**개인정보 점검**(원본과 가린 글을 나란히 놓아 안 가려진 칸을 확인합니다).
셋 다 조회일 뿐 아무것도 고치지 않습니다.

**저장은 처음 값과 달라진 칸만 보냅니다.** 폼 전체를 보내면 페르소나를 안
고쳤어도 벡터를 다시 만들고, 수정 이력에 "26칸 고침"만 남아 무엇을 바꿨는지
알 수 없게 됩니다. 페르소나를 실제로 고쳤을 때만 `resync_member()` 가 돌고,
저장이 끝나면 서버가 캐시를 비웁니다 — **DB · 벡터 · 캐시 세 곳이 한 번에
맞춰집니다.** 하나라도 빠지면 "화면엔 새 값인데 추천은 옛날 것"이 됩니다.

가중치(7지표)를 고쳤을 때는 저장 전후의 TOP 5를 나란히 보여 줍니다
(`▲2` `▼1` `NEW`). 내 수정이 순위를 어떻게 바꿨는지 바로 보라는 뜻입니다.
가중치를 안 건드렸으면 순위가 바뀔 리 없으므로 계산하지 않습니다.

값이 규칙에 어긋나면(나이 0~120, 가중치 1~5, 밀도 음수 불가) 저장이 422로
막히고 **어긋난 칸 아래에 이유가 붙습니다.** 이때 DB에는 아무것도 안 씁니다 —
검사가 저장보다 먼저 돌기 때문입니다.

**테마**는 크롬·윈도우의 라이트/다크 설정을 그대로 따릅니다. 오른쪽 위
3단 스위치(시스템 / 라이트 / 다크)로 덮어쓸 수 있고, 고른 값은 브라우저에
저장됩니다.

차트는 바깥 라이브러리를 쓰지 않습니다 — `admin.html` 안의 네 함수
(`bars` / `cols` / `donut` / `area`)가 HTML·SVG로 직접 그립니다.
빌드 단계가 없다는 이 저장소의 원칙은 관리자 페이지에도 그대로입니다.

---

## API 한눈에 보기

| 메서드 | 경로 | 하는 일 | LLM |
|---|---|---|---|
| POST | `/api/lifetype` | 1차 유형 판정 + 어울리는 동네 2곳 | ✗ |
| GET | `/api/lifetype/keywords` | 첫 화면에 뿌릴 키워드 목록 | ✗ |
| POST | `/api/predict` | 2차 추천 TOP 5 | ✓ |
| POST | `/api/region` | 행정동 하나의 시설 정보 (핀 클릭) | ✗ |
| POST | `/api/region/explain` | 행정동 하나의 설명 | ✓ |
| POST | `/api/chat` | 결과에 대한 후속 질문 | ✓ |
| GET | `/api/regions/gudong` | 구 → 동 목록 (25개 구 / 427개 동) | ✗ |
| GET | `/api/admin/summary` | 대시보드 집계 한 덩어리 (카운트 + 차트 + 최근 수정) | ✗ |
| GET | `/api/admin/ready` | DB·캐시·쓰기 스위치 상태 | ✗ |
| GET | `/api/admin/logs` | 관리자 수정 이력 (`admin_log` 표) | ✗ |
| GET·PATCH | `/api/admin/members/*`, `/regions/*` | 회원·행정동 조회/수정 | ✗ |
| POST | `/api/admin/cache/clear` | 추천·설명 캐시 비우기 | ✗ |

`/api/region` 과 `/api/region/explain` 을 나눈 이유는 시설 정보는 즉시 나오지만
설명은 3~5초 걸리기 때문입니다. 한 요청으로 묶으면 빠른 쪽까지 기다리게 됩니다.

`/api/admin/*` 은 `Authorization: Bearer <ADMIN_TOKEN>` 헤더가 필요하고,
수정(PATCH)과 캐시 비우기는 `.env` 의 `ADMIN_WRITE_ENABLED=1` 까지 있어야
통과합니다. 잠겨 있으면 405가 나가고, 관리자 화면은 저장 버튼을 흐리게 두고
상단에 "쓰기 잠김"을 띄웁니다 — 눌러 놓고 왜 안 되는지 찾게 하지 않으려는 것입니다.
(예외로 `/api/admin/health` 는 토큰도 필요 없습니다. 프로세스가 살아 있는지만 봅니다.)

### `/api/predict` 가 1차 결과를 이어받는 방법

1차 카드에서 넘어올 때 아래 세 값이 함께 옵니다.

| 필드 | 쓰임 |
|---|---|
| `firstWeights` | **슬라이더를 안 만졌을 때만** 슬라이더 기본값 대신 쓴다 |
| `firstSpots` | 2차 목록에 `fromFirst: true` 를 붙이는 데 쓴다 |
| `typeName` | 응답의 `firstTypeName` 으로 되돌려 준다 |

1차에 있었는데 2차에서 빠진 동네는 `droppedFromFirst` 에 담깁니다 —
예산 때문에 사라졌다면 그 이유를 알아야 납득하기 때문입니다.

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
├── main.py            FastAPI 앱 설정 + 정적 파일 서빙. 라우트는 routers/ 에 있다
├── routers/           API 라우트
│   ├── recommend.py     /api/predict · /api/region · /api/region/explain
│   │                     /api/chat · /api/regions/gudong
│   ├── lifetype.py      /api/lifetype · /api/lifetype/keywords  (1차 유형 판정)
│   ├── survey.py        /api/survey/*   회원가입 설문 채점
│   ├── auth.py          /api/auth/*     로그인 · 아이디 중복확인 · 가입
│   ├── likes.py         /api/likes/*    좋아요 · 검색기록 · 채팅기록
│   └── admin.py         /api/admin/*  (대시보드 집계 · 회원·행정동 조회/수정
│                         · 상태 · 이력 · 캐시. 토큰 필요)
├── services/          기능별 분리
│   ├── coords.py        행정동 좌표 조회
│   ├── engine.py        엔진 호출 + 한↔영 키 변환 + 시설 정보 조회
│   ├── floorplan.py     LH 평면도 선택
│   ├── lifetype.py      1차 유형 판정 (키워드 → 축 점수 → 유형·가중치). LLM 안 씀
│   ├── persona_type.py  설문 15문항 → persona 9칸 + 유형 판정
│   └── typespot.py      1차 유형에 어울리는 동네 2곳 고르기
├── frontend/           빌드 단계 없음. index.html이 main.js 하나만 불러오고
│   │                    나머지는 ES 모듈 import로 연결됨
│   ├── index.html
│   ├── signup.html       회원가입 라이프스타일 설문 15문항.
│   │                     admin.html 처럼 HTML+CSS+JS 일체형 (공유 코드 없음)
│   ├── admin.html        관리자 페이지. 역시 일체형. 대시보드 · 회원 ·
│   │                     행정동 · 시스템 네 화면 + 라이트/다크 테마.
│   │                     차트는 바깥 라이브러리 없이 HTML·SVG로 직접 그림
│   ├── main.js           모듈 진입점
│   ├── style.css         공용 스타일(테마, 좌측 컨트롤 패널 등)
│   ├── search.css        첫 검색 화면 + 1차 유형 카드 + 결과 화면 상단 검색바
│   ├── lib/
│   │   ├── api.js          서버 fetch 호출 모음
│   │   ├── state.js        화면 간 공유 상태(마지막 결과·검색어·1차 유형)
│   │   └── format.js       문자열 다듬기 순수 함수
│   └── ui/              화면 단위 JS + 그중 큰 화면은 짝이 되는 CSS
│       ├── search.js         첫 검색 화면 · 키워드 태그 · 상단 검색바
│       ├── lifetype.js       1차 유형 결과 카드
│       ├── deal.js           거래유형 세그먼트 · 금액 슬라이더
│       ├── map.js            카카오 지도 초기화 · 마커
│       ├── result.js/.css    AI 분석 실행 · 결과 렌더링 · TOP5 목록
│       ├── reason.js/.css    지도 핀 클릭 시 추천 사유 모달 · 레이더 차트
│       ├── chat.js/.css      결과 화면 채팅 패널
│       └── menu.js/.css      우측 상단 메뉴 패널 · 로그인 모달
└── data/
    ├── 동_좌표.csv                    427개 행정동 위경도
    ├── 0. 한국토지주택공사...csv        평면도 목록
    └── LH평면도/                      평면도 이미지
```

**시세 데이터 파일은 이 저장소에 두지 않습니다.** `services/typespot.py` 가 쓰는 시세는
이미 읽고 있는 `life.db` 의 `master_dataset_v3` 안에 동마다 한 줄로 들어 있습니다
(`아파트_전세_보증금` 등, 칸 이름 규칙은 엔진의 `app/engine/housing.py` `DEAL_COLUMNS` 참고).
따로 열 파일이 없습니다.

> `services/price.py` 는 없습니다. 예산 감점은 엔진(`Life-Embed-jh`)이
> `search(housing_override=…)` 안에서 처리합니다. 예전 `price.py` 를 되살리면
> **예산이 두 번 적용되어 오류 없이 결과가 틀어집니다.**

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
→ `Life-Embed-jh/data/life.db`가 수십 MB(2026-09-07 기준 약 42MB)인지 확인하세요.
   133바이트 정도로 작으면 Git LFS 포인터 텍스트 파일만 받아진 상태입니다.
   `Life-Embed-jh` 폴더에서 `git lfs checkout data/life.db`(이미 받아둔 LFS
   객체를 파일로 풀어쓰기만 함, 네트워크 불필요)나 `git lfs pull`(새로 내려받기)로
   해결하세요.

---

## 아직 안 된 것

- LH 평면도를 가구원수 기준으로 추천 (지금은 면적만 기준)
- 폴백 표시 (`fallback`이 지금은 항상 `False`로 고정 — 실제 폴백 감지 미구현)
- 실제 로그인/회원가입 API (마이페이지·검색 기록 저장·좋아요 등은 전부
  "준비 중" 안내만 뜸)

### 회원가입 설문 → 고객 DB 적재 (다음 큰 작업)

`signup.html` 이 받은 답은 지금 **추천에만 쓰이고 저장되지 않습니다.**
저장까지 붙이려면 아래가 필요합니다.

**1. 회원가입 폼** — 이름·성별·나이·연락처·거주지/직장 구·동.
`Life-Embed-jh/data/customers_v2.csv` 의 칸과 1:1로 맞습니다.
구·동 드롭다운은 `GET /api/regions/gudong` 을 쓰세요 (프론트에 427개를
하드코딩하면 `data/동_좌표.csv` 와 두 벌이 되어 어긋납니다).
카카오 로그인을 붙이더라도 `city`/`city_dong`/`work_city`/`work_dong` 은
카카오가 주지 않으므로 이 부분은 그대로 필요합니다.

**2. `POST /api/signup`** — 저장은 `services/engine.py` 를 통해서만 합니다
(엔진을 아는 파일은 그 하나뿐이라는 규칙).

**3. 엔진 쪽 적재** — persona 9칸 → `resync_member()` 로 벡터 생성 →
`find_similar_members()` + `blend()` 로 7지표 도출 → `user_preferences.csv`
형태로 저장. `update_member()` 가 이미 이 3계층을 다룹니다.

### 그 전에 확인해야 할 것

**설문 답변 최소 길이.** 지금은 문항당 5자입니다. 그런데 엔진의
`MIN_LENGTH = 20`(`app/core/config.py`)보다 짧은 청크는 **버려집니다.**
지금 경로(설문 → 자연어 → `/api/predict`)는 청킹을 안 거쳐서 문제가 없지만,
persona 로 **저장**하는 순간 걸립니다.

기존 회원 900개 청크(100명 × 9칸)의 실측 분포는 **최소 55자 / 중앙 138자 /
최대 237자, 20자 미만 0개** 입니다. 짧은 persona 가 통과하면
`find_similar_members()` 가 엉뚱한 이웃을 뽑고 **그들의 7지표를 신규 회원이
물려받습니다** — 오류 없이 조용히 틀립니다.

- `MIN_LENGTH` 를 낮추지 마세요. `make_chunks()` 는 지식베이스(`chunk_kb.py`)와
  공유되므로 설문뿐 아니라 427개 동 청킹까지 바뀝니다.
- 대신 입력 최소 길이를 올리고, 칸 합산 후에도 20자 미만이면 그 칸을 비웁니다
  (나머지 칸으로 추천이 돌아갑니다 — 안전한 실패).
- LLM 정제를 넣는다면 **"짧은 답을 늘리는" 용도가 아니라 "충분한 답을 기존
  데이터 문체에 맞추는"** 용도여야 합니다. 5자를 정보 추가 없이 20자로 만들 수
  없고, 억지로 늘리면 환각이 그대로 DB에 남습니다.

**착수 전 실험** — 기존 100명이 정답지입니다. 기존 persona 를 5/10/15자로
요약 → LLM 복원 → 복원본에서 도출한 7지표를 원래 `user_preferences.csv` 와
비교하면 최소 길이를 추측이 아니라 숫자로 정할 수 있습니다.

### 설문이 아직 못 채우는 persona 칸

| 칸 | 상태 |
|---|---|
| `persona` | 이름·나이·성격을 아우르는 **총괄 요약**이라 문항 하나로 대신 못 함 |
| `career_goals_and_ambitions` | 대응 문항 없음 (P1·P2는 현재 직업·일과라 다름) |

둘 다 비워 두고 있습니다. 문항을 추가하거나, 적재 단계의 LLM 정제가
나머지 칸을 읽고 만들어 주는 방법이 있습니다.