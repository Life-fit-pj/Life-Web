<div align="center">

# LIFE,FIT — 웹

![Python](https://img.shields.io/badge/Python-3.12-3776AB?style=flat-square&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.141-009688?style=flat-square&logo=fastapi&logoColor=white)
![JavaScript](https://img.shields.io/badge/Vanilla_JS-ES_Modules-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![Kakao Map](https://img.shields.io/badge/Kakao_Map-FFCD00?style=flat-square&logo=kakao&logoColor=black)
![Supabase](https://img.shields.io/badge/Supabase_Auth-3FCF8E?style=flat-square&logo=supabase&logoColor=white)

서울 427개 행정동 중 라이프스타일에 맞는 동네를 추천하는 서비스의 화면·서버입니다.

[시작하기](#시작하기) · [사용법](#사용법) · [API](#api) · [구조](#구조) · [다른 엔진 붙이기](#다른-엔진-붙이기) · [자주 나는 문제](#자주-나는-문제)

</div>

---

추천 계산과 LLM 호출은 형제 저장소 [Life-Embed-jh](https://github.com/Life-fit-pj/Life-Embed-jh)가
담당합니다. 이 저장소는 요청을 받아 `httpx`로 엔진 서버(`EMBED_API_BASE`, 기본
`http://127.0.0.1:8000`)를 호출하고, 결과를 지도와 카드로 보여주는 역할만 합니다 —
**두 서버를 각각 띄워야 합니다.**

```
브라우저 ──▶ Life-Web (:5000) ──httpx──▶ Life-Embed-jh (:8000) ──▶ Supabase Postgres
            화면 · 라우팅                 추천 · LLM · DB
```

## 시작하기

### 1. 엔진 준비

`Life-Embed-jh`를 먼저 설치하고 `.env`를 채웁니다 — [Life-Embed-jh README](https://github.com/Life-fit-pj/Life-Embed-jh#설치) 참고.

### 2. 패키지

```bash
py -m pip install -r requirements.txt
```

### 3. 카카오 지도

`frontend/index.html`에 앱키가 들어 있습니다. [카카오 개발자 콘솔](https://developers.kakao.com)에서
플랫폼 → Web에 `http://127.0.0.1:5000`을 등록해야 지도가 보입니다.

### 4. 실행

```bash
# 1) Life-Embed-jh 저장소에서 엔진 서버를 먼저 띄웁니다
py -m uvicorn app.main:app --reload --port 8000

# 2) 이 저장소에서 웹 서버를 띄웁니다
py -m uvicorn main:app --reload --port 5000
```

브라우저에서 `http://127.0.0.1:5000`을 엽니다. 관리자 페이지는 `/admin.html`이고, 이 저장소의
`.env`에 `ADMIN_TOKEN`(수정까지 하려면 `ADMIN_WRITE_ENABLED=1`)이 필요합니다.

## 사용법

### 검색 — 1차 유형 → 2차 추천

| 단계 | 하는 일 | API | LLM |
|---|---|---|---|
| **1차** | 떠다니는 키워드를 누르거나 문장을 적으면 라이프스타일 유형과 어울리는 동네 2곳 | `/api/lifetype` | ✗ 즉시 |
| **2차** | **내게 맞는 동네 5곳 보기** → 7개 지표 가중치를 슬라이더에 반영하고 지도를 채움 | `/api/predict` | ✓ 3~6초 |

1차가 LLM을 안 쓰는 이유는 키워드를 바꿔 가며 여러 번 눌러 보게 하기 위해서입니다. 2차로 넘어갈 때
1차 가중치와 동네 목록이 함께 가서, 1차에 있던 동네에는 표시가 붙고 빠진 동네는 `droppedFromFirst`로
알려 줍니다.

### 다른 시작 방법

- **회원가입 설문** — 로그인 → 회원가입 → 15문항 설문. 제출하면 계정과 persona가 저장되고 곧바로 2차 추천을 돌립니다.
- **슬라이더 직접 조절** — "직접 설정할게요" → 슬라이더·건물유형·거래유형·예산을 정하고 **AI 분석 실행**. 예산 감점은 웹이 아니라 **엔진**이 합니다.

### 결과 화면

| 동작 | 결과 |
|---|---|
| 오른쪽 목록 클릭 | 지도가 그 위치로 이동 |
| **지도 핀 클릭** | 추천 사유 카드 — 기대 수준 대비 "넉넉해요 / 딱 맞아요 / 조금 아쉬워요" + 동네별 LLM 설명 |
| 카드 안 "로드뷰" 탭 | 그 위치의 카카오 로드뷰 |
| 화면 아래 💬 | 결과에 대해 추가로 물어보는 채팅 |
| 오른쪽 위 ☰ | 메뉴 — 로그인 · 마이페이지 · 좋아요 · 검색 기록 |

<details>
<summary><b>관리자 페이지</b></summary>

<br/>

첫 화면에서 관리자 토큰을 입력하면 들어갑니다(브라우저에 저장, 401이면 다시 입력 화면).

| 화면 | 무엇을 보나 |
|---|---|
| **대시보드** | 회원·행정동·청크 수, 월별 가입 추이, 7지표 평균, 연령·성별·거래형태, 최근 수정 |
| **회원** | 목록 / 상세 — 기본정보 · 희망조건 7개 · 페르소나 9칸 · 추천 돌려보기 · 비슷한 회원 · 개인정보 점검 |
| **행정동** | 자치구 필터 + 검색 / 지표 12개와 427개 동 중 백분위 |
| **시스템** | DB·캐시·쓰기 스위치 상태, 캐시 비우기, 수정 이력 |

- **저장은 처음 값과 달라진 칸만 보냅니다.** 전부 보내면 페르소나를 안 고쳐도 벡터를 다시 만들고, 이력에 "26칸 고침"만 남습니다.
- 가중치를 고치면 저장 전후 TOP 5를 나란히 보여 줍니다(`▲2` `▼1` `NEW`).
- 값이 규칙에 어긋나면(나이 0~120, 가중치 1~5, 밀도 음수 불가) 422로 막히고 어긋난 칸 아래에 이유가 붙습니다.
- 테마는 시스템 설정을 따르고 3단 스위치(시스템/라이트/다크)로 덮어씁니다.
- 차트는 바깥 라이브러리 없이 `bars`/`cols`/`donut`/`area` 네 함수가 HTML·SVG로 그립니다.

</details>

## API

| 메서드 | 경로 | 하는 일 | LLM |
|---|---|---|---|
| POST | `/api/lifetype` | 1차 유형 판정 + 어울리는 동네 2곳 | ✗ |
| GET | `/api/lifetype/keywords` | 첫 화면 키워드 목록 | ✗ |
| POST | `/api/predict` | 2차 추천 TOP 5 | ✓ |
| POST | `/api/region` | 행정동 하나의 시설 정보 (핀 클릭) | ✗ |
| POST | `/api/region/explain` | 행정동 하나의 설명 | ✓ |
| POST | `/api/chat` | 결과에 대한 후속 질문 | ✓ |
| GET | `/api/regions/gudong` | 구 → 동 목록 (25개 구 / 427개 동) | ✗ |
| POST | `/api/survey` | 설문 15문항 → 규칙 기반 추천 (아직 프론트 미연결) | ✗ |
| POST | `/api/auth/login` · `/api/signup` | Supabase 로그인 · 가입 | ✗ |
| GET | `/api/auth/me` · `/api/auth/signed-up` | 내 정보 · 가입 여부 | ✗ |
| GET·POST·DELETE | `/api/likes` | 좋아요 · 검색 기록 · 채팅 기록 | ✗ |
| GET·PATCH·POST | `/api/admin/*` | 대시보드 · 회원/행정동 조회·수정 · 상태 · 이력 · 캐시 | ✗ |

- `/api/region`과 `/api/region/explain`을 나눈 이유 — 시설 정보는 즉시, 설명은 3~5초라 묶으면 빠른 쪽까지 기다립니다.
- LLM을 부르는 요청은 하루 한도가 있습니다(`services/quota.py`, 회원은 `customer_id`, 비회원은 IP 기준).
- `/api/admin/*`은 `Authorization: Bearer <ADMIN_TOKEN>`이 필요하고, 수정·캐시 비우기는 `ADMIN_WRITE_ENABLED=1`까지 있어야 통과합니다(잠겨 있으면 405). `/api/admin/health`만 예외로 토큰이 필요 없습니다.

<details>
<summary><b><code>/api/predict</code>가 1차 결과를 이어받는 방법</b></summary>

<br/>

| 필드 | 쓰임 |
|---|---|
| `firstWeights` | **슬라이더를 안 만졌을 때만** 슬라이더 기본값 대신 쓴다 |
| `firstSpots` | 2차 목록에 `fromFirst: true`를 붙이는 데 쓴다 |
| `typeName` | 응답의 `firstTypeName`으로 되돌려 준다 |

1차에 있었는데 2차에서 빠진 동네는 `droppedFromFirst`에 담깁니다 — 예산 때문에 사라졌다면 그 이유를
알아야 납득하기 때문입니다.

</details>

## 구조

```
Life-Web/
├── main.py              FastAPI 앱 설정 + 정적 파일 서빙. 라우트는 routers/에 있다
├── routers/
│   ├── recommend.py       /api/predict · /api/region · /api/region/explain · /api/chat · /api/regions/gudong
│   ├── lifetype.py        /api/lifetype*  (1차 유형 판정, LLM 안 씀)
│   ├── survey.py          /api/survey     (설문 채점)
│   ├── auth.py            /api/auth/* · /api/signup
│   ├── likes.py           /api/likes/*    (좋아요 · 검색 기록 · 채팅 기록)
│   └── admin.py           /api/admin/*    (토큰 필요)
├── services/
│   ├── engine.py          ★ Life-Embed-jh를 아는 유일한 파일 + 한↔영 지표 키 매핑
│   ├── coords.py          행정동 좌표 (427개)
│   ├── lifetype.py        1차 유형 판정 — 4축 · 16유형 · 가중치 표의 원본
│   ├── persona_type.py    설문 15문항 → 유형 판정 (lifetype.py 표를 그대로 import)
│   ├── typespot.py        1차 유형에 어울리는 동네 2곳 (엔진 /recommend 호출)
│   ├── floorplan.py       LH 평면도 선택
│   └── quota.py           LLM 요청 하루 한도
├── frontend/            빌드 단계 없음. index.html이 main.js 하나만 모듈로 불러온다
│   ├── index.html · main.js · style.css · search.css
│   ├── signup.html        회원가입 설문 (HTML+CSS+JS 일체형)
│   ├── admin.html         관리자 페이지 (일체형)
│   ├── lib/               api · state · format · supabaseClient
│   └── ui/                search · lifetype · deal · map · result · reason · chat
│                          · menu · mypage · likes · history
└── data/
    ├── 동_좌표.csv          427개 행정동 위경도
    └── LH평면도/            평면도 목록 CSV + 이미지
```

> **`services/price.py`를 되살리지 마세요.** 예산 감점은 엔진이 `search(housing_override=…)` 안에서
> 처리합니다. 웹에도 두면 **예산이 두 번 적용되어 오류 없이 결과가 틀어집니다.**

## 다른 엔진 붙이기

이 웹은 엔진이 무엇으로 만들어졌는지 모릅니다. `services/engine.py`가 `EMBED_API_BASE`를
`httpx`로 부를 뿐이라, 같은 API 계약을 구현한 서버를 그 자리에 붙일 수 있습니다.
내 엔진을 다른 포트(예: 8001)에 띄우고 `EMBED_API_BASE=http://127.0.0.1:8001`로 바꾸면 됩니다.

### 최소 계약 — 엔드포인트 둘

| 메서드 | 경로 | 요청 | 응답 |
|---|---|---|---|
| POST | `/search` | `{"query": str, "top_k": int, "housing_override": {...} \| null}` | `{weights, regions, explanation, housing}` |
| POST | `/recommend` | `{"weights": {...}, "top_k": int, "housing": {...} \| null}` | `regions` 목록 |

<details>
<summary><b>요청·응답 예시와 지켜야 할 규칙</b></summary>

<br/>

`housing` 모양(단위는 만원, 가격 조건이 없으면 `None`):

```python
{"건물유형": "아파트", "거래유형": "월세",
 "targets": {"예산": 70, "보증금": 3000}}
```

`/search` 응답:

```python
{
    "weights": {"녹지": 3.2, "안전": 3.3, "교통": 2.6, "상권": 3.2,
                "의료": 3.0, "교육": 4.6, "문화": 2.6},
    "regions": [
        {
            "name": "노원구 중계1동",        # "구 행정동명" — 공백 하나로 구분
            "total": 78.7,                   # 종합 점수
            "scores": {"녹지": 88, "안전": 84, "교통": 48, "상권": 68,
                       "의료": 70, "교육": 98, "문화": 25},
            "price": None,                   # 있으면 시세 탭이 채워진다
        },
        # ... top_k 개
    ],
    "explanation": "중계1동은 교육 98점으로 ...",  # 없으면 ""
    "housing": None,
}
```

| 항목 | 규칙 |
|---|---|
| 지표 이름 | 한국어 7개 고정 — `녹지 안전 교통 상권 의료 교육 문화` |
| `name` | `"구 행정동명"`. `서울특별시`를 붙이지 않습니다 — 웹이 `split(" ", 1)`로 좌표를 찾습니다 |
| `scores` | 0~100 숫자, 클수록 좋은 값 |
| `weights` | 1~5 범위 숫자 (문자열 `"4.6"` 안 됨) |
| `explanation` | 없으면 `""`. `None`은 안 됩니다 |

**예산 감점은 엔진의 몫입니다.** 웹은 조건을 넘겨줄 뿐 점수를 다시 깎지 않습니다.

추천 말고 좋아요·로그인·관리자까지 옮기려면 `Life-Embed-jh/app/api/`의 나머지 라우터가 쓰는 경로도
구현해야 합니다 — 전체 목록은 `services/engine.py`의 `_call()` 호출부를 보세요.

붙이기 전에 단독으로 두드려 보세요:

```bash
curl -X POST http://127.0.0.1:8001/search -d '{"query":"애들 학원 보내기 좋은 곳"}'
```

</details>

## 자주 나는 문제

| 증상 | 원인 |
|---|---|
| `httpx.ConnectError` / API가 전부 500 | 엔진 서버(`:8000`)를 안 띄웠거나 `EMBED_API_BASE`가 틀림 |
| `RuntimeError: ... 없다` | `Life-Embed-jh/.env` 확인 — 웹이 아니라 엔진 쪽 |
| 지도가 안 보임 | 카카오 개발자 콘솔에 `http://127.0.0.1:5000` 미등록 |
| 지도에 마커가 안 찍힘 | 엔진 응답의 `name`이 `"구 행정동명"`(공백 하나) 형태가 아님 |
| 추천 사유 카드의 점이 비어 있음 | `scores` 키가 한국어 7개와 정확히 일치하지 않음 |

## 남은 일

- LH 평면도를 가구원수 기준으로 추천 (지금은 면적만)
- 폴백 표시 — `fallback`이 항상 `False` (실제 감지 미구현)
- `POST /api/survey`는 있지만 `signup.html`은 아직 `/api/predict`의 LLM 경로로 우회
- 설문이 못 채우는 persona 칸 — `persona`(총괄 요약), `career_goals_and_ambitions`(대응 문항 없음)
