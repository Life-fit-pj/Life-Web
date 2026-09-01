# 기록 방법
    - 사용자는 코딩을 막 시작한 초보개발자.
    - 함수나 기능에 대한 설명 필요
    - 원본 코드 -> 수정할 코드를 알기 쉽게 표기
    - 예시:
        클릭은 되는데 드래그만 안 되는 이유

        슬라이더를 끄는 건 mousedown → mousemove → mouseup 세 단계예요. 그런데 search.js가 문서 전체에 mousemove 리스너를 걸어놨죠:

       ```
        document.addEventListener("mousemove", (e) => {
        ...
        updateMagnetic(mx, my);
        });
        ```

        떠다니는 단어의 자석 효과예요. 이게 계속 돌면서 getBoundingClientRect()를 14번씩 호출해요. 검색 화면이 사라진 뒤에도요.

        클릭(한 번의 이벤트)은 되는데 드래그(연속 이벤트)가 버벅이는 게 이 증상과 맞아요.

        고치기 — 화면이 걷히면 자석을 멈춘다

        search.js의 updateMagnetic 맨 앞에 한 줄 넣으세요.

        ```
        function updateMagnetic(mx, my) {
        // 검색 화면이 걷힌 뒤에는 계산할 이유가 없다.
        // 그대로 두면 mousemove 마다 getBoundingClientRect 를 14번씩 부르느라
        // 슬라이더 드래그 같은 다른 조작이 버벅인다
        const screen = document.getElementById("searchScreen");
        if (!screen || screen.classList.contains("out")) return;

        document.querySelectorAll(".ss-word").forEach((word) => {
            ...    
        ```

---

# (2026-08-31) 위 가이드대로 직접 고친 것 점검 — 빠진 것 2개 + 준공년도 죽은 코드 삭제

바로 아래 항목("건축 패널이 안 바뀌는 이유")의 가이드를 보고 사용자님이 4개 파일
(`pipeline_api.py`/`engine.py`/`main.py`/`search.js`)을 직접 고쳤다. 그걸 점검해
달라는 요청을 받고 하나씩 대조해 봤다.

## 잘된 것

`Life-Embed-jh/app/features/pipeline_api.py`의 `search()` 반환값에 `"housing": housing`
추가, `main.py`의 `weights, regions, explanation, extracted_housing = get_regions(prefs)`
+ 응답에 `"housing": extracted_housing` 추가, `frontend/ui/search.js`의 `applyHousing()`
함수와 `runSearch()`에서의 호출 — 가이드에 적힌 그대로 정확히 반영되어 있었다.

## 빠진 것 1 — `services/engine.py`에 `get_regions`가 두 번 정의되어 있었음

가이드의 "원본"과 "수정" 코드 블록을 각각 복사해 붙여넣으면서, 원본 블록을 지우지
않고 그 위에 수정 블록을 이어 붙인 것으로 보인다. 그 결과 파일에 같은 이름의 함수가
두 번 있었다:

```python
# services/engine.py (수정하신 상태, 80~102번째 줄)
def get_regions(user_prefs):
    query = (user_prefs.get('query') or '').strip()
    housing = to_housing(user_prefs)

def get_regions(user_prefs):                          # ← 바로 위와 이름이 같다
    query = (user_prefs.get('query') or '').strip()
    housing = to_housing(user_prefs)
    extracted_housing = None
    ...
    return weights, regions, explanation, extracted_housing
```

파이썬은 같은 이름의 함수를 다시 `def` 하면 에러 없이 뒤엣것으로 덮어쓴다. 그래서
실제 동작(서버가 부르는 건 항상 마지막 정의)은 멀쩡했지만, 앞의 3줄짜리 `def`는
아무도 안 부르는 죽은 코드로 남아 있었다 — 다음에 이 함수를 읽는 사람이 "어느 게
진짜지?" 헷갈리게 되는 상태. 앞의 죽은 정의를 지웠다.

## 빠진 것 2 — `get_regions()` 맨 아래 스모크 체크가 옛날 3개짜리 반환값을 기대하고 있었음

`get_regions()`의 반환값이 3개(`weights, regions, explanation`)에서 4개
(`..., extracted_housing`)로 늘었는데, 파일 맨 아래 `if __name__ == "__main__":`
블록은 여전히 3개로 받고 있었다:

