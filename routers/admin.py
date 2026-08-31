"""
GET  /api/admin/members                  회원 100명 목록
GET  /api/admin/members/{customer_id}    회원 한 명 (기본정보+조건+페르소나)
GET  /api/admin/regions                  행정동 427개 목록
GET  /api/admin/regions/{gu}/{dong}      행정동 하나의 지표 12개
"""

from fastapi import APIRouter, HTTPException
from services.engine import get_member, list_members, get_region, list_regions

router = APIRouter(prefix="/api/admin", tags=["관리자"])

@router.get("/members")
def admin_members():
    return list_members()


# 없는 회원을 물었을 때는 `None`을 그대로 돌려주지 말고 404를 낸다.
@router.get("/members/{customer_id}")
def admin_member(customer_id: str):
    found = get_member(customer_id)
    if found is None:
        raise HTTPException(status_code=404, detail="그런 회원이 없다")
    return found


@router.get("/regions")
def admin_regions():
    return list_regions()


@router.get("/regions/{gu}/{dong}")
def admin_region(gu: str, dong: str):
    found = get_region(gu, dong)
    if found is None:
        raise HTTPException(status_code=404, detail="그런 행정동이 없다")
    return found