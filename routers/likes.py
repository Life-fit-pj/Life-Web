"""
POST   /api/likes   좋아요 추가
DELETE /api/likes   좋아요 취소
"""

from fastapi import APIRouter
from pydantic import BaseModel

from services.engine import like_region, unlike_region

router = APIRouter(prefix="/api/likes", tags=["좋아요"])


class LikeRequest(BaseModel):
    anonId: str
    gu: str
    dong: str


@router.post("")
def add(body: LikeRequest):
    like_region(body.anonId, body.gu, body.dong)
    return {"ok": True}


@router.delete("")
def remove(body: LikeRequest):
    unlike_region(body.anonId, body.gu, body.dong)
    return {"ok": True}
