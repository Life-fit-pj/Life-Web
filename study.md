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

# 아직 안 만든 것 — 로그인 관련 메뉴 항목 (백엔드 필요, 참고용)

우측 상단 메뉴의 로그인 후 항목(마이페이지·검색 기록·좋아요·관리자 페이지)은
전부 "이 사람이 누구인지 서버가 기억해야" 동작하는데, 지금 이 저장소엔 회원 DB도
로그인 API도 없습니다(`/api/predict`, `/api/region`, `/api/region/explain`,
`/api/chat` 네 개가 전부). 나중에 만들 때 참고하도록 항목별 요구사항만 짧게
남겨 둡니다.

- **로그인/회원가입**: 회원 DB(이메일·비밀번호 해시·가입일·`role`) + `/api/auth/signup`,
  `/api/auth/login`, `/api/auth/me`. 비밀번호는 반드시 해시(`bcrypt`/`passlib`). 로그인
  성공 시 토큰을 내려주면 프론트는 그걸 `localStorage`에 저장 — 지금 `isLoggedIn()`이
  보는 자리가 이미 있음.
- **검색·대화 기록 저장**: `main.py`의 `ChatRequest.history`가 지금은 빈 자리로만
  있음(주석에 "로그인·저장 기능을 붙이면 여기로 들어온다"고 미리 적어둠, `main.py:89-91`).
  로그인 상태일 때 `/api/predict`·`/api/chat` 결과를 회원별 DB 테이블에 쌓는 로직 필요.
- **좋아요 한 거주지**: `frontend/ui/reason.js`의 `openReasonModal`(45번째 줄) 안에
  "좋아요" 버튼 + `/api/likes`(POST/DELETE) + `likes` 테이블(회원, 구, 동).
- **관리자 페이지**: 회원 테이블에 권한 필드 + 관리자 전용 라우트. 뭘 관리할지는 별도 논의.
- **원본 데이터 출처 안내**: 유일하게 백엔드가 필요 없음 — 정적 페이지 하나로 끝남.

---

# CSS 파일도 `ui/*.js`처럼 화면 단위로 나누기 (완료)

`style.css`/`search.css` 두 개뿐이던 CSS를 화면 단위로 나눴습니다
(`ui/result.css`, `ui/reason.css`, `ui/chat.css`, `ui/menu.css` 신규 생성 +
`index.html`에 `<link>` 4줄 추가). 서버를 띄워 전부 200 응답 + 화면이 그대로
보이는 것까지 확인했습니다.

**CSS는 JS의 `import`가 없어서** 나눈 파일 수만큼 `index.html`에
`<link rel="stylesheet">`를 직접 추가해야 하고, 공용 스타일(`style.css`)을
화면별 스타일(`ui/*.css`)보다 먼저 적어야 합니다(같은 우선순위 선택자는
`<link>`를 나중에 적은 파일이 이김).

나중에 비슷하게 더 나누고 싶을 때 참고할 매핑표:

| 파일 | 담긴 내용 |
|---|---|
| `style.css` | 테마 변수, 리셋, `.panel` 공통 틀, 좌측 컨트롤 패널(슬라이더 전반 — 여러 화면이 같이 쓰는 폼 스타일), 스크롤바·반응형 |
| `ui/result.css` | 우측 결과 패널 — 점수 박스, TOP5 목록, 평면도 |
| `ui/reason.css` | 추천 사유 모달 + 레이더 차트(`.rc-chart`) |
| `ui/chat.css` | 채팅 패널 |
| `ui/menu.css` | 메뉴 + 준비중 안내창 |
| `search.css` | 첫 검색 화면 + 결과 화면 상단 검색바 |

`#map`(`ui/map.js`)과 `.seg`/`.seg-btn`(`ui/deal.js`)은 분량이 작아 일부러
`style.css`에 남겨 뒀습니다 — `ui/*.js`와 `ui/*.css`를 무조건 1:1로 맞출
필요는 없고, 파일을 만들 가치가 있는 화면만 나누면 됩니다.

---

# 시세(집값) 반영 — 엔진 팀 요청 사항 진행 상황

엔진 팀이 보낸 7개 항목을 실제 코드와 대조한 결과, 그중 3개(3·4·5번)는 이미
되어 있어서 손댈 게 없었고, 1개(1번 — 가격 상관없음 체크박스)는 아래처럼
직접 고쳐서 끝냈습니다. 2번과 6번은 아직 안 고쳤습니다.

## 1. "가격 상관없음" 체크박스 — 완료. 내가 고친 것

