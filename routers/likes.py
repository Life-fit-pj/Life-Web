"""
GET    /api/likes   좋아요한 동네 목록 조회
POST   /api/likes   좋아요 추가
DELETE /api/likes   좋아요 취소
"""

from fastapi import APIRouter
from pydantic import BaseModel

from services.engine import get_likes, like_region, unlike_region

router = APIRouter(prefix="/api/likes", tags=["좋아요"])


class LikeRequest(BaseModel):
    anonId: str
    gu: str
    dong: str


@router.get("")
def list_(anonId: str):
    return get_likes(anonId)


@router.post("")
def add(body: LikeRequest):
    like_region(body.anonId, body.gu, body.dong)
    return {"ok": True}


@router.delete("")
def remove(body: LikeRequest):
    unlike_region(body.anonId, body.gu, body.dong)
    return {"ok": True}
