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

# [요약] (2026-09-02) 관리자 화면 첨삭 — 대시보드 정리 + 시스템 이슈 카드

> 전체 상세 기록(단계별 원본/수정 코드, 문법검사 명령, 화면 스크린샷 텍스트)은 길어서
> 여기서는 **무엇을 왜 했는지**와 **지금도 유효한 함정**만 남긴다. 코드를 다시 봐야 하면
> `git log -p -- frontend/admin.html` 로 그 시점 커밋을 보면 된다.

**고친 파일은 `frontend/admin.html` 하나** (일체형 단일 페이지, HTML+CSS+JS 한 파일).
서버(`routers/`, `services/`)는 안 건드렸다.

**무엇을 바꿨나**

| | 전 | 후 |
|---|---|---|
| 대시보드 | KPI 박스 5개 + 카드 7장 | 카드 5장 (숫자는 제목 줄 `회원 <b>105</b>명`으로, 7지표 평균은 카드 힌트로 자리만 옮김) |
| 시스템 | 상태 · 캐시 · 수정 이력 | 상태 · **이슈**(자동 진단) · **청킹** · **가중치** · 캐시 · 수정 이력 |

**이슈 카드가 하는 일** — `/api/admin/summary`가 이미 주는 숫자만으로 적재 상태를 스스로 진단한다.
`noProfile(나이 빈 회원) = noPrefs(선호도 없는 회원) = asMembers(빈 페르소나 칸÷9)`가 전부 같은
값이면 "가입이 덜 끝난 계정 N개"로 한 줄 묶고, 어긋나면 "일부만 실리다 만" 진짜 유실로 보고
따로 띄운다. 서버에 이슈 표가 없어 **사람이 적어 넣거나 해결 표시를 하는 기능은 없다** —
지금 보이는 것만 자동으로 잡아낸다 (엔진에 `issue` 표를 만들면 확장 가능, 5-3 참고).

**지금도 유효한 함정 다섯 가지**

1. **`a || b`로 빈 값을 못 거른다** — 파이썬 엔진이 `None`을 `str(None)`으로 바꿔 보내서
   화면에는 `"None"`이라는 **다섯 글자짜리 멀쩡한 문자열**이 도착한다. `||`는 "거짓 같은 값"일
   때만 오른쪽을 쓰는데 `'None'`은 참으로 취급된다. `v === 'None'`을 직접 검사해야 한다.
   근본 원인은 엔진 `app/features/admin.py`의 `_pairs()`(지금은 `pairs()`) 함수 —
   `[{"label": str(a), ...} for a, b in cur.fetchall()]` — 인데, 차트 7종이 전부 이 함수를
   쓰고 있어 고치려면 엔진 저장소 커밋이 필요하다. 아직 안 고쳤다.
2. **`innerHTML`에 넣는 값은 습관적으로 `esc()`** — 태그를 일부러 넣을 때(`<small>` 단위 표시
   등)만 예외로 뺀다.
3. **`.reduce()`는 시작값 없이 빈 배열에 쓰면 오류** — `list.length ? list.reduce(...) : null`처럼
   먼저 길이를 확인해야 한다.
4. **CSS는 이름(`var(--bad)`)으로만 색을 쓴다** — 라이트/다크 두 벌(`@media` + `:root[data-theme]`)을
   자동으로 따라가려면 하드코딩 색을 쓰면 안 된다.
5. **`$('#id')`가 사라진 자리에 남은 호출은 `null.innerHTML`로 즉시 죽는다** — 상자를 지울 땐
   그 상자를 채우던 JS 코드도 반드시 같이 지운다.

**아직 안 한 것 (엔진 저장소 커밋이 필요해서 미룸)**

