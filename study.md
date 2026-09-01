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

# (2026-09-02) 어제 수정한 것 검증 + 새로 찾은 문제 2개

어제 교안(바로 아래 2026-09-01 항목)대로 직접 고치신 것을 하나씩 대조하고 실제로
돌려서 검증했습니다. **적용된 것은 전부 의도대로 동작합니다.** 다만 아직 안 끝난 것
2개와, 배선이 살아나면서 **비로소 드러난 새 문제 2개**가 있습니다.

## 0. 상태표

| 항목 | 상태 | 비고 |
|---|---|---|
| A-3 `to_weights()` 반올림 제거 | ✅ 적용·검증 완료 | 가중치가 실수로 살아남음 |
| A-4 `typespot` 채점 방식 교체 | ✅ 적용·검증 완료 | 명동·역삼1동 사라짐 |
| A-5 `firstWeights` 가 무시되는 문제 | ⚠️ **미해결** | `int()`→`float()` 만 적용됨. 근본 원인 그대로 |
| B `/api/region` 500 | ✅ 재발 없음 | 427개 동 전부 200 |
| C 실패를 조용히 삼키는 문제 | ⬜ **미적용** | `reason.js` 의 `catch` 두 곳 그대로 |
| D `housing` 배선 5곳 | ✅ 적용·검증 완료 | 설명문에 가격 문장이 실제로 나옴 |
| **F1 (신규)** 설명문의 금액이 10배 틀림 | 🔴 **엔진 쪽 수정 필요** | 사용자에게 틀린 숫자가 보임 |
| **F2 (신규)** `region_explain` 프롬프트 자기모순 | 🟠 엔진 쪽 수정 필요 | F1 의 원인 중 하나 |

---

## 1. 잘된 것 (실측값)

### A-3 + A-4 — 1차 추천이 고른 키워드를 따라갑니다

```
검색어  소음 없는 한적한 곳 / 슬리퍼 신고 쇼핑몰 / 흙길 따라 걷는 산책

[어제]  가중치 녹지 3   안전 3   교통 2   상권 3   의료 3   교육 3   문화 3
        동네   중구 명동 · 구로구 구로제3동

[지금]  가중치 녹지 3.46 안전 3.26 교통 2.46 상권 3.05 의료 3.49 교육 3.35 문화 2.59
        동네   송파구 방이1동 · 성북구 길음제1동
               (여러 번 눌러 보면 거여2동 · 화곡제3동 · 목3동 · 신정4동 등)
```

가중치가 실수로 살아남았고, 상위 후보에서 명동·역삼1동·논현2동이 빠졌습니다.
「숲길 산책자형」에 맞는 결과입니다.

극단값에서 안 터지는 것도 확인했습니다 — `전부 3` / `전부 1` / `녹지만 5` /
`빈 딕셔너리` 네 경우 모두 정상 동작합니다(`녹지만 5` → 강서구 화곡제2동·강남구 세곡동).

> 한 가지만 알아 두세요(지금은 문제 없음): `mean_w` 는 가중치 평균이라 **모든
> 가중치가 정확히 0이면** `ZeroDivisionError` 가 납니다. `to_weights()` 는 최소
> 1.0 으로 자르고, 엔진 가중치도 1~5, 슬라이더도 1~5 라 실제로 0이 들어올 경로가
> 없습니다. `recommend()` 를 다른 데서 직접 부르게 될 때만 신경 쓰면 됩니다.

### B — 500 오류는 재발하지 않습니다

`/api/region` 을 427개 동 전부에 대해 다시 호출 → **실패 0건**. 어제 진단대로
서버 프로세스가 옛 엔진 코드를 물고 있던 문제였던 것으로 보입니다.

### D — `housing` 배선 5곳 전부 정상

중구 중림동(아파트 전세 중앙값 8억)으로 같은 동네를 조건만 바꿔 세 번 불러봤습니다.

| 보낸 `housing` | 설명문에 나온 가격 문장 |
|---|---|
| `None` | (가격 이야기 **전혀 없음** — 정상) |
| 전세 6억 5천 | "예산보다 약 **23% 높은** 수준입니다" |
| 전세 10억 | "예산보다 약 **20% 낮은** 수준이며, 거래량이 충분해 신뢰도가 높습니다" |

방향도 맞고, 캐시도 조건별로 갈립니다(같은 동네·같은 검색어인데 설명이 달라짐).
검증 항목 1·3·4 통과입니다.

**검증 2(슬라이더 경로)** 도 통과했습니다. 검색어 없이 건물유형·거래유형·예산만
슬라이더로 주면 응답에 `housing` 이 실려 나옵니다.

```
POST /api/predict  {건물유형 아파트, 거래유형 전세, jeonseDeposit 65000}  (query 없음)
→ "housing": {"건물유형": "아파트", "거래유형": "전세", "targets": {"예산": 65000}}
```

가격 조건을 안 주면 `"housing": null` 그대로입니다 — 억지 기본값을 안 만듭니다.

---

## 2. 🔴 F1 (신규·중요) — 설명문의 금액이 10배 틀리게 나옵니다

**이건 어제 교안에서 제가 못 잡은 문제입니다.** `housing` 배선이 살아나면서 비로소
눈에 보이게 된 것입니다.

엔진이 Claude 에게 넘기는 프롬프트는 **정확합니다.** 직접 찍어서 확인했습니다.

```
## 사용자가 원한 가격
아파트 전세 예산 65,000만원

## 참고 시세 (동네 전체 중앙값, 실제 매물가 아님)
아파트 전세 예산 80,000만원 (조건 일치도 23점 · 예산 목표보다 23% 높음) ...
```

그런데 **Claude 가 답을 쓰면서 자릿수를 잃습니다.** 서로 다른 동네 3곳으로 시험한
결과입니다.

| 동네 | 실제 값 | 설명문에 나온 값 | 판정 |
|---|---|---|---|
| 마포구 아현동 | 80,000만원 (8억) | "전세 시세 중앙값은 **8,000만원**" | ❌ **10배 축소** |
| 마포구 아현동 | 예산 65,000만원 (6.5억) | "예산 **6,500만원**" | ❌ **10배 축소** |
| 강서구 화곡제3동 | 52,000만원 (5.2억) | "중앙값 **5,200만 원**" | ❌ **10배 축소** |
| 용산구 효창동 | 84,000만원 (8.4억) | "**84,000만원**대" | ⚠️ 값은 맞지만 안 읽힘 |

2차 추천 설명(`app/engine/explain.py`)에서도 같은 종류의 사고가 납니다 — 5곳 중
1곳에서 `"5위 강동구 명일제1동은 ... 가격이 5천으로 낮은 편입니다"` 가 나왔습니다.
(나머지 4곳은 "6억 5천", "7억 3천" 처럼 제대로 옮겼습니다.)

