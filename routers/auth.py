"""
POST /api/login          로그인 (처음 보는 아이디면 그 자리에서 발급도 겸한다)
GET  /api/check-id       아이디 중복확인 (회원가입 화면)
POST /api/signup         아이디+비밀번호 회원가입
GET  /api/auth/me        로그인한 회원의 기본정보 (마이페이지)
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.engine import (
    auth_login, get_customer, check_login_id, signup as engine_signup,
)

router = APIRouter(prefix="/api", tags=["로그인"])


class LoginRequest(BaseModel):
    loginId: str
    password: str


class SignupRequest(BaseModel):
    loginId: str
    password: str


@router.post("/login")
def do_login(body: LoginRequest):
    customer_id = auth_login(body.loginId, body.password)
    if customer_id is None:
        raise HTTPException(401, "아이디 또는 비밀번호가 맞지 않는다")
    return {"customerId": customer_id}


@router.get("/check-id")
def check_id(loginId: str):
    """아이디 중복확인. 회원가입 화면의 '중복확인' 버튼이 부른다."""
    return {"available": not check_login_id(loginId)}


@router.post("/signup")
def do_signup(body: SignupRequest):
    customer_id = engine_signup(body.loginId, body.password)
    if customer_id is None:
        raise HTTPException(409, "이미 사용 중인 아이디다")
    return {"customerId": customer_id}


@router.get("/auth/me")
def me(customerId: str):
    """마이페이지에서 부른다. customers 표 한 줄(이름/이메일/가입일 등)을 그대로 돌려준다."""
    found = get_customer(customerId)
    if found is None:
        raise HTTPException(404, "그런 회원이 없다")
    return found
