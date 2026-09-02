"""
POST /api/login   로그인 (처음 보는 아이디면 그 자리에서 발급도 겸한다)
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.engine import auth_login

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