사용자님이 `index.html`에 체크박스, `frontend/ui/deal.js`에 `isPriceAny()`
함수, `main.py`의 `PredictRequest` 필드를 옵셔널로 바꾸는 것까지는 이미
해두셨습니다. 제가 이어서 고친 부분은 아래 세 가지입니다.

### 1-1. `main.py`에서 `builtYear` 필드가 통째로 사라져 있었음 (버그)

`PredictRequest`를 옵셔널로 바꾸는 작업을 하다가, 관련 없는 `builtYear` 줄까지
같이 지워진 것으로 보입니다.

원본(`main.py`, 사용자님이 수정한 상태):
```python
    area: int = 59
    bldgType: str | None = None

    dealType: str | None = None
    salePrice: int | None = None
    ...
```

그런데 아래쪽 `predict()` 함수는 여전히 `body.builtYear`를 읽고 있었습니다
(126번째 줄):
```python
    if body.builtYear >= 2015:
        base_score += 5
```

`PredictRequest`에 `builtYear` 필드 자체가 없어졌으니, 요청이 들어올 때마다
`body.builtYear`에서 `AttributeError`가 나서 **`/api/predict`가 무조건 500
에러**가 나는 상태였습니다(실제로 서버를 띄워 재현해 확인했습니다). 필드를
그대로 되살려서 고쳤습니다.

수정:
```python
    area: int = 59
    builtYear: int = 2015
    bldgType: str | None = None

    dealType: str | None = None
```

**교훈**: 여러 줄을 한 번에 골라서 지우거나 바꿀 때, 그 범위 안에 손대려던
것과 무관한 줄이 같이 딸려 들어가지 않았는지 항상 한 번 더 확인하는 게
좋습니다. 이런 실수는 문법 오류가 아니라서 에디터가 안 잡아주고, 그 필드를
실제로 쓰는 요청이 와야만(즉 서버를 실행해서 확인해야만) 드러납니다.

### 1-2. `frontend/ui/deal.js` — 체크되면 가격 관련 입력을 잠그기

요청 문서 1번 항목이 "슬라이더는 체크박스가 꺼져 있을 때만 활성화되는 게
자연스럽다"고 했던 부분입니다. `isPriceAny()`는 이미 있었지만, 그 값을 실제로
써서 입력을 잠그는 코드가 없었습니다.

`frontend/ui/deal.js`에 추가:
```js
/** "가격 상관없음"이 켜지면 가격 관련 입력을 전부 잠가서
 *  건드려도 소용없다는 걸 눈으로 보여준다 */
function updatePriceAnyState() {
  const any = isPriceAny();
  const seg = document.getElementById("dealSeg");
  const bldg = document.getElementById("bldgType");

  seg?.querySelectorAll(".seg-btn").forEach((b) => { b.disabled = any; });
  if (bldg) bldg.disabled = any;

  MONEY_SLIDERS.forEach(([id]) => {
    const s = document.getElementById(id);
    if (s) s.disabled = any;
  });
}
```
그리고 `initDealType()` 끝에 체크박스 이벤트 연결 + 첫 화면 상태 맞추기를
추가했습니다:
```js
  document.getElementById("priceAny")?.addEventListener("change", updatePriceAnyState);

  showDealGroup(currentDeal());
  updatePriceAnyState();         // 첫 화면 상태도 맞춰 준다
```
`disabled = true`가 붙은 `<select>`/`<button>`/`<input type="range">`는
브라우저가 자동으로 흐리게 보여주고 클릭도 안 먹기 때문에, CSS를 따로 안 써도
"이건 지금 못 건드린다"는 게 눈으로 보입니다.

### 1-3. `frontend/ui/result.js` — 체크됐으면 서버에 `null`로 보내기

체크박스를 잠그기만 하고 서버로 보내는 값은 그대로면 의미가 없습니다.
`runSimulation()`이 `payload`를 만드는 부분을 고쳤습니다.

원본:
```js
import { currentDeal } from "./deal.js";
...
  const payload = {
    bldgType: document.getElementById('bldgType')?.value || "아파트",
    dealType: currentDeal(),
    salePrice: Number(document.getElementById('salePrice')?.value || 58000),
    jeonseDeposit: Number(document.getElementById('jeonseDeposit')?.value || 23000),
    wolseDeposit: Number(document.getElementById('wolseDeposit')?.value || 3000),
    wolseRent: Number(document.getElementById('wolseRent')?.value || 60),
```

