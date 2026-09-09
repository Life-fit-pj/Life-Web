# Life-Web 웹 서버 이미지 (DOCKER.md 6번)
#
# 베이스는 엔진과 같은 python:3.12-slim 이다. 이 저장소의 requirements.txt 로도
# 휠 가용성 dry-run 을 따로 돌려 확인했다 — pandas 3.0.5 · cryptography 50.0.1
# 포함 26개 전부 cp312 휠, exit 0. 컴파일이 없으므로 단일 스테이지로 충분하다.
FROM python:3.12-slim

# PYTHONDONTWRITEBYTECODE — 이미지 안에 .pyc 를 남기지 않는다
# PYTHONUNBUFFERED     — 로그가 버퍼에 갇히지 않고 stdout 으로 바로 나간다 (14번)
# PYTHONIOENCODING     — main.py 가 sys.stdout.encoding 을 읽어 UTF-8 인지 확인하고
#                        아니면 reconfigure 한다. 값이 None 이면 그 줄에서 죽으므로
#                        컨테이너에서도 확실히 utf-8 이 잡히게 못박아 둔다 (15번)
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONIOENCODING=utf-8 \
    PIP_NO_CACHE_DIR=1

WORKDIR /code

# 요구사항만 먼저 넣고 설치한다 — 소스가 바뀌어도 이 레이어는 캐시에 남는다
COPY requirements.txt ./
# --only-binary=:all: 로 소스 배포를 금지한다. 휠 없는 패키지가 새로 들어오면
# 몇 분씩 조용히 컴파일하는 대신 여기서 즉시 실패한다
RUN pip install --only-binary=:all: -r requirements.txt

# ── 애플리케이션 코드 ─────────────────────────
COPY main.py ./
COPY routers ./routers
COPY services ./services

# ── 정적 자산 (Phase 1 에서 프론트가 Vercel 로 빠지면 이 블록만 지운다) ──
#   frontend/          index.html · JS · CSS. main.py 가 "/" 에 mount 한다
#   data/LH평면도      411MB, 262개 PNG. main.py 가 "/LH평면도" 에 mount 하는데
#                      StaticFiles 는 폴더가 없으면 기동 시점에 죽는다
#   data/*.csv         동_좌표.csv, LH 평면도 목록 CSV(floorplan.py 가 import 시 읽는다)
# 이미지가 커지는 값은 거의 전부 이 두 줄이다. 볼륨으로 돌리려면 여기만 손대면 된다
COPY frontend ./frontend
COPY data ./data

# 엔진의 life.db 가 붙을 자리. 웹 자신의 data/ 를 가리지 않도록 /code/data 가
# 아닌 별도 경로에 붙인다 — 같은 곳에 마운트하면 위에서 구운 LH평면도가 가려진다.
#   docker run -v <Life-Embed-jh>/data:/engine/data:ro -e LIFE_DB_PATH=/engine/data/life.db
# services/typespot.py 가 LIFE_DB_PATH 를 최우선으로 보고, 없으면 형제 폴더를
# 뒤지는데 컨테이너 안에는 형제 폴더가 없다. 못 찾아도 죽지 않고 빈 결과를
# 돌려주므로(하드코딩 금지 정책) 마운트 실패가 조용히 넘어간다 — 17번에서 확인한다
VOLUME ["/engine/data"]

EXPOSE 5000

# 컨테이너 안에서는 127.0.0.1 이 아니라 0.0.0.0 으로 열어야 바깥에서 붙는다
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5000"]