**원인**: 프롬프트가 `f"{value:,.0f}만원"` 형식으로 **만원 단위 원값을 그대로** 줍니다.
사람은 8억을 "80,000만원"이라고 쓰지 않기 때문에, Claude 가 자연스러운 한국어로
옮기는 과정에서 자릿수를 놓칩니다. **모델을 탓할 게 아니라 입력 형식의 문제입니다.**

**왜 이게 심각한가**: 8억짜리 동네를 8천만원이라고 말하면 사용자가 결정을 잘못
내립니다. 점수나 문장은 틀려도 "설명이 좀 어색하네"로 끝나지만, **금액은 사용자가
그대로 믿습니다.**

**Life-Web 에서는 못 고칩니다.** 설명문을 만드는 곳이 엔진(`Life-Embed-jh`)이고,
Life-Web 은 `housing` 을 넘기고 결과 문자열을 받아 화면에 뿌리기만 합니다.
아래 3절의 요청서를 엔진 쪽에 전달하세요.

> 참고 — 화면의 "주변 시세" 탭은 **정상입니다.** 거긴 LLM 을 안 거치고
> `frontend/ui/reason.js` 의 `fmtWon()` 이 `80000 → "8억원"` 으로 직접 바꿔 찍습니다.
> **같은 숫자가 탭에서는 8억, 설명문에서는 8천만원으로 보이는 상태**라 더 눈에 띕니다.

---

## 3. 🟠 F2 (신규) — `region_explain` 프롬프트가 자기모순 상태입니다

`Life-Embed-jh/app/features/region_explain.py` 의 `SYSTEM_PROMPT` 4번 규칙에 이런
문장이 있습니다.

```
"시세" 점수는 다른 지표와 방향이 반대입니다 — ...
사용자가 가격을 말하지 않은 검색이므로 구체적인 금액은 쓰지 말고,
"가격대는 서울에서 저렴한 편입니다" 처럼 한 문장만 덧붙이세요.
```

이 문장은 **`housing` 이 없던 시절에 쓰인 것**입니다. 이제 우리가 `housing` 을
넘기면 같은 프롬프트 안에 `## 사용자가 원한 가격 65,000만원` 이 **함께** 들어가서,
Claude 는 "구체적인 금액은 쓰지 마라"와 "이 금액을 참고해라"를 동시에 받습니다.
지시가 충돌하면 출력이 불안정해집니다 — F1 이 잦은 이유 중 하나로 보입니다.

또 하나. 엔진 쪽 요청서는 설명문에
`"원하시는 가격대에 가깝습니다 / 조금 높은 편입니다 / 저렴한 편입니다"` 중 하나가
나온다고 했는데, **실제로는 그 문구가 안 나옵니다.** "예산보다 약 23% 높은
수준입니다" 처럼 퍼센트를 날것으로 씁니다. 이유는 그 문구 지침이
`app/engine/explain.py`(2차 설명) 프롬프트에만 있고 `region_explain.py` 에는
**복사되지 않았기** 때문입니다.

### 엔진 쪽에 전달할 요청서 (그대로 복사해 쓰세요)

```
# [Life-Embed-jh] 설명문 금액 표기 요청 — 자릿수 오류 + 프롬프트 충돌

## 증상
region_explain 이 만든 설명문에서 금액이 10배 작게 나온다.
프롬프트 입력은 정확한데(확인함) 출력에서 자릿수가 빠진다.
  입력: "아파트 전세 예산 80,000만원"
  출력: "전세 시세 중앙값은 8,000만원"
서로 다른 동네 3곳 중 2곳에서 재현됐다.
app/engine/explain.py(2차 설명)에서도 5곳 중 1곳에서 발생("가격이 5천으로 낮은 편").

## 원인
금액을 f"{value:,.0f}만원" 형식으로, 만원 단위 원값 그대로 프롬프트에 넣고 있다.
  - app/features/region_explain.py:104, 119
  - app/engine/explain.py:156, 176
  - app/engine/housing.py:121, 170
사람은 8억을 "80,000만원"이라고 쓰지 않으므로, 모델이 자연스러운 한국어로 옮기며
자릿수를 잃는다. 모델이 아니라 입력 형식의 문제다.

## 요청 1 — 금액을 사람이 쓰는 단위로 넣어 달라
만원 단위 정수를 "8억원" / "6억 5,000만원" / "70만원" 형태로 바꾸는 함수를
app/engine/housing.py 에 하나 만들고, 위 6곳이 전부 그 함수를 쓰게 해달라.
(Life-Web 의 frontend/ui/reason.js 에 fmtWon() 이 같은 일을 하고 있으니 규칙 참고 가능.
 단, 두 벌이 되지 않도록 엔진 쪽 하나만 정답으로 두고 웹은 화면 표시용으로만 유지)

## 요청 2 — region_explain.py 의 SYSTEM_PROMPT 4번 충돌 해소
"사용자가 가격을 말하지 않은 검색이므로 구체적인 금액은 쓰지 말고" 는
housing 이 없을 때의 규칙인데, housing 이 있는 요청에도 그대로 적용된다.
housing 유무로 규칙이 갈리게 나눠 달라.

## 요청 3 — 방향 문구를 region_explain.py 에도 넣어 달라
app/engine/explain.py 에는 있고 region_explain.py 에는 없다.
  - 목표와 비슷하면: "원하시는 가격대에 가깝습니다"
  - 높으면: "원하시는 가격대보다 조금 높은 편입니다"
  - 낮으면: "원하시는 가격대보다 저렴한 편입니다"
지금은 "예산보다 약 23% 높은 수준입니다" 처럼 퍼센트를 날것으로 쓴다.

## 검증
같은 동네를 목표가만 바꿔 여러 번 부르고, 설명문의 금액이
"주변 시세" 탭(Life-Web 이 fmtWon 으로 찍는 값)과 자릿수가 같은지 대조.
```

---

## 4. ⚠️ 아직 안 끝난 것 2개

### A-5 — `firstWeights` 는 여전히 100% 무시됩니다

`routers/recommend.py:96` 의 `int()` → `float()` 는 적용됐지만, **그 블록 자체가
여전히 죽은 코드**입니다. 어제 적어 둔 선택지 3개 중 아무것도 아직 고르지 않으셨습니다.

프론트가 실제로 보내는 형태 그대로 재현한 결과입니다.

```
1차 유형   숲길 산책자
1차 가중치 녹지 3.46  안전 3.26  교통 2.46  상권 3.05  의료 3.49  교육 3.35  문화 2.59
1차 동네   양천구 목3동 · 양천구 신정4동
                     ↓  "내게 맞는 동네 5곳 보기" (슬라이더는 안 건드림)
2차 가중치 녹지 5.0   안전 2.8   교통 2.9   상권 3.4   의료 2.7   교육 2.4   문화 3.0
2차 동네   금천구 시흥제4동 · 동작구 사당제4동 · 송파구 마천1동 · 금천구 독산제2동 · 노원구 상계8동

fromFirst        [False, False, False, False, False]
droppedFromFirst ['목3동', '신정4동']
```

