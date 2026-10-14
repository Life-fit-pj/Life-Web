"""AI 질문 한도. Claude 를 부르는 요청(검색어 추천·후속 질문)을 하루 몇 번까지만 받는다.

로그인한 회원은 customer_id 로, 아니면 접속 IP 로 센다. 회원 여부는 프론트가 보내는
Supabase 토큰을 엔진(/auth/login)에 물어 확인한다 — anonId 는 브라우저가 마음대로 바꿀 수
있어서 믿지 않는다.

# ponytail: 서버 메모리 사전이라 재시작하면 0 으로 돌아가고 서버를 여러 대 띄우면 따로 센다.
#           지난 날짜·만료 토큰도 안 지운다. 인스턴스가 늘거나 메모리가 문제되면 DB(또는 Redis)로 옮긴다.
"""

import datetime
import re
import threading

from fastapi import HTTPException, Request

from services.engine import get_me

MEMBER_DAILY_LIMIT = 20
GUEST_DAILY_LIMIT = 5

MEMBER_ID = re.compile(r"C\d+")      # 회원 번호의 모양. 엔진 app/tools/tools.py 의 MEMBER_ID 와 같은 규칙이다

_lock = threading.Lock()
_counts: dict[tuple, int] = {}      # (날짜, 주체) -> 오늘 쓴 횟수
_members: dict[str, str | None] = {}  # 토큰 -> customer_id. 같은 토큰으로 매번 엔진을 부르지 않는다
_personas: dict[str, dict] = {}       # 토큰 -> 가입 설문 글(엔진 /auth/me 의 persona). 평면도가 읽는다 — 토큰 확인과 한 왕복으로 받아 둔다


def _client_ip(request: Request) -> str:
    """Railway 엣지가 X-Real-IP 에 실제 접속 IP 를 넣는다(사용자가 보낸 값은 덮어쓴다).
    X-Forwarded-For 는 사용자가 보낸 값이 그대로 남아 위조된다 — 배포에서 확인했다(2026-09-30)."""
    return request.headers.get("x-real-ip") or (request.client.host if request.client else "unknown")


def _who(request: Request) -> tuple[str, int]:
    """(주체, 하루 한도). 유효한 로그인 토큰이면 회원, 아니면 IP.

    한 요청 안에서 consume · member_id · own 이 차례로 부르므로(/api/chat 은 셋 다) 답을 request.state 에 적어 두고
    다시 쓴다 — 토큰이 틀린 브라우저는 실패를 안 기억하기 때문에, 안 적어 두면 엔진 왕복이 요청당 세 번이 된다
    """
    cached = getattr(request.state, "quota_who", None)
    if cached is not None:
        return cached
    request.state.quota_who = _resolve_who(request)
    return request.state.quota_who


def _resolve_who(request: Request) -> tuple[str, int]:
    """_who 의 몸. 토큰을 엔진에 물어 확인한다 — 요청당 한 번만 불린다"""
    token = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
    if token:
        member = _members.get(token)
        if member is None:
            # /auth/me 는 /auth/login 과 같은 확인(토큰 → 회원 번호)을 하고 가입 설문 글까지 준다 — 둘을 따로 부르면
            # 회원 검색 한 번에 엔진 왕복이 하나 는다(2026-10-09 까지 그랬다). 글은 관리자 수정 때만 바뀌므로 토큰마다 한 번이면 된다
            try:
                me = get_me(token)
            except Exception:
                me = None           # 만료·위조 토큰이면 엔진이 401 을 준다 — 이번 요청만 손님으로 센다
            member = me["customer_id"] if me else None
            # 확인된 회원만 기억한다. 실패(엔진이 잠깐 멈춤 · 아직 가입 전)까지 기억하면 그 토큰은 웹을 다시 띄울 때까지
            # 손님으로 굳는다 — 로그인해 있는데 한도가 5번이 되고, 자기 기록 · 좋아요도 못 본다
            if member:
                _members[token] = member
                _personas[token] = me.get("persona") or {}
        if member:
            return f"member:{member}", MEMBER_DAILY_LIMIT
    return f"ip:{_client_ip(request)}", GUEST_DAILY_LIMIT


def persona(request: Request) -> dict:
    """토큰으로 확인한 회원의 가입 설문 글(칸 이름 → 글). 손님이면 빈 사전. 평면도가 가구 구성을 읽는 데 쓴다"""
    _who(request)                      # 아직 확인 전이면 여기서 확인한다(요청당 한 번)
    token = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
    return _personas.get(token, {}) if _members.get(token) else {}


def forget_member(customer_id: str) -> None:
    """관리자가 회원 글을 고쳤을 때 — 그 회원의 토큰 캐시를 비워 다음 요청이 새 글을 받게 한다"""
    for token in [t for t, m in _members.items() if m == customer_id]:
        _members.pop(token, None)
        _personas.pop(token, None)


def member_id(request: Request) -> str | None:
    """토큰으로 확인한 회원 번호. 손님이면 None.

    회원에게만 주는 것(채팅의 회원 전용 도구)은 이 값으로 가른다 — 브라우저가 보낸 anonId 는 누구나 바꿔 보낼 수 있다
    """
    who, _ = _who(request)
    return who.removeprefix("member:") if who.startswith("member:") else None


def own(request: Request, anon_id: str | None) -> bool:
    """이 요청이 그 번호의 주인인가.

    기기 번호(UUID)는 추측할 수 없으므로 늘 참이다. 회원 번호(C107)는 누구나 지어 보낼 수 있으므로,
    토큰으로 확인한 회원 번호와 같을 때만 참이다 — 기록 · 좋아요를 그 번호로 읽고 쓰기 전에 본다
    """
    return not MEMBER_ID.fullmatch(anon_id or "") or member_id(request) == anon_id


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

    req = _Req({"type": "http", "headers": [(b"x-real-ip", b"1.1.1.1")], "client": ("10.0.0.1", 1)})
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