수정:
```js
import { currentDeal, isPriceAny } from "./deal.js";
...
  const priceAny = isPriceAny();
  const payload = {
    // "가격 상관없음"이 켜지면 null 로 보낸다.
    // 슬라이더 값을 그대로 보내면 서버가 "이 가격을 원한다" 로 알아듣기 때문이다
    bldgType: priceAny ? null : (document.getElementById('bldgType')?.value || "아파트"),
    dealType: priceAny ? null : currentDeal(),
    salePrice: priceAny ? null : Number(document.getElementById('salePrice')?.value || 58000),
    jeonseDeposit: priceAny ? null : Number(document.getElementById('jeonseDeposit')?.value || 23000),
    wolseDeposit: priceAny ? null : Number(document.getElementById('wolseDeposit')?.value || 3000),
    wolseRent: priceAny ? null : Number(document.getElementById('wolseRent')?.value || 60),
```

### 확인한 것

서버를 실제로 띄워 두 가지 요청을 다 보내봤습니다.
- 평소처럼 가격 값을 보낸 요청 → 정상 200, 로그에 `[예산검토]`가 찍히며 예산
  초과 지역이 실제로 감점되는 것 확인(builtYear 버그 고친 뒤 정상화됨).
- `bldgType`/`dealType`/가격 4개를 전부 `null`로 보낸 요청 → 정상 200, 감점
  없이 원래 점수 그대로 나오는 것 확인("가격 상관없음"이 실제로 가격 필터를
  건너뛴다는 뜻).

`services/price.py`는 이미 `None`을 잘 처리하도록 짜여 있어서 따로 안
고쳤습니다(`apply_budget()`의 `prefs.get("bldgType") or "아파트"`, `over_ratio()`의
`if not 시세 or not 내예산: return 0.0`).

## 2. 가격 슬라이더 라벨 — 아직 안 고침

`index.html`의 라벨 4곳(`매매가`/`전세 보증금`/`보증금`/`월 임대료`)을 "목표가"
뉘앙스로 바꾸는 문구 작업입니다. 문구는 프론트 판단이라 예시만 남깁니다: `희망
매매가`/`희망 전세 보증금`/`희망 보증금`/`희망 월세`.

**참고**: `services/price.py`의 `over_ratio()`를 다시 보니 `max(0.0, (시세 -
내예산) / 내예산)`이라 **시세가 목표가보다 쌀 때는 감점이 0**입니다. 엔진 팀
요청 문서는 "훨씬 싼 매물도 똑같이 감점"이라고 설명했는데 실제 코드는
"비쌀 때만 감점"으로 짜여 있어서, 문구를 정하기 전에 엔진 팀에 어느 쪽이
맞는 설명인지 확인해 보면 좋겠습니다.

## 3~5, 7. 확인만 하고 끝난 것 — 손댈 것 없음

- **월세 보증금+월세 두 입력**: `index.html`에 이미 둘 다 있고 `payload`에도
  둘 다 실어 보내고 있습니다.
- **건물유형 드롭다운 값**: `아파트`/`단독다가구`/`연립다세대`/`오피스텔` —
  엔진이 갖고 있는 값과 정확히 일치해서 매핑표가 필요 없습니다.
- **면적 슬라이더**: `services/price.py`의 시세 계산 어디에도 `area`를 읽는
  코드가 없어서, 지금 상태가 이미 "면적은 가격 계산에 반영 안 함"입니다.
- **자연어 검색**: `frontend/ui/search.js`의 `runSearch()`는 검색어만 보내고
  있어서 이미 요청 문서 설명대로 동작합니다.

## 6. 주변 시세 탭 — 아직 안 고침 (백엔드부터 손대야 함)

요청 문서에는 없던 내용인데 확인하다가 찾았습니다. `services/price.py`의
`apply_budget()`은 이미 각 지역에 시세 정보를 담아 둡니다(`r["price"] = info`).
그런데 `main.py`의 `/api/predict`가 응답을 만드는 부분이 이 값을 빼먹고
있어서, 프론트로는 아예 안 넘어옵니다:
```python
top_regions.append({
    "rank": idx + 1,
    "name": f"서울특별시 {r['name']}",
    "lat": lat,
    "lng": lng,
    "score": r["total"],
    "scores": r["scores"],
    # ← 여기에 "price": r.get("price") 가 빠져 있음
})
```

**해야 할 일**:
1. `main.py`의 `top_regions.append({...})`에 `"price": r.get("price")` 추가
   (서울 전체 대비 백분위는 지금 `services/price.py`에 없는 기능이라 별도
   개발이 더 필요할 수 있음 — 중앙값·25~75% 범위는 바로 가능).
2. `frontend/ui/reason.js`의 "주변 시세" 탭(`data-tab-panel="price"` 자리,
   지금은 `<div class="rc-empty">준비 중입니다.</div>`만 있음)을 `item.price`를
   읽어 채우는 코드로 바꾸기. 매매/전세면 `item.price?.금액`·`금액_25`·`금액_75`,
   월세면 `item.price?.보증금`·`월임대료`. `item.price`가 `null`이면(그 동네
   시세 데이터가 없을 때) "준비 중"이 아니라 "이 조건의 시세 정보가 없어요"로
   문구를 바꾸는 게 더 정확함.
