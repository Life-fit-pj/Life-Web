# 회원가입 연동 임시 비활성화 (2026-09-03)

> **해제됨 (2026-09-03)** — `Life-Embed-jh`가 `work_ds` 브랜치 `2e570c0 auth.py 파일 수정`
> 커밋에서 `id_exists` / `signup` / `google_login` 세 함수를 구현해, 아래 조치를 되돌렸다.
> `services/engine.py`의 세 import와 `check_login_id` / `signup` / `google_signin` 래퍼,
> `routers/auth.py`의 `/api/check-id` · `/api/signup` · `/api/login/google` 본문이 모두
> 복원된 상태다. 이 문서는 같은 증상(엔진 함수 부재로 인한 기동 실패)이 다시 났을 때를
> 위한 기록으로만 남긴다.

## 무슨 일이 있었나

`uvicorn main:app --reload --port 5000`이 서버 기동 단계에서 죽었다. 마지막 줄:

```
ImportError: cannot import name 'id_exists' from 'app.features.auth'
(...Life-Embed-jh\app\features\auth.py)
```

## 원인 — 두 저장소 진행 상황이 어긋남

- `Life-Web`(`update-jh` 브랜치)은 `f1570ce 회원가입 창 생성` 커밋에서
  `services/engine.py`가 형제 저장소 `Life-Embed-jh`의 `app.features.auth`에서
  `id_exists` / `signup` / `google_login` 세 함수를 가져오도록 이미 고쳐져 있었다.
- 그런데 `Life-Embed-jh`(`jihye` 브랜치)의 `app/features/auth.py`에는 `login`,
  `backfill_logins` 두 함수만 있다. 세 함수는 `main` · `dev-dasom` · `dev-embed` ·
  `update-ds` 등 어느 브랜치·커밋에도 없다 — 엔진 쪽 구현이 아예 안 된 상태였다.

즉 회원가입 UI/라우트는 웹 쪽에 먼저 들어왔는데 이를 뒷받침할 엔진 함수가 없어서,
`main.py`가 라우터를 로드하는 시점(`routers/admin.py` → `services/engine.py`)에
import가 그대로 실패해 **서버 전체가 기동조차 안 됐다.**

## 조치 — 회원가입 연동만 임시로 끊었다 (로그인은 그대로 둠)

`login`(임시 로그인 발급)과 `backfill_logins`는 엔진에 실제로 있으므로 건드리지 않았다.
`id_exists` / `signup` / `google_login`에 의존하는 부분만 잘라냈다.

### [services/engine.py](services/engine.py)

**전**
```python
from app.features.auth import (
    login as auth_login, backfill_logins,
    id_exists as auth_id_exists, signup as auth_signup, google_login as auth_google_login,
)
...
def check_login_id(login_id):
    """아이디 중복확인. 이미 쓰이고 있으면 True."""
    return auth_id_exists(login_id)


def signup(login_id, password):
    """아이디+비밀번호로 새 계정을 만든다. 이미 있는 아이디면 None."""
    return auth_signup(login_id, password)


def google_signin(email):
    """구글 계정으로 로그인/가입한다. 이메일 하나로 계정을 찾거나 새로 만든다."""
    return auth_google_login(email)
```

**후**
```python
from app.features.auth import login as auth_login, backfill_logins
# id_exists / signup / google_login 은 Life-Embed-jh(jihye 브랜치) auth.py에 아직 없어서
# 임시 비활성화했다 — 자세한 경위는 SIGNUP_DISABLED.md 참고
...
# check_login_id / signup / google_signin — 회원가입 연동과 함께 임시 비활성화.
# SIGNUP_DISABLED.md 참고.
```

### [routers/auth.py](routers/auth.py)

**전** — `check_login_id` / `engine_signup` / `google_signin`을 import해서 세 라우트가
실제로 엔진을 호출했다 (`/api/check-id`, `/api/signup`, `/api/login/google`).

**후** — 세 라우트는 남겨 뒀지만 본문을 엔진 호출 없이 `501 Not Implemented`만
돌려주도록 바꿨다. 라우트 자체를 지우면 프론트에서 404(존재하지 않는 API)로 보이는데,
지금은 "아직 안 붙었을 뿐"이라는 게 더 정확해서 501을 택했다.

```python
@router.get("/check-id")
def check_id(loginId: str):
    """아이디 중복확인. 엔진(Life-Embed-jh)에 id_exists가 아직 없어 임시 비활성화."""
    raise HTTPException(501, "회원가입 기능은 아직 연동되지 않았다")


@router.post("/signup")
def do_signup(body: SignupRequest):
    """엔진(Life-Embed-jh)에 signup이 아직 없어 임시 비활성화."""
    raise HTTPException(501, "회원가입 기능은 아직 연동되지 않았다")


@router.post("/login/google")
def do_google_login(body: GoogleLoginRequest):
    """엔진(Life-Embed-jh)에 google_login이 아직 없어 임시 비활성화."""
    raise HTTPException(501, "구글 로그인 기능은 아직 연동되지 않았다")
```

구글 OAuth 검증 코드(`google.auth`/`google.oauth2` 호출, `GOOGLE_CLIENT_ID` 읽기)도
같이 들어냈다 — 지금은 엔진이 없어서 어차피 검증까지 못 가므로, 안 쓰는 코드를 남겨두면
나중에 "이거 왜 있지"가 된다. 복원 시 `git show f1570ce:routers/auth.py`로 원래
구현을 그대로 가져올 수 있다.

## 영향받는 화면

`frontend/ui/menu.js`의 로그인 모달 안 **중복확인** / **회원가입** / **구글로그인**
버튼이 이제 501 에러를 받는다(서버가 죽지 않고 에러 메시지만 온다). **로그인**(아이디+비번,
`/api/login`)과 **마이페이지**(`/api/auth/me`)는 그대로 정상 동작한다.
`frontend/signup.html`(회원가입 설문 화면)은 원래도 이 API들을 안 부르고
`/api/predict`로 우회하고 있었으므로 이번 변경과 무관하다.

## 원복하는 법

`Life-Embed-jh`의 `app/features/auth.py`에 아래 세 함수가 생기면:

```python
def id_exists(login_id: str) -> bool: ...
def signup(login_id: str, password: str) -> str | None: ...   # 성공 시 customer_id, 중복이면 None
def google_login(email: str) -> str: ...                       # 있으면 찾고 없으면 새로 만들어 customer_id 반환
```

1. `services/engine.py`: import 줄과 `check_login_id` / `signup` / `google_signin` 세
   함수를 `git show f1570ce:services/engine.py`에서 그대로 복원.
2. `routers/auth.py`: import와 세 라우트 본문(구글 OAuth 검증 포함)을
   `git show f1570ce:routers/auth.py`에서 그대로 복원.
3. `py -m uvicorn main:app --reload --port 5000`으로 기동 확인 후, 로그인 모달에서
   중복확인 → 회원가입 → 구글로그인 순으로 직접 눌러 확인.