- `preferences_initial`(가입 시 vs 지금 가중치 비교) 데이터가 머지 때 빠짐 — 살릴 패치가
  `C:\Users\lecra\Desktop\life-db-backup\salvage\`에 있음.
- 위 1번(`_pairs()`의 `str(None)`) 근본 수정.
- 이슈를 사람이 적어 넣는 기능(엔진에 `issue` 표 + `POST /api/admin/issues` 필요).

---

# (2026-09-03) 교안 — 회원 탭: 관리자가 회원을 손수 추가하는 기능

## 0. 이 교안은 무엇인가, 왜 하는가

프로젝트를 봐 준 선생님의 피드백이다.

> 로그인이 있고 회원가입을 전제한 설문이 있으면, 관리자가 상품을 추가하는 것 같은 기능이
> 있는지? 실무자들에게는 일반적으로 관리자 페이지에서 상품이나 필요한 객체를 추가하는
> 기능이 필요함. 그리고 추가된 데이터가 청킹하고 벡터화 되어 저장할 수 있는 기능이 있는지.
> 없다면 추가하면 좋음(**증분 임베딩** 때문). 리뷰나 장대한 건 시간상 무리, 회원을 임의로
> 추가하는 기능을 넣을 수 있다면 베스트.

**여기서 "상품"에 해당하는 것이 이 프로젝트에서는 "회원"이다.** 지금 관리자 화면의
회원 탭은 **이미 있는 회원을 고쳐 쓰는 기능(`PATCH`)만** 있다 — 목록에서 골라 폼을
채우고 `저장`을 누르는 식이다. **처음부터 새 회원을 만드는 기능(`POST`)은 없다.**
이 교안은 그 `POST` 한 칸을 만든다.

> **회원가입(`signup.html`)과는 다른 기능이다.** 회원가입은 사용자 본인이 직접 15문항
> 설문에 답하는 화면이고, 지금 서버가 아직 없어 프론트가 임시로 `/api/predict`의 검색어
> 경로로 우회하고 있다(`CLAUDE.md`의 "다음에 할 일" 1번). 이 교안이 만드는 것은 그것과
> 별개로 **관리자가 화면에서 직접 값을 타이핑해 넣는** 기능이다. 다만 저장하는 자리
> (`customers` / `user_preferences` / `member_chunk` 세 표)는 같아서, 이 기능을 다 만들고
> 나면 회원가입 백엔드를 붙일 때 재사용할 수 있는 조각(새 `customer_id` 발급, INSERT,
> 청킹+임베딩 호출)이 이미 마련돼 있는 셈이다.

**증분 임베딩(incremental embedding)이 뭔가** — "회원 한 명이 늘 때마다 900개 청크
전체를 다시 벡터로 만들지 않고, 그 한 명 몫만 만들어 끼워 넣는다"는 뜻이다. 이미
`app/engine/resync.py`의 `resync_member()`가 이 일을 하고 있다(관리자가 페르소나 글을
고칠 때마다 그 한 명만 다시 임베딩한다 — `app/features/admin.py`의 `update_member()`가
부른다). **이번에 만드는 "회원 추가" 기능은 이 함수를 재료로 그대로 갖다 쓴다** — 새로
만들 필요가 없다는 뜻이다.

## 1. 시작하기 전에 확인해 둔 사실

**① 회원 데이터는 표 세 개에 나뉘어 저장된다** (`CLAUDE.md`의 "회원 데이터 3계층"과 같음)

| 표 | 무엇 | 지금 이 교안에서 |
|---|---|---|
| `customers` | 이름·성별·나이·연락처·거주지 등 기본정보 | 새 행 INSERT |
| `user_preferences` | 7지표 가중치(녹지·안전·교통·상권·의료·교육·문화) + 그 `_초기` 값 + 주거조건(건물유형 등) | 새 행 INSERT |
| `member_chunk` | 페르소나 9칸을 쪼갠 글 + 벡터 | `resync_member()`가 만들어 줌 |

**② 세 표 다 "없으면 만든다"는 함수가 지금까지 없었다** — `update_member()`는 전제가
"이미 있는 회원을 고친다"라서 전부 `UPDATE`문이다(`app/core/db.py`의 `_run_update`).
로그인 계정을 붙이는 `pick_customer_for_login()`조차 "빈 계정은 절대 새로 만들지 않고
항상 기존 회원에 붙인다"고 주석에 적혀 있다. **그래서 이번이 이 저장소 최초의
"회원을 진짜로 새로 만드는" 코드다.**

**③ `customer_id`는 `C` + 3자리 숫자다** — 지금 DB에는 `C001`~`C105`까지 있다
(`C101`~`C105`는 지난 교안에서 다룬, 로그인만 있고 나머지가 빈 계정 5개). 새 회원은
그다음 번호(`C106`부터)를 자동으로 받아야 한다. 사람이 직접 아이디를 정하게 하면
겹치는 값을 낼 수 있어서 위험하다.

**④ 세 표 모두 `customer_id` 말고는 `NOT NULL`이 없다** — 직접 확인했다
(`PRAGMA table_info`). 즉 **이름 하나만 있어도 저장은 된다.** 다만 페르소나를
하나도 안 쓰면 이 회원은 "이웃 찾기(벡터 유사도)"에서 영원히 안 잡힌다 — 값이
없어서가 아니라 **벡터 자체가 없어서**다.

**⑤ `MIN_LENGTH = 20`을 잊으면 안 된다** (`app/core/config.py`) — 페르소나 글을
20자 미만으로 쓰면 `make_chunks()`가 그 칸을 **조용히 버린다.** 저장은 되는데
(`member_chunk`에 안 들어갈 뿐 원본 텍스트 자체를 막는 검사는 없음) 벡터가 안 생겨서
나중에 "분명히 썼는데 왜 이웃 찾기에 안 걸리지"라는 혼란이 생긴다. **관리자 화면
단계에서 20자 미만이면 저장 전에 막아 주는 게 낫다** — 지난 교안 3-3의 이슈 카드가
바로 이 상황(짧은 페르소나 칸)을 잡아내는 것과 같은 이유다.

## 2. 무엇을 만드는가 — 요청이 지나가는 길

```
[admin.html] "+ 추가" 버튼 → 빈 폼 채움 → POST /api/admin/members
      │
      ▼
