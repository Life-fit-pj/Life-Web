# SALVAGE.md — 버리기 전에 빼둔 미커밋 작업 (Life-Web)

## 이 파일은 무엇인가

2026-09-02, `update-jh` 브랜치에 **커밋하지 않은 채 작업 중이던 내용**을
`origin/dev-user-store`를 머지해 받기로 결정하면서 통째로 걷어냈다.
그때 사라진 코드와 설계 의도를 항목별로 여기 남긴다. **되살리고 싶으면 이 파일만 보면 된다.**

형제 저장소에도 같은 성격의 `Life-Embed-jh/SALVAGE.md`가 있다.

- 기준 커밋: `7f86f38` (관리자 페이지에 가중치 박스 추가 및 수정)
- 걷어낸 대상: `frontend/admin.html`(+300/-124) · `routers/admin.py`(+56/-1) ·
  `services/engine.py`(+3/-2) · `CLAUDE.md`(+94/-16) · `AGENTS.md`(+3/-3)

### 보관 위치 — 저장소 밖(`C:\Users\lecra\Desktop\life-db-backup\salvage-web\`)이라 git과 무관하다

```
salvage-web/
├── admin.html            걷어내기 직전의 전체 파일
├── admin.html.patch      git diff
├── admin.py.patch        routers/admin.py
├── engine.py.patch       services/engine.py
├── CLAUDE.md             걷어내기 직전의 전체 파일
├── CLAUDE.md.patch
├── AGENTS.md.patch
└── UNCOMMITTED.md        이 문서의 초판(머지 전에 쓴 것)
```

되살리려면 해당 `.patch`를 `git apply` 하면 된다. 다만 머지로 주변 코드가 바뀌었으므로
`admin.html.patch`는 그대로 안 붙는다 — 전체 파일(`salvage-web/admin.html`)에서 필요한
덩어리만 골라 옮기는 편이 빠르다.

---

## 걷어낸 것 — 항목별

| # | 항목 | 되살릴 가치 |
|---|---|---|
| A | 관리자 **분석 채팅** | 높음 — 기능 자체가 통째로 사라졌다 |
| B | 회원 **검색·대화 기록 패널** | **없음** — 머지로 해소됐다 |
| C | **대시보드 정리** | 취향 문제 |
| D | **시스템 화면 — 이슈·청킹·가중치** | 중간 — 적재 점검 수단이 없어졌다 |
| E | **문서 갱신** | 높음 — 낡은 서술이 그대로 돌아왔다 |

---

### A. 관리자 분석 채팅 ⚠ 기능이 통째로 사라졌다

대시보드 맨 아래에서 Claude에게 집계 숫자를 물어보는 기능.
**Claude가 SQL을 짜지 않고**, 서버가 집계표(`collect_facts()`)를 만들어 넘기는 구조였다.

- `services/engine.py` — `from app.features import analysis as analysis_engine`
- `routers/admin.py` — `AnalyzeRequest` 모델 + 라우트 5개
  (`GET /analysis/facts`, `POST /analysis`, `GET /analysis`, `GET·DELETE /analysis/{chat_id}`).
  `POST`·`DELETE`는 토큰 + 쓰기 스위치를 둘 다 요구했다 — 답변을 `analysis_chat` 표에
  남기므로 쓰기 작업이고 LLM 비용도 들기 때문.
- `frontend/admin.html` — `EXAMPLES` · `analysisPanel()` · `wireAnalysis()`,
  CSS `.an-ex` `.an-ask` `.an-q` `.an-a` `.an-row` `.an-item` `.an-when` `.an-del`.
  지난 대화를 다시 열면 **"언제 기준 집계인지"를 반드시 함께** 보여줬다(숫자가 계속 바뀌므로).

