"""
POST /api/account/issue   임시 계정 발급
POST /api/login            로그인
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.engine import issue_account, auth_login

router = APIRouter(prefix="/api", tags=["로그인"])


class LoginRequest(BaseModel):
    loginId: str
    password: str


@router.post("/account/issue")
def issue():
    return issue_account()


@router.post("/login")
def do_login(body: LoginRequest):
    customer_id = auth_login(body.loginId, body.password)
    if customer_id is None:
        raise HTTPException(401, "아이디 또는 비밀번호가 맞지 않는다")
    return {"customerId": customer_id}
