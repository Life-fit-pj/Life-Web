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

`main.py` 맨 아래의 `if __name__ == '__main__': app.run(...)` 블록은 Flask 시절 코드가 그대로
남은 죽은 코드입니다 — `FastAPI` 인스턴스에는 `.run()`이 없어서 `py main.py`로 직접 실행하면
`AttributeError`가 납니다. 반드시 위의 `uvicorn` 명령으로 실행하세요.

Kakao Maps JS 키는 `frontend/index.html`에 내장되어 있습니다. Kakao Developers 콘솔의 Web
플랫폼에 `http://127.0.0.1:5000`이 등록되어 있어야 하며, 그렇지 않으면 지도가 아무 오류 없이
렌더링되지 않습니다.

## 아키텍처

**요청 흐름:** `frontend/*.js` → FastAPI 앱(`main.py`)의 `POST /api/predict` 또는 `/api/region`
(요청 본문은 pydantic 모델로 검증됨) → `services/engine.py`가 형제 패키지인 `Life-Embed-jh`를
호출 → 응답을 재구성해 JSON으로 반환 → 프론트엔드가 지도 핀/카드를 렌더링.

- `main.py` — FastAPI 앱 설정, 정적 파일 서빙(`StaticFiles` 마운트로 프론트엔드 + `data/LH평면도`
  이미지), 그리고 두 개의 API 라우트를 담당합니다. 라우트 핸들러는 입출력 형태만 다듬고, 실제
  작업은 모두 `services/`에 위임합니다. `/api/predict` 응답에서 지역명 앞에 `서울특별시`를
  붙이는 것도 이 파일이 합니다(엔진이 주는 `"구 행정동명"`은 접두어가 없음).
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
- `frontend/` — 빌드 단계도, 프레임워크도 없습니다. `index.html`/`search.css`/`search.js`는
  초기 검색 화면(떠다니는 클릭 가능한 키워드, 자연어 질의 입력창)이고, `style.css`/`script.js`는
  결과 화면(Kakao 지도, 순위 목록, 핀별 추천 사유 카드, 채팅 패널)입니다.

### API 계약

- `POST /api/predict` — 요청 본문은 `{ query: "..." }`(LLM이 텍스트를 7개 지표 가중치로 변환)
  또는 영어 키 `greenery, safety, transport, commercial, medical, education, culture` 아래의
  슬라이더 값(가중치로 그대로 사용됨) 중 하나입니다. `area`/`builtYear`/`bldgType`도 함께
  받으며, `area`가 59㎡ 이상이거나 `builtYear`가 2015년 이후면 종합 점수(`score`)에 소폭
  가산점이 붙습니다. 두 경로 모두 `services.engine.get_regions`로 수렴하며, 동일한 형태를
  반환합니다: `score`, `topRegions`(좌표 포함, `name`에 `서울특별시` 접두어가 붙음),
  `floorplanPath`, `fallback`(현재 항상 `False`, 실제 폴백 감지는 미구현), `explanation`,
  `weights`(프론트엔드가 슬라이더를 다시 동기화할 수 있도록).
- `POST /api/region` — 요청 본문 `{ gu, dong }`, 지도 핀 클릭 시 표시되는 모달용으로 인근 시설
  개수/항목(`services.engine.get_facilities`가 주는 `counts`/`items`)을 반환합니다. 핀 클릭 시
  427개 동 전체 점수를 다시 계산하지 않도록 `/api/predict`와 의도적으로 분리되어 있습니다.
- `frontend/script.js`는 `POST /api/region/explain`(동네별 개별 LLM 설명)과
  `POST /api/chat`(결과 화면에서의 추가 질문)도 호출하지만, **`main.py`에 이 두 라우트는 아직
  없습니다.** 요청은 404로 실패하고 프론트엔드가 이를 조용히 삼켜 해당 UI 영역만 비워 두므로,
  화면이 깨지진 않지만 기능은 동작하지 않습니다. 이 두 엔드포인트를 구현하는 것이 남은 작업입니다.
  > **[2026-08-29 정정]** `main.py`를 다시 확인해 보니 위 두 라우트(`/api/region/explain`,
  > `/api/chat`)가 이미 구현되어 있습니다(123~151번째 줄 부근). 이 문단은 그 사이에 작업이
  > 진행되면서 사실과 달라진 오래된 메모이니, 두 엔드포인트가 "없다"는 앞 문장은 더 이상
  > 유효하지 않습니다.

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

