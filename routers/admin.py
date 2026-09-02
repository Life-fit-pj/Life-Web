"""
GET   /api/admin/summary                  대시보드 집계 (첫 화면)
GET   /api/admin/logs                     관리자 수정 이력
GET   /api/admin/members                  회원 100명 목록
GET   /api/admin/members/{customer_id}    회원 한 명 (기본정보+조건+페르소나)
GET   /api/admin/regions                  행정동 427개 목록
GET   /api/admin/regions/{gu}/{dong}      행정동 하나의 지표 12개
GET   /api/admin/members/{customer_id}/preview   이 회원 조건으로 추천 TOP 5
PATCH /api/admin/members/{customer_id}    회원 수정
PATCH /api/admin/regions/{gu}/{dong}      행정동 수정
POST  /api/admin/logins/backfill          기존 회원에게 로그인 계정 일괄 발급

조회는 관리자 토큰만, 수정은 토큰 + 쓰기 스위치를 요구한다 (6단계).
"""

import os
import secrets
from pathlib import Path

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, Header

from services.engine import (
    get_member, list_members, get_region, list_regions,
    update_member, update_region, preview_member, similar_members, InvalidPatch, health,
    clear_caches, privacy_preview, dashboard, recent_logs, backfill_logins,
)

# Life-Web/.env 를 읽는다 (main.py 가 어느 위치에서 실행되든 경로가 고정되도록)
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "dev-admin-token")
ADMIN_WRITE_ENABLED = os.environ.get("ADMIN_WRITE_ENABLED", "1") == "1"


def check_admin(authorization: str = Header(None)):
    """헤더의 Bearer 토큰이 ADMIN_TOKEN 과 같은지 본다. 로그인이 아니라 정해진 값 하나만 확인한다."""
    token = (authorization or "").removeprefix("Bearer ").strip()
    if not secrets.compare_digest(token, ADMIN_TOKEN):
        raise HTTPException(401, "관리자 토큰이 맞지 않는다")


def check_writable():
    """실수로 데이터가 망가지는 걸 막는 비상 스위치. .env 한 글자로 쓰기를 잠글 수 있다."""
    if not ADMIN_WRITE_ENABLED:
        raise HTTPException(405, "지금은 관리자 쓰기가 잠겨 있다")


router = APIRouter(prefix="/api/admin", tags=["관리자"])


@router.get("/members", dependencies=[Depends(check_admin)])
def admin_members():
    return list_members()


# 없는 회원을 물었을 때는 `None`을 그대로 돌려주지 말고 404를 낸다.
@router.get("/members/{customer_id}", dependencies=[Depends(check_admin)])
def admin_member(customer_id: str):
    found = get_member(customer_id)
    if found is None:
        raise HTTPException(status_code=404, detail="그런 회원이 없다")
    return found


@router.get("/regions", dependencies=[Depends(check_admin)])
def admin_regions():
    return list_regions()


@router.get("/regions/{gu}/{dong}", dependencies=[Depends(check_admin)])
def admin_region(gu: str, dong: str):
    found = get_region(gu, dong)
    if found is None:
        raise HTTPException(status_code=404, detail="그런 행정동이 없다")
    return found


# 회원정보/지역 수정 — 토큰 + 쓰기 스위치 둘 다 통과해야 한다
@router.patch("/members/{customer_id}", dependencies=[Depends(check_admin), Depends(check_writable)])
def admin_update_member(customer_id: str, patch: dict):
    try:
        updated = update_member(customer_id, patch)
    except InvalidPatch as e:
        raise HTTPException(status_code=422, detail=e.errors)
    if updated is None:
        raise HTTPException(status_code=404, detail="그런 회원이 없다")
    return updated



@router.patch("/regions/{gu}/{dong}", dependencies=[Depends(check_admin), Depends(check_writable)])
def admin_update_region(gu: str, dong: str, patch: dict):
    try:
        updated = update_region(gu, dong, patch)
    except InvalidPatch as e:
        raise HTTPException(status_code=422, detail=e.errors)
    if updated is None:
        raise HTTPException(status_code=404, detail="그런 행정동이 없다")
    return updated


@router.get("/members/{customer_id}/preview", dependencies=[Depends(check_admin)])
def admin_preview_member(customer_id: str):
    """이 회원 조건으로 추천을 돌려본다. 아무것도 안 고친다."""
    result = preview_member(customer_id)
    if result is None:
        raise HTTPException(status_code=404, detail="그런 회원이 없다")
    return result


@router.get("/members/{customer_id}/similar", dependencies=[Depends(check_admin)])
def admin_similar_members(customer_id: str):
    """이 회원과 페르소나가 비슷한 회원들."""
    result = similar_members(customer_id)
    if result is None:
        raise HTTPException(status_code=404, detail="그런 회원이 없다")
    return result


@router.get("/health")
def admin_health():
    """프로세스가 살아 있나. 토큰도 필요 없다 — 이건 가장 바깥 확인이다."""
    return {"ok": True}


@router.get("/ready", dependencies=[Depends(check_admin)])
def admin_ready():
    """일할 준비가 됐나 — DB가 진짜 DB인지, 캐시가 데워져 있는지.

    쓰기 스위치는 이 저장소의 .env 가 갖고 있으므로 엔진이 아니라 여기서 붙인다.
    """
    return {**health(), "write_enabled": ADMIN_WRITE_ENABLED}


@router.post("/cache/clear", dependencies=[Depends(check_admin), Depends(check_writable)])
def admin_clear_cache():
    """캐시를 버린다. 다음 요청 때 새로 계산된다."""
    return clear_caches()


@router.get("/members/{customer_id}/privacy", dependencies=[Depends(check_admin)])
def admin_privacy_preview(customer_id: str):
    """원본 vs 가린 글. 관리자만 본다."""
    result = privacy_preview(customer_id)
    if result is None:
        raise HTTPException(status_code=404, detail="그런 회원이 없다")
    return result

@router.get("/summary", dependencies=[Depends(check_admin)])
def admin_summary():
    """첫 화면(대시보드)이 쓰는 집계 한 덩어리. 아무것도 안 고친다."""
    return {**dashboard(), "write_enabled": ADMIN_WRITE_ENABLED}


@router.get("/logs", dependencies=[Depends(check_admin)])
def admin_logs(limit: int = 30):
    """관리자 수정 이력. 최근 것이 위로 온다."""
    return recent_logs(min(max(limit, 1), 200))


@router.post("/logins/backfill", dependencies=[Depends(check_admin), Depends(check_writable)])
def admin_backfill_logins():
    """로그인 계정이 없는 기존 회원(C001~C099 등)에게 임시 아이디/비번을 발급한다.

    새로 만든 계정만 응답에 담긴다 — 이미 있던 사람은 건드리지 않으므로 여러 번 눌러도 안전하다.
    """
    return backfill_logins()
