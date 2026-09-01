"""
LIFE,FIT 웹 서버 (FastAPI)

추천 계산과 LLM 은 life-fit-embed 가 담당한다.
이 파일은 요청을 받아 services/ 에 넘기고, 결과를 화면 형식으로 바꿔 돌려준다.

실행:  uvicorn main:app --reload --port 5000
"""

import sys
# Windows 콘솔의 기본 코드페이지(cp949)는 이모지를 못 담는다.
# services/*.py 가 로드 시점에 찍는 ✅/❌ print 가 그대로 두면 UnicodeEncodeError 로
# 서버 임포트 자체를 죽인다 — 여기서 먼저 UTF-8 로 바꿔 둔다
if sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

import mimetypes
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/css", ".css")

import os
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

# ==========================================
# 1. 폴더 절대 경로 설정
# ==========================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, 'data')
FRONTEND_DIR = os.path.join(BASE_DIR, 'frontend')

app = FastAPI(title="LIFE,FIT")


# ==========================================
# 2. API 라우트: 예측 및 추천 수행
# ==========================================

from routers import admin, lifetype, recommend, likes

app.include_router(recommend.router)
app.include_router(lifetype.router)
app.include_router(admin.router)
app.include_router(likes.router)


# ==========================================
# 3. 프론트엔드 정적 서빙 라우트
# ==========================================
@app.get("/")
def serve_index():
    return FileResponse(os.path.join(FRONTEND_DIR, 'index.html'))


# 평면도는 data/ 안에 있어 따로 길을 열어 준다
app.mount("/LH평면도", StaticFiles(directory=os.path.join(DATA_DIR, 'LH평면도')))

# frontend 전체를 뿌린다. 맨 마지막에 둬야 위의 경로들을 가로채지 않는다
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True))



