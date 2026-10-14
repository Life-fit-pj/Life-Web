"""
GET    /api/memory   AI가 채팅에서 기억한 거주 선호 (회원 본인 것)
DELETE /api/memory   모두 지우기. ?field=avoid&value=언덕 이면 그 조건 하나만

누구 것인지는 브라우저가 보낸 번호가 아니라 로그인 토큰으로만 정한다 — 번호는 누구나 지어 보낼 수 있고,
기억에는 예산·통근지 같은 개인 정보가 들어 있다. 채팅(routers/recommend.py)이 엔진에 넘기는 번호도 같은 규칙이다.
"""

from fastapi import APIRouter, HTTPException, Request

from services import quota
from services.engine import delete_memory, get_memory

router = APIRouter(prefix="/api/memory", tags=["장기 메모리"])


def _member(request: Request) -> str:
    customer_id = quota.member_id(request)
    if customer_id is None:
        raise HTTPException(401, "로그인한 회원만 볼 수 있다")
    return customer_id


@router.get("")
def read(request: Request):
    return get_memory(_member(request))


@router.delete("")
def clear(request: Request, field: str | None = None, value: str | None = None):
    delete_memory(_member(request), field, value)
    return {"ok": True}