3. "가격 상관없음"이 켜진 상태에서도 `services/price.py`가 기본값(아파트/전세)
   시세를 채워 넣긴 하므로, 이 탭을 그때는 숨길지 "조건을 선택하면 시세를 볼
   수 있어요"로 대체할지 정해야 함.

## 요약

| 번호 | 항목 | 상태 |
|---|---|---|
| 1 | 가격 상관없음 체크박스 | ✅ 완료 (오늘 마무리 — builtYear 버그도 같이 고침) |
| 2 | 가격 슬라이더 문구 | 미착수 — 문구는 자유, 단 엔진 팀에 감점 방식 재확인 권장 |
| 3 | 월세 보증금+월세 입력 | 확인 완료 — 이미 있음 |
| 4 | 건물유형 드롭다운 값 | 확인 완료 — 이미 엔진 값 그대로 |
| 5 | 면적 슬라이더 반영 | 확인 완료 — 지금 상태가 이미 A안(안 보냄) |
| 6 | 주변 시세 탭 | 미착수 — `main.py` 응답에 `price` 필드 추가부터 필요 |
| 7 | 자연어 검색 가격 반영 | 확인 완료 — 이미 됨 |

---

# (2026-08-31) 왜 엔진에 시세를 추가했는데도 LLM 서술에 반영이 안 되는가

엔진 팀이 `master_dataset_v3`에 시세 24칸을 추가하고, `pipeline/housing.py`·`chat.py`·
`region_explain.py`·`explain.py`까지 전부 손봐서 "목표가에 얼마나 가까운가"를 계산하고
설명문에 넣는 파이프라인을 이미 완성해 두었다(자세한 내용은 `Life-Embed-jh/STUDY.md`
1~10번). 그런데 실제로 화면에서 써보면 여전히 안 맞는 느낌이 든다 — 원인을 찾아보니
**엔진 문제가 아니라 이 저장소(Life-Web)가 그 새 기능을 아예 호출하지 않고 있었다.**

## 1. 지금 이 저장소엔 시세 시스템이 두 개다

- **엔진의 새 시스템** — `search()`/`recommend_by_weights(weights, housing=...)`. 사용자
  조건(건물유형·거래유형·예산)에 맞는 동만 먼저 추리고, 그 안에서 순위를 매기고, 그 순위
  그대로 설명문(`explanation`)을 쓴다. `housing`을 안 주면 이 필터는 그냥 꺼진다.
- **이 저장소의 옛날 시스템** — `services/price.py`의 `apply_budget()`. 자기 `data/시세_지역별.csv`를
  따로 읽어서, 엔진이 이미 뽑아준 TOP 5의 점수를 예산 초과분만큼 다시 깎고 재정렬한다.

`services/engine.py`의 `get_regions()`를 보면 이 둘이 어떻게 부딪히는지 보인다.

```python
# services/engine.py (현재)
def get_regions(user_prefs):
    query = (user_prefs.get('query') or '').strip()

    if query:
        result = search(query, top_k=CANDIDATE_K)                     # housing 인자 없음
        weights = result["weights"]
        regions = result["regions"]
        explanation = result["explanation"]
    else:
        weights = to_korean_weights(user_prefs)
        regions = recommend_by_weights(weights, top_k=CANDIDATE_K)    # 여기도 없음
        explanation = ""                                              # 슬라이더 경로는 설명문이 아예 없다

    regions = apply_budget(regions, user_prefs, top_k=5)              # 별개의 옛 시스템으로 재정렬
    return weights, regions, explanation
```

증상이 세 가지로 나타난다.

1. **슬라이더만 써서 추천받으면(검색어 없이) LLM 서술 자체가 없다.** `explanation = ""`을
   이 파일이 직접 박아두고 있다 — 화면에 건물유형·거래유형·예산을 다 골라도 그 조건이
   엔진에 전혀 안 들어가기 때문이다("가격 상관없음" 체크박스와 무관하게, 애초에 검색어
   경로가 아니면 `explanation`이 항상 빈 문자열이다).
2. **검색어로 검색해도, 화면 슬라이더 값은 무시된다.** `search(query, ...)`는 오직 검색어
   "문장"에서 Claude가 뽑아낸 조건만 본다 — "2억 3천짜리 전세 아파트"처럼 검색어에 직접
   써야만 반영되고, 화면에서 슬라이더로 골라둔 값은 안 본다.