> **되살리려면 엔진 쪽이 먼저다.** 이 기능은 엔진의 `app/features/analysis.py`(246줄,
> 그쪽도 untracked였다가 같이 걷어냄)에 의존한다. 백업은
> `life-db-backup/salvage/analysis.py`. DB의 `analysis_chat` 표에 쌓여 있던 지난 대화도
> `life.db`를 되돌리면서 함께 사라졌다(백업 `life.db.20260902-224751.bak`).

### B. 회원 검색·대화 기록 패널 — 머지로 해소됨

회원 상세의 "검색·대화 기록" 탭(`showHistory()`, `GET /api/admin/members/{id}/history`,
CSS `.hist`). 저장하는 쪽이 없어 **항상 비어 있던** 패널이다.

`dev-user-store`가 같은 자리에 **활동** 카드(`activityBody()`)를 넣었고, 그쪽은
`GET /api/admin/members/{id}` 응답의 `likes`·`searches`·`chats`를 그린다.
**실제로 데이터가 쌓이는 구현**이므로 이 항목은 되살릴 이유가 없다.

### C. 대시보드 정리

"꼭 필요하지 않은 요소를 지우고 정돈해 달라"는 요청으로 한 작업. 지금은 원래대로 돌아왔다.

| 지웠던 요소 | 이유 |
|---|---|
| KPI **행정동 427** | 상단 상태 알약에 같은 숫자가 있고, 회원이 늘어도 안 변하는 상수 |
| KPI **관리자 수정 N건** | 수정 이력이 "누가 뭘 고쳤는지"까지 보여준다 |
| KPI **페르소나 청크 900** | 운영 점검용이라 시스템 화면이 제자리(→ 항목 D) |
| KPI **평균 희망 가중치** | 하나만 남으면 박스가 화면 폭 전체로 늘어난다 |
| **월별 가입 추이** 면적 차트 | 100명 데이터에서는 추세가 아니라 노이즈 |
| **최근 수정** 카드 | 시스템 화면의 수정 이력과 중복 |

회원 수는 제목 줄(`#dash-sub`)로, 7지표 전체 평균은 `희망 조건 평균` 카드 힌트로 옮겨
**숫자는 하나도 안 없앴다.** 죽은 코드 `area()`·`wireArea()`·`kpi()`와 관련 CSS도 같이 걷어냈다.

### D. 시스템 화면 — 이슈 · 청킹 · 가중치

"DB 적재 시 서술 데이터가 유실된 경우를 기록하면 좋겠다"는 요청으로 만든 것.
수정 이력 카드를 **이슈** 카드로 바꾸고, `/ready`·`/summary`가 이미 주는 숫자만 보고
화면이 그 자리에서 판단하게 했다(서버에 이슈 표는 없었다).

| 감지 | 조건 | 등급 |
|---|---|---|
| 페르소나 칸 유실 | 회원당 청크 < 9칸 → 몇 칸이 비었는지 + 한 명도 없는 칸 이름 | 심각 |
| 짧은 페르소나 칸 | 칸별 평균 < 60자 (실측 최소가 55자) | 주의 |
| 가중치 비어 있음 | 7지표 중 값이 0 | 심각 |

`fact()` 상자로 **청킹**(총 청크·회원당 칸·채워진 칸·가장 짧은 칸)과
**가중치**(전체 평균·최고·최저·비어 있는 지표) 카드도 만들었다.
기준 상수 `CHUNK_SLOTS`(9)·`CHUNK_MIN_LEN`(20)은 엔진 `app/core/config.py`를 베낀 값이다.

> **지금 이 기능이 있었다면 바로 걸릴 상황이 하나 생겼다** — 머지 뒤 `customers`가
> 103명인데 `member_chunk`는 900개다. 회원당 8.7칸이라 "페르소나 칸 유실"에 잡힌다.
> 로그인 기능이 만든 계정 3개에 페르소나가 없기 때문인데, 정상인지 아닌지 판단이 필요하다.

### E. 문서 갱신 ⚠ 낡은 서술이 그대로 돌아왔다