[Life-Web] routers/admin.py           (토큰 + 쓰기 스위치 확인)
      │
      ▼
[Life-Web] services/engine.py         (엔진 함수 이름만 그대로 통과)
      │
      ▼
[Life-Embed-jh] app/features/admin.py 의 create_member()  ← 오늘 새로 만드는 함수
      │
      ├─ _next_customer_id()          새 아이디 발급 (C106, C107 …)
      ├─ insert_customer()            customers 표에 INSERT   ← db.py에 새로 추가
      ├─ insert_preferences()         user_preferences 표에 INSERT ← db.py에 새로 추가
      └─ resync_member()              member_chunk 에 청킹+임베딩 (이미 있는 함수, 그대로 재사용)
```

고칠 파일은 넷이다. **엔진 저장소(`Life-Embed-jh`)에 커밋이 필요한 작업**이라는 점이
지난 교안과 다르다 — DB에 새 행을 만드는 일이라 화면 쪽에서만 막을 수 없다.

| 저장소 | 파일 | 무엇을 |
|---|---|---|
| `Life-Embed-jh` | `app/core/db.py` | `insert_customer`, `insert_preferences` 추가 |
| `Life-Embed-jh` | `app/features/admin.py` | `create_member()` 추가 |
| `Life-Web` | `services/engine.py` | import 줄에 `create_member` 한 칸 추가 |
| `Life-Web` | `routers/admin.py` | `POST /api/admin/members` 라우트 추가 |
| `Life-Web` | `frontend/admin.html` | "+ 추가" 버튼 + 새 회원 폼 |

## 3. 엔진 쪽 — `db.py`에 INSERT 함수 추가

`update_customer`/`update_preferences`는 이미 있는 행을 `UPDATE`하는 `_run_update`를
쓴다(`app/core/db.py` 590번째 줄 근처). **INSERT용 짝 함수가 없으므로 새로 만든다.**
`Ctrl+F`로 **`def update_preferences`**를 찾아 그 아래에 붙여 넣는다.

```python
# ── 새로 추가 ──
def _run_insert(table, customer_id, patch, allowed):
    """patch 중 allowed(화이트리스트)에 있는 칸만 골라 INSERT 한다.

    _run_update 의 INSERT 버전이다. customer_id 는 항상 첫 칸으로 같이 넣는다.
    """
    fields = [name for name in allowed if name in patch]
    cols = ["customer_id"] + fields
    quoted = ", ".join(f'"{c}"' for c in cols)
    marks = ", ".join("?" * len(cols))
    values = [customer_id] + [patch[name] for name in fields]

    get_con().execute(f'INSERT INTO "{table}" ({quoted}) VALUES ({marks})', values)
    get_con().commit()


def insert_customer(customer_id, patch, allowed):
    return _run_insert("customers", customer_id, patch, allowed)


def insert_preferences(customer_id, patch, allowed):
    return _run_insert("user_preferences", customer_id, patch, allowed)
```

**왜 `allowed`(화이트리스트)를 또 받나** — `_run_update`와 똑같은 이유다. `patch`는
결국 사용자가 화면에서 입력해 보낸 값이다. 화이트리스트 없이 `patch`의 키를 그대로
SQL 칼럼 이름 자리에 넣으면, 이론적으로 `patch`에 없는 칼럼 이름을 끼워 넣는
공격(SQL 인젝션)에 열리게 된다. `allowed`에 있는 이름만 통과시키면 그 위험이 없다.

## 4. 엔진 쪽 — `admin.py`에 `create_member()` 추가

`Ctrl+F`로 **`def update_member`**를 찾는다(`app/features/admin.py`, 132번째 줄 근처).
그 함수 앞이나 뒤 아무 데나 아래를 통째로 붙여 넣는다.

**먼저 파일 위쪽 import 줄에 두 개를 보탠다.**

```python
# ── 원본 (1~12번째 줄) ──
from app.core.db import (
    customer_list, customer_one, customer_preferences, customer_preferences_initial,
    customer_persona, region_list, region_one,
    update_customer, update_preferences, update_region as db_update_region,
    column_percentile, write_admin_log, ensure_admin_log, dicts, one,
    list_likes, list_search_history, list_chat_history,
)

