# CLAUDE.md

이 파일은 이 저장소에서 작업할 때 Claude Code(claude.ai/code)에게 지침을 제공합니다.

## 이 저장소는 무엇인가

LIFE,FIT web — 사용자의 라이프스타일 선호도를 바탕으로 서울의 행정동(427개 중 하나)을
추천해주는 FastAPI 서버 + 정적 프론트엔드입니다(예전에는 Flask였으나 전환됨). 이 저장소는
UI와 HTTP 레이어**만** 담당합니다. 모든 추천 로직과 LLM 호출은 형제 저장소인 `Life-Embed-jh`에
있으며, 이 저장소는 `sys.path`를 통해 이를 직접 임포트합니다(pip 설치 방식이 아님).

## 필수 폴더 구조

이 저장소는 반드시 `Life-Embed-jh`와 같은 레벨에 위치해야 합니다:

```
Life-fit-main/
├── Life-Embed-jh/    # 추천 엔진 (DB, LLM, 파이프라인) — 별도 저장소
└── Life-Web/         # 이 저장소
```

`services/engine.py`는 `../Life-Embed-jh`를 `sys.path`에 추가하고 여기서
`app.features.pipeline_api`, `app.core.db`, `app.features.region_explain`,
`app.features.chat`, `app.features.admin`을 임포트합니다. `Life-Embed-jh`가 없거나 이름이
잘못되면 서버는 임포트 시점에 `ModuleNotFoundError: No module named 'app'` 오류로 실패합니다.
`Life-Embed-jh`는 자체 `.env`에 `ANTHROPIC_API_KEY`와 `data/life.db`(약 216MB, git에 포함되지
않음)가 필요합니다 — 해당 저장소의 README를 참고하세요.

## 실행 방법

```bash
py -m pip install fastapi uvicorn pydantic pandas numpy python-dotenv
py -m uvicorn main:app --reload --port 5000
```

`http://127.0.0.1:5000`에서 서비스됩니다. 이 저장소에는 테스트 스위트, 린터, 빌드 단계가
없습니다 — 대신 각 `services/*.py` 파일에 `if __name__ == "__main__":` 스모크 체크가 있으며,
해당 모듈을 단독으로 점검하려면 직접 실행하면 됩니다(예: `py services/coords.py`,
`py services/engine.py`, `py services/floorplan.py`).

Kakao Maps JS 키는 `frontend/index.html`에 내장되어 있습니다. Kakao Developers 콘솔의 Web
플랫폼에 `http://127.0.0.1:5000`이 등록되어 있어야 하며, 그렇지 않으면 지도가 아무 오류 없이
렌더링되지 않습니다.

## 아키텍처

**요청 흐름:** `frontend/main.js` → `frontend/ui/*.js` → FastAPI 앱의 API 라우트
(요청 본문은 pydantic 모델로 검증됨) → `services/engine.py`가 형제 패키지인 `Life-Embed-jh`를
호출 → 응답을 재구성해 JSON으로 반환 → 프론트엔드가 지도 핀/카드를 렌더링.

- `main.py` — FastAPI 앱 설정과 정적 파일 서빙(`StaticFiles` 마운트로 프론트엔드 +
  `data/LH평면도` 이미지)**만** 합니다. 라우트는 전부 `routers/`에 있고 여기서는
  `include_router`만 합니다.
- `routers/recommend.py` — `/api/predict`, `/api/region`, `/api/region/explain`, `/api/chat`,
  `/api/regions/gudong`. `/api/predict` 응답에서 지역명 앞에 `서울특별시`를 붙이는 것도
  이 파일입니다(엔진이 주는 `"구 행정동명"`은 접두어가 없음).
- `routers/lifetype.py` — `/api/lifetype`, `/api/lifetype/keywords`. 1차 유형 판정입니다.
- `routers/admin.py` — `/api/admin/*`. `Authorization: Bearer <ADMIN_TOKEN>` 헤더를 요구하고,
  수정(PATCH)은 `.env`의 `ADMIN_WRITE_ENABLED=1`까지 있어야 통과합니다.
- `services/engine.py` — **`Life-Embed-jh`를 알고 있는 유일한 파일**입니다. 다른 추천 엔진으로
  교체하려면 여기 있는 import 줄만 바꾸면 됩니다(README의 "다른 엔진 붙이기" 참고).
  7개 라이프스타일 지표의 한국어⇄영어 매핑(`KEY_MAP`)도 여기 하나만 있습니다 — 다른 파일에서
  다시 적지 말고 import 하세요.