## 메인 화면 검색창 버그 진단 (2026-08-27)


## 핀 클릭 상세 정보 모달 — 오류 진단 + 구조 개선 설계 (2026-08-29)

> **[2026-08-29 적용 완료]** 아래 진단·설계 내용은 실제로 `frontend/script.js`,
> `frontend/style.css`에 적용했습니다(버그 A/B 수정, LLM 이유 박스 이동, 탭 4개 추가,
> 로드뷰 지연 초기화 뼈대까지 전부 반영). 로드뷰는 카카오 API 연동 자체는 코드로
> 넣어뒀지만 실제 파노라마가 뜨는지는 브라우저에서 직접 확인이 필요합니다(자동화 도구
> 없이는 핀 클릭→탭 클릭까지 실제 클릭 시나리오를 검증하지 못했습니다). 아래 설명은
> "왜 이렇게 고쳤는지"를 이해하기 위한 기록으로 남겨둡니다.

아래 내용은 애초에 진단·설계 문서로 작성됐습니다. 지금 막 코딩을 배우기 시작한
단계라고 하셔서, 각 함수가 왜 이렇게 짜여 있는지부터 풀어서 설명합니다.

### 0. 먼저 알아야 할 것 — 이 모달은 어떻게 화면에 뜨는가

지도 위 핀(마커)을 클릭했을 때 뜨는 그 창의 코드 이름은 `reason-modal`("추천 사유
모달")입니다. 흐름은 이렇습니다.

1. `addMarkerAndOverlay(item, latLng, bounds, weights)` ([script.js:204](frontend/script.js#L204)) —
   지도에 핀을 하나 찍고, 그 핀에 클릭 이벤트를 건다. `item`은 그 동네 하나의 정보
   (이름, 순위, 점수, 좌표, 지표별 점수 등을 담은 객체)이고, `weights`는 사용자가
   슬라이더로 설정한(또는 자연어 검색이 변환한) 7개 지표의 중요도다.
   ```js
   kakao.maps.event.addListener(marker, "click", () => {
     openReasonModal(item, weights);
   });
   ```
   즉 "이 핀을 누르면 `openReasonModal`을 부른다"는 예약만 미리 걸어두는 코드다.

2. `ensureModal()` ([script.js:262](frontend/script.js#L262)) — 모달 껍데기(배경 어둡게
   깔리는 부분 + 흰 카드 + 닫기 버튼)를 **딱 한 번만** 만들어서 `modalEl` 이라는 전역
   변수에 저장해 두고, 이후에는 그걸 재사용한다. 핀을 클릭할 때마다 매번 새로
   `document.createElement`로 만들면 이전에 걸어둔 "배경 클릭하면 닫기", "Esc 누르면
   닫기" 같은 이벤트 리스너가 핀 클릭 횟수만큼 계속 쌓이는 문제가 생기기 때문에,
   "이미 있으면 그걸 그대로 돌려주고, 없을 때만 만든다"는 패턴(흔히 **싱글턴**이라고
   부른다)을 쓴 것이다.

3. `openReasonModal(item, weights)` ([script.js:287](frontend/script.js#L287)) — 실제로
   모달을 채우고 여는 함수. 이 함수 안에서 하는 일은 크게 두 갈래로 나뉜다.
   - **동기(즉시) 처리**: `buildReasonCard(item, weights)`로 카드 HTML을 만들어 넣고,
     `drawRadar(...)`로 레이더 차트(스파이더 웹)를 그린다. 둘 다 서버에 물어볼 필요
     없이 이미 갖고 있는 `item`/`weights` 값만으로 계산할 수 있어서 기다림 없이
     바로 화면에 나온다.
   - **비동기(나중에 채워짐) 처리**: `loadFacilities(item.name)`와
     `loadRegionExplain(item, weights)`는 각각 `/api/region`, `/api/region/explain`에
     `fetch`로 물어봐야 답이 오는 함수라서, 답이 올 때까지는 "~ 살펴보는 중..." 같은
     로딩 문구만 보이다가 응답이 도착하면 그 안의 `innerHTML`을 채워 넣는다.

4. `buildReasonCard(item, weights)` ([script.js:412](frontend/script.js#L412)) — 모달
   안에 들어갈 HTML을 문자열로 조립하는 함수. 여기서 중요한 건, 시설 정보나 LLM
   설명처럼 "나중에 채워질 자리"를 `<div id="rcFacility">...</div>`,
   `<div id="rcLlm"></div>`처럼 **빈 상자로 미리 만들어 둔다**는 점이다. 3번의
   `loadFacilities`/`loadRegionExplain`은 이 id를
   `document.getElementById("rcFacility")`로 찾아서 그 안의 `innerHTML`만 나중에
   바꿔치기한다. 그래서 이 빈 상자 `<div>`가 카드 템플릿의 어느 줄에 있는지가 곧
   "화면에서 그 내용이 어디에 나오는지"를 그대로 결정한다 — 2번 항목에서 위치를
   옮기는 작업이 왜 "그냥 템플릿 문자열 안에서 순서만 바꾸면 되는" 작업인지의 근거다.

### 1. 모달에서 발견한 오류 2가지

#### 버그 A — 핀 하나 클릭할 때마다 서버에 같은 요청을 2번씩 보낸다

위치: [script.js:287-304](frontend/script.js#L287-L304) `openReasonModal` 함수

```js
function openReasonModal(item, weights) {
  const el = ensureModal();
  el.querySelector(".reason-body").innerHTML = buildReasonCard(item, weights);
  el.classList.add("is-open");
  document.body.style.overflow = "hidden";     // 뒤 화면 스크롤 잠금
  el.querySelector(".reason-close").focus();

  // 카드가 화면에 붙은 뒤에 그려야 canvas 크기가 잡힌다
  drawRadar(buildRows(item, weights));

  loadFacilities(item.name);
  loadRegionExplain(item, weights);

  // 막대는 이미 있는 데이터로 즉시 보여 주고,
  // 시설 정보만 나중에 채운다. 기다리는 동안에도 읽을 것이 있게 한다
  loadFacilities(item.name);
  loadRegionExplain(item, weights);
}
```

`loadFacilities(item.name)`와 `loadRegionExplain(item, weights)`가 각각 **두 번씩**
호출되고 있다. 주석("막대는 이미 있는 데이터로 즉시 보여 주고...")을 보면 원래는 설명을
적어두려던 자리였는데, 그 아래에 실제 호출 코드까지 실수로 한 번 더 복사돼서 남은
것으로 보인다.

이게 왜 문제가 되냐면:
- 핀 하나를 클릭할 때마다 `/api/region`과 `/api/region/explain`에 요청이 각각 2번씩,
  총 4번의 네트워크 요청이 나간다. 특히 `/api/region/explain`은 안에서 LLM(Anthropic
  API)을 호출하는 엔드포인트라서([main.py:133](main.py#L133) 부근), 요청이 2배가 되면
  응답 속도도 느려지고 API 호출 비용도 2배로 나간다.
- 두 응답이 정확히 같은 순서로 돌아온다는 보장이 없다(네트워크 타이밍은 매번 달라질
  수 있다). 운이 나쁘면 나중에 도착한 두 번째 응답이 먼저 도착한 첫 번째 응답의
  내용을 덮어써서 화면이 잠깐 깜빡이거나, 두 응답 내용이 미묘하게 다를 경우(예: LLM
  이 매번 살짝 다른 문장을 만드는 경우) 사용자가 알아채지 못하는 사이에 결과가 한 번
  더 바뀌는 상태가 된다.

**고치는 방향**: 아래쪽에 중복된 두 줄(과 그 위의 주석)을 지우고, 호출을 한 번씩만
남긴다.

```js
function openReasonModal(item, weights) {
  const el = ensureModal();
  el.querySelector(".reason-body").innerHTML = buildReasonCard(item, weights);
  el.classList.add("is-open");
  document.body.style.overflow = "hidden";     // 뒤 화면 스크롤 잠금
  el.querySelector(".reason-close").focus();

  // 카드가 화면에 붙은 뒤에 그려야 canvas 크기가 잡힌다
  drawRadar(buildRows(item, weights));

  // 막대는 이미 있는 데이터로 즉시 보여 주고,
  // 시설 정보/LLM 설명은 서버 응답이 오는 대로 나중에 채운다
  loadFacilities(item.name);
  loadRegionExplain(item, weights);
}
```

#### 버그 B — 지표 5점 점수줄(rc-rows)이 카드 안에서 통째로 두 번 찍힌다

위치: [script.js:449-451](frontend/script.js#L449-L451) `buildReasonCard` 함수 안

```js
      <div class="rc-chart"><canvas id="rcRadar"></canvas></div>
      <div class="rc-rows">${rowsHtml}</div>
      <div class="rc-rows">${rowsHtml}</div>
```

`rowsHtml`은 `rows.map(...).join("")`로 **녹지·안전·교통·상권·의료·교육·문화 7개
지표의 점(●●●○○) 줄**을 만든 결과인데, 그 결과를 담는 `<div class="rc-rows">`가
줄만 바뀌어 그대로 두 번 나온다. `style.css`를 확인해 보면 `.rc-rows`(복수형, 감싸는
상자)에는 애초에 스타일 규칙 자체가 없고, 실제 grid 배치는 그 안의 각 줄인
`.rc-row`(단수형)에 걸려 있다([style.css:631](frontend/style.css#L631)) — 그래서 이
중복은 CSS로 가려지지 않고 그대로 "7개 지표 줄이 위아래로 두 벌, 총 14줄" 나오는
형태로 화면에 보인다.

사용자가 겪고 계신 "핀 클릭 모달 오류"의 눈에 보이는 정체가 바로 이것일 가능성이
높습니다 — 같은 지표 목록이 카드 안에서 두 번 반복되는 것이 이상하게 느껴졌을
것입니다. 그리고 이 중복은 3번 항목("정보 과다로 인한 피로감")의 원인 중 하나이기도
합니다 — 정리하는 김에 여기서 같이 없애는 게 자연스럽습니다.

**고치는 방향**: 아래 두 줄 중 하나를 지운다.

```js
      <div class="rc-chart"><canvas id="rcRadar"></canvas></div>
      <div class="rc-rows">${rowsHtml}</div>
```

> 다만 3번 항목에서 이 `rc-rows` 자체를 탭 안으로 옮기는 리팩터를 같이 하게 되므로,
> 실제로는 이 줄을 지우는 작업과 3번의 탭 구조 변경을 한 번에 처리하는 편이 두 번
> 손대는 것보다 편할 수 있습니다.

### 2. "이 동네를 고른 이유"(LLM 응답) 박스를 스파이더 웹 아래로 이동

지금 `buildReasonCard`가 만드는 카드 내부 순서는 위에서 아래로 이렇다
([script.js:437-463](frontend/script.js#L437-L463)):

1. `rc-eyebrow` — "N순위 추천 지역" 작은 글씨
2. `rc-head` — 동네 이름 + MATCH 점수
3. `rc-reason` — 한 줄 요약 문장(헤드라인 + 보조 설명)
4. `rc-chart` — **스파이더 웹(레이더 차트)**
5. `rc-rows` × 2 (버그 B) — 지표 5점 점수줄
6. `rc-facility` (`id="rcFacility"`, 비동기) — "이 동네에 있는 것" / "생활 여건"
7. `rc-llm` (`id="rcLlm"`, 비동기) — **"💬 이 동네를 고른 이유"** ← 지금 여기, 맨 아래 근처
8. `rc-source` — 출처 문구

즉 지금은 LLM 응답 박스가 시설 정보(6번)보다도 아래, 카드에서 거의 마지막에
나옵니다. 요청하신 대로 하려면 7번을 4번 바로 다음으로 옮기면 됩니다.

**바뀔 순서**: `rc-chart`(스파이더 웹) → `rc-llm`(이 동네를 고른 이유) → (3번에서
만들 탭 영역) → `rc-source`

이동 자체는 위험한 작업이 아닙니다. `loadRegionExplain` 함수는 위치와 상관없이
`document.getElementById("rcLlm")`으로 그 상자를 **찾아서** 내용을 채워 넣는 방식이라,
그 상자가 템플릿 문자열의 몇 번째 줄에 있는지는 함수 동작에 전혀 영향을 주지 않습니다.
즉 `buildReasonCard`의 return 문 안에서 `<div class="rc-llm" id="rcLlm"></div>` 한
덩어리를 오려서 `rc-chart` 바로 다음 줄에 붙여넣기만 하면 됩니다. 다른 함수는 손댈
필요가 없습니다.

지금:
```js
      <div class="rc-chart"><canvas id="rcRadar"></canvas></div>
      <div class="rc-rows">${rowsHtml}</div>

      <!-- 시설 정보가 비동기로 채워지는 자리 -->
      <div class="rc-facility" id="rcFacility">
        <div class="rc-loading">이 동네를 살펴보는 중...</div>
      </div>

      <!-- LLM 설명이 채워지는 자리. 시설보다 오래 걸린다 -->
      <div class="rc-llm" id="rcLlm"></div>

      <div class="rc-source">서울 427개 행정동 공공데이터 기준 백분위</div>
```

이렇게 바꾸세요 (3번의 탭 영역까지 함께 넣은 최종 형태입니다):
```js
      <div class="rc-chart"><canvas id="rcRadar"></canvas></div>

      <!-- LLM 설명이 채워지는 자리. 스파이더 웹 바로 아래로 이동 -->
      <div class="rc-llm" id="rcLlm"></div>

      <!-- 3번 항목: 탭 UI. rc-rows / rc-facility 는 각 탭 패널 안으로 이동 -->
      <div class="rc-tabs">
        ...(아래 3번 항목 참고)...
      </div>

      <div class="rc-source">서울 427개 행정동 공공데이터 기준 백분위</div>
```

`rc-llm:empty { border-top: none; margin: 0; padding: 0; }` 규칙이
[style.css:736](frontend/style.css#L736)에 이미 있어서, LLM 설명이 아직 안 왔거나
실패해서 빈 상태일 때는 위쪽 구분선(border-top)이 저절로 사라지도록 짜여 있습니다.
위치를 옮겨도 이 동작은 그대로 유지되니 별도로 손볼 필요는 없습니다.

### 3. LLM 응답 박스 아래에 탭 추가 (정보 과다 완화)

**탭 UI란**: 여러 묶음의 정보를 한 화면에 전부 펼쳐 놓는 대신, 위쪽에 버튼(탭 머리글)을
몇 개 두고 그중 하나를 눌렀을 때 그 버튼에 해당하는 내용만 보여주고 나머지는 숨겨두는
방식입니다. 별도 라이브러리 없이 HTML/CSS/JS만으로 만들 수 있는 가장 단순한 형태는:
- 모든 탭의 내용(panel)을 HTML에는 전부 넣어 두되, CSS로 `display: none`(안 보이는
  탭)과 `display: block`(보이는 탭)만 클래스로 토글한다.
- 탭 버튼을 클릭하면 JS가 "지금 선택된 버튼"과 "지금 보여줄 패널"에만
  `is-active` 클래스를 붙이고, 나머지에서는 뗀다.

요청하신 4개 탭과 기존 코드의 대응 관계:

| 탭 | 내용 | 기존 코드에서 가져올 것 |
|---|---|---|
| 인디케이터 5점 점수표 | 지표 7개 × 5점 dot | `rc-rows` (`buildRows`가 만든 `rowsHtml`) — 버그 B에서 지운 나머지 한 벌 |
| 이 동네에 있는 것 / 생활 여건 | 시설 개수·이름, 거주안정성 등 | `rc-facility`(`id="rcFacility"`) — `loadFacilities`가 채워주는 그대로 |
| 주변 시세 | (추가 예정) | 아직 데이터 소스가 없음 — 우선 "준비 중" 안내만 |
| 로드뷰 | (구현 예정) | 새로 작성 필요 — 아래에 설계안 |

#### 3-1. HTML — `buildReasonCard`의 return 템플릿에 추가할 부분

```js
      <div class="rc-tabs">
        <div class="rc-tab-heads">
          <button class="rc-tab-head is-active" data-tab="score">5점 점수표</button>
          <button class="rc-tab-head" data-tab="living">생활 여건</button>
          <button class="rc-tab-head" data-tab="price">주변 시세</button>
          <button class="rc-tab-head" data-tab="roadview">로드뷰</button>
        </div>

        <div class="rc-tab-panel is-active" data-tab-panel="score">
          <div class="rc-rows">${rowsHtml}</div>
        </div>

        <div class="rc-tab-panel" data-tab-panel="living" id="rcFacility">
          <div class="rc-loading">이 동네를 살펴보는 중...</div>
        </div>

        <div class="rc-tab-panel" data-tab-panel="price">
          <div class="rc-empty">준비 중입니다.</div>
        </div>

        <div class="rc-tab-panel" data-tab-panel="roadview">
          <div id="rcRoadview" class="rc-roadview"></div>
        </div>
      </div>
```

주의할 점 하나 — `id="rcFacility"`는 그대로 유지해야 합니다. `loadFacilities` 함수가
여전히 `document.getElementById("rcFacility")`로 이 상자를 찾아서 채우기 때문에,
클래스를 `rc-facility`에서 `rc-tab-panel`로 바꾸더라도 `id`만은 그대로 둬야 기존
비동기 채우기 로직을 건드리지 않아도 됩니다.

#### 3-2. CSS — `style.css`에 새로 추가할 규칙

```css
.rc-tab-heads {
  display: flex;
  gap: 4px;
  margin-top: 16px;
  border-bottom: 1px solid var(--line);
}

.rc-tab-head {
  flex: 1;
  padding: 8px 0;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  font-size: 12px;
  color: var(--muted);
  cursor: pointer;
}

.rc-tab-head.is-active {
  color: var(--text);
  font-weight: 600;
  border-bottom-color: var(--accent);
}

.rc-tab-panel { display: none; padding-top: 14px; }
.rc-tab-panel.is-active { display: block; }

.rc-empty { font-size: 12px; color: var(--muted); text-align: center; padding: 20px 0; }

.rc-roadview {
  width: 100%;
  height: 220px;
  border-radius: 10px;
  overflow: hidden;
  background: var(--card);
}
```

기존 `.rc-facility`, `.rc-loading`, `.rc-fac-head` 등의 스타일은 그대로 둬도 됩니다 —
`rc-facility` 클래스 자체를 지우지 않고 `rc-tab-panel`을 추가로 덧붙이는 방식이면 두
스타일이 함께 적용되어 지금과 같은 여백/글자 크기가 유지됩니다.

#### 3-3. JS — 탭 전환 로직 + 로드뷰(구현 예정)

탭 버튼 클릭에 반응하는 함수를 하나 추가하고, `openReasonModal` 끝에서 호출합니다.

```js
/** 탭 버튼 클릭에 맞춰 패널을 바꿔 보여준다 */
function bindReasonTabs(el, item) {
  el.querySelectorAll(".rc-tab-head").forEach((head) => {
    head.addEventListener("click", () => {
      const name = head.dataset.tab;

      el.querySelectorAll(".rc-tab-head")
        .forEach((h) => h.classList.toggle("is-active", h === head));
      el.querySelectorAll(".rc-tab-panel")
        .forEach((p) => p.classList.toggle("is-active", p.dataset.tabPanel === name));

      if (name === "roadview") initRoadview(item);
    });
  });
}
```

`openReasonModal` 안에서는 `buildReasonCard`로 채운 직후에 한 번 불러주면 됩니다.

```js
function openReasonModal(item, weights) {
  const el = ensureModal();
  el.querySelector(".reason-body").innerHTML = buildReasonCard(item, weights);
  el.classList.add("is-open");
  document.body.style.overflow = "hidden";
  el.querySelector(".reason-close").focus();

  bindReasonTabs(el, item);     // 추가: 탭 클릭 이벤트 연결

  drawRadar(buildRows(item, weights));
  loadFacilities(item.name);
  loadRegionExplain(item, weights);
}
```

**로드뷰(카카오 API)는 아직 구현되어 있지 않으므로, 아래는 코드가 아니라 설계
스케치입니다.** `frontend/index.html:14`에서 이미 `libraries=services`를 붙여
카카오 지도 SDK를 불러오고 있는데, 로드뷰 자체는 이 `services` 라이브러리에 포함돼
있어서 **스크립트 태그를 더 추가할 필요는 없습니다.** 필요한 건 좌표로 가장 가까운
파노라마 사진을 찾아주는 `kakao.maps.RoadviewClient`와, 그걸 그려줄
`kakao.maps.Roadview` 두 가지입니다. `item.lat`/`item.lng`는
[script.js:161-162](frontend/script.js#L161-L162)에서 보듯 이미 마커를 찍을 때 쓰는
값이라 그대로 재사용할 수 있습니다.

```js
// 모달을 새로 열 때마다 buildReasonCard()가 #rcRoadview 를 완전히 새로 만들기 때문에,
// 이전 모달에서 만든 Roadview 인스턴스는 더 이상 쓸 수 있는 DOM에 붙어있지 않다.
// radarChart 를 매번 destroy() 하고 새로 만드는 것과 같은 이유로,
// 여기서도 모달을 닫을 때 인스턴스를 반드시 null 로 되돌려야 한다.
let roadviewInstance = null;

function initRoadview(item) {
  if (roadviewInstance) return;      // 이미 이번 모달에서 초기화했다면 다시 안 함

  const container = document.getElementById("rcRoadview");
  if (!container || typeof kakao === "undefined") return;

  const position = new kakao.maps.LatLng(item.lat, item.lng);
  const client = new kakao.maps.RoadviewClient();

  // 반경 50m 안에서 가장 가까운 로드뷰 파노라마를 찾는다
  client.getNearestPanoId(position, 50, (panoId) => {
    if (!panoId) {
      container.innerHTML = "<div class='rc-empty'>이 위치는 로드뷰를 지원하지 않아요.</div>";
      return;
    }
    roadviewInstance = new kakao.maps.Roadview(container);
    roadviewInstance.setPanoId(panoId, position);
  });
}
```

그리고 `closeReasonModal`에 한 줄을 더해서, 모달을 닫을 때 `roadviewInstance`를
비워야 합니다 — 그래야 **다른 동네** 핀을 클릭해서 모달을 다시 열었을 때
`initRoadview`가 "이미 초기화했다"고 착각해서 아무 것도 안 하는 상태를 막을 수
있습니다.

```js
function closeReasonModal() {
  if (!modalEl) return;
  modalEl.classList.remove("is-open");
  document.body.style.overflow = "";
  roadviewInstance = null;      // 추가: 다음 모달에서 다시 초기화되도록
}
```

로드뷰를 탭을 누르기 전(즉 화면에 아직 안 보이는 `display: none` 상태)에 미리
만들려고 하면 컨테이너 크기가 0이라서 지도가 깨진 채로 초기화되는 문제가 흔히
생깁니다. 그래서 `initRoadview`를 모달이 열릴 때 바로 부르지 않고, **로드뷰 탭을
실제로 클릭한 시점**(`bindReasonTabs` 안의 `if (name === "roadview")`)에만 부르도록
설계했습니다 — 이런 걸 "지연 초기화(lazy initialization)"라고 부릅니다.

주변 시세 탭은 아직 데이터를 어디서 가져올지 정해지지 않았으므로, 우선 "준비
중입니다" 문구만 두고 데이터 소스가 정해지면 `loadFacilities`와 비슷한 형태의 비동기
함수(`loadNearbyPrice(item)` 같은)를 추가해서 `data-tab-panel="price"` 안을 채우면
됩니다.
