# Last updated: 2026-09-09
"""
POST /api/auth/login       Supabase 로그인 → customer_id 연결 (가입 전이면 404)
GET  /api/auth/signed-up   이 Supabase 사용자가 이미 가입돼 있나 (회원가입 화면 진입 판단)
POST /api/signup           Supabase 인증 + 기본정보/설문으로 새 계정 생성
GET  /api/auth/me          로그인한 회원의 기본정보 (마이페이지)

로그인 자체(이메일/비번, 구글)는 프론트가 Supabase SDK 로 직접 처리한다. 여기는 그렇게
발급된 access token(Authorization: Bearer ...)을 받아 Life-Embed-jh 의 /auth/* 에 그대로
넘기는 다리다 — 비밀번호는 이 서버를 거치지 않는다.
"""

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from services.engine import auth_login, get_customer, signed_up, signup as engine_signup
from services.persona_type import profile as survey_profile, answers_to_persona

router = APIRouter(prefix="/api", tags=["로그인"])


def _bearer_token(authorization: str = Header(...)) -> str:
    """Authorization: Bearer <supabase access token> 에서 토큰만 뽑는다."""
    return authorization.removeprefix("Bearer ").strip()


class SignupRequest(BaseModel):
    # 기본정보 — customers 표 화이트리스트(Life-Embed-jh app/features/admin.py
    # CUSTOMER_FIELDS)와 이름이 같아야 한다. 이름/성별/나이/거주지만 필수로 본다.
    name: str
    gender: str          # "M" | "F"
    age: int
    city: str
    cityDong: str
    workCity: str | None = None
    workDong: str | None = None
    phone: str | None = None
    email: str | None = None
    # 설문 15문항 원본 답변(p1~g2). 건너뛰면 빈 딕셔너리 — 그래도 계정은 만들어진다.
    answers: dict = {}


@router.post("/auth/login")
def do_login(token: str = Depends(_bearer_token)):
    customer_id = auth_login(token)
    if customer_id is None:
        raise HTTPException(404, "가입된 계정이 아니다")
    return {"customerId": customer_id}


@router.get("/auth/signed-up")
def check_signed_up(token: str = Depends(_bearer_token)):
    """회원가입 화면 진입 시 부른다 — 이미 가입돼 있으면 로그인으로 돌려보낸다."""
    return {"signedUp": signed_up(token)}


@router.post("/signup")
def do_signup(body: SignupRequest, token: str = Depends(_bearer_token)):
    """계정 생성 + customer 신규 적재를 한 번에 한다.

    설문(answers)이 있으면 persona_type.profile() 로 7지표 가중치를 규칙 기반으로
    뽑고, answers_to_persona() 로 persona 9칸 중 채울 수 있는 칸만 채운다.
    둘 다 엔진의 create_member() 화이트리스트(admin.py CUSTOMER_FIELDS/
    PREFERENCE_FIELDS/PERSONA_FIELDS)에 맞는 키만 담아 보낸다.
    """
    weights = survey_profile(body.answers)["weights"] if body.answers else {}
    persona = answers_to_persona(body.answers) if body.answers else {}

    payload = {
        "name": body.name, "gender": body.gender, "age": body.age,
        "city": body.city, "city_dong": body.cityDong,
        "work_city": body.workCity, "work_dong": body.workDong,
        "phone": body.phone, "email": body.email,
        **weights, **persona,
    }

    customer_id = engine_signup(token, payload)
    if customer_id is None:
        raise HTTPException(409, "이미 가입된 계정이다")
    return {"customerId": customer_id}


@router.get("/auth/me")
def me(customerId: str):
    """마이페이지에서 부른다. customers 표 한 줄(이름/이메일/가입일 등)을 그대로 돌려준다."""
    found = get_customer(customerId)
    if found is None:
        raise HTTPException(404, "그런 회원이 없다")
    return found