```python
# services/engine.py (원본)
if __name__ == "__main__":
    w, r, e = get_regions({"query": "애들 학원 보내기 좋은 곳"})
```

이 상태로 `py services/engine.py`(README·CLAUDE.md가 안내하는 단독 점검 명령)를
돌리면 `ValueError: too many values to unpack (expected 3)`로 바로 죽는다. `main.py`를
거쳐 브라우저로 쓸 때는 어차피 함수를 이렇게 안 부르니 못 알아챈 것 — 이런 이유로
"스모크 체크가 따로 있는" 파일은 그 스모크 체크도 같이 고쳐야 놓치지 않는다. 4개를
받게 고치고, 새로 생긴 `housing` 값도 확인 삼아 같이 출력하게 했다:

```python
# services/engine.py (수정)
if __name__ == "__main__":
    w, r, e, h = get_regions({"query": "애들 학원 보내기 좋은 곳"})
    ...
    print("housing:", h)
```

## 준공년도(`builtYear`) 죽은 코드 삭제

요청대로 "이제 안 쓸" `builtYear`(준공년도) 관련 코드를 지웠다. 애초에 `index.html`에
이 값을 조절하는 슬라이더(`#builtYear`)가 없어서, `frontend/ui/result.js`가 보내던
`builtYear` 값은 항상 `document.getElementById('builtYear')`가 `null`이라 `|| 2015`
기본값만 매번 보내고 있었다 — 즉 사용자가 뭘 하든 절대 안 바뀌는, 있으나 마나 한
필드였다. 지운 곳 세 군데:

- `main.py` — `PredictRequest`의 `builtYear: int = 2015` 필드, `predict()` 안의
  `if body.builtYear >= 2015: base_score += 5` 가산점 로직.
- `frontend/ui/result.js` — `payload`에서 `builtYear: document.getElementById('builtYear')?.value || 2015,` 줄.
- `CLAUDE.md` — API 계약 설명에서 `builtYear` 언급 제거(겸사겸사 이미 지워진
  `services/price.py`를 참조하던 낡은 문장도 지금 상태에 맞게 고쳤다).

## 확인한 것

- `py -m py_compile main.py services/engine.py`, `py -m py_compile pipeline_api.py`,
  `node --check`(search.js/result.js) 전부 문법 통과.
- 서버를 띄워 슬라이더 경로(`/api/predict`에 `query` 없이 요청) → `housing` 키가
  응답에 있고 값은 `null`(의도대로), 200 응답 확인.
- 검색어 경로 — `"4억짜리 아파트 매매로 조용한 동네"`로 실제 LLM 호출까지 태워봤더니
  `housing: {"건물유형": "아파트", "거래유형": "매매", "targets": {"예산": 40000}}`로
  정확히 돌아옴. 바로 아래 가이드가 의도한 대로 프론트가 "건축" 패널을 갱신할 수 있는
  상태가 됐다는 뜻.

---

# (2026-08-31) 검색어로 찾을 때 "건축(Architecture)" 패널이 안 바뀌는 이유 + 고치는 법

## 증상

좌측 패널은 두 구역으로 나뉜다 — "🏠 건축"(건물 유형·거래 유형·가격·건축 면적)과
"🌳 환경"/"🏥 인프라"(녹지·안전·교통·상권·의료·교육·문화 7개 슬라이더). 검색창에
"4억짜리 아파트 매매로 조용한 동네" 처럼 문장을 쳐서 찾으면, 아래쪽 7개 슬라이더는
LLM이 읽은 값대로 움직이는데 위쪽 "건축" 구역(건물 유형 드롭다운, 거래 유형 버튼,
가격 슬라이더)은 검색 전 상태 그대로 남아있다.

## 원인 — LLM이 이미 읽어내고 있는데, 그 값을 프론트까지 아무도 안 넘겨준다

**1) 엔진(`Life-Embed-jh`)은 이미 건물유형·거래유형·예산을 검색어에서 뽑아내고 있다.**
`Life-Embed-jh/pipeline/weights.py`의 `SYSTEM_PROMPT`(46~52번째 줄)가 Claude에게
"건물유형/거래유형/예산/보증금도 같이 뽑아라"라고 시키고, `ask_claude()`가 그 값을
`draft` 딕셔너리에 담아 돌려준다. `Life-Embed-jh/app/features/pipeline_api.py`의
`search()`(115~122번째 줄)가 이 `draft`로 `housing` 변수를 만든다:

```python
# Life-Embed-jh/app/features/pipeline_api.py (현재)
housing = housing_override
if housing is None and draft.get("건물유형") and draft.get("거래유형") and draft.get("예산"):
    targets = {"예산": draft["예산"]}
    if draft["거래유형"] == "월세" and draft.get("보증금"):
        targets["보증금"] = draft["보증금"]
    housing = {"건물유형": draft["건물유형"], "거래유형": draft["거래유형"], "targets": targets}
```

이 `housing`은 실제로 추천 순위에는 반영된다(`recommend_by_weights(weights, housing=housing)`
에 그대로 넘어가 "그 조건에 맞는 동만 추리는" 필터로 쓰임). **문제는 `search()`의
맨 끝 반환값에 이 `housing`이 빠져 있다는 것**이다:

```python
# Life-Embed-jh/app/features/pipeline_api.py (현재, 131~137번째 줄)
return{
    "query": query,
    "persona_query": persona_query,
    "weights": weights,
    "regions": detailed,
    "explanation": text,
    # ← housing이 여기 없다. 계산은 다 해놓고 버린다
}
```

**2) 이 저장소(`Life-Web`)도 검색어 요청에 화면의 현재 슬라이더 값을 아예 안 보낸다.**
`frontend/ui/search.js`의 `runSearch()`는 `postPredict({ query: query })`만 보낸다
(`bldgType`/`dealType`/가격 필드 없음). `main.py`의 `PredictRequest`는 이 필드들에
전부 기본값 `None`을 갖고 있어서, `services/engine.py`의 `to_housing()`이 항상 `None`을
돌려주고(`bldg`가 없으니), 결과적으로 `housing_override=None`으로 `search()`가 불려서
1번의 "검색어에서 뽑은 조건"이 그대로 쓰인다 — **여기까지는 의도대로 동작한다.**

**3) 그런데 `main.py`가 프론트로 돌려주는 응답(`weights`)에는 7개 지표만 있다.**
`services/engine.py`의 `get_regions()`도 `search()`가 돌려준 값 중
`weights`/`regions`/`explanation` 셋만 꺼내 쓰고, `main.py`의 `/api/predict` 응답도
`"weights": weights`(7개 지표)만 내려준다. 그래서 `frontend/ui/search.js`의
`applyWeights(data.weights)`는 7개 슬라이더만 갱신할 수 있고, "건축" 구역을 갱신할
재료 자체가 애초에 응답 안에 없다.

**요약**: LLM이 "4억짜리 아파트 매매"를 정확히 읽어서 추천 순위에는 반영하고 있지만,
그 사실을 화면에 "우리가 이렇게 이해했어요"라고 보여줄 통로가 없어서, 사용자 눈에는
건축 패널이 검색과 무관하게 멈춰 있는 것처럼 보인다.

## 고치는 법 — 세 파일을 순서대로

### 1) `Life-Embed-jh/app/features/pipeline_api.py` — `search()`가 `housing`도 돌려주게

이미 계산해 둔 `housing` 변수를 반환값에 한 줄만 추가하면 된다.

```python
# 수정 (131~138번째 줄)
return{
    "query": query,
    "persona_query": persona_query,
    "weights": weights,
    "regions": detailed,
    "explanation": text,
    "housing": housing,   # 검색어에서 뽑아낸(또는 화면에서 넘어온) 조건. 가격 언급이 없었으면 None
}
```

`Life-Web`이 아니라 `Life-Embed-jh` 저장소 파일이라는 점 주의 — `CLAUDE.md`에 적힌
"어떤 엔진이든 두 함수만 계약대로 노출하면 교체 가능"이라는 규칙에서 `housing`은 원래
계약에 없는 필드지만, 없어도 프론트가 그냥 무시하니 추가해도 계약을 깨지 않는다.

### 2) `Life-Web/services/engine.py` — `get_regions()`가 `housing`을 한 단계 더 전달

```python
# 원본
def get_regions(user_prefs):
    query = (user_prefs.get('query') or '').strip()
    housing = to_housing(user_prefs)

    if query:
        result = search(query, top_k=5, housing_override=housing)
        weights = result["weights"]
        regions = result["regions"]
        explanation = result["explanation"]
    else:
        weights = to_korean_weights(user_prefs)
        regions = recommend_by_weights(weights, top_k=5, housing=housing)
        explanation = ""

    return weights, regions, explanation
```

