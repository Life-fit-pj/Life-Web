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


class NoCacheStaticFiles(StaticFiles):
    """프론트 파일(HTML/JS/CSS)을 고쳐도 브라우저가 예전 버전을 계속 쓰는 걸 막는다.

    StaticFiles 는 기본적으로 Cache-Control 을 안 보낸다. 그런데 Last-Modified 만 있으면
    브라우저가 "방금 바뀐 파일이니 한동안은 새로 안 받아도 된다"고 스스로 판단하는
    경우(RFC 7234 휴리스틱 캐싱)가 있어, 강력 새로고침 없이는 방금 고친 JS/HTML이
    반영 안 된 것처럼 보일 수 있다. 이 저장소엔 빌드 단계가 없어 캐시로 아낄 트래픽도
    거의 없으므로, 개발 중 혼란을 없애는 쪽을 택한다.
    """
    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        response.headers["Cache-Control"] = "no-store"
        return response


# ==========================================
# 2. API 라우트: 예측 및 추천 수행
# ==========================================

from routers import admin, lifetype, recommend, likes, survey, auth

app.include_router(recommend.router)
app.include_router(lifetype.router)
app.include_router(survey.router)
app.include_router(admin.router)
app.include_router(likes.router)
app.include_router(auth.router)


# ==========================================
# 3. 프론트엔드 정적 서빙 라우트
# ==========================================
@app.get("/")
def serve_index():
    return FileResponse(os.path.join(FRONTEND_DIR, 'index.html'))


# 평면도는 data/ 안에 있어 따로 길을 열어 준다
app.mount("/LH평면도", StaticFiles(directory=os.path.join(DATA_DIR, 'LH평면도')))

# frontend 전체를 뿌린다. 맨 마지막에 둬야 위의 경로들을 가로채지 않는다
app.mount("/", NoCacheStaticFiles(directory=FRONTEND_DIR, html=True))



