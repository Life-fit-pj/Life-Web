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

메인 화면 좌측 상단에 검색창(`topSearchInput`)을 새로 추가하면서 생긴 문제 3개를 코드만
읽어서 진단한 결과입니다. 아래 수정은 아직 파일에 적용하지 않았습니다 — 직접 적용해보고
결과를 확인해 주세요.

### 콘솔에는 에러가 안 뜨는 게 함정

이번 문제는 `Uncaught SyntaxError` 같은 게 콘솔에 안 뜹니다. HTML은 닫는 태그
(`</div>`)가 하나 빠져도 브라우저가 에러를 내지 않고, 그냥 그 아래 있는 태그들을 전부
안 닫힌 태그 속으로 밀어 넣어 버리기 때문입니다. 그래서 겉보기엔 멀쩡해 보이는데 안쪽
구조가 완전히 달라져 있는 상태입니다.

확인하는 법: 브라우저에서 F12 → Elements(요소) 탭 → `<div class="header">`를 펼쳐보면,
원래는 그 옆에 나란히(형제로) 있어야 할 `<div class="panel ctrl-panel">`
(왼쪽 슬라이더 패널)과 `<div class="panel rank-panel">`(오른쪽 결과 패널)이 전부
`header` **안에** 들어가 있는 걸 볼 수 있습니다.

### 원인

`frontend/index.html` 76번째 줄에서 `<div class="header">`를 여는데, 87번째 줄
(`<p id="topSearchStatus">`) 다음에 이걸 닫는 `</div>`가 없습니다. 검색창(`top-search`)을
header 안에 추가하는 작업을 하다가, 원래 header를 닫던 `</div>` 한 줄이 같이 지워진
것으로 보입니다.

```html
    <p id="topSearchStatus" class="ts-status"></p>

  <!-- 좌측 조건 설정 패널 -->
  <div class="panel ctrl-panel">
```

이 상태로는 `header`가 끝까지(파일 맨 아래 `</body>` 직전까지) 안 닫혀서, 그 뒤에 나오는
좌측 패널·우측 패널이 전부 `header`의 자식이 되어버립니다.

이게 왜 문제냐면, `frontend/style.css` 50~59번째 줄에 이런 규칙이 있습니다.

```css
.header {
  ...
  pointer-events: none;
}
```

`pointer-events: none`은 "이 요소는 마우스 클릭을 받지 않고, 클릭을 그대로 아래(지도)로
흘려보낸다"는 뜻입니다. header가 화면 위쪽 전체를 덮는 반투명 배경이라서, 빈 공간을
눌렀을 때 지도가 반응하도록 일부러 넣은 설정입니다. 문제는 **이 성질이 자식 요소에도
그대로 상속된다**는 점입니다. 그래서 `.disclaimer`처럼 진짜로 클릭이 되어야 하는 요소는
따로 `pointer-events: auto;`를 다시 걸어서 되살려 놨는데, 새로 추가한 `.top-search`에는
이 처리가 빠져 있습니다. 게다가 위에서 발견한 "닫는 div 누락" 때문에 원래는 header 밖에
있어야 할 `ctrl-panel`/`rank-panel`(슬라이더, AI 분석 버튼, TOP5 리스트)까지도 지금은
header 밑에 깔려서 똑같이 클릭이 통과해 버립니다.

**문제점 2, 3은 사실 같은 원인의 두 증상입니다:**
- "지도 조종층이 검색창보다 위에 있다" → 실제로는 지도가 위로 올라온 게 아니라, 검색창이
  클릭을 못 받는 상태라서 클릭이 그 밑의 지도로 그냥 전달되는 것입니다. 눈으로는 검색창이
  멀쩡히 보이니 "외관상 문제없음"으로 느껴진 것도 이 때문입니다.
- "재검색이 안 된다" → 같은 이유로 `topSearchInput`에 글자를 입력하거나
  `topSearchBtn`을 누르는 동작 자체가 클릭으로 인식되지 않기 때문입니다.

**문제점 1(검색한 문구가 안 보인다)**도 여기서 이어질 가능성이 큽니다. `search.js`의
`fillTopSearch()` 함수 코드 자체는 검색어를 `topSearchInput.value`에 정확히 넣도록 짜여
있어서(직접 코드를 따라가며 확인함) 로직상 문제는 없어 보입니다. 다만 그 입력창을 클릭해도
반응이 없으니, 실제로는 값이 들어가 있어도 사용자가 클릭해서 커서를 확인하거나 글자를
선택해볼 방법이 없어 "안 보인다"고 느껴졌을 가능성이 높습니다. 아래 수정을 적용한 뒤
다시 검색해서 이 부분도 같이 해결되는지 확인해 주세요. 그래도 안 보이면 알려주시면
`search.js` 쪽을 더 들여다보겠습니다.