- `services/coords.py` — `data/동_좌표.csv`(427행)를 임포트 시점에 메모리 내
  `(구, 동) → (lat, lng)` 딕셔너리(`COORDS`)로 한 번만 로드합니다. `lookup_coords`와
  `/api/regions/gudong`이 이를 읽어옵니다. pandas가 아닌 `csv`를 사용합니다.
- `services/lifetype.py` — 1차 유형 판정. 고른 키워드를 축 점수로 바꾸고 유형 이름과 7지표
  가중치를 만듭니다. **LLM을 쓰지 않습니다** — 의존성이 `random` 뿐입니다.
- `services/typespot.py` — 1차 유형에 어울리는 동네 2곳. `life.db`(없으면
  `master_dataset_v3.csv`)를 `_find()`로 형제 폴더에서 찾아 **그 표 하나만** 읽습니다.
  시세도 그 안에 있습니다(`아파트_전세_보증금`) — 따로 열 파일이 없습니다. 시세는
  "서울 전세 중앙값의 0.65~1.35배" 밴드로 후보를 거르는 데 씁니다(예산을 아직 안 받은
  단계라 아무나 못 가는 동네를 보여 주지 않으려는 것).
- `services/floorplan.py` — LH 평면도 CSV(cp949 인코딩)를 임포트 시점에 pandas로 로드합니다.
  `find_floorplan(area)`는 *실제로 디스크에 이미지 파일이 존재하는* 평면도 중 면적이 가장
  가까운 것을 선택합니다.
- `frontend/` — 빌드 단계도, 프레임워크도 없습니다. `index.html`이 `main.js` 하나만 모듈로
  불러오고 나머지는 `import`가 끌고 옵니다. `lib/`는 공용(서버 호출·공유 상태·문자열 다듬기),
  `ui/`는 화면 단위입니다.
- `frontend/signup.html`, `frontend/admin.html` — **일체형 단일 페이지**입니다(HTML+CSS+JS가
  한 파일). 첫 화면과 공유하는 코드가 없어서 나누면 파일만 늘어납니다. 서버에 저장하는 기능이
  붙어 `lib/api.js`를 쓰게 되면 그때 `<script type="module">`로 바꾸면 됩니다.

### 화면 흐름 — 1차와 2차

첫 화면은 두 단계입니다. 이 구분을 모르고 고치면 엉뚱한 곳을 건드리게 됩니다.

| | 부르는 API | LLM | 담당 파일 |
|---|---|---|---|
| **1차** 유형 판정 | `/api/lifetype` | ✗ (즉시) | `ui/search.js` → `ui/lifetype.js` |
| **2차** 추천 | `/api/predict` | ✓ (3~6초) | `ui/search.js` `runPredict()` |

1차가 LLM을 안 쓰는 이유는 "즉시 나오는 맛보기"여야 키워드를 바꿔 가며 여러 번 눌러 보기
때문입니다. 지역 선정은 검색이 아니라 채점이라(427개 동이 전부 지표 점수를 가짐) 가중치만
있으면 순위가 나오며 매칭 실패가 없습니다.

`ui/search.js`와 `ui/lifetype.js`는 **서로 import 하지 않습니다.** `showTypeCard`가
`onContinue`/`onSkip` 콜백을 받는 구조라 순환 import가 생기지 않습니다 — 이 구조를 유지하세요.

### API 계약

- `POST /api/predict` — 요청 본문은 `{ query: "..." }`(LLM이 텍스트를 7개 지표 가중치로 변환)
  또는 영어 키 `greenery, safety, transport, commercial, medical, education, culture` 아래의
  슬라이더 값 중 하나입니다. `area`/`bldgType`/`dealType`과 금액 필드도 함께 받습니다.
  1차에서 넘어왔다면 `firstWeights`/`firstSpots`/`typeName`이 함께 옵니다 —
  `firstWeights`는 **슬라이더를 안 만졌을 때만**(전부 기본값 3) 적용됩니다.
  응답: `score`, `topRegions`(좌표 포함, `name`에 `서울특별시` 접두어, 각 항목에 `fromFirst`),
  `firstTypeName`, `droppedFromFirst`, `floorplanPath`, `fallback`, `explanation`,
  `weights`, `housing`.
- `POST /api/lifetype` — 요청 `{ query }`. 응답은 유형 판정 결과 전체 + `spots`(동네 2곳) +
  `dataStatus`. `GET /api/lifetype/keywords`는 첫 화면에 뿌릴 키워드를 줍니다 —
  프론트에 하드코딩하면 `services/lifetype.py`와 어긋나므로 반드시 서버에서 받으세요.