from app.core.config import INDICATORS, CHUNK_COLUMNS
from app.engine.recommend import INDICATOR_COLUMNS
from app.engine.resync import resync_member
from app.core.db import get_con
```

```python
# ── 수정 ──
from app.core.db import (
    customer_list, customer_one, customer_preferences, customer_preferences_initial,
    customer_persona, region_list, region_one,
    update_customer, update_preferences, update_region as db_update_region,
    insert_customer, insert_preferences,                       # ← 추가
    column_percentile, write_admin_log, ensure_admin_log, dicts, one,
    list_likes, list_search_history, list_chat_history,
)

from app.core.config import INDICATORS, CHUNK_COLUMNS, MIN_LENGTH   # ← MIN_LENGTH 추가
from app.engine.recommend import INDICATOR_COLUMNS
from app.engine.resync import resync_member
from app.core.db import get_con
```

**그다음 함수 본체.**

```python
# ── 새로 추가 ──
def _next_customer_id() -> str:
    """지금 있는 가장 큰 번호 + 1. 'C105' 다음은 'C106'.

    C101~C105 처럼 로그인만 발급된 빈 계정도 번호를 이미 썼으므로
    그대로 이어서 쓴다 — 번호를 비워 두지 않는다.
    """
    rows = dicts("SELECT customer_id FROM customers")
    nums = [int(r["customer_id"][1:]) for r in rows if r["customer_id"][1:].isdigit()]
    return f"C{max(nums, default=0) + 1:03d}"


def create_member(payload: dict) -> dict:
    """회원 한 명을 손으로 새로 만든다. update_member 와의 차이는 딱 하나 —

    거긴 "이미 있는 행을 고친다(UPDATE)"고 여긴 "행 자체가 없다(INSERT)"는 전제다.
    페르소나를 하나라도 받으면 그 자리에서 청킹 + 임베딩까지 끝낸다
    (resync_member 재사용 — 900개를 다시 만들지 않고 이 한 명 몫만 만드는
    '증분 임베딩'이 이미 그 함수 안에 있다)
    """
    _validate(payload)     # 나이·가중치 범위는 기존 규칙을 그대로 쓴다

    # 20자 미만 페르소나는 make_chunks() 가 조용히 버린다 —
    # 여기서 먼저 막아야 "썼는데 왜 안 잡히지"가 안 생긴다
    persona_patch = {k: v for k, v in payload.items()
                      if k in PERSONA_FIELDS and (v or "").strip()}
    too_short = {k: f"{MIN_LENGTH}자 이상 써야 벡터가 만들어진다 (지금 {len(v.strip())}자)"
                 for k, v in persona_patch.items() if len(v.strip()) < MIN_LENGTH}
    if too_short:
        raise InvalidPatch(too_short)

    customer_id = _next_customer_id()
    insert_customer(customer_id, payload, CUSTOMER_FIELDS)

    # 가중치를 하나라도 받았으면 '_초기' 칸도 같은 값으로 같이 채운다 —
    # 방금 가입한 회원은 "지금 값"과 "가입 때 값"이 아직 같아야 정상이다
    indicator_patch = {k: v for k, v in payload.items() if k in PREFERENCE_FIELDS}
    if indicator_patch:
        pref_row = dict(indicator_patch)
        pref_row.update({f"{k}_초기": v for k, v in indicator_patch.items()})
        insert_preferences(customer_id, pref_row, tuple(pref_row.keys()))

    if persona_patch:
        row = {k: persona_patch.get(k, "") for k in PERSONA_FIELDS}
        row["customer_id"] = customer_id
        resync_member(get_con(), customer_id, row)   # ← 청킹 + 임베딩 + 저장

    write_admin_log("member", customer_id, payload)
    _clear_caches()
    return get_member(customer_id)
