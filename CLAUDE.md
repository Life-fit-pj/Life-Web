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
`app.features.pipeline_api.{search, recommend_by_weights}`와
`app.core.db.{facilities, facility_counts}`를 임포트합니다. `Life-Embed-jh`가 없거나 이름이
잘못되면 서버는 임포트 시점에 `ModuleNotFoundError: No module named 'app'` 오류로 실패합니다.
`Life-Embed-jh`는 자체 `.env`에 `ANTHROPIC_API_KEY`와 `data/life.db`(약 216MB, git에 포함되지
않음)가 필요합니다 — 해당 저장소의 README를 참고하세요.

## 실행 방법

```bash
py -m pip install fastapi uvicorn pydantic pandas numpy
py -m uvicorn main:app --reload --port 5000
```

`http://127.0.0.1:5000`에서 서비스됩니다. 이 저장소에는 테스트 스위트, 린터, 빌드 단계가
없습니다 — 대신 각 `services/*.py` 파일에 `if __name__ == "__main__":` 스모크 체크가 있으며,
해당 모듈을 단독으로 점검하려면 직접 실행하면 됩니다(예: `py services/coords.py`,
`py services/engine.py`, `py services/floorplan.py`).

`services/coords.py`, `services/engine.py`, `services/floorplan.py`는 임포트 시점에 `✅`/`❌`
이모지를 `print()`합니다. 한국어 Windows 콘솔의 기본 코드페이지(cp949)는 이 문자들을 못
담아 `UnicodeEncodeError`가 나고, 그 에러를 처리하는 `except` 블록의 `print`도 같은 이유로
또 실패해 서버가 임포트 단계에서 죽습니다 — `main.py`가 다른 임포트보다 먼저
`sys.stdout.reconfigure(encoding="utf-8")`로 이를 막아 둡니다. 이 재설정 코드보다 위쪽으로
새 임포트를 옮기지 마세요.

`Life-Embed-jh/data/life.db`는 Git LFS로 관리됩니다. 그 저장소를 `git lfs pull` 없이 그냥
클론하면 66MB 실제 DB 대신 133바이트짜리 포인터 텍스트 파일만 받아지고, `/api/predict` 호출
시 `sqlite3.DatabaseError: file is not a database`로 500 에러가 납니다(이 저장소가 아니라
`Life-Embed-jh` 쪽 문제입니다).

`FastAPI` 인스턴스에는 `.run()`이 없으므로(Flask와 다름) `py main.py`로 직접 실행하면
안 되고, 반드시 위의 `uvicorn` 명령으로 실행하세요. (예전에는 Flask 시절 잔재인
`if __name__ == '__main__': app.run(...)` 블록이 파일 맨 아래 죽은 코드로 남아 있었는데,
지금은 지워졌습니다.)

Kakao Maps JS 키는 `frontend/index.html`에 내장되어 있습니다. Kakao Developers 콘솔의 Web
플랫폼에 `http://127.0.0.1:5000`이 등록되어 있어야 하며, 그렇지 않으면 지도가 아무 오류 없이
렌더링되지 않습니다.

## 아키텍처

**요청 흐름:** `frontend/*.js` → FastAPI 앱(`main.py`)의 `POST /api/predict` 또는 `/api/region`
(요청 본문은 pydantic 모델로 검증됨) → `services/engine.py`가 형제 패키지인 `Life-Embed-jh`를
호출 → 응답을 재구성해 JSON으로 반환 → 프론트엔드가 지도 핀/카드를 렌더링.

- `main.py` — FastAPI 앱 설정, 정적 파일 서빙(`StaticFiles` 마운트로 프론트엔드 + `data/LH평면도`
  이미지), 그리고 네 개의 API 라우트(`/api/predict`, `/api/region`, `/api/region/explain`,
  `/api/chat`)를 담당합니다. 라우트 핸들러는 입출력 형태만 다듬고, 실제 작업은 모두
  `services/`에 위임합니다. `/api/predict` 응답에서 지역명 앞에 `서울특별시`를 붙이는 것도
  이 파일이 합니다(엔진이 주는 `"구 행정동명"`은 접두어가 없음).