`CLAUDE.md`·`AGENTS.md`에서 **사실과 어긋난 서술을 고친 것**이라, 되돌아온 지금은
문서가 다시 틀린 상태다. 특히:

- `life.db` 크기가 **216MB**로 적혀 있다 → 실제 약 **73MB**
- "git에 포함되지 않음"으로 적혀 있다 → 실제 **Git LFS**(포인터면 `git lfs pull` 먼저)
- 설치 명령이 `pip install fastapi uvicorn …` → 실제 **`pip install -r requirements.txt`**
- `services/engine.py`가 끌어오는 모듈 목록에 `scoring`이 빠져 있다
- `/api/survey` 채점을 "규칙만"이라 적었지만 실제로는 **규칙 우선, 미달 시 LLM 보조**

패치가 `salvage-web/CLAUDE.md.patch`에 그대로 있으니, 분석 채팅(A) 관련 문단만 빼면
대부분 지금도 그대로 쓸 수 있다.

---

## 실제로 진행한 순서 (2026-09-02)

1. **엔진** `Life-Embed-jh` — 미커밋분을 `SALVAGE.md` + `salvage/`로 빼고 폐기,
   `origin/dev-embed`를 **fast-forward** 머지(`7c1b97d 랜덤 uid 로그인 처리`).
2. 머지 직후 `data/life.db`가 **133바이트 LFS 포인터** 상태여서 `git lfs pull`로 복구
   (73,150,464 바이트, 26개 표 · `user_login` 포함 확인).
3. **웹** `Life-Web` — 위 항목들을 `salvage-web/`으로 빼고 5개 파일 폐기.
4. `git merge origin/dev-user-store` — 충돌 **1건**.
5. 충돌 해결 후 커밋 `aac8f76`.

### 유일한 충돌과 해결

`frontend/admin.html`의 `openMember()` 구조 분해 한 줄에서 양쪽이 각각 키를 추가했다.

```js
// HEAD (가중치 박스)         : preferences_initial 추가
// origin/dev-user-store      : likes, searches, chats 추가
// 해결 — 양쪽 다 남겼다:
const { customer, preferences, preferences_initial, persona, likes, searches, chats }
  = await api('/members/' + id);
```

### 검증

- `POST /api/login` → 200 (임시 계정 발급·로그인 동작). 확인용으로 만든 계정은 지웠다.
- `GET /api/admin/members/C001` → `likes`·`searches`·`chats`가 실제로 실려 온다.
- FastAPI 앱 import 통과, 라우터 6개(`auth` 포함) 등록 확인.

---

## ⚠ 머지가 남긴 회귀 — `preferences_initial`

**증상** — 회원 상세의 가중치 박스에서 *고정 블록*(`.sliders.fixed`)과
*가입 때와 달라진 칸 표시*(`.w-item.moved`, 점 •)가 **오류 없이 조용히 사라진다.**

**원인** — 이 기능은 커밋 `7f86f38`로 웹에 들어와 있지만, 값을 공급하던 쪽은
**엔진의 미커밋 변경분**이었다. 그 변경분(`salvage/admin.py.patch`)을 걷어내면서
`get_member()`가 `preferences_initial`을 더 이상 주지 않는다:

```python
# 지금 app/features/admin.py 의 get_member() 가 주는 것
{"customer", "preferences", "persona", "likes", "searches", "chats"}
#  preferences_initial 없음
```

화면 코드가 `preferences_initial?.[k]` / `|| {}`로 방어하고 있어 **에러는 안 나고 기능만 빠진다.**

**고치려면** — 엔진 `app/features/admin.py`의 `get_member()`에 한 줄을 되살린다.

```python
"preferences_initial": customer_preferences_initial(customer_id) or {},
```

`app/core/db.py`의 `customer_preferences_initial`도 함께 필요하다.
둘 다 `life-db-backup/salvage/`의 `admin.py.patch` · `db.py.patch`에 있다.
**엔진 저장소에 커밋이 필요한 작업이라 손대지 않았다.**
