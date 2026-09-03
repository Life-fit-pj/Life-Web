"""
POST /api/login          로그인 (처음 보는 아이디면 그 자리에서 발급도 겸한다)
GET  /api/check-id       아이디 중복확인 (회원가입 화면)
POST /api/signup         아이디+비밀번호 회원가입
POST /api/login/google   구글 계정 로그인/가입
GET  /api/auth/me        로그인한 회원의 기본정보 (마이페이지)
"""

import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.engine import auth_login, get_customer, check_login_id, signup as engine_signup, google_signin

# Life-Web/.env 를 읽는다 (admin.py 와 같은 방식 — main.py 가 어느 위치에서
# 실행되든 경로가 고정되도록 파일 기준 상대경로를 쓴다)
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

# 구글 클라우드 콘솔에서 발급받는 OAuth 클라이언트 ID. 카카오맵 키처럼 프론트(index.html)에도
# 같은 값을 넣어야 한다 — 거기서는 어떤 앱이 로그인창을 띄우는지, 여기서는 그 앱이 발급한
# 토큰이 맞는지 확인하는 데 쓰인다. 비어 있으면 구글 로그인은 501 로 막힌다(아직 키 미설정)
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")

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
    """아이디 중복확인. 회원가입 화면의 '중복확인' 버튼이 부른다."""
    return {"available": not check_login_id(loginId)}


@router.post("/signup")
def do_signup(body: SignupRequest):
    customer_id = engine_signup(body.loginId, body.password)
    if customer_id is None:
        raise HTTPException(409, "이미 사용 중인 아이디다")
    return {"customerId": customer_id}


@router.post("/login/google")
def do_google_login(body: GoogleLoginRequest):
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(501, "구글 로그인 클라이언트 ID가 아직 설정되지 않았다 (.env의 GOOGLE_CLIENT_ID)")

    # 토큰을 보낸 사람 말을 그대로 믿지 않는다 — 구글 서버에 서명을 검증시켜
    # 진짜 구글이 발급한 토큰인지, 우리 앱(GOOGLE_CLIENT_ID) 앞으로 발급된 것인지 확인한다
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token as google_id_token

    try:
        payload = google_id_token.verify_oauth2_token(
            body.credential, google_requests.Request(), GOOGLE_CLIENT_ID
        )
    except ValueError:
        raise HTTPException(401, "구글 로그인 확인에 실패했다")

    email = payload.get("email")
    if not email or not payload.get("email_verified"):
        raise HTTPException(401, "확인된 구글 이메일이 없다")

    customer_id = google_signin(email)
    return {"customerId": customer_id}


@router.get("/auth/me")
def me(customerId: str):
    """마이페이지에서 부른다. customers 표 한 줄(이름/이메일/가입일 등)을 그대로 돌려준다."""
    found = get_customer(customerId)
    if found is None:
        raise HTTPException(404, "그런 회원이 없다")
    return found
