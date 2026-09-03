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
from services.persona_type import profile as survey_profile, answers_to_persona

router = APIRouter(prefix="/api", tags=["로그인"])


class LoginRequest(BaseModel):
    loginId: str
    password: str


class SignupRequest(BaseModel):
    loginId: str
    password: str
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

    customer_id = engine_signup(body.loginId, body.password, payload)
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