```python
# 수정
def get_regions(user_prefs):
    query = (user_prefs.get('query') or '').strip()
    housing = to_housing(user_prefs)
    extracted_housing = None   # 검색어 경로에서만 채워진다

    if query:
        result = search(query, top_k=5, housing_override=housing)
        weights = result["weights"]
        regions = result["regions"]
        explanation = result["explanation"]
        extracted_housing = result.get("housing")
    else:
        # 슬라이더 경로는 애초에 화면 값 그대로 housing을 만들었으니
        # 다시 화면에 되돌려줄 필요가 없다 (이미 일치함)
        weights = to_korean_weights(user_prefs)
        regions = recommend_by_weights(weights, top_k=5, housing=housing)
        explanation = ""

    return weights, regions, explanation, extracted_housing
```

**반환값이 3개에서 4개로 늘어난다** — 이 함수를 부르는 곳(`main.py`) 딱 한 군데만
같이 고치면 된다.

### 3) `Life-Web/main.py` — 응답에 `housing` 필드 추가

```python
# 원본 (predict() 안)
    weights, regions, explanation = get_regions(prefs)
```

```python
# 수정
    weights, regions, explanation, extracted_housing = get_regions(prefs)
```

그리고 맨 아래 반환하는 딕셔너리에 한 줄 추가:

```python
# 원본
    return {
        "score": round(min(98.5, max(30.0, base_score)), 1),
        "query": body.query or "",
        "topRegions": top_regions,
        "floorplanPath": find_floorplan(body.area),
        "fallback": False,
        "explanation": explanation,
        "weights": weights,
    }
```

```python
# 수정
    return {
        "score": round(min(98.5, max(30.0, base_score)), 1),
        "query": body.query or "",
        "topRegions": top_regions,
        "floorplanPath": find_floorplan(body.area),
        "fallback": False,
        "explanation": explanation,
        "weights": weights,
        "housing": extracted_housing,   # {"건물유형":"아파트","거래유형":"매매","targets":{"예산":40000}} 또는 null
    }
```

### 4) `frontend/ui/search.js` — 받은 `housing`으로 "건축" 패널을 실제로 갱신

`applyWeights(data.weights)`가 7개 슬라이더를 갱신하는 것과 똑같은 자리에,
"건축" 패널을 갱신하는 짝 함수를 하나 추가한다.

```js
// 서버가 준 한국어 지표명 → 슬라이더 id (기존에 이미 있음, 참고용)
const SLIDER_ID = {
  "녹지": "greenery", "안전": "safety", "교통": "transport",
  "상권": "commercial", "의료": "medical", "교육": "education",
  "문화": "culture",
};

// 거래유형 → 그 유형이 쓰는 예산 슬라이더 id
const PRICE_SLIDER_ID = { "매매": "salePrice", "전세": "jeonseDeposit", "월세": "wolseRent" };

/** 검색어에서 LLM이 읽어낸 건물유형·거래유형·예산을 "건축" 패널에 반영한다.
 *  가격 언급이 없었던 검색이면 housing이 null이라 아무것도 안 건드린다 */
function applyHousing(housing) {
  if (!housing) return;

  const bldg = document.getElementById("bldgType");
  if (bldg && housing.건물유형) {
    bldg.value = housing.건물유형;
    // change 이벤트를 직접 일으켜야 deal.js의 updatePriceAnyState() 같은
    // 연결된 로직도 같이 갱신된다 (applyWeights가 input 이벤트를 쏘는 것과 같은 이유)
    bldg.dispatchEvent(new Event("change", { bubbles: true }));
  }

  if (housing.거래유형) {
    // 이미 initDealType()(ui/deal.js)이 걸어둔 클릭 핸들러를 그대로 태운다 —
    // is-on 클래스 토글과 showDealGroup()까지 한 번에 해결된다
    document.querySelector(`.seg-btn[data-deal="${housing.거래유형}"]`)?.click();
  }

  const targets = housing.targets || {};
  const sliderId = PRICE_SLIDER_ID[housing.거래유형];
  if (sliderId && targets.예산 != null) {
    const slider = document.getElementById(sliderId);
    if (slider) {
      slider.value = targets.예산;
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }
  if (housing.거래유형 === "월세" && targets.보증금 != null) {
    const slider = document.getElementById("wolseDeposit");
    if (slider) {
      slider.value = targets.보증금;
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }
}
```

