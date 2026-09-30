"""AI 질문 한도. Claude 를 부르는 요청(검색어 추천·후속 질문)을 하루 몇 번까지만 받는다.

로그인한 회원은 customer_id 로, 아니면 접속 IP 로 센다. 회원 여부는 프론트가 보내는
Supabase 토큰을 엔진(/auth/login)에 물어 확인한다 — anonId 는 브라우저가 마음대로 바꿀 수
있어서 믿지 않는다.

# ponytail: 서버 메모리 사전이라 재시작하면 0 으로 돌아가고 서버를 여러 대 띄우면 따로 센다.
#           지난 날짜·만료 토큰도 안 지운다. 인스턴스가 늘거나 메모리가 문제되면 DB(또는 Redis)로 옮긴다.
"""

import datetime
import threading

from fastapi import HTTPException, Request

from services.engine import auth_login

MEMBER_DAILY_LIMIT = 20
GUEST_DAILY_LIMIT = 5

_lock = threading.Lock()
_counts: dict[tuple, int] = {}      # (날짜, 주체) -> 오늘 쓴 횟수
_members: dict[str, str | None] = {}  # 토큰 -> customer_id. 같은 토큰으로 매번 엔진을 부르지 않는다


def _client_ip(request: Request) -> str:
    """Railway 프록시 뒤에서는 request.client 가 프록시 주소다.
    X-Forwarded-For 의 맨 오른쪽 값은 프록시가 직접 붙인 것이라 사용자가 위조할 수 없다."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[-1].strip()
    return request.client.host if request.client else "unknown"


def _who(request: Request) -> tuple[str, int]:
    """(주체, 하루 한도). 유효한 로그인 토큰이면 회원, 아니면 IP."""
    token = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
    if token:
        if token not in _members:
            try:
                _members[token] = auth_login(token)
            except Exception:
                # 만료·위조 토큰이면 엔진이 401 을 준다 — 손님으로 센다
                _members[token] = None
        if _members[token]:
            return f"member:{_members[token]}", MEMBER_DAILY_LIMIT
    return f"ip:{_client_ip(request)}", GUEST_DAILY_LIMIT


def status(request: Request) -> dict:
    """오늘 남은 횟수. 화면이 채팅창에 보여 준다."""
    who, limit = _who(request)
    used = _counts.get((datetime.date.today(), who), 0)
    return {"limit": limit, "remaining": max(limit - used, 0), "member": who.startswith("member:")}


def consume(request: Request) -> dict:
    """한 번 쓴다. 한도를 넘었으면 429."""
    who, limit = _who(request)
    key = (datetime.date.today(), who)
    with _lock:
        used = _counts.get(key, 0)
        if used >= limit:
            raise HTTPException(
                status_code=429,
                detail={"limit": limit, "remaining": 0, "member": who.startswith("member:")},
            )
        _counts[key] = used + 1
    return {"limit": limit, "remaining": limit - used - 1, "member": who.startswith("member:")}


if __name__ == "__main__":
    # 손님 한도를 다 쓰면 429 가 나는지만 본다 (엔진 없이 돈다 — 토큰을 안 보낸다)
    from starlette.requests import Request as _Req

    req = _Req({"type": "http", "headers": [(b"x-forwarded-for", b"1.1.1.1, 9.9.9.9")], "client": ("10.0.0.1", 1)})
    for i in range(GUEST_DAILY_LIMIT):
        assert consume(req)["remaining"] == GUEST_DAILY_LIMIT - i - 1
    try:
        consume(req)
        raise AssertionError("한도를 넘었는데 429 가 안 났다")
    except HTTPException as e:
        assert e.status_code == 429
    assert status(req)["remaining"] == 0
    other = _Req({"type": "http", "headers": [], "client": ("2.2.2.2", 1)})
    assert status(other)["remaining"] == GUEST_DAILY_LIMIT
    print("quota ok")