### 고치기

**1) `frontend/index.html` — header 닫는 태그 추가**

87번째 줄(`<p id="topSearchStatus" ...>`) 바로 다음에 `</div>` 한 줄을 추가해서 header를
닫아주세요.

지금:
```html
    <p id="topSearchStatus" class="ts-status"></p>

  <!-- 좌측 조건 설정 패널 -->
  <div class="panel ctrl-panel">
```

이렇게 바꾸세요:
```html
    <p id="topSearchStatus" class="ts-status"></p>
  </div>

  <!-- 좌측 조건 설정 패널 -->
  <div class="panel ctrl-panel">
```

**2) `frontend/style.css` — 검색창 클릭 되살리기**

`===== 상단 검색창 =====` 아래에 있는 `.top-search` 규칙에 `pointer-events: auto;`
한 줄을 추가하세요. `.disclaimer`에 이미 같은 이유로 붙어있는 처리와 동일합니다.

지금:
```css
.top-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px 7px 16px;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid var(--line);
  border-radius: 999px;
  box-shadow: var(--shadow);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  transition: border-color 0.2s, box-shadow 0.2s;
}
```

이렇게 바꾸세요:
```css
.top-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px 7px 16px;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid var(--line);
  border-radius: 999px;
  box-shadow: var(--shadow);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  transition: border-color 0.2s, box-shadow 0.2s;
  pointer-events: auto;      /* header가 클릭을 막아버려서, 검색창만 다시 클릭되게 되살림 */
}
```

두 가지를 다 적용하면: (a) 좌우 패널이 다시 header 밖으로 나와 원래대로 자유롭게
클릭되고, (b) 검색창 자체도 클릭·입력이 가능해집니다. 이 상태로 첫 화면에서 검색 →
메인 화면 전환 → 상단 검색창에 문구 표시 → 그 검색창에서 재검색까지 순서대로 다시
테스트해 보세요.

### 참고: 급하진 않지만 남겨진 것

`style.css`에 `.top-search-wrap`이라는 규칙(화면 중앙에 알약 모양으로 고정시키려던 것으로
보임, `position: fixed; left: 50%; ...`)이 있는데, `index.html`에는 이 클래스를 쓰는
요소가 없습니다. 그래서 이 스타일은 지금 아무 데도 적용되지 않는 죽은 CSS이고, 검색창은
그냥 header 안 문단처럼 자연스럽게 흘러가는 위치에 놓여 있습니다. 위 두 가지를 고친
뒤에도 위치가 마음에 안 들면(화면 중앙 위쪽에 알약 모양으로 떠 있게 하고 싶다면),
`<div class="top-search">`를 `<div class="top-search-wrap"><div class="top-search">...</div></div>`
처럼 한 겹 더 감싸면 원래 의도한 모양이 나올 것으로 보입니다. 다만 이건 미관 문제라
당장 급한 건 아닙니다.

## 후속 확인: 위 두 수정을 적용한 뒤 (2026-08-27)

위 두 가지(`</div>` 추가, `pointer-events: auto` 추가)를 실제로 파일에 적용하신 걸
`git diff`로 확인했습니다. 그런데 그 이후에 "엔터로 검색 안 됨 / 클릭해도 안 됨 /
검색어가 검색창에 안 보임 / 채팅창 확인 불가"가 다시 보고되어서, 이번엔 코드만 읽지
않고 **실제로 브라우저를 띄워서** 재현을 시도해봤습니다 (Chrome을 headless 모드로 실행해서
`searchInput`에 문구를 입력 → 클릭/엔터 → 결과 확인, 이 과정을 그대로 자동화했습니다).

결과: 지금 저장된 코드로는 아래 4가지가 **전부 정상 동작**하는 것을 확인했습니다.

- 첫 화면 검색창에서 클릭으로 검색 → 정상 (결과 문구 "OO · OO 조건으로 찾았어요" 출력됨)
- 첫 화면 검색창에서 Enter로 검색 → 정상
- 메인 화면 상단 검색창에서 클릭/Enter로 재검색 → 둘 다 정상
- 검색 후 메인 화면 상단 검색창에 검색어가 정확히 채워짐
- 검색 후 채팅창에 내가 검색한 문구 + AI의 요약 답변이 자동으로 추가됨