3. **엔진이 만든 TOP 5·설명문을, `apply_budget()`이 다시 한번 자기 방식대로 재정렬한다.**
   그래서 최종 화면 순서와 설명문이 말하는 순서가 어긋날 수 있다 — 설명문은
   `apply_budget()` 재정렬 **이전** 순서를 근거로 쓰였기 때문이다. 또한 `apply_budget()`이
   보는 시세(`data/시세_지역별.csv`)와 엔진이 참고 시세로 문장에 넣은 시세(`master_dataset_v3`)가
   같은 동네라도 서로 다른 숫자일 수 있다 — 화면 표시와 설명문이 서로 다른 값을 인용하게 된다.

## 2. 수정 — `services/engine.py`에서 슬라이더 값을 `housing`으로 바꿔 엔진에 넘기기

```python
# services/engine.py (수정) — housing 딕셔너리를 만드는 함수 추가
def to_housing(prefs):
    """화면의 건물유형·거래유형·예산 슬라이더를 엔진의 housing 형태로 바꾼다.

    '가격 상관없음'이면 bldgType/dealType 이 이미 None 으로 온다
    (frontend/ui/result.js 의 isPriceAny() 처리 — 그대로 유지).
    """
    bldg = prefs.get("bldgType")
    deal = prefs.get("dealType")
    if not bldg or not deal:
        return None

    if deal == "매매":
        예산 = prefs.get("salePrice")
    elif deal == "전세":
        예산 = prefs.get("jeonseDeposit")
    else:  # 월세
        예산 = prefs.get("wolseRent")

    if not 예산:
        return None

    targets = {"예산": 예산}
    if deal == "월세" and prefs.get("wolseDeposit"):
        targets["보증금"] = prefs["wolseDeposit"]

    return {"건물유형": bldg, "거래유형": deal, "targets": targets}
```

```python
# services/engine.py (수정) — get_regions()
def get_regions(user_prefs):
    query = (user_prefs.get('query') or '').strip()
    housing = to_housing(user_prefs)

    if query:
        result = search(query, top_k=CANDIDATE_K, housing_override=housing)
        weights = result["weights"]
        regions = result["regions"]
        explanation = result["explanation"]
    else:
        weights = to_korean_weights(user_prefs)
        regions = recommend_by_weights(weights, top_k=CANDIDATE_K, housing=housing)
        explanation = ""   # 슬라이더 경로는 자연어 검색어가 없어 explain() 프롬프트를 못 만든다 — 4번 참고

    return weights, regions[:5]
```

**주의 — `search()`에 `housing_override` 인자를 추가하는 건 엔진(Life-Embed-jh) 쪽 작업이다.**
지금 `search()`는 검색어 문장에서 Claude가 뽑은 조건만 쓰기 때문에, 화면 슬라이더 값을
우선 반영하려면 엔진이 먼저 그 인자를 받아야 한다 — 제안 코드를 `Life-Embed-jh/STUDY.md`
10번에 적어뒀다. 그전까지는 검색어 경로에서 화면 슬라이더 값이 여전히 무시된다는 걸
알고 있을 것.

`apply_budget()` 호출을 통째로 뺀 이유 — `housing`을 넘긴 순간부터 "조건에 맞는 동만
추리고 순위를 매기는" 일을 엔진이 이미 하므로, 그 위에 또 다른 방식으로 재정렬하면
1번 문제(설명문·화면 순서 불일치)가 그대로 재발한다. 대신 [10]에서 엔진에 요청해 둔
`attach_price()`가 각 동네에 `r["price"]`(구조화된 시세)를 붙여서 돌려주므로, 화면에
시세를 보여주는 용도는 그걸로 대체한다 — 3번에서 이어서 다룬다.

## 3. `main.py` — 엔진이 붙여준 `price`를 응답에 그대로 실어 보내기

`services/price.py`의 `apply_budget()`이 없어지면, "주변 시세" 탭(요약 6번, 아직 미착수였던
바로 그 항목)에 필요한 값은 이제 엔진이 `detailed`에 붙여준 `r["price"]`에서 나온다.

```python
# main.py (원본) — predict() 안, top_regions.append({...})
        top_regions.append({
            "rank": idx + 1,
            "name": f"서울특별시 {r['name']}",
            "lat": lat,
            "lng": lng,
            "score": r["total"],
            "scores": r["scores"],
        })
```

```python
# main.py (수정)
        top_regions.append({
            "rank": idx + 1,
            "name": f"서울특별시 {r['name']}",
            "lat": lat,
            "lng": lng,
            "score": r["total"],
            "scores": r["scores"],
            "price": r.get("price"),   # housing 조건이 없었으면 None — 프론트에서 탭을 숨기거나 안내문으로 대체
        })
```