- `POST /api/region` — 요청 `{ gu, dong }`, 지도 핀 클릭 시 인근 시설 개수/항목을 반환합니다.
  427개 동 전체 점수를 다시 계산하지 않도록 `/api/predict`와 의도적으로 분리되어 있습니다.
- `POST /api/region/explain` — 동네별 개별 LLM 설명. 시설 정보는 즉시 나오지만 설명은 3~5초
  걸려서 `/api/region`과 나눴습니다.
- `GET /api/regions/gudong` — `{구: [동...]}`. 25개 구 / 427개 동. 회원가입 2단 드롭다운용.

## 회원 데이터 3계층 (설문·회원가입을 건드릴 때 필수)

설문과 회원가입 폼은 **이미 존재하는 스키마에 맞춰 만들어져 있습니다.** 키 이름을 바꾸면
나중에 DB 적재를 붙일 때 변환 코드를 새로 써야 하므로 함부로 고치지 마세요.

| 계층 | 저장 위치 | 무엇이 채우는가 |
|---|---|---|
| customer | `Life-Embed-jh/data/customers_v2.csv` | 회원가입 기본정보 폼(아직 없음) |
| preferences | `Life-Embed-jh/data/user_preferences.csv` | 슬라이더·거래유형 화면 + persona에서 도출한 7지표 |
| persona | `CHUNK_COLUMNS` 9칸 (`app/core/config.py:49`) | `frontend/signup.html`의 15문항 설문 |

**설문 문항 → persona 칸** (`signup.html`의 `PERSONA_MAP`):

| 문항 | 칸 |
|---|---|
| P1 P2 | `professional_persona` |
| S1 S2 | `sports_persona` |
| A1 A2 H1 | `arts_persona` |
| T1 T2 | `travel_persona` |
| C1 C2 | `culinary_persona` |
| F1 F2 | `family_persona` |
| G1 G2 | `cultural_background` |
| — | `persona`, `career_goals_and_ambitions` — **비워 둠** |

`persona`는 "전기태 씨는 …한 인물입니다" 같은 **총괄 요약**이라 문항 하나로 대신할 수 없고,
`career_goals_and_ambitions`는 대응 문항이 아직 없습니다. 빈 칸은 청크가 안 만들어질 뿐
나머지 칸으로 추천이 돌아갑니다.

**저장용 persona에는 질문 라벨을 붙이지 마세요.** 붙이면 모든 회원이 동일한 라벨 문장을
갖게 되어 서로 비슷해 보이고, `find_similar_members()`의 이웃 찾기가 무의미해집니다.
(검색어로 보낼 때는 머리말을 붙여도 됩니다 — Claude가 읽는 용도라 다릅니다.)

## 알려진 함정

**`services/price.py`를 되살리지 마세요.** 예산 감점은 엔진이 `search(housing_override=…)`
안에서 처리합니다. 웹에도 `apply_budget()` 같은 것을 두면 **예산이 두 번 적용되어 오류 없이
결과가 틀어집니다.** `front-ds-v2` 브랜치에는 아직 `price.py`와 `data/시세_*.csv`가 남아
있으니 거기서 파일을 가져올 때 주의하세요.

**데이터 파일을 `Life-Web/data/`에 복사해 두지 마세요.** `Life-Embed-jh/data/`에 원본이
있고 `typespot.py`의 `_find()`가 형제 폴더를 찾습니다. 사본을 만들면 두 벌이 되어 언젠가
어긋납니다. 이 저장소의 `data/`에는 웹 전용 자료(동 좌표, LH 평면도)만 둡니다.

**시세를 별도 CSV에서 읽지 마세요.** `master_dataset_v3` 안에 이미 동마다 들어 있습니다.
예전에 `Life-Web/data/시세_지역별.csv`를 따로 읽던 코드가 있었는데 두 가지가 잘못돼
있었습니다. ① 원본이 엔진 쪽에 있는데 사본을 만들어 5천 줄이 두 벌이 됨.
② CSV의 `(자치구명, 지역명)`과 DB의 `(구, 행정동명)` 이름이 안 맞아 **427개 중 180개가
시세 없음으로 빠짐**. 같은 표에서 꺼내면 둘 다 사라집니다(지금은 427/427).

