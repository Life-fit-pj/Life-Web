"""
POST /api/login     로그인 (처음 보는 아이디면 그 자리에서 발급도 겸한다)
GET  /api/auth/me   로그인한 회원의 기본정보 (마이페이지)
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.engine import auth_login, get_customer

router = APIRouter(prefix="/api", tags=["로그인"])


class LoginRequest(BaseModel):
    loginId: str
    password: str


@router.post("/login")
def do_login(body: LoginRequest):
    customer_id = auth_login(body.loginId, body.password)
    if customer_id is None:
        raise HTTPException(401, "아이디 또는 비밀번호가 맞지 않는다")
    return {"customerId": customer_id}


@router.get("/auth/me")
def me(customerId: str):
    """마이페이지에서 부른다. customers 표 한 줄(이름/이메일/가입일 등)을 그대로 돌려준다."""
    found = get_customer(customerId)
    if found is None:
        raise HTTPException(404, "그런 회원이 없다")
    return found