`frontend/ui/reason.js`의 "주변 시세" 탭(`data-tab-panel="price"`)을 `item.price`를 읽어
채우는 것은 원래 계획(위쪽 6번 항목)과 같으니 그대로 진행하면 된다. 다만 `item.price`의
모양이 바뀐다는 점만 주의 — `services/price.py`가 주던 `금액_25`/`금액_75`(분포 범위)나
`신뢰등급`/`거래건수`/`출처`는 `master_dataset_v3` 기반의 새 `price`엔 없다(중앙값과
"일치도" 점수만 있음). 분포·신뢰도 정보까지 화면에 꼭 보여줘야 한다면, 그 정보가 남아있는
`Life-Embed-jh/data/시세_지역별_전처리.csv`를 엔진 쪽에서 별도로 노출해줘야 한다 — 지금
당장 필요한지는 결정이 필요하다(아래 4번).

## 4. 아직 결정이 안 된 것들

- **슬라이더 경로엔 여전히 LLM 설명문이 없다.** `search()`는 자연어 검색어가 있어야
  `explain()` 프롬프트(`## 사용자 검색어\n{query}`)를 만들 수 있는 구조라서, 슬라이더만
  쓴 요청엔 대응하는 "검색어"가 없다. 빈 문자열이나 "건물유형·거래유형·예산 조건으로 찾음"
  같은 자리표시 문장을 만들어 `explain()`을 그래도 불러줄지, 아니면 슬라이더 경로는 원래
  설명문이 없는 게 맞는 설계인지는 결정이 필요하다 — 지금 코드를 그대로 살려뒀다.
- **`신뢰등급`/`거래건수`/`출처`(표본 신뢰도) 정보 손실.** 위 3번 참고. `services/price.py`를
  완전히 지우면 이 정보를 보여줄 방법이 없어진다.
- **`services/price.py` 자체를 지울지 여부.** `apply_budget()` 호출을 뺀 순간 이 파일은
  안 쓰이게 되지만, 3번의 신뢰도 정보 문제가 해결되기 전까지는 남겨두고 참고용으로만 쓸지,
  바로 지울지는 사용자 판단에 맡긴다 — 지금은 손대지 않았다.
- **`CANDIDATE_K=25`로 후보를 넉넉히 받던 이유가 `apply_budget()`의 재정렬 때문이었다.**
  이제 `housing` 필터가 엔진 안에서 먼저 걸러내므로, `top_k=CANDIDATE_K` 대신 처음부터
  `top_k=5`로 줄여도 되는지 실제로 돌려보고 확인이 필요하다.

## 5. "가격 상관없음" 체크박스 → 건물유형 드롭다운 5번째 옵션으로 통합

지금은 체크박스 하나(`#priceAny`)가 거래유형 버튼 3개(`#dealSeg`), 건물유형 드롭다운
(`#bldgType`), 금액 슬라이더 4개를 한꺼번에 잠그는 구조다. 컨트롤이 5종류나 서로 다른 위치에
흩어져 있어서 "체크박스 하나가 저 멀리 있는 것들까지 잠근다"는 게 화면만 보고는 안 와닿는다.
건물유형 드롭다운 자체에 "건물·거래유형 고려안함" 항목을 5번째로 추가하면, 잠그는 대상이
드롭다운 하나로 좁혀지고 체크박스도 따로 필요 없어진다.

### 5-1. `index.html` — 체크박스를 없애고 드롭다운에 옵션 추가

```html
<!-- index.html (원본) -->
      <select id="bldgType">
        <option value="아파트" selected>아파트</option>
        <option value="단독다가구">단독다가구</option>
        <option value="연립다세대">연립다세대</option>
        <option value="오피스텔">오피스텔</option>
      </select>
    </div>

      <div class="weight-row">
      <div class="weight-top">
        <span class="wlabel">거래 유형</span>
      </div>
      <div class="seg" id="dealSeg">
        <button type="button" class="seg-btn" data-deal="매매">매매</button>
        <button type="button" class="seg-btn is-on" data-deal="전세">전세</button>
        <button type="button" class="seg-btn" data-deal="월세">월세</button>
      </div>
    </div>

    <label class="weight-row">
      <input type="checkbox" id="priceAny">
      <span class="wlabel">가격 상관없음</span>
    </label>
```