그리고 `runSearch()` 안에서 `applyWeights`를 부르는 바로 옆 줄에 추가:

```js
// 원본 (runSearch 안)
    stopSteps();
    applyWeights(data.weights);            // 슬라이더에 반영
    renderResult(data);                    // 같은 응답으로 결과 화면 채우기
```

```js
// 수정
    stopSteps();
    applyWeights(data.weights);            // 슬라이더에 반영
    applyHousing(data.housing);            // "건축" 패널에 반영 — 가격 언급 없었으면 아무 일도 안 함
    renderResult(data);                    // 같은 응답으로 결과 화면 채우기
```

## 확인할 것

1. 검색창에 "4억짜리 아파트 매매로" 처럼 건물유형·거래유형·가격이 다 들어간 문장을
   넣고 검색 → 건물 유형 드롭다운이 "아파트", 거래 유형 버튼이 "매매"로 바뀌고
   매매가 슬라이더가 40000(4억) 근처로 움직이는지.
2. 가격 언급이 전혀 없는 문장("조용한 동네")으로 검색 → "건축" 패널이 검색 전 상태
   그대로 유지되는지(`housing`이 `null`이라 `applyHousing`이 아무것도 안 건드려야 함).
3. 좌측 패널에서 슬라이더를 직접 조절해 "AI 분석 실행" 버튼을 누르는 기존 경로는
   전혀 안 건드렸으니, 그대로 잘 동작하는지만 회귀 확인.

## 이번엔 안 되는 것 — "건축 면적" 슬라이더

같은 패널 안의 면적(`#area`) 슬라이더는 이번 수정 대상이 아니다.
`Life-Embed-jh/pipeline/weights.py`의 `SYSTEM_PROMPT`(16~57번째 줄)가 Claude에게
시키는 것 자체에 면적이 없어서 — 검색어에 "59제곱미터 이상"이라고 써도 LLM이 애초에
그 값을 안 뽑는다. 이것까지 되게 하려면 `Life-Embed-jh`의 `SYSTEM_PROMPT`와
`ask_claude()`의 파싱 로직에 면적 항목을 추가하는 별도 작업이 필요하다(이번 것보다
범위가 크다 — 프롬프트 수정 + JSON 스키마 확장 + `search()` 반환값에 실어 보내는 것까지
전부 새로 해야 함). 지금 당장 필요하면 별도로 요청해서 진행하는 게 좋다.

(원래 여기 같이 있던 준공년도(`builtYear`) 슬라이더는 애초에 화면에 없던 죽은 코드였다
— 위에 나오는 "빠진 것 2개 + 준공년도 죽은 코드 삭제" 항목에서 지웠다.)

---

# (2026-08-31) 로그인 버튼을 헤더 밖으로 분리 + 메뉴는 "로그인 이후" 화면만 상시 노출

## 요청받은 것

1. 메뉴(햄버거) 패널에서 회원가입 링크를 없애고, 로그인 버튼을 패널 밖 헤더 쪽으로 뺀다.
2. 메뉴 패널에는 항상 "로그인 이후" 항목(마이페이지·검색 기록·좋아요·원본 데이터)만 보인다
   — 실제 로그인 여부를 더 이상 안 본다.
3. 로그인 버튼을 누르면 모달이 뜨고, 그 안에 로그인 섹션 + 회원가입 섹션이 위아래로
   같이 들어간다. 아직 둘 다 기능이 없으니 "준비중" 문구만 보여준다.
4. 그 모달 크기는 맵 핀 클릭 시 뜨는 추천 사유 모달(`.reason-modal`)과 동일하게.
5. 로그인 버튼 색은 낮/밤 테마 상관없이 항상 노란색.

## 왜 `isLoggedIn()`/`localStorage` 토큰 로직을 통째로 지웠는가

원래 메뉴는 `localStorage`의 `lifefit-token` 유무로 로그인 전/후 항목을 바꿔 그렸고,
"로그인" 링크를 누르면 가짜 토큰을 저장해 로그인 후 화면을 미리보기 하는 개발용 트릭이
있었습니다(`menu.js`의 옛 `isLoggedIn()`/`menuLogin`/`menuLogout`).

