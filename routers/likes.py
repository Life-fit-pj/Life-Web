"""
GET    /api/likes   좋아요한 동네 목록 조회
POST   /api/likes   좋아요 추가
DELETE /api/likes   좋아요 취소
"""

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from services import quota
from services.engine import ANON_ID, get_likes, like_region, unlike_region

router = APIRouter(prefix="/api/likes", tags=["좋아요"])


class LikeRequest(BaseModel):
    anonId: str = Field(pattern=ANON_ID)
    gu: str
    dong: str


def _check_owner(request: Request, anon_id: str) -> None:
    """회원 번호로 된 좋아요는 본인만 읽고 쓴다. 좋아요는 채팅의 "내가 좋아한 동네와 닮은 곳"과 성향 제안의 재료다"""
    if not quota.own(request, anon_id):
        raise HTTPException(403, "본인 것만 볼 수 있다")


@router.get("")
def list_(request: Request, anonId: str = Query(pattern=ANON_ID)):
    _check_owner(request, anonId)
    return get_likes(anonId)


@router.post("")
def add(body: LikeRequest, request: Request):
    _check_owner(request, body.anonId)
    like_region(body.anonId, body.gu, body.dong)
    return {"ok": True}


@router.delete("")
def remove(body: LikeRequest, request: Request):
    _check_owner(request, body.anonId)
    unlike_region(body.anonId, body.gu, body.dong)
    return {"ok": True}