**`status()`의 `*Found`는 파일 존재 여부일 뿐입니다.** 예전에 `priceFound: True`인데도
`_load_price()`가 빈 딕셔너리인 적이 있었습니다 — 없는 칸(`기준금액`)을 읽어 매 줄이
`except KeyError`로 걸러졌고, 그 탓에 시세 밴드가 한 번도 안 돌았는데 아무도 몰랐습니다.
그래서 값이 실제로 실렸는지 보는 `priceLoaded`를 뒀습니다.
**데이터가 붙었는지 확인할 때는 파일 존재가 아니라 실린 개수를 보세요.**

**`MIN_LENGTH = 20`(`app/core/config.py`)을 낮추지 마세요.** `make_chunks()`는 회원
임베딩과 지식베이스 청킹이 **함께 쓰는** 함수라, 설문 하나 때문에 427개 동 청킹까지 바뀝니다.
게다가 기존 회원 900개 청크의 실측 분포가 최소 55자 / 중앙 138자라 이 값은 지금 아무것도
거르지 않습니다 — 낮추면 새로 들어올 짧은 답변만 통과시킵니다. 짧은 persona가 통과하면
엉뚱한 이웃이 뽑히고 그들의 7지표를 신규 회원이 물려받습니다(오류 없이 조용히 틀림).
자세한 내용과 권장 대안은 README의 "그 전에 확인해야 할 것" 참고.

**`frontend/index.html`의 `<script>`는 `main.js` 하나뿐이어야 합니다.** `front-ds-v2`
브랜치는 `script.js`/`search.js`/`menu.js`를 각각 불러오는 옛 구조입니다. 그쪽에서 마크업을
가져올 때 script 줄까지 따라오면 모듈과 옛 monolith가 동시에 돌아 조용히 깨집니다.

**`onclick` 속성으로 모듈 함수를 부를 수 없습니다.** ES 모듈 스코프라 전역에서 안 보입니다.
이벤트는 JS에서 `addEventListener`로 연결하세요(`main.js` 아래쪽 주석 참고).

**모달 여는 클래스는 `.is-open`입니다.** 메뉴·로그인·추천 사유·1차 유형 카드가 전부 이
관례를 씁니다. `front-ds-v2`는 `.show`를 쓰므로 코드를 옮길 때 바꿔야 합니다.

## 보안 주의사항

API 키, 토큰, 기타 비밀 정보는 반드시 `.env`(gitignore 처리됨)에 두고 절대 커밋하지 마세요.
추천 엔진이 사용하는 Anthropic 키는 이 저장소의 `.env`가 아닌 `Life-Embed-jh/.env`에
있습니다. 관리자 토큰(`ADMIN_TOKEN`)은 이 저장소의 `.env`입니다.

## 진단·수정 기록은 study.md에 남깁니다

버그 진단, 수정 전/후 코드 비교, 초보자용 설명처럼 과정을 자세히 풀어 쓰는 기록은
`study.md`에 적습니다. 여기 CLAUDE.md에는 저장소의 현재 사실 관계만 간결하게 유지합니다.

## 다음에 할 일

1. **회원가입 백엔드** — `POST /api/signup` + 엔진 쪽 적재(`resync_member` → 벡터,
   `find_similar_members` + `blend` → 7지표). 회원가입 폼(목업 또는 카카오 API) 확정 후 착수.
   설문 답변은 지금 추천에만 쓰이고 저장되지 않습니다.
2. **설문 최소 길이 실험** — 기존 회원 100명을 정답지로 삼아 5/10/15자 역테스트.
   최소 길이를 추측이 아니라 숫자로 정할 수 있습니다(README 참고).
3. **LLM persona 정제** — 목적은 "짧은 답 늘리기"가 아니라 "기존 데이터와 문체 맞추기".
   새 사실 추가·근거 없는 추론은 금지 — 환각이 그대로 DB에 남습니다.
4. **`career_goals_and_ambitions` 문항 추가** 또는 정제 단계에서 생성.
5. **`fallback` 실제 감지** — 지금은 항상 `False`로 고정되어 있습니다.
6. **시세 밴드의 하한을 열지 결정** — `typespot.py`의 밴드는 양방향이라 비싼 동네뿐 아니라
   **싼 동네도 뺍니다**(중계2.3동 2.9억, 공릉1동 3.3억 등이 걸립니다). 예산이 적은 사용자에게
   저렴한 동네를 감추는 게 맞는지 따져볼 필요가 있습니다. `BAND_LOW = 0.65`를 0으로 두면
   상한만 걸립니다. 또 427개 중 **180개는 시세 데이터가 없어 그대로 통과**하므로 필터가
   절반만 걸린다는 점도 감안하세요.