```html
<!-- index.html (수정) -->
      <select id="bldgType">
        <option value="아파트" selected>아파트</option>
        <option value="단독다가구">단독다가구</option>
        <option value="연립다세대">연립다세대</option>
        <option value="오피스텔">오피스텔</option>
        <option value="ANY">건물·거래유형 고려안함</option>
      </select>
    </div>

      <div class="weight-row">
      <div class="weight-top">
        <span class="wlabel">거래 유형</span>
      </div>
      <div class="seg" id="dealSeg">
        <button type="button" class="seg-btn" data-deal="매매">매매</button>
        <button type="button" class="seg-btn is-on" data-deal="전세">전세</button>
        <button type="button" class="seg-btn" data-deal="월세">월세</button>
      </div>
    </div>
```

체크박스 `<label>` 통째로 삭제. "가격 상관없음"이라는 뜻은 이제 드롭다운 값 하나
(`"ANY"`)로 표현된다.

### 5-2. `frontend/ui/deal.js` — 체크박스 대신 드롭다운 값을 본다

```js
// deal.js (원본)
export function isPriceAny() {
  return document.getElementById("priceAny")?.checked ?? false;
}

function updatePriceAnyState() {
  const any = isPriceAny();
  const seg = document.getElementById("dealSeg");
  const bldg = document.getElementById("bldgType");

  seg?.querySelectorAll(".seg-btn").forEach((b) => { b.disabled = any; });
  if (bldg) bldg.disabled = any;

  MONEY_SLIDERS.forEach(([id]) => {
    const s = document.getElementById(id);
    if (s) s.disabled = any;
  });
}
```

```js
// deal.js (수정)
export function isPriceAny() {
  return document.getElementById("bldgType")?.value === "ANY";
}

/** "건물·거래유형 고려안함"이 선택되면 거래유형·금액 입력을 잠근다.
 *  건물유형 드롭다운 자체는 잠그지 않는다 — 다시 다른 값을 골라서
 *  빠져나올 수 있어야 하기 때문이다 */
function updatePriceAnyState() {
  const any = isPriceAny();
  const seg = document.getElementById("dealSeg");

  seg?.querySelectorAll(".seg-btn").forEach((b) => { b.disabled = any; });

  MONEY_SLIDERS.forEach(([id]) => {
    const s = document.getElementById(id);
    if (s) s.disabled = any;
  });
}
```

`initDealType()` 안에서 이벤트를 붙이는 대상도 바꾼다 — 체크박스의 `change`가 아니라
드롭다운의 `change`를 듣는다.

```js
// deal.js (원본) — initDealType() 안
  document.getElementById("priceAny")?.addEventListener("change", updatePriceAnyState);
```

```js
// deal.js (수정)
  document.getElementById("bldgType")?.addEventListener("change", updatePriceAnyState);
```

### 5-3. `frontend/ui/result.js`는 고칠 필요가 없다

`result.js`는 체크박스를 직접 안 보고 `isPriceAny()` 함수만 부른다(`priceAny ? null :
...`). `isPriceAny()`의 내부 구현만 바꿨을 뿐 반환값의 의미(참/거짓)는 그대로라서,
`result.js`는 한 줄도 안 건드려도 그대로 동작한다 — 애초에 체크박스를 직접 참조하지 않고
함수로 감싸뒀던 게 여기서 이득을 본 것이다.

### 확인할 것

드롭다운에서 "건물·거래유형 고려안함"을 선택했을 때 거래유형 버튼·금액 슬라이더가
잠기는지, 다시 "아파트" 같은 값으로 되돌렸을 때 전부 풀리는지 브라우저에서 직접 클릭해
확인. `<select>`는 체크박스와 달리 클릭 한 번에 값이 바로 안 바뀌고 옵션을 고르고 나서
바뀌므로, `change` 이벤트가 브라우저마다 다르게 씹히지 않는지도 같이 확인.

---

# (2026-08-31) 결정 사항 두 가지 반영 — 시세 8번째 지표 + C안(CSV·price.py 이관)

지난 논의에서 두 가지를 정하기로 했다.

1. "건물·거래유형 고려안함"을 고르면(=`housing`이 `None`) 그냥 가격을 무시하는 게 아니라,
   **4건물유형×3거래유형 12개 컬럼의 평균 백분위**로 "저렴한 동네를 살짝 우대"한다.
2. `data/시세_지역별.csv`·`services/price.py`는 **C안** — 신뢰등급·거래건수·분포 정보까지
   전부 엔진(Life-Embed-jh)으로 이관하고, 이 저장소는 엔진이 돌려주는 `price` 필드 하나만
   그대로 쓴다.

1번은 엔진 쪽 작업이 대부분이라 코드는 `Life-Embed-jh/STUDY.md` 11번(시세를 8번째 신호로
켜기)·12번(C안 상세)에 적어뒀다. 여기서는 **이 저장소가 뭘 안 해도 되고 뭘 해야 하는지**만
정리한다.

