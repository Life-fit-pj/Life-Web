"""
GET   /api/admin/members                  회원 100명 목록
GET   /api/admin/members/{customer_id}    회원 한 명 (기본정보+조건+페르소나)
GET   /api/admin/regions                  행정동 427개 목록
GET   /api/admin/regions/{gu}/{dong}      행정동 하나의 지표 12개
GET   /api/admin/members/{customer_id}/preview   이 회원 조건으로 추천 TOP 5
PATCH /api/admin/members/{customer_id}    회원 수정
PATCH /api/admin/regions/{gu}/{dong}      행정동 수정

조회는 관리자 토큰만, 수정은 토큰 + 쓰기 스위치를 요구한다 (6단계).
"""

import os
import secrets
from pathlib import Path

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, Header

from services.engine import (
    get_member, list_members, get_region, list_regions,
    update_member, update_region, preview_member, similar_members, InvalidPatch,
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