- `services/engine.py` — **`Life-Embed-jh`를 알고 있는 유일한 파일**입니다. 다른 추천 엔진으로
  교체하려면 여기 있는 두 개의 import 줄만 바꾸면 됩니다(아래 "교체 가능한 엔진 계약" 참고).
  또한 7개 라이프스타일 지표에 대한 한국어⇄영어 키 매핑과, 핀 클릭 시 필요한 시설 정보
  조회(`get_facilities`)도 이 파일이 담당합니다.
- `services/coords.py` — `data/동_좌표.csv`(427행)를 임포트 시점에 메모리 내
  `(구, 동) → (lat, lng)` 딕셔너리로 한 번만 로드합니다. `lookup_coords`가 이를 읽어옵니다.
  pandas가 아닌 `csv`를 사용합니다.
- `services/floorplan.py` — LH 평면도 CSV(cp949 인코딩)를 임포트 시점에 pandas로 로드합니다.
  `find_floorplan(area)`는 *실제로 디스크에 이미지 파일이 존재하는* 평면도 중 면적이 가장
  가까운 것을 선택합니다 — CSV에는 227행이 있지만 그중 66개만 대응하는 이미지 폴더가 있어서,
  면적 차이순으로 정렬한 후보들을 순회하며 실제로 존재하는 경로가 나올 때까지 탐색합니다.
- `services/price.py` — `data/시세_지역별.csv`를 임포트 후 첫 호출 시점에 한 번만 로드합니다
  (지연 로딩). `apply_budget()`이 `services/engine.py`의 추천 결과에 예산 초과분만큼 감점을
  얹고, 화면에 보여줄 시세를 붙입니다. 엔진이 주는 만족도 순위 자체는 건드리지 않고 그 위에
  얹는 방식이라, 엔진 교체와 무관하게 독립적으로 동작합니다.
- `frontend/` — 빌드 단계도, 프레임워크도 없습니다(다만 아래처럼 ES 모듈로 화면 단위·역할
  단위로 잘게 나뉘어 있어 나중에 Next.js 등으로 옮길 때 파일 단위 이식이 쉽습니다).
  `index.html`은 `<script type="module" src="main.js">` 하나만 불러오고, 나머지는
  `import`로 연결됩니다. 예전의 단일 `script.js`는 화면별로 쪼개져 지금은 존재하지
  않습니다.
  - `frontend/main.js` — 모듈 진입점. `ui/*.js` 각 파일을 옆으로 불러와 각자 자기
    `DOMContentLoaded` 리스너로 스스로 초기화하게 하고, `onclick` 속성이 모듈 스코프
    함수를 못 찾는 문제 때문에 `runBtn` 클릭 이벤트만 여기서 직접 연결합니다.
  - `frontend/lib/` — 화면 여러 곳이 같이 쓰는 것들. `api.js`는 서버 호출(`fetch`)을
    모아 둔 곳(`postPredict`/`postRegion`/`postRegionExplain`/`postChat`) — 주소나
    헤더가 바뀌면 여기만 고치면 됩니다. `state.js`는 화면 간에 공유하는 값(마지막 추천
    결과 `state.lastResult`, 마지막 검색어 `state.lastQuery`, 중복 요청 방지용
    `nextSeq`/`isLatest`)을 담는 상자입니다. `format.js`는 DOM을 건드리지 않고 문자열만
    다듬는 순수 함수(`escapeAndFormat`, `splitRegionName`)를 모아 둡니다. `.gitignore`의
    Python용 `lib/` 규칙이 한때 이 폴더를 통째로 가려서 git이 추적하지 못했던 적이
    있으니(`/lib/`로 루트 한정 완료), 새 `.gitignore` 규칙을 추가할 때 `frontend/lib/`을
    다시 가리지 않도록 주의하세요.
  - `frontend/ui/` — 화면 단위로 나뉜 코드. `search.js`(초기 검색 화면 — 떠다니는 클릭
    가능한 키워드, 자연어 질의 입력창), `result.js`(`runSimulation`/`renderResult` —
    슬라이더·검색 두 경로가 모두 이 결과 렌더러 하나로 수렴), `map.js`(Kakao 지도 초기화·
    마커), `reason.js`(핀 클릭 시 뜨는 추천 사유 모달, 레이더 차트), `chat.js`(결과 화면
    채팅 패널), `deal.js`(거래유형 세그먼트·금액 슬라이더), `menu.js`(우측 상단 메뉴
    패널 — 로그인/로그아웃은 `localStorage`의 `lifefit-token` 유무로만 판별하는 개발용
    임시 구현이며, 실제 로그인 API가 없습니다)로 나뉩니다.
  - CSS도 같은 방식으로 화면 단위 분리를 시작했습니다. `frontend/style.css`(테마 변수,
    리셋, `.panel` 공통 틀, 좌측 컨트롤 패널 전반의 폼 스타일, 스크롤바·반응형처럼 여러
    화면이 같이 쓰는 것만 남음)와 `frontend/search.css`(첫 진입 검색 화면 + 결과 화면
    상단 검색바)는 공용, `frontend/ui/result.css`·`ui/reason.css`·`ui/chat.css`·
    `ui/menu.css`는 같은 이름의 `ui/*.js`와 1:1로 대응하는 화면별 스타일입니다. CSS에는
    JS의 `import` 같은 연결 수단이 없어서, 나눈 파일 수만큼 `index.html`에
    `<link rel="stylesheet">`를 직접 추가해야 합니다(순서: 공용 파일 먼저, 화면별 파일
    나중 — 같은 우선순위 선택자는 나중에 적은 `<link>`가 이기기 때문). `#map`(`ui/map.js`
    담당)과 `.seg`/`.seg-btn`(`ui/deal.js` 담당)은 분량이 작아 `style.css`에 남겨 뒀습니다
    — `ui/*.js`와 `ui/*.css`가 무조건 1:1일 필요는 없고, 파일을 만들 가치가 있는 화면만
    나눴습니다.