**1차에서 보여 준 두 동네가 2차에서 100% 사라집니다.** `firstWeights`/`firstSpots`
장치가 애초에 막으려던 바로 그 상황입니다.

A-3/A-4 로 1차가 좋아진 만큼 이 단절이 더 눈에 띄게 됐습니다 — 어제는 1차도 2차도
엉뚱해서 티가 덜 났습니다. 어제 적은 선택지(1: 지금 동작 인정하고 죽은 코드 삭제 /
2: 1차를 존중 / 3: 섞기) 중 하나를 정하고 진행하세요. **저는 여전히 2번을 권합니다.**

### C — `reason.js` 의 `catch` 두 곳은 아직 그대로입니다

[frontend/ui/reason.js:76-79](frontend/ui/reason.js#L76-L79) (시설 정보),
[frontend/ui/reason.js:100-103](frontend/ui/reason.js#L100-L103) (LLM 설명) 둘 다
`box.innerHTML = "";` 그대로입니다. 500 이 재발하지 않으니 급하진 않지만,
**다음에 같은 일이 생기면 또 "왜 비었는지 모르는 상태"가 됩니다.** 어제 교안의
C 절 코드를 그대로 쓰시면 됩니다.

---

## 5. 그 밖에 본 것 (문제 아님)

- `routers/recommend.py` — 클래스 사이와 `@router.post("/chat")` 앞의 빈 줄이
  한 줄로 줄었습니다. PEP 8 은 최상위 정의 사이에 두 줄을 권합니다. 동작에는
  아무 영향이 없으니 눈에 거슬릴 때 고치면 됩니다.
- `services/engine.py` 는 `used_housing` 으로 이름을 바꿨는데
  `routers/recommend.py:98` 은 아직 `extracted_housing` 으로 받습니다. 지역 변수라
  동작은 정상입니다. 맞춰 두면 읽기 좋습니다.
- `postRegionExplain` 을 부르는 곳은 `reason.js` 한 곳뿐이라 인자 추가로 깨질 곳이
  없습니다(확인함). `frontend/ui/lifetype.js` 도 `weights` 를 화면에 숫자로 찍지 않고
  `firstWeights` 로 넘기기만 하므로 실수 전환의 영향이 없습니다(확인함).
- 문법 검사: `py_compile` 5개 파일, `node --check` 4개 파일 전부 통과.
- 엔진 저장소에 커밋 안 된 변경(`app/features/admin.py` 의 `preview_member`)이
  있습니다. 이번 작업과 무관한 관리자 페이지 작업으로 보여 건드리지 않았습니다.

---

# (2026-09-01) 핀 모달 500 오류 · 1차 추천이 체크한 것과 어긋나는 문제 · housing 배선

> **처리 상태(2026-09-02 기준)** — A-3 / A-4 / D 는 적용·검증 완료,
> B 는 재발 없음, **A-5 와 C 는 아직 안 끝났습니다.** 검증 실측값과 새로 찾은
> 문제 2개는 바로 위 (2026-09-02) 항목에 있습니다. 아래는 그때 쓴 원본 교안입니다.

## 0. 한눈에 보기

한 번에 세 가지를 물어보셨는데 원인은 서로 다릅니다. 섞어서 고치면 뭐가 뭘 고쳤는지
알 수 없게 되니 **순서대로** 하나씩 진행하세요.

| # | 증상 | 원인 | 고칠 곳 |
|---|---|---|---|
| A | "소음 없는 한적한 곳"을 골랐는데 **중구 명동**이 나옴 | 1차 가중치가 상쇄 + 반올림으로 전부 3(중립)이 됨 | `services/lifetype.py`, `services/typespot.py` |
| B | 콘솔에 `/api/region` 500, `/api/region/explain` 500 | **지금 코드로는 재현이 안 됩니다.** 서버 프로세스가 옛 엔진 코드를 물고 있었을 가능성이 가장 큼 | 서버 재시작 + 실행 옵션 |
| C | 모달의 "생활 여건" 탭과 LLM 추천 사유가 빈칸 | B의 결과. `reason.js`가 실패를 **조용히 삼켜서** 원인이 화면에 안 남음 | `frontend/ui/reason.js` |
| D | (엔진 쪽 요청) 동네 설명에 가격 조건 전달 | Life-Web 이 `housing` 을 안 넘기고 있음 | 파일 5곳 배선 |

**권장 순서**: `B`(서버 재시작으로 확인, 5분) → `D`(요청받은 배선, 정답이 정해져 있음)
→ `C`(에러를 안 삼키게, 10줄) → `A`(설계 판단이 필요하니 마지막)

---

## A. 체크한 키워드와 다른 동네가 나오는 문제

### A-1. 재현 — "의도가 맞냐"고 물으셨는데, **아닙니다**

스크린샷에서 고르신 3개를 그대로 넣어 봤습니다.

```
소음 없는 한적한 곳  /  슬리퍼 신고 쇼핑몰  /  흙길 따라 걷는 산책
```

```
축 점수   EI +0.289   VQ -0.577   TP -0.500   WD +0.707
유형      EQPW 「숲길 산책자형」          ← 여기까지는 정상
가중치    녹지 3  안전 3  교통 2  상권 3  의료 3  교육 3  문화 3
```

**유형 이름은 맞게 나왔는데 가중치가 사실상 전부 3(중립)입니다.** 7개 중 6개가 3이면
"아무 조건도 없다"와 같은 뜻이라, 427개 동을 그냥 종합 점수 순으로 줄 세운 것과
같아집니다. 그 상태로 상위 8곳을 뽑아 보면:

```
72.3 중구 명동          ← 스크린샷에 나온 그 동네
71.2 노원구 상계2동
70.2 구로구 구로제3동    ← 스크린샷에 나온 그 동네
69.9 구로구 구로제5동
68.5 성북구 길음제1동
68.1 강남구 역삼1동
68.0 강남구 논현2동
68.0 양천구 신정4동
```

`typespot.recommend()` 는 상위 8곳 중 2곳을 무작위로 보여 줍니다(같은 키워드로
여러 번 눌러도 재미있으라고 그렇게 만들었습니다). 그래서 명동과 구로제3동이 뽑힌
것입니다. **버그로 터진 게 아니라, 가중치가 죽은 상태에서 코드가 정상 동작한 결과**
입니다.

### A-2. 왜 전부 3이 되었나 — 원인이 두 겹입니다

**(1) 상반된 키워드가 축에서 정확히 상쇄된다**

`services/lifetype.py` 의 `KEYWORDS` 표를 보면:

```python
"슬리퍼 신고 쇼핑몰":   {"VQ": 2, "EI": 1, "WD": 1},      # 번화함 +2
"소음 없는 한적한 곳":  {"VQ": -2, "EI": -1, "TP": -1},    # 조용함 -2   ← 서로 지움
"흙길 따라 걷는 산책":  {"VQ": -2, "WD": 1, "EI": 1},      # 조용함 -2
```

VQ 축은 `[+2, -2, -2]` 라 합이 −2, 그걸 다시 완만하게 정규화하면 −0.577 까지
줄어듭니다. 사용자 머릿속에서는 "조용한데 걸어서 쇼핑도 되는 동네"라는 **양립
가능한** 조건이지만, 지금 모델은 하나의 축 위에서 서로 빼기만 합니다.

**(2) 남은 신호마저 `round()` 가 지운다**

`services/lifetype.py` 의 `to_weights()` 마지막 줄(317번째 줄)입니다.

```python
return {k: max(1, min(5, round(v))) for k, v in w.items()}
```

반올림 **직전** 값은 이렇습니다.

```
녹지 3.46   안전 3.26   교통 2.46   상권 3.05   의료 3.49   교육 3.35   문화 2.59
     ↓ round()
녹지 3      안전 3      교통 2      상권 3      의료 3      교육 3      문화 3
```

녹지 3.46 과 문화 2.59 는 **0.87 만큼 벌어진 뚜렷한 신호**인데, 정수로 접는 순간
둘 다 3이 되어 사라집니다. 가중치를 받는 쪽(`typespot.recommend()`, 엔진의
`recommend_by_weights()`)은 둘 다 **실수(float)를 그대로 처리**하므로, 정수로 만들
이유가 애초에 없습니다.

### A-3. 고치는 법 ① — 반올림하지 않는다 (효과가 가장 큽니다)

```python
# services/lifetype.py — 원본 (310~317번째 줄)
def to_weights(axis: dict) -> dict:
    """축 점수 -> 7개 지표 가중치(1~5). 지역 정렬에 쓴다."""
    w = {k: 3.0 for k in WEIGHT_KEYS}
    for a, eff in AXIS_TO_WEIGHT.items():
        s = axis.get(a, 0.0)
        for key, coef in eff.items():
            w[key] += s * coef
    return {k: max(1, min(5, round(v))) for k, v in w.items()}
```

```python
# services/lifetype.py — 수정
def to_weights(axis: dict) -> dict:
    """축 점수 -> 7개 지표 가중치(1.0~5.0). 지역 정렬에 쓴다.

    정수로 반올림하지 않는다 —
    축 점수가 완만하게 정규화되어 있어(score_axes 참고) 가중치 차이가 보통
    ±0.5 안쪽인데, round() 로 접으면 그 차이가 통째로 사라져 7개가 전부
    3(=조건 없음)이 된다. "조용한 곳"을 고른 사용자에게 중구 명동이 추천되던
    원인이었다. 받는 쪽(typespot.recommend, 엔진의 recommend_by_weights)은
    둘 다 실수를 그대로 처리하므로 정수로 만들 이유가 없다
    """
    w = {k: 3.0 for k in WEIGHT_KEYS}
    for a, eff in AXIS_TO_WEIGHT.items():
        s = axis.get(a, 0.0)
        for key, coef in eff.items():
            w[key] += s * coef
    return {k: round(max(1.0, min(5.0, v)), 2) for k, v in w.items()}
```

> `max`/`min` 안에 `1.0`/`5.0` 을 쓴 이유 — 파이썬에서 `max(1, 0.5)` 는 정수 `1` 을
> 돌려줍니다. 실수로 통일해 두어야 반환 타입이 섞이지 않습니다.

**이 수정이 다른 곳을 깨지 않는지 확인한 것**

- `frontend/ui/lifetype.js` 는 `weights` 를 화면에 숫자로 찍지 않고 `firstWeights`
  로 그대로 넘기기만 합니다 → 화면 영향 없음.
- 다만 `routers/recommend.py:96` 이 `prefs[eng] = int(body.firstWeights[kor])` 로
  **다시 정수로 접습니다.** 여기도 같이 고쳐야 합니다(A-5 참고).

### A-4. 고치는 법 ② — 1차 채점을 2차(엔진)와 같은 방식으로

가중치를 살려도 한 가지가 더 남습니다. **가중치는 "감점"이 아니라 "배점"** 입니다.

`typespot.recommend()` 의 점수 계산(332~333번째 줄):

```python
sc = sum(ind.get(k, 50.0) * max(0.0, weights.get(k, 3)) for k in WEIGHT_KEYS) / total
```

상권을 1점(=관심 없음)으로 줘도, 상권 점수 100인 명동은 `100 × 1 = 100` 을 그대로
법니다. **"관심 없다"가 "싫다"로 전달되지 않기 때문에**, 모든 지표가 높은 만능형
동네(명동·역삼1동)가 어떤 가중치에서도 상위권에 남습니다.

엔진 쪽(`Life-Embed-jh/app/engine/recommend.py`)은 이 문제를 이미 두 가지 장치로
풀어 놨습니다. 1차만 옛 방식에 남아 있는 것입니다.

| | 1차 `typespot.py` | 2차 엔진 `recommend.py` |
|---|---|---|
| 절대점수 가중합 | ✓ | ✓ (`mix=0.5`) |
| **특기 점수**(그 동네 자기 평균 대비) | ✗ | ✓ `build_relative()` |
| **가중치 증폭**(평균 대비 편차를 6제곱) | ✗ | ✓ `sharpen=6` |

`build_relative()` 의 주석이 이 문제를 그대로 설명합니다 —
*"절대점수 가중합은 골고루 높은 동네가 항상 이긴다."*

**수정안** — `typespot.recommend()` 의 `rank_all()` 을 엔진과 같은 규칙으로 바꿉니다.

```python
# services/typespot.py — 원본 (322~335번째 줄)
    total = sum(max(0.0, weights.get(k, 3)) for k in WEIGHT_KEYS) or 1.0

    def rank_all(use_band):
        out = []
        for (gu, dong), ind in scores.items():
            if use_band and band:
                pr = price.get((gu, dong))
                # 시세를 모르는 동은 남긴다. 아는데 범위 밖이면 뺀다
                if pr is not None and not (band[0] <= pr <= band[1]):
                    continue
            sc = sum(ind.get(k, 50.0) * max(0.0, weights.get(k, 3))
                     for k in WEIGHT_KEYS) / total
            out.append((sc, gu, dong))
        return out
```

```python
# services/typespot.py — 수정
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
```

> `(p - own + 50)` 의 `+50` 은 왜 필요한가 — 특기 점수는 −50~+50 범위라 그냥 쓰면
> 음수가 됩니다. 절대점수(0~100)와 같은 눈금에 올려놓으려고 50을 더합니다.
> 엔진 `recommend()` 안의 `(relative[k] + 50)` 과 똑같은 계산입니다.

**A-3 + A-4 를 함께 적용했을 때** (같은 키워드 3개로 실제로 돌려 본 값):

```
   [지금]                            [수정 후]
72.3 중구 명동             →     68.6 양천구 목3동
71.2 노원구 상계2동                68.2 송파구 거여2동
70.2 구로구 구로제3동              67.7 강서구 화곡제3동
69.9 구로구 구로제5동              67.5 송파구 방이1동
68.5 성북구 길음제1동              67.1 노원구 중계1동
68.1 강남구 역삼1동                66.3 성북구 길음제1동
68.0 강남구 논현2동                66.3 양천구 신정4동
68.0 양천구 신정4동                66.2 송파구 가락2동
```

명동·역삼1동·논현2동이 빠지고 조용한 주거지가 올라옵니다. 「숲길 산책자형」에
어울리는 결과입니다.

### A-5. 같이 봐야 할 것 — `firstWeights` 는 2차에서 **한 번도 쓰이지 않습니다**

별개의 조용한 버그입니다. 찾은 김에 같이 적어 둡니다.

`routers/recommend.py:91~96` 은 "슬라이더를 안 만졌으면 1차 가중치를 쓴다"고 되어
있습니다.

```python
# routers/recommend.py (91~98번째 줄, 원본)
    if body.firstWeights:
        touched = any(prefs.get(eng, 3) != 3 for eng in KEY_MAP)
        if not touched:
            for eng, kor in KEY_MAP.items():
                if kor in body.firstWeights:
                    prefs[eng] = int(body.firstWeights[kor])

    weights, regions, explanation, extracted_housing = get_regions(prefs)
```

그런데 `services/engine.py` 의 `get_regions()` 를 보면:

```python
    if query:
        result = search(query, top_k=5, housing_override=housing)
        weights = result["weights"]              # ← LLM 이 만든 값. prefs 를 안 본다
    else:
        weights = to_korean_weights(user_prefs)  # ← prefs[eng] 는 여기서만 읽힌다
```

`prefs[eng]` 는 **`query` 가 없을 때만** 읽힙니다. 그런데 1차 유형 카드에서
"내게 맞는 동네 5곳 보기"를 누르면 `frontend/ui/search.js:412` 가
`postPredict({ query, ...firstPayload() })` 로 **항상 검색어를 같이 보냅니다.**

> **결론: 1차 → 2차 경로에서 `firstWeights` 는 100% 무시됩니다.**
> 2차 레이더 차트의 점선("원하신 수준")은 1차에서 고른 키워드가 아니라, 엔진의
> Claude 가 그 키워드 문장을 새로 읽고 만든 값입니다. 스크린샷 4의 점선이
> 체크한 것과 안 맞아 보이는 이유가 이것입니다.

이건 **어느 쪽이 맞는지 정하는 문제**라 코드부터 고치면 안 됩니다. 셋 중 하나를
고르세요.

1. **지금 동작이 맞다** — LLM 이 더 정확하니 1차 가중치는 참고만 한다.
   → `routers/recommend.py:88~96` 의 죽은 코드를 지우고, `CLAUDE.md` 의 API 계약
   설명("`firstWeights` 는 슬라이더를 안 만졌을 때만 적용")을 사실에 맞게 고칩니다.
2. **1차를 존중해야 한다** — 사용자가 직접 고르고 카드로 확인까지 한 값이 우선.
   → `get_regions()` 에서 `search()` 결과의 `weights` 를 `firstWeights` 로 덮어씁니다.
3. **섞는다** — 엔진의 `blend()` 처럼 7:3 등으로 평균낸다.
   → 가장 자연스럽지만 비율을 정할 근거가 필요합니다.

저는 **2번**을 권합니다. 사용자가 눈으로 고르고 「숲길 산책자형」이라고 확인까지 한
값을 뒤집으면, 화면이 방금 한 말과 다른 결과를 내놓는 셈이 됩니다.

2번을 고르셨다면 A-3 과 함께 `int()` 도 벗겨야 합니다.

```python
# routers/recommend.py — 수정
                    prefs[eng] = float(body.firstWeights[kor])   # int() → float()
```

---

## B. 콘솔의 500 오류 두 개

### B-1. 먼저 알아 두실 것 — **지금 코드로는 재현되지 않습니다**

확인한 것:

- `get_facilities("송파구", "마천1동")` 단독 호출 → 정상
- `/api/region` 을 **427개 동 전부**에 대해 호출 → **실패 0건**
- `/api/region/explain` 을 실제 LLM 까지 태워 호출 → 200, 설명문 정상 생성
- 엔진 저장소(`Life-Embed-jh`) 워킹트리 깨끗, 최신 커밋 `e43d959`

즉 **파일을 고쳐서 낫는 문제가 아니라, 그때 돌고 있던 서버 프로세스의 문제**일
가능성이 가장 큽니다.

### B-2. 가장 유력한 원인 — `--reload` 는 엔진 저장소를 안 봅니다

```bash
py -m uvicorn main:app --reload --port 5000
```

`--reload` 는 **현재 폴더(`Life-Web`)만** 감시합니다. `Life-Embed-jh` 의 파일을
고치거나 `git merge` / `git checkout` 으로 갈아끼워도 **서버는 다시 안 뜹니다.**
그러면 이런 상태가 됩니다.

- 메모리 안: 서버를 켤 때 읽은 **옛** `app.core.db`, `app.features.region_explain`
- 디스크 위: 병합으로 바뀐 **새** 파일들

함정이 하나 더 있습니다. `Life-Embed-jh/app/features/region_explain.py` 의
`build_context()` 는 함수 **안에서** import 를 합니다(98번째 줄 근처).

```python
    if housing:
        from app.engine.housing import (DEAL_COLUMNS, housing_fit_score,
                                        region_price_note, price_gap_text)
```

이런 "지연 import"는 **그 줄이 실행되는 순간** 디스크에서 읽습니다. 그래서 옛
모듈과 새 모듈이 한 요청 안에서 섞일 수 있습니다.

두 라우트가 **동시에** 500 이 난 것도 이 설명과 맞습니다. `/api/region` 과
`/api/region/explain` 은 둘 다 `app.core.db` 의 `facilities` / `facility_counts` /
`region_extras` 를 씁니다(`region_explain` 도 설명을 만들기 전에 그 세 함수로
재료를 모읍니다). 그리고 저 세 함수가 쓰는 `dong_variants` 는 최근 커밋에서
`app/core/db.py` 안의 사본이 지워지고 `app/domain/dong.py` 로 옮겨졌습니다.
**옛 db 모듈 + 새 domain 모듈** 조합이면 여기서 터질 수 있습니다.

### B-3. 할 일 (순서대로)

**① 서버를 완전히 껐다 켠다.** 이것만으로 사라질 가능성이 높습니다.

```bash
# 터미널에서 Ctrl+C 로 확실히 종료한 뒤
py -m uvicorn main:app --reload --port 5000
```

**② 그래도 나면, 서버 콘솔의 Traceback 을 봅니다.** 브라우저 콘솔의 "500" 은
"서버가 터졌다"까지만 알려 줍니다. **진짜 답은 서버를 띄운 터미널에 찍힌
`Traceback (most recent call last):` 의 맨 아랫줄**입니다. 그 한 줄을 가져오시면
바로 원인을 짚을 수 있습니다.

**③ 재발 방지 — 엔진 폴더도 감시하게 합니다.**

```bash
py -m uvicorn main:app --reload --reload-dir . --reload-dir ../Life-Embed-jh --port 5000
```

`--reload-dir` 을 한 번이라도 쓰면 기본값(현재 폴더)이 사라지므로 `.` 을 반드시
같이 적어야 합니다. 이렇게 두면 엔진 파일을 고쳤을 때도 서버가 다시 뜹니다.

> 참고 — 콘솔의 `favicon.ico 404` 와 `Canvas2D ... willReadFrequently` 경고는
> 무시해도 됩니다. 앞의 것은 브라우저가 탭 아이콘을 찾다 못 찾은 것이고, 뒤의 것은
> 카카오 로드뷰 내부 코드에 대한 성능 안내입니다. 우리 문제와 무관합니다.

---

## C. 모달이 비는 문제 — 실패를 조용히 삼키고 있습니다

증상 C 는 B 의 **결과**입니다. 500 이 나면 `frontend/ui/reason.js` 가 이렇게 합니다.

```javascript
// frontend/ui/reason.js — 원본 (76~79번째 줄, 시설 정보)
    catch (err) {
    console.error(err);
    box.innerHTML = "";      // 실패하면 조용히 비운다. 나머지는 이미 보인다
  }
```

```javascript
// frontend/ui/reason.js — 원본 (100~103번째 줄, LLM 설명)
  } catch (err) {
    console.error(err);
    box.innerHTML = "";      // 실패하면 조용히 비운다. 나머지는 이미 보인다
  }
```

"조용히 비운다"는 원래 **좋은 판단**이었습니다 — 레이더 차트와 점수표는 이미 나와
있으니 빨간 에러로 화면을 망칠 이유가 없죠. 하지만 지금처럼 "원래 나오던 게 안
나온다"는 상황에서는 사용자도 개발자도 *왜* 안 나오는지 알 방법이 없습니다.
빈칸은 "실패했다"와 "원래 보여줄 정보가 없다"를 구분해 주지 못합니다.

**수정 — 실패했다는 사실만 한 줄로 남깁니다.**

```javascript
// frontend/ui/reason.js — 수정 (시설 정보)
  } catch (err) {
    console.error("[reason] 시설 정보 실패", err);
    // 빈칸으로 두면 "실패"와 "원래 정보가 없음"을 구분할 수 없다.
    // 레이더·점수표는 이미 보이므로 화면을 망치지 않는 선에서 한 줄만 남긴다
    box.innerHTML = `<div class="rc-empty">이 동네 정보를 불러오지 못했어요.</div>`;
  }
```

```javascript
// frontend/ui/reason.js — 수정 (LLM 설명)
  } catch (err) {
    console.error("[reason] 동네 설명 실패", err);
    box.innerHTML = `<div class="rc-empty">추천 사유를 불러오지 못했어요.</div>`;
  }
```

`rc-empty` 는 "주변 시세" 탭이 이미 쓰고 있는 클래스라(`buildPriceHtml()` 참고)
CSS 를 새로 만들 필요가 없습니다.

---

## D. 동네 상세 설명에 `housing`(가격 조건) 넘기기 — 엔진 쪽 요청 배선

### D-0. 무엇을 하는 작업인가

지도 핀을 눌렀을 때 나오는 동네 설명(`/api/region/explain`)에 **사용자의 가격 조건을
같이 보내는** 작업입니다. 그러면 설명문이 "원하시는 가격대보다 조금 높은 편입니다"
같은 문장을 낼 수 있습니다. 지금은 이 경로에 시세 이야기가 아예 안 나옵니다.

**엔진(`Life-Embed-jh`)은 손대지 않습니다.** 확인해 봤더니 받을 준비가 이미 끝나
있습니다.

```python
# Life-Embed-jh/app/features/region_explain.py — 이미 이렇게 되어 있음
def region_explain(gu, dong, query="", weights=None, scores=None, housing=None)
def region_explain_cached(gu, dong, query="", weights=None, scores=None, housing=None)
```

캐시 키에도 `_housing_key(housing)` 이 들어 있어서, 같은 동네·같은 검색어라도 가격
조건이 다르면 설명을 새로 만듭니다. **Life-Web 이 값을 안 넘기고 있을 뿐입니다.**

`housing` 자료구조(엔진이 기대하는 형태, 단위는 전부 만원):

```python
{"건물유형": "아파트",   "거래유형": "전세", "targets": {"예산": 65000}}
{"건물유형": "오피스텔", "거래유형": "월세", "targets": {"예산": 70, "보증금": 5000}}
```

이 형태를 만드는 함수는 `services/engine.py` 의 `to_housing(prefs)` **하나뿐**입니다.
`"빌라" → "연립다세대"` 같은 변환 규칙이 거기에만 있으니 **프론트에서 새로 조립하지
마세요.** 두 곳에서 각자 만들면 언젠가 규칙이 갈라집니다.

### D-1. 먼저 고쳐야 할 것 — 슬라이더 경로의 `housing` 이 응답에서 빠집니다

이걸 먼저 안 고치면, 슬라이더로만 조건을 준 사용자는 상세 설명에서 여전히 시세
이야기를 못 듣습니다. **설명에 쓰는 기준과 순위를 매긴 기준이 달라지면 사용자에게
앞뒤가 안 맞는 말을 하게 됩니다.**

```python
# services/engine.py — 원본 (82~100번째 줄)
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

```python
# services/engine.py — 수정
def get_regions(user_prefs):
    query = (user_prefs.get('query') or '').strip()
    housing = to_housing(user_prefs)

    # "순위를 매길 때 실제로 쓰인" housing. 두 경로 모두에서 채운다.
    #
    # 예전에는 검색어 경로에서만 채우고 슬라이더 경로는 None 으로 뒀다 —
    # "화면이 만든 값이니 되돌려줄 필요 없다"는 판단이었는데, 핀 모달의
    # 동네 설명(/api/region/explain)이 이 값을 다시 받아야 하게 되면서
    # 슬라이더로만 조건을 준 사용자는 시세 이야기를 못 듣게 됐다.
    # 순위 기준과 설명 기준이 다르면 앞뒤가 안 맞는 말을 하게 된다
    used_housing = None

    if query:
        result = search(query, top_k=5, housing_override=housing)
        weights = result["weights"]
        regions = result["regions"]
        explanation = result["explanation"]
        # search() 는 housing_override 가 있으면 그걸 그대로,
        # 없으면 검색어에서 뽑아낸 조건을 돌려준다 — 어느 쪽이든 "실제로 쓰인" 값
        used_housing = result.get("housing")
    else:
        weights = to_korean_weights(user_prefs)
        regions = recommend_by_weights(weights, top_k=5, housing=housing)
        explanation = ""
        used_housing = housing        # ← 이 한 줄이 빠져 있었다

    return weights, regions, explanation, used_housing
```

> 이름을 `extracted_housing` → `used_housing` 으로 바꾼 이유: 이제 "검색어에서 뽑아낸
> 것"만이 아니라 "화면에서 고른 것"도 담기므로, 옛 이름은 거짓말이 됩니다.
> 파일 맨 아래 스모크 체크(`w, r, e, h = get_regions(...)`)는 위치로 받으므로
> 고칠 필요 없습니다. 부르는 쪽인 `routers/recommend.py:98` 도 지역 변수라 그대로
> 둬도 동작하지만, 같이 바꿔 두면 읽기 좋습니다.

### D-2. `get_region_explain()` 이 `housing` 을 받아 넘기게

```python
# services/engine.py — 원본 (112~114번째 줄)
def get_region_explain(gu, dong, query="", weights=None, scores=None):
    """동네 하나에 대한 LLM 설명을 만든다. 지도 핀을 눌렀을 때 쓴다."""
    return region_explain_cached(gu, dong, query, weights, scores)
```

```python
# services/engine.py — 수정
def get_region_explain(gu, dong, query="", weights=None, scores=None, housing=None):
    """동네 하나에 대한 LLM 설명을 만든다. 지도 핀을 눌렀을 때 쓴다.

    housing 이 있으면 엔진이 설명문에 "원하시는 가격대보다 조금 높은 편입니다"
    같은 문장을 넣는다. None 이면 프롬프트에 "가격 이야기를 꺼내지 마라"가
    들어가므로, 가격 조건이 없을 때 억지로 기본값을 만들어 넣지 말 것
    """
    return region_explain_cached(gu, dong, query, weights, scores, housing)
```

### D-3. 라우터가 `housing` 을 받아 전달하게

```python
# routers/recommend.py — 원본 (54~61번째 줄)
class RegionRequest(BaseModel):
    gu: str
    dong: str
    # 설명을 만들려면 "무엇을 찾던 사람인지" 가 필요하다
    query: str | None = None
    weights: dict | None = None
    scores: dict | None = None
```

```python
# routers/recommend.py — 수정
class RegionRequest(BaseModel):
    gu: str
    dong: str
    # 설명을 만들려면 "무엇을 찾던 사람인지" 가 필요하다
    query: str | None = None
    weights: dict | None = None
    scores: dict | None = None
    # 순위를 매길 때 실제로 쓰인 가격 조건. /api/predict 응답의 housing 을
    # 프론트가 그대로 실어 보낸다 — 프론트에서 새로 조립하지 않는다.
    # 가격 조건이 없었으면 None (엔진이 시세 이야기를 안 꺼낸다)
    housing: dict | None = None
```

> `/api/region`(시설 정보)도 같은 모델을 씁니다. `housing` 은 선택 필드라
> 안 보내도 아무 문제 없습니다 — 그쪽은 고칠 게 없습니다.

```python
# routers/recommend.py — 원본 (176~183번째 줄)
    return {
        "explanation": get_region_explain(
            body.gu, body.dong,
            query=body.query or "",
            weights=body.weights,
            scores=body.scores,
        )
    }
```

```python
# routers/recommend.py — 수정
    return {
        "explanation": get_region_explain(
            body.gu, body.dong,
            query=body.query or "",
            weights=body.weights,
            scores=body.scores,
            housing=body.housing,
        )
    }
```

`/api/predict` 응답의 `"housing": extracted_housing` (139번째 줄)은 변수명만
`used_housing` 으로 맞춰 주면 됩니다. 필드 자체는 이미 있습니다.

### D-4. 프론트 — 요청 본문에 싣기

```javascript
// frontend/lib/api.js — 원본 (57~65번째 줄)
/** 핀 클릭 — LLM 설명 */
export function postRegionExplain(gu, dong, query, weights, scores) {
  return postJSON("/api/region/explain", {
    gu, dong,
    query: query || "",
    weights: weights || null,
    scores: scores || null,
  });
}
```

```javascript
// frontend/lib/api.js — 수정
/** 핀 클릭 — LLM 설명.
 *  housing 은 /api/predict 응답에서 받은 값을 그대로 실어 보낸다.
 *  여기서 조립하지 않는다 — 만드는 규칙은 services/engine.py 의 to_housing() 하나뿐이다 */
export function postRegionExplain(gu, dong, query, weights, scores, housing) {
  return postJSON("/api/region/explain", {
    gu, dong,
    query: query || "",
    weights: weights || null,
    scores: scores || null,
    housing: housing || null,
  });
}
```

### D-5. 프론트 — 어떤 `housing` 을 넘길지 (여기가 이 작업의 핵심입니다)

넘겨야 하는 것은 **"지금 화면에 떠 있는 추천 순위를 만들 때 실제로 쓰인 housing"**
입니다. `state.lastQuery` 와 똑같은 성격이라 같은 자리에 보관합니다.

```javascript
// frontend/lib/state.js — 원본 (11~18번째 줄)
export const state = {
  lastResult: null,   // 마지막 추천 응답 전체. 채팅이 질문과 함께 보낸다
  lastQuery: "",      // 마지막 검색어. 핀 클릭 설명에 같이 보낸다
  ...
```

```javascript
// frontend/lib/state.js — 수정
export const state = {
  lastResult: null,   // 마지막 추천 응답 전체. 채팅이 질문과 함께 보낸다
  lastQuery: "",      // 마지막 검색어. 핀 클릭 설명에 같이 보낸다

  // 이번 추천 순위를 만들 때 실제로 쓰인 가격 조건. 핀 클릭 설명에 같이 보낸다.
  // 순위 기준과 설명 기준이 어긋나면 사용자에게 앞뒤가 안 맞는 말을 하게 된다
  lastHousing: null,
  ...
```

```javascript
// frontend/ui/result.js — 원본 (61~62번째 줄)
  state.lastQuery = data.query || "";
  state.lastResult = data;
```

```javascript
// frontend/ui/result.js — 수정
  state.lastQuery = data.query || "";
  state.lastResult = data;
  state.lastHousing = data.housing || null;   // 가격 조건이 없었으면 null 그대로
```

```javascript
// frontend/ui/reason.js — 원본 (93번째 줄)
    const data = await postRegionExplain(gu, dong, state.lastQuery, weights, item.scores);
```

```javascript
// frontend/ui/reason.js — 수정
    const data = await postRegionExplain(
      gu, dong, state.lastQuery, weights, item.scores, state.lastHousing);
```

> `state.lastResult.housing` 을 바로 읽어도 값은 같습니다(둘 다 같은 응답에서
> 나옵니다). 그래도 `lastHousing` 을 따로 두는 이유는 `lastQuery` 와 관례를
> 맞추기 위해서입니다 — 나중에 `reason.js` 를 읽는 사람이 "이 값이 어디서 왔지"를
> 한 줄로 알 수 있습니다.

### D-6. 절대 하지 말 것

- **엔진(`Life-Embed-jh`)을 수정하지 않습니다.** 이 작업은 전부 Life-Web 안에서 끝납니다.
- **프론트에서 `housing` 을 새로 조립하지 않습니다.** `to_housing()` 이 만든 값이나
  검색 응답으로 받은 값을 **실어 나르기만** 합니다.
- **가격 조건이 없을 때 기본값을 만들어 넣지 않습니다.** `None` 이면 엔진이 시세
  블록 자체를 안 만들고, 프롬프트에도 "시세 이야기를 꺼내지 마라"가 들어갑니다.
  빈 값을 채우면 없는 근거로 가격을 말하게 됩니다.

### D-7. 검증 (4가지, 순서대로)

1. **가격 조건이 있는 검색** — `"전세 6억 5천으로 아파트 알아봐줘"` → 핀 클릭
   → 설명문에 "원하시는 가격대에 가깝습니다 / 조금 높은 편입니다 / 저렴한 편입니다"
   중 하나가 나오고, 그 방향이 실제 금액 차이와 맞는지.
2. **슬라이더로만 조건을 준 경우**(검색어 없이 건물유형·거래유형·예산만) → 핀 클릭
   → 1번과 같은 결과가 나오는지. **D-1 을 고쳐야 통과합니다.**
3. **가격 조건이 없는 검색** — `"애들 학원 보내기 좋은 곳"` → 핀 클릭
   → 시세/가격 이야기가 **전혀 안 나와야** 정상.
4. **같은 동네를 조건만 바꿔 두 번** 눌러 설명이 실제로 달라지는지.
   캐시 키에 `housing` 이 들어가 있으므로 달라야 정상입니다.
   **똑같이 나오면 어딘가에서 `housing` 이 유실된 것**이니 위 5곳을 다시 확인하세요.

참고: 엔진 쪽 진단 경위는 `Life-Embed-jh/STUDY.md` 16절,
아직 결론 안 난 논의는 `Life-Embed-jh/README.md` 의 "논의 필요" 절에 있습니다.

---

# 지난 기록 (2026-08-31, 완료 — 요약만 남김)

행이 길어져 상세 코드는 지우고 **나중에 다시 헷갈릴 만한 결론만** 남깁니다.

### 검색어로 찾을 때 "건축" 패널이 안 바뀌던 문제 — 완료

LLM 이 검색어에서 건물유형·거래유형·예산을 이미 읽어내고 있었는데 그 값을 프론트까지
아무도 안 넘겨주고 있었다. `pipeline_api.search()` 가 `housing` 을 반환하게 하고
→ `engine.get_regions()` 가 한 단계 더 전달 → `/api/predict` 응답에 `housing` 필드
추가 → `search.js` 의 `applyHousing()` 이 패널을 갱신. **위 D 절이 그 값을 한 번 더
멀리(핀 모달까지) 보내는 작업이다.**

- **면적(`#area`) 슬라이더는 여전히 안 됩니다.** 엔진의 `SYSTEM_PROMPT` 에 면적
  항목 자체가 없어서 LLM 이 애초에 안 뽑습니다. 되게 하려면 프롬프트 + JSON 스키마 +
  `search()` 반환값까지 손대는 별도 작업입니다.
- 준공년도(`builtYear`)는 화면에 슬라이더가 없어 `|| 2015` 기본값만 매번 보내던
  죽은 코드였다. `main.py`, `result.js`, `CLAUDE.md` 세 곳에서 삭제 완료.
- `services/engine.py` 에 `get_regions` 가 **두 번 정의**되어 있어 뒤엣것이 앞엣것을
  덮던 사고가 있었다. 파이썬은 같은 이름의 함수를 다시 정의해도 오류를 내지 않는다 —
  **조용히 나중 것만 남는다.** 고친 코드를 붙여 넣을 때 옛 정의를 지웠는지 꼭 확인할 것.

### 로그인 버튼 헤더 분리 + 메뉴 정리 — 완료

메뉴가 로그인 여부와 무관하게 "로그인 이후" 화면만 보여주게 되면서, `localStorage`
토큰으로 화면을 바꾸던 `isLoggedIn()` / `menuLogin` / `menuLogout` 이 전부 죽은 코드가
되어 삭제했다. 진짜 로그인 API 가 생기면 헤더의 `#loginToggle` 이 그 상태를 갖는
자리가 된다(지금은 "준비중" 모달만 띄움).

**아직 백엔드가 없어 못 만든 것** — 마이페이지·검색 기록·좋아요·관리자 페이지.
필요한 것: 회원 DB(이메일·비밀번호 해시·`role`) + `/api/auth/*`(비밀번호는 반드시
`bcrypt` 등으로 해시), 회원별 기록 테이블, `likes` 테이블(회원·구·동).
`ChatRequest.history` 는 그때 쓰려고 미리 자리만 열어 둔 필드다.

### CSS 화면 단위 분리 — 완료

`style.css`/`search.css` 두 개를 `ui/result.css`, `ui/reason.css`, `ui/chat.css`,
`ui/menu.css` 로 나눴다. 파일별 내용은 `CLAUDE.md` 의 프론트엔드 구조 매핑표 참고.

### 시세(집값) 반영 — 완료

이 저장소가 따로 예산을 계산하던 옛 방식(`services/price.py`, `data/시세_지역별.csv`)은
전부 삭제. 지금은 `to_housing()` 이 화면 값을 엔진의 `housing` 형태로 바꿔 넘기고,
엔진이 그 조건에 맞는 동만 추려 순위를 매긴다. `"건물·거래유형 고려안함"`(`bldgType === "ANY"`)을
고르면 `housing` 이 `None` 이 되어 엔진의 기본 동작("저렴한 동네를 살짝 우대")으로 넘어간다.
`attach_price()` 결과가 `topRegions[].price` 로 실려 `reason.js` 의 "주변 시세" 탭에 보인다.

**남은 것**: 가격 슬라이더 라벨 문구(`희망 매매가` 등을 "목표가" 뉘앙스로) — 급하지 않아 미룸.