이번 요청대로 메뉴가 실제 로그인 여부와 무관하게 "로그인 이후" 화면만 항상 보여주게
되면, 그 화면을 바꿔주던 토큰 로직은 더 이상 아무것도 하지 않는 죽은 코드가 됩니다.
로그인 버튼도 실제로 로그인시키는 대신 "준비중" 모달만 띄우므로, 토큰을 만드는 경로
자체가 사라졌습니다. 그래서 `isLoggedIn()` 함수, `menuLogin`/`menuLogout` 엘리먼트,
관련 CSS(`.menu-logout-link`)를 전부 지웠습니다 — 나중에 진짜 로그인 API가 생기면,
그때는 헤더의 `#loginToggle` 버튼이 로그인 상태(로그인/로그아웃 표시)를 갖게 될
것이므로, 그 시점에 이 자리에 새로 만들면 됩니다.

## 무엇을 고쳤는지

**`frontend/index.html`** — `#menuToggle` 버튼만 있던 자리를 `#topActions`라는
플렉스 상자로 감싸고, 그 안에 `#loginToggle`(로그인 버튼)과 `#menuToggle`을 나란히
뒀습니다. 스크린샷 속 레이아웃(로그인 버튼 + 원형 메뉴 버튼이 우측 상단에 나란히)이
이 상자 하나로 만들어집니다.

```html
<!-- 원본 -->
<button id="menuToggle" title="메뉴">☰</button>

<!-- 수정 -->
<div id="topActions">
  <button id="loginToggle">로그인</button>
  <button id="menuToggle" title="메뉴">☰</button>
</div>
```

**`frontend/ui/menu.css`** — fixed 위치를 `#menuToggle` 대신 부모 `#topActions`
하나에만 줬습니다(버튼 두 개가 따로 fixed면 gap을 맞추기 번거로움). `#loginToggle`은
`var(--accent-fill)`을 안 씁니다 — 이 변수는 밤 테마에서 `#D1B15A`(톤 다운된 금색)로
바뀌어서 "낮/밤 둘 다 노란색"이라는 요청과 안 맞습니다. 대신 값을 고정했습니다:

```css
#loginToggle {
  background: #FFD24A;   /* 낮 테마의 accent-fill 값을 그대로 고정 */
  color: #2D2A32;
  border-radius: 999px;  /* 알약 모양 */
  ...
}
```

모달은 `.reason-modal`(`ui/reason.css`)과 같은 크기 규칙을 그대로 복사했습니다
(`width: min(460px, 92vw); max-height: 86vh; border-radius: 18px;` 등) — 클래스는
새로 만들었습니다(`.auth-backdrop`/`.auth-modal`). `reason.css`의 클래스를 직접
재사용하지 않은 이유는, 그 파일이 "핀 클릭 사유 모달" 전용으로 이미 이름 붙어 있어서
같이 쓰면 나중에 파일을 찾을 때 헷갈리기 때문입니다(화면 단위로 CSS를 나눈 원칙과도
맞음 — `CLAUDE.md`의 CSS 분리 규칙 참고).

**`frontend/ui/menu.js`** — `renderMenuItems()`가 더 이상 분기하지 않고 로그인 이후
항목만 그립니다. 로그인/회원가입 "준비중" 모달을 여닫는 `ensureAuthModal()`/
`openAuthModal()`/`closeAuthModal()`을 추가하고 `openAuthModal`을 export 했습니다.

**`frontend/ui/search.js`** — 기존에 `#menuToggle` 클릭을 `openMenu`에 연결하던
자리(`bindEvents()`) 옆에 `#loginToggle` 클릭을 `openAuthModal`에 연결하는 줄을
추가했습니다. 이 파일이 이미 시작 화면의 모든 버튼 바인딩을 모아두는 곳이라 그대로
따랐습니다.

## 확인한 것

서버를 띄워 `/`, `/ui/menu.js`, `/ui/menu.css`가 200으로 응답하는 것과, 두 파일의
JS 문법이 깨지지 않은 것(`node --check`)을 확인했습니다. 브라우저에서 직접 클릭해
보는 것까지는 이 환경에서 헤드리스 브라우저 도구가 없어 못 했으니, 실제로 열어서
① 로그인 버튼이 노란 알약 모양으로 뜨는지 ② 눌렀을 때 로그인/회원가입 준비중 모달이
핀 모달과 같은 크기로 뜨는지 ③ 햄버거 메뉴에 회원가입/로그인 링크 없이 마이페이지
등 4개 항목만 뜨는지 한 번 확인해 주세요.

