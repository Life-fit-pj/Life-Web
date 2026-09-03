"""
POST /api/login          로그인 (처음 보는 아이디면 그 자리에서 발급도 겸한다)
GET  /api/check-id       아이디 중복확인 (회원가입 화면) — 임시 비활성화, 501 반환
POST /api/signup         아이디+비밀번호 회원가입 — 임시 비활성화, 501 반환
POST /api/login/google   구글 계정 로그인/가입 — 임시 비활성화, 501 반환
GET  /api/auth/me        로그인한 회원의 기본정보 (마이페이지)

check-id/signup/login-google 세 개는 Life-Embed-jh(jihye 브랜치)의 app.features.auth에
id_exists/signup/google_login 함수가 아직 없어서 막아 뒀다. 자세한 경위는
SIGNUP_DISABLED.md 참고.
"""

from pathlib import Path

from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.engine import auth_login, get_customer

# Life-Web/.env 를 읽는다 (admin.py 와 같은 방식 — main.py 가 어느 위치에서
# 실행되든 경로가 고정되도록 파일 기준 상대경로를 쓴다)
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

router = APIRouter(prefix="/api", tags=["로그인"])


class LoginRequest(BaseModel):
    loginId: str
    password: str


class SignupRequest(BaseModel):
    loginId: str
    password: str


class GoogleLoginRequest(BaseModel):
    credential: str   # Google Identity Services 버튼이 로그인 성공 시 주는 ID 토큰(JWT)


@router.post("/login")
def do_login(body: LoginRequest):
    customer_id = auth_login(body.loginId, body.password)
    if customer_id is None:
        raise HTTPException(401, "아이디 또는 비밀번호가 맞지 않는다")
    return {"customerId": customer_id}


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


@router.get("/auth/me")
def me(customerId: str):
    """마이페이지에서 부른다. customers 표 한 줄(이름/이메일/가입일 등)을 그대로 돌려준다."""
    found = get_customer(customerId)
    if found is None:
        raise HTTPException(404, "그런 회원이 없다")
    return found