```

**하나씩 짚어 보면**

- **`_validate(payload)`를 그대로 재사용했다** — `update_member`가 쓰던 나이(0~120),
  가중치(1~5) 범위 검사다. 새로 만들 이유가 없어서 그대로 불렀다.
- **`persona_patch`를 만들 때 `(v or "").strip()`** — 빈 문자열이나 공백만 있는 칸은
  "안 쓴 것"으로 친다. `PERSONA_FIELDS`는 이미 파일 위쪽에 `tuple(CHUNK_COLUMNS)`로
  정의돼 있다(23번째 줄) — 새로 안 만들어도 된다.
- **`insert_preferences`에 넘기는 `allowed`가 `PREFERENCE_FIELDS`가 아니라
  `tuple(pref_row.keys())`인 이유** — `PREFERENCE_FIELDS`는 지표 7개뿐이라 `_초기`
  칸 이름이 없다. `pref_row`는 우리가 코드 안에서 직접 만든(사용자가 키 이름까지
  마음대로 정할 수 없는) 딕셔너리라 그 키를 그대로 화이트리스트로 써도 안전하다.
- **`resync_member`에 넘기는 `row`는 9칸을 전부 채운다** — 안 쓴 칸은 빈 문자열
  `""`로 채운다. `make_chunks()`가 빈 문자열은 알아서 걸러 내므로(20자 미만) 문제없다.
- **왜 `create_member`가 실패해도 `customers`에는 이미 들어간 채로 남을 수 있나** —
  이 함수는 트랜잭션으로 세 INSERT를 하나로 묶지 않는다(`insert_customer`,
  `insert_preferences`, `resync_member`가 각각 `commit()`한다). 지금 규모(회원
  100여 명, 관리자만 쓰는 내부 도구)에서는 실용적으로 넘어가지만, **가운데서 오류가
  나면 이름만 있고 가중치는 없는 회원이 남을 수 있다는 뜻**이다. 이슈 카드(지난
  교안 3장)가 바로 이런 상태를 "가입이 덜 끝난 회원"으로 잡아내므로 완전히 안
  보이는 상태로 남지는 않는다. 여러 명을 한꺼번에 넣는 기능으로 커지면 그때는
  `con.execute("BEGIN")` ~ `COMMIT`으로 묶는 걸 고려해야 한다.

## 5. 웹 쪽 — `services/engine.py`에 한 줄 추가

`Ctrl+F`로 **`from app.features.admin import`**를 찾는다.

```python
# ── 원본 ──
from app.features.admin import (
    get_member, list_members, get_region, list_regions,
    update_member, update_region, preview_member, similar_members, InvalidPatch, health,
    clear_caches, privacy_preview, dashboard, recent_logs,
)
```

```python
# ── 수정 ──
from app.features.admin import (
    get_member, list_members, get_region, list_regions,
    update_member, update_region, preview_member, similar_members, InvalidPatch, health,
    clear_caches, privacy_preview, dashboard, recent_logs, create_member,   # ← 추가
)
```

`services/engine.py`는 **엔진 저장소를 아는 유일한 파일**이라는 규칙(`CLAUDE.md`)을
따른 것이다. `routers/admin.py`는 이 파일을 거쳐서만 엔진 함수를 쓴다.

## 6. 웹 쪽 — 라우터에 `POST /api/admin/members` 추가

`Ctrl+F`로 **`@router.get("/members", dependencies`**를 찾는다(`routers/admin.py`
53번째 줄 근처). 그 아래에 새 라우트를 추가한다.

```python
# ── 원본 (24~28번째 줄, import) ──
from services.engine import (
    get_member, list_members, get_region, list_regions,
    update_member, update_region, preview_member, similar_members, InvalidPatch, health,
    clear_caches, privacy_preview, dashboard, recent_logs, backfill_logins, analysis_engine,
)
```

```python
# ── 수정 ──
from services.engine import (
    get_member, list_members, get_region, list_regions,
    update_member, update_region, preview_member, similar_members, InvalidPatch, health,
    clear_caches, privacy_preview, dashboard, recent_logs, backfill_logins, analysis_engine,
    create_member,                                                        # ← 추가
)
```

```python
# ── 새 라우트 (admin_members 함수 바로 아래) ──
@router.post("/members", dependencies=[Depends(check_admin), Depends(check_writable)])
def admin_create_member(payload: dict):
    """관리자가 회원 한 명을 새로 만든다. 이름 정도만 있어도 저장은 된다.

    422 면 payload 안에 규칙에 안 맞는 칸(나이 범위, 20자 미만 페르소나 등)이
    있다는 뜻 — detail 을 보면 어느 칸인지 나온다.
    """
    try:
        return create_member(payload)
    except InvalidPatch as e:
        raise HTTPException(status_code=422, detail=e.errors)
```

기존 `PATCH /members/{customer_id}`와 나란히 두는 게 자연스러우니 그 근처에 놓는다.
**쓰기 스위치(`check_writable`)를 그대로 걸었다** — 회원을 새로 만드는 것도 "쓰기"라서,
`.env`의 `ADMIN_WRITE_ENABLED=0`으로 전체 쓰기를 잠그면 이것도 같이 잠겨야 맞다.

## 7. 프론트 — 회원 탭에 "+ 추가" 버튼과 빈 폼

### 7-1. 버튼 자리 만들기

`Ctrl+F`로 **`id="member-search"`**를 찾는다(478번째 줄 근처, 회원 탭 사이드바 위쪽).

```html
<!-- ── 원본 ── -->
<div class="side-top">
  <input type="text" id="member-search" placeholder="이름 · 아이디 검색">
  <div class="side-count" id="member-count"></div>
</div>
```

```html
<!-- ── 수정 ── -->
<div class="side-top">
  <input type="text" id="member-search" placeholder="이름 · 아이디 검색">
  <button class="btn sm" id="member-add">+ 추가</button>
  <div class="side-count" id="member-count"></div>
</div>
```

### 7-2. 클릭 이벤트 연결하기

`Ctrl+F`로 **`$('#member-rows').addEventListener`**를 찾는다(935번째 줄 근처). 바로
아래에 한 줄을 보탠다.

```js
// ── 추가 (기존 두 addEventListener 아래) ──
$('#member-add').addEventListener('click', openNewMemberForm);
```

### 7-3. 빈 폼을 그리는 함수 — `openMember`의 "빈 버전"

`Ctrl+F`로 **`async function openMember(id)`**를 찾는다(940번째 줄). 그 함수 바로
**위**에 새 함수를 추가한다. `openMember`가 이미 있는 회원 값을 채워서 그리는
함수라면, 이번 건 **값 없이 빈 칸으로만** 같은 모양을 그린다고 보면 된다.

```js
// ── 새로 추가 ──
function openNewMemberForm() {
  currentMember = null;
  markMemberRow();          // 목록에서 켜져 있던 회원 표시를 끈다
  const board = $('#member-detail');

  const editable = Object.keys(CUSTOMER_LABELS).filter(k => !READONLY.includes(k));
  const basic = editable.map(k => `
    <div>
      <label class="lab" for="f-${k}">${esc(CUSTOMER_LABELS[k])}</label>
      ${k === 'gender'
        ? `<select id="f-${k}" name="${k}">
             <option value="">선택 안 함</option>
             <option value="M">남성</option>
             <option value="F">여성</option>
           </select>`
        : `<input id="f-${k}" name="${k}" type="${k === 'age' ? 'number' : 'text'}">`}
      <div class="err" data-err="${k}"></div>
    </div>`).join('');

  // 기본값 3으로 둔다 — 안 건드리면 "보통"으로 저장된다
  const sliders = INDICATORS.map(k => `
    <div class="w-item">
      <div class="slider-row">
        <span class="s-lab">${esc(k)}</span>
        <input type="range" class="w-bar" min="1" max="5" step="0.01" value="3"
               oninput="this.nextElementSibling.value = this.value">
        <input type="number" class="w-num" name="${k}" min="1" max="5" step="any" value="3"
               oninput="this.previousElementSibling.value = this.value">
      </div>
    </div>`).join('');

  const personas = Object.keys(PERSONA_LABELS).map(k => `
    <details class="persona" ${k === 'persona' ? 'open' : ''}>
      <summary>${esc(PERSONA_LABELS[k])}<span class="len">0자</span></summary>
      <div class="body">
        <textarea name="${k}"
          oninput="this.closest('details').querySelector('.len').textContent = this.value.length + '자'"></textarea>
        <div class="err" data-err="${k}"></div>
      </div>
    </details>`).join('');

  board.innerHTML = `
    <div class="detail-head">
      <h3>새 회원</h3>
      <span class="id">아이디는 저장할 때 자동으로 붙는다</span>
      <div class="acts">
        <button class="btn sm primary" id="member-create"
          ${WRITE_ENABLED ? '' : 'disabled title="쓰기가 잠겨 있다"'}>추가</button>
      </div>
    </div>
    <div class="detail-body" id="member-form">
      ${card('기본 정보', `<div class="grid2">${basic}</div>`, '이름만 있어도 저장된다')}
      ${card('희망 조건 <span class="hint">1~5</span>', `<div class="sliders">${sliders}</div>`,
             '기본값 3 · 안 건드리면 그대로 저장된다')}
      ${card('페르소나 <span class="hint">서술형</span>', personas,
             `20자 미만으로 쓰면 저장은 되지만 벡터는 안 만들어진다 (MIN_LENGTH=20)`)}
    </div>`;

  $('#member-create').addEventListener('click', createMember);
}
```

**`openMember`와 무엇이 다른가**

- `initial = {...}`을 안 채운다 — 새 회원은 "처음 값"이라는 게 없다. 그래서 저장 로직도
  `collectPatch()`(달라진 칸만 골라내기)가 아니라 **채워진 칸을 전부 모으는** 새 함수
  (`createMember`)를 따로 쓴다. `collectPatch`를 그대로 쓰면 "달라진 게 없다"고 잘못
  판단해서 아무것도 안 보낸다 — `initial`이 비어 있으면 모든 입력값이 `initial[name]`
  (=`undefined`)과 달라 보이긴 하지만, 의미상으로도 "새로 만드는 것"과 "고치는 것"은
  다른 동작이라 함수를 나누는 쪽이 헷갈리지 않는다.
- `activityBody`(좋아요·검색·채팅), `추천 돌려보기`/`비슷한 회원`/`개인정보 점검`
  버튼은 아직 없다 — 전부 **이미 존재하는 회원**을 전제로 하는 기능이라 새 회원 폼에는
  자리가 없다. 추가에 성공하면 목록에서 그 회원을 다시 열어(`openMember`) 그때부터는
  똑같이 쓸 수 있다.

### 7-4. 저장 함수 — `createMember`

`Ctrl+F`로 **`async function saveMember(id)`**를 찾는다(1073번째 줄). 그 함수
**위나 아래**에 추가한다.

```js
// ── 새로 추가 ──
async function createMember() {
  const payload = {};
  $$('#member-form [name]').forEach(el => {
    const raw = el.type === 'number'
      ? (el.value === '' ? null : Number(el.value))
      : el.value.trim();
    if (raw !== '' && raw !== null) payload[el.name] = raw;
  });
  if (!payload.name) return toast('이름은 있어야 합니다');

  clearErrors();
  let created;
  try {
    created = await api('/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return showErrors(e);
  }

  members = await api('/members');
  renderMemberRows(members);
  await openMember(created.customer.customer_id);   // 방금 만든 회원을 바로 연다
  loaded.dash = false;                                // 대시보드 숫자가 낡았다
  refreshStatus();
  toast(`${created.customer.customer_id} 로 추가했습니다`);
}
```

**`saveMember`와 나란히 놓고 비교하면**

| | `saveMember` (고치기) | `createMember` (추가하기) |
|---|---|---|
| 무엇을 모으나 | `collectPatch()` — **달라진** 칸만 | 채워진 칸 **전부** |
| 요청 | `PATCH /members/{id}` | `POST /members` (아이디가 아직 없다) |
| 성공 후 | 같은 `id`를 다시 연다 | 서버가 새로 준 `customer_id`를 열어야 한다 —
그래서 `created.customer.customer_id`를 쓴다 (6장의 `get_member(customer_id)` 반환
모양이 `{"customer": {...}, "preferences": {...}, ...}`이기 때문) |

## 8. 확인하기

**① 문법 검사** (지난 교안 0장의 명령을 그대로 쓴다)

```bash
py -c "import io,re,subprocess,os; s=io.open('frontend/admin.html',encoding='utf-8').read(); m=re.findall(r'<script>(.*?)</script>',s,re.S); o=os.path.join(os.environ['TEMP'],'chk.js'); io.open(o,'w',encoding='utf-8').write('\n'.join(m)); r=subprocess.run(['node','--check',o],capture_output=True,text=True); print('OK' if r.returncode==0 else r.stderr)"
```

**② 서버 재시작** — 엔진 쪽(`app/features/admin.py`, `app/core/db.py`)을 고쳤으므로
`--reload`가 잡아도 좋고, 확실히 하려면 uvicorn을 껐다 켠다.

**③ 화면에서 눌러보기**

1. 관리자 화면 → 회원 탭 → `+ 추가` 클릭 → 빈 폼이 뜨는지
2. 이름만 "테스트"로 넣고 `추가` 클릭 → 토스트에 `C106 로 추가했습니다`(번호는
   실제 마지막 번호+1) → 왼쪽 목록 맨 아래(또는 정렬 위치)에 새로 뜨는지
3. 그 회원을 다시 열어 페르소나 칸에 20자 미만 문장을 넣고 저장 → 저장은 되지만
   **시스템 탭의 "청킹 → 채워진 칸" 숫자가 그 칸만큼 안 늘어나는지** (5장에서 설명한
   MIN_LENGTH 함정이 실제로 재현되는지 직접 눈으로 확인하는 것)
4. 페르소나의 `총괄 요약`에 20자 이상 문장을 제대로 써서 저장 → 그 회원 상세에서
   `비슷한 회원` 버튼을 눌러 결과가 나오는지(= 벡터가 실제로 만들어졌다는 증거)
5. 시스템 탭 → 청킹 카드의 `총 청크` 숫자가 방금 늘어난 칸 수만큼 올랐는지

**④ 콘솔에서 직접 확인하고 싶으면** (`Life-Embed-jh` 안에서)

```bash
py -c "
from app.core.db import get_con
con = get_con()
print(con.execute(\"SELECT * FROM customers ORDER BY customer_id DESC LIMIT 3\").fetchall())
print(con.execute(\"SELECT customer_id, category, LENGTH(text) FROM member_chunk WHERE customer_id = 'C106'\").fetchall())
"
```

## 9. 한계 — 지금은 MVP다

- **동시에 두 관리자가 동시에 `+ 추가`를 누르면 같은 번호(`C106`)를 받을 수 있다** —
  `_next_customer_id()`가 조회와 삽입 사이에 잠금이 없다. 지금은 관리자 한두 명이
  쓰는 내부 도구라 실용적으로 넘어갔지만, 여러 명이 동시에 쓸 수도 있는 화면이 되면
  `customer_id`에 `UNIQUE` 제약(지금은 `PRIMARY KEY`라 이미 걸려 있음)에 걸려 뒤에
  시도한 쪽이 오류를 받는 정도로 끝난다 — 데이터가 겹쳐 쓰이지는 않는다.
- **로그인 계정(아이디/비번)은 같이 안 만든다** — 필요하면 기존 `POST
  /api/admin/logins/backfill`을 다시 눌러 발급하거나, `create_member` 끝에
  `create_login()` 호출을 추가하면 된다.
- **세 INSERT가 한 트랜잭션으로 안 묶여 있다** (4장 마지막 설명 참고) — 지금 규모에서는
  감수할 만하지만, 이슈 카드가 있으니 실패해도 "가입이 덜 끝난 회원"으로 눈에는 띈다.
- **주거조건(건물유형·거래유형·예산 등 8칸)은 이번 폼에 안 넣었다** — `insert_preferences`
  자체는 받을 수 있지만(화이트리스트를 그때그때 만들기 때문), 폼에 입력칸을 안 만들었다.
  선생님 피드백의 핵심(추가 + 청킹/임베딩)을 시간 안에 보여 주는 게 우선이라 뺐다.
  나중에 필요하면 7-3의 `basic` 블록 옆에 같은 패턴으로 칸을 늘리면 된다.

## 10. 개념 정리

| 개념 | 한 줄 설명 | 나온 곳 |
|---|---|---|
| 화이트리스트 기반 INSERT/UPDATE | `patch`의 키를 그대로 SQL에 안 쓰고, 허용된 이름만 통과시킨다 | 3장 |
| 증분 임베딩 | 새로 생긴 데이터 한 건만 벡터로 만들어 끼워 넣는다(전체 재계산 안 함) | 0장, `resync_member` |
| 청킹(chunking) | 긴 서술형 글을 검색 가능한 단위(카테고리별 문단)로 쪼갠다 | 1장 ⑤ |
| `_초기` 칸 | "가입 때 값"을 "지금 값"과 따로 보관해 나중에 비교한다 | 4장 |
| MVP(Minimum Viable Product) | 시간 안에 핵심(추가 + 벡터화)만 보여 주고 나머지는 뒤로 미룬다 | 9장 |

## 11. 기록 남기는 법

이 기능을 실제로 만들고 나면:

1. **`Life-Web/CLAUDE.md`** — "다음에 할 일" 1번(회원가입 백엔드)에 "관리자 수동 추가
   (`POST /api/admin/members`)는 이미 있음 — 새 `customer_id` 발급·INSERT·`resync_member`
   호출 조각을 그대로 재사용 가능"이라고 한 줄 보태면 다음 사람이 바퀴를 다시 안 만든다.
2. **이 파일(`study.md`)** — 실제로 막힌 지점(예: 트랜잭션 관련 오류, 문자 인코딩,
   `resync_member`가 기대하는 `row` 모양이 안 맞아 난 오류 등)을 여기 이어서 적는다.