---

# 아직 안 만든 것 — 로그인 관련 메뉴 항목 (백엔드 필요, 참고용)

우측 상단 메뉴의 로그인 후 항목(마이페이지·검색 기록·좋아요·관리자 페이지)은
전부 "이 사람이 누구인지 서버가 기억해야" 동작하는데, 지금 이 저장소엔 회원 DB도
로그인 API도 없습니다(`/api/predict`, `/api/region`, `/api/region/explain`,
`/api/chat` 네 개가 전부). 나중에 만들 때 참고하도록 항목별 요구사항만 짧게
남겨 둡니다.

- **로그인/회원가입**: 회원 DB(이메일·비밀번호 해시·가입일·`role`) + `/api/auth/signup`,
  `/api/auth/login`, `/api/auth/me`. 비밀번호는 반드시 해시(`bcrypt`/`passlib`). 로그인
  성공 시 토큰을 내려주면 프론트는 그걸 `localStorage`에 저장 — 헤더의 `#loginToggle`
  버튼이 이 상태를 표시하는 자리가 된다(지금은 "준비중" 모달만 띄우는 자리표시).
- **검색·대화 기록 저장**: `main.py`의 `ChatRequest.history`가 지금은 빈 자리로만
  있음(주석에 "로그인·저장 기능을 붙이면 여기로 들어온다"고 미리 적어둠, `main.py:89-91`).
  로그인 상태일 때 `/api/predict`·`/api/chat` 결과를 회원별 DB 테이블에 쌓는 로직 필요.
- **좋아요 한 거주지**: `frontend/ui/reason.js`의 `openReasonModal`(45번째 줄) 안에
  "좋아요" 버튼 + `/api/likes`(POST/DELETE) + `likes` 테이블(회원, 구, 동).
- **관리자 페이지**: 회원 테이블에 권한 필드 + 관리자 전용 라우트. 뭘 관리할지는 별도 논의.
- **원본 데이터 출처 안내**: 유일하게 백엔드가 필요 없음 — 정적 페이지 하나로 끝남.

---

# CSS 파일도 `ui/*.js`처럼 화면 단위로 나누기 (완료 — 요약만 남김)

`style.css`/`search.css` 두 개뿐이던 CSS를 화면 단위(`ui/result.css`,
`ui/reason.css`, `ui/chat.css`, `ui/menu.css`)로 나누고 200 응답까지 확인했습니다.
파일별로 뭐가 들어있는지는 `CLAUDE.md`의 프론트엔드 구조 설명에 매핑표로 남아있으니
여기서는 지웠습니다.

---

# 시세(집값) 반영 — 완료 (요약만 남김)

`data/시세_지역별.csv`·`services/price.py`로 이 저장소가 따로 예산을 계산하던 옛 방식은
전부 지웠다(둘 다 디스크에서 삭제 확인). 지금은 `services/engine.py`의 `to_housing()`이
화면의 건물유형·거래유형·예산을 엔진의 `housing` 형태로 바꿔 `search()`/
`recommend_by_weights()`에 그대로 넘기고, 엔진이 그 조건에 맞는 동만 추려 순위를 매긴다.
"건물·거래유형 고려안함"을 고르면(`bldgType === "ANY"`) `housing`이 `None`이 되어, 엔진이
"저렴한 동네를 살짝 우대"하는 기본 동작으로 넘어간다. `main.py`가 엔진의 `attach_price()`
결과(`r["price"]`)를 `topRegions`에 그대로 실어 보내고, `frontend/ui/reason.js`의
"주변 시세" 탭(`buildPriceHtml`)이 그 값을 읽어 보여준다 — 전부 확인 완료.

가격 관련 컨트롤도 체크박스(`#priceAny`) 대신 건물유형 드롭다운의 다섯 번째 옵션
(`"ANY" = "건물·거래유형 고려안함"`)으로 통합됐다. `isPriceAny()`가 드롭다운 값만 보고,
선택 시 거래유형 버튼·금액 슬라이더를 잠근다(`frontend/ui/deal.js`).

**남은 것**: 가격 슬라이더 라벨(`희망 매매가` 등을 "목표가" 뉘앙스로 다듬는 문구 작업)은
아직 안 건드렸다 — 급하지 않은 문구 작업이라 미룸.