### API 계약

- `POST /api/predict` — 요청 본문은 `{ query: "..." }`(LLM이 텍스트를 7개 지표 가중치로 변환)
  또는 영어 키 `greenery, safety, transport, commercial, medical, education, culture` 아래의
  슬라이더 값(가중치로 그대로 사용됨) 중 하나입니다. `area`/`bldgType`도 함께 받으며, `area`가
  59㎡ 이상이면 종합 점수(`score`)에 소폭 가산점이 붙습니다. `dealType`(`매매`/`전세`/`월세`)과
  그에 맞는 예산 필드(`salePrice`/`jeonseDeposit`/`wolseDeposit`+`wolseRent`, 전부 만원 단위)는
  `services/engine.py`의 `to_housing()`이 엔진의 `housing` 형태로 바꿔 `search`/
  `recommend_by_weights`에 그대로 넘기고, 엔진이 그 조건에 맞는 동만 추려 순위를 매깁니다
  (예전에는 이 저장소의 `services/price.py`가 따로 예산 초과분을 감점했으나 지금은 삭제되어
  없음 — 엔진이 필터링까지 전담). 두 경로 모두 `services.engine.get_regions`로 수렴하며,
  동일한 형태를 반환합니다: `score`, `topRegions`(좌표 포함, `name`에 `서울특별시` 접두어가
  붙음), `floorplanPath`, `fallback`(현재 항상 `False`, 실제 폴백 감지는 미구현), `explanation`,
  `weights`(프론트엔드가 슬라이더를 다시 동기화할 수 있도록), `housing`(검색어 경로에서 LLM이
  읽어낸 건물유형·거래유형·예산 조건 — `{건물유형, 거래유형, targets:{예산, 보증금?}}` 또는
  가격 언급이 없었으면 `null`. `frontend/ui/search.js`의 `applyHousing()`이 이 값으로 "건축"
  패널을 동기화한다. 슬라이더 경로에서는 화면 값과 이미 같으므로 항상 `null`).