## 1. 이 저장소가 따로 할 일은 없다 — `housing=None`만 잘 넘기면 자동으로 켜진다

지난번에 적어둔 `to_housing()`을 다시 보면:

```python
# services/engine.py (지난 제안, 그대로 유지)
def to_housing(prefs):
    bldg = prefs.get("bldgType")
    deal = prefs.get("dealType")
    if not bldg or not deal:
        return None   # "건물·거래유형 고려안함"을 고르면 여기로 온다
    ...
```

"건물·거래유형 고려안함"(드롭다운의 `bldgType === "ANY"`)을 고르면 `bldg`가 `"ANY"`가
되어 `if not bldg`는 거짓이지만, **`recommend_by_weights(weights, housing=...)`에 넘기기
전에 `"ANY"`를 실제로는 "조건 없음"으로 바꿔줘야 한다** — 엔진의 `DEAL_COLUMNS`엔
`("ANY", ...)` 같은 키가 없기 때문이다. `to_housing()`에 한 줄만 추가하면 된다.

```python
# services/engine.py (수정) — to_housing() 맨 앞에 추가
def to_housing(prefs):
    bldg = prefs.get("bldgType")
    deal = prefs.get("dealType")
    if not bldg or bldg == "ANY" or not deal:
        return None
    ...
```

이렇게 `housing`이 `None`으로 엔진에 전달되면, `Life-Embed-jh/STUDY.md` 11번에서 만드는
`recommend_by_weights()`의 `else` 분기(시세를 8번째 신호로 얹는 부분)가 자동으로 켜진다.
**이 저장소는 "저렴한 순 우대"를 흉내 낼 별도 로직을 만들 필요가 없다** — `housing=None`을
정확히 넘기기만 하면 된다. (참고로 이전 버전 체크박스가 있었을 때도 원리는 같았다 —
`priceAny`가 켜지면 `bldgType`/`dealType`을 `null`로 보내던 것과 지금 `"ANY"` 옵션이
`None`으로 정규화되는 것이 같은 역할이다.)

## 2. `price` 필드 — 이제 신뢰등급·분포까지 들어온다

`Life-Embed-jh/STUDY.md` 12번대로 엔진이 `attach_price()`를 확장하면, `main.py`에 이미
적어둔 `"price": r.get("price")`(요약 6번 항목) 하나로 신뢰등급·거래건수·분포 범위까지
전부 딸려온다. 이 저장소 쪽에서 추가로 조회할 게 없다 — `frontend/ui/reason.js`의
"주변 시세" 탭은 `item.price.거래건수`/`item.price.신뢰등급`/`item.price.금액_25`/
`item.price.금액_75`를 그대로 읽으면 된다(옛 `services/price.py`가 주던 필드 이름과
최대한 맞춰뒀다 — `Life-Embed-jh/STUDY.md` 12번의 `attach_price()` 참고).

## 3. 지울 것 — 순서

1. `services/engine.py` 맨 위의 `from .price import apply_budget` 삭제, `get_regions()`의
   `apply_budget(...)` 호출도 삭제(지난 제안대로 `housing`을 넘기는 구조로 이미 바뀌었다면
   이 줄은 이미 안 쓰이고 있을 것 — 지우기만 하면 됨).
2. `services/price.py` 파일 삭제.
3. `data/시세_지역별.csv` 삭제.
4. 서버 재시작 후 `/api/predict`가 정상 응답하는지, "주변 시세" 탭에 신뢰등급·거래건수가
   여전히 뜨는지 확인. `services/engine.py`에 `price.py`를 참조하는 줄이 남아있으면
   임포트 시점에 바로 `ModuleNotFoundError`가 나므로 서버가 뜨는지만 봐도 빠뜨린 곳을
   바로 알 수 있다.

## 주의할 점

- **삭제는 `Life-Embed-jh` 쪽 12번 작업(`region_price_detail()`, `attach_price()` 확장)이
  끝난 뒤에 해야 한다.** 순서를 바꿔서 이 저장소의 CSV·`price.py`부터 지우면, 엔진 쪽
  작업이 끝나기 전까지 신뢰등급·거래건수·분포 정보를 화면 어디서도 못 보여주는 공백
  기간이 생긴다.
- **`CANDIDATE_K=25`를 계속 쓸지도 이 김에 다시 볼 것.** 예전엔 `apply_budget()`이 재정렬할
  후보를 넉넉히 받으려고 25개를 받았는데, 이제 그 재정렬 자체가 없어지므로 `top_k=5`로
  바로 받아도 되는지 실제로 돌려서 확인.