즉 **지금 파일 안의 코드 자체에는 이 4가지를 막는 버그가 없습니다.** 그런데도 화면에서
안 되는 것처럼 보인다면, 가장 유력한 원인은 코드 문제가 아니라 **브라우저가 예전 화면을
그대로 붙들고 있는 것(캐시)**입니다. 특히 이렇게 재현되기 쉽습니다:

- 코드를 고치기 전부터 브라우저 탭을 계속 켜놓고 테스트했다 → 그 탭은 새로고침을 하기
  전까지 예전 `search.js`/`style.css`를 메모리에 그대로 들고 있습니다. 파일을 고쳐도
  서버는 다시 켤 필요가 없지만(정적 파일은 요청마다 디스크에서 새로 읽으므로), **브라우저
  탭은 직접 새로고침을 해줘야** 새 파일을 받아옵니다.

### 확인해 주세요

1. 지금 테스트 중인 브라우저 탭에서 **Ctrl+Shift+R** (또는 Ctrl+F5)로 강력 새로고침을
   한 번 해보세요. 일반 새로고침(F5)보다 캐시를 더 확실히 무시합니다.
2. 그래도 안 되면, 아예 새 시크릿 창(Ctrl+Shift+N)에서 `http://127.0.0.1:5000`을 열어
   캐시가 전혀 없는 상태로 다시 테스트해 주세요.
3. 그래도 같은 증상이 재현되면, F12 → Console 탭을 연 채로 검색을 시도해서 빨간 글씨로
   뜨는 에러 메시지를 그대로 알려주세요. 지금까지는 코드 읽기 + 자동화 테스트로는 에러가
   전혀 재현되지 않아서, 실제 에러 메시지가 있어야 다음 진단이 가능합니다.

## 채팅 기록이 검색할 때마다 사라지는 문제 (2026-08-27)

### 증상

검색(첫 화면 검색 또는 상단 재검색)을 하거나, 슬라이더를 조절하고 "AI 분석 실행"을
누를 때마다 채팅창의 대화 내용이 이전 것은 지워지고 새 내용으로 교체됩니다. 원하는
동작은 이전 대화 아래에 새 대화가 이어서 쌓이는(누적되는) 것입니다.

### 원인

`frontend/script.js`의 `initChatWithResult(data)` 함수(585번째 줄 부근)를 보면,
검색 결과가 나올 때마다 채팅창 내용을 지우는 코드가 있습니다.

```js
function initChatWithResult(data) {
  const body = document.getElementById("chatBody");
  if (!body) return;

  body.innerHTML = "";     // 이전 검색의 대화를 지운다
  ...
```

`body.innerHTML = "";`가 바로 그 줄입니다. 이 함수는 `renderResult(data)` 안에서
호출되는데, `renderResult`는 검색으로 얻은 결과든 슬라이더로 얻은 결과든 **모든 새
결과가 나올 때마다** 똑같이 호출됩니다(86번째 줄 `renderResult` 함수 참고: "검색과
슬라이더 둘 다 이 함수만 부른다"). 그래서 결과가 나올 때마다 채팅창이 통째로
비워지고 새로 채워지는 것입니다. 주석에 적힌 "이전 검색의 대화를 지운다"는 문구를
보면, 이건 버그가 아니라 처음엔 의도한 동작이었던 것으로 보입니다 — 다만 지금은
그 동작을 원치 않는 상황입니다.

### 고치기

`frontend/script.js` — `body.innerHTML = "";` 한 줄만 지우면 됩니다. 나머지 코드는
`appendChild`/`addChatMsg`로 이미 "맨 아래에 덧붙이는" 방식으로 짜여 있어서, 지우는
줄만 없애면 자동으로 누적됩니다.

지금:
```js
function initChatWithResult(data) {
  const body = document.getElementById("chatBody");
  if (!body) return;

  body.innerHTML = "";     // 이전 검색의 대화를 지운다

  if (data.query) {
```

이렇게 바꾸세요:
```js
function initChatWithResult(data) {
  const body = document.getElementById("chatBody");
  if (!body) return;

  if (data.query) {
```

이렇게 바꾸면: 검색할 때마다 대화창 맨 아래에 "이번에 검색한 문구 → AI 요약 →
궁금한 점을 물어보세요" 순서로 계속 이어 붙습니다. 다만 그렇게 되면 어디서부터
새 검색인지 구분이 잘 안 될 수 있는데, 원하시면 새 검색이 시작될 때마다 구분선(예:
"───── 새 검색 ─────" 같은 짧은 문구)을 하나 추가로 넣는 방법도 있습니다 — 필요하면
말씀해 주세요, 그 부분도 정리해서 적어드리겠습니다.