- `POST /api/region` — 요청 본문 `{ gu, dong }`, 지도 핀 클릭 시 표시되는 모달용으로 인근 시설
  개수/항목(`services.engine.get_facilities`가 주는 `counts`/`items`)을 반환합니다. 핀 클릭 시
  427개 동 전체 점수를 다시 계산하지 않도록 `/api/predict`와 의도적으로 분리되어 있습니다.
- `frontend/ui/reason.js`는 `POST /api/region/explain`(동네별 개별 LLM 설명)을,
  `frontend/ui/chat.js`는 `POST /api/chat`(결과 화면에서의 추가 질문)을 호출하며,
  `main.py`에 이미 구현되어 있습니다(각각 151번째 줄, 169번째 줄 부근).

### 교체 가능한 엔진 계약

어떤 엔진이든 아래 두 함수를 정확히 이 반환 형태로 노출하기만 하면 `Life-Embed-jh`를 대체할
수 있습니다(자세한 내용과 셀프 체크 스니펫은 README.md 참고):

- `search(query, top_k=5)` → `{"weights": {<7개 한국어 지표명>: 1-5 float}, "regions": [{"name": "구 행정동명", "total": float, "scores": {<7개 지표>: 0-100}}], "explanation": str}`
- `recommend_by_weights(weights, top_k=5)` → 위와 같은 `regions` 목록 형태만 반환

위반 시 프론트엔드가 아무 오류 없이 조용히 망가지는 강제 제약 조건:
- 7개 지표명은 고정된 한국어 문자열입니다: `녹지 안전 교통 상권 의료 교육 문화`.
- `name`은 정확히 `"구 행정동명"` 형태여야 합니다 — 공백 하나, `서울특별시` 접두어 없음.
  백엔드가 `name.split(" ", 1)`로 좌표를 조회하므로, 이 형식을 벗어나면 좌표 조회가 실패합니다.
- `scores` 값은 0-100 범위이며 높을수록 좋은 값이어야 합니다(정확한 백분위일 필요는 없음).
- `weights` 값은 숫자형이어야 하며(`"4.6"`이 아닌 `4.6`), 범위는 1-5입니다.
- `explanation`은 값이 없을 때 `None`이 아닌 `""`이어야 합니다.

엔진을 교체하려면 `services/engine.py` 상단의 import 두 줄(형제 폴더 경로 + 그 안의 모듈
경로)만 수정하면 됩니다.

## 보안 주의사항

API 키, 토큰, 기타 비밀 정보는 반드시 `.env`(gitignore 처리됨)에 두고 절대 커밋하지 마세요.
추천 엔진이 사용하는 Anthropic 키는 이 저장소의 `.env`가 아닌 `Life-Embed-jh/.env`에
있습니다.

## 진단·수정 기록은 study.md에 남깁니다

버그 진단, 수정 전/후 코드 비교, 초보자용 설명처럼 과정을 자세히 풀어 쓰는 기록은
`study.md`에 적습니다. 여기 CLAUDE.md에는 저장소의 현재 사실 관계만 간결하게 유지합니다.

## 검토 결과 (2026-08-31) — JS·CSS 화면 단위 분리 완료 이후 점검

프론트가 단일 `script.js`/`style.css`에서 `main.js`(진입점) + `lib/{api,state,format}.js`
(공용) + `ui/{deal,map,reason,chat,result,menu,search}.js`(화면 단위 JS) +
`ui/{result,reason,chat,menu}.css`(화면 단위 CSS)로 나뉘는 작업이 끝났습니다. 서버를 띄워
`/`, `/main.js`, `/ui/*.js`, `/ui/*.css`, `/lib/*.js`가 전부 200으로 응답하는 것, 실제
`/api/predict` 호출이 진짜 추천 결과를 돌려주는 것까지 확인했고, 정상 동작합니다.

2026-08-30 검토에서 지적됐던 두 가지(`ui/result.js`의 중복 `updateTopRegionsList()`,
`ui/reason.js`의 `state` 이름 충돌)는 모두 고쳐졌습니다 — `grep`으로 재확인함. CSS 분리도
선택자가 파일 경계를 넘어 중복 정의되지 않은 것을 확인했습니다.
