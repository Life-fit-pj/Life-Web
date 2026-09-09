# DOCKERSTUDY.md

`Life-Web`(웹 서버 + 정적 프론트) 을 컨테이너에 올리기까지 **실제로 밟은 순서**를 정리한
학습 기록이다. 기준일 2026-09-09.

작업 대장은 옆 저장소 `Life-Embed-jh/DOCKER.md` 에 두 저장소 몫이 함께 있다(이 저장소 몫은
6·7·15번). 이 문서는 그중 **웹에서 끝난 것만 순서대로 다시 읽는 문서**이고, 엔진 쪽에서만
해당되는 이야기는 **연결되는 부분이 아니면 넣지 않았다.**

엔진과 이어지는 지점은 셋뿐이다 — **베이스 이미지를 같은 것으로 맞췄다**, **엔진의
`life.db` 를 읽기 전용으로 빌려 쓴다**, **2차 추천은 엔진 컨테이너를 HTTP 로 부른다**.

## 큰 그림 — 세 단계

```
  [준비]            [1단계]              [2단계]                [3단계]
  휠 검사       →   Dockerfile      →   docker build      →   docker run
                    (설계도 작성)        (이미지 생성)          (컨테이너 실행)

                    requirements.txt ┐
                    main.py/routers/ │
                    services/        ┼─→ 이미지 520MB ─→ 컨테이너 :5010
                    frontend/ data/  │        ↑                ↑
                    .dockerignore    ┘   빌드 때 굽는다    실행 때 주입한다
                                                       .env, 엔진 data/(볼륨)
```

`Dockerfile` 은 **레시피**(글자), `이미지` 는 그대로 만들어 둔 **완제품 스냅샷**(정지),
`컨테이너` 는 그 이미지를 **실제로 돌리고 있는 프로세스**(운동).

---

## 0단계 (준비) — 베이스 이미지와 휠 검사

베이스는 **엔진과 같은 `python:3.12-slim`** 으로 맞췄다. 두 컨테이너가 같은 바닥을 쓰면
베이스 레이어를 공유해 디스크가 덜 들고, 파이썬 버전 차이로 생기는 문제도 없앤다.

다만 **패키지 목록이 다르므로 검사는 이 저장소 것으로 다시 돌려야 한다.** 엔진에서 통과한
기록은 엔진의 `requirements.txt` 기준이라 여기엔 근거가 되지 않는다.

```bash
docker run --rm -v <repo>/requirements.txt:/tmp/req.txt:ro python:3.12-slim \
  sh -c "pip install --dry-run --only-binary=:all: -r /tmp/req.txt"
# -> exit 0 (26개 전부 휠)
```

`--only-binary=:all:` 은 **"소스 배포판은 쓰지 마라"** 는 뜻이다. 이걸 걸고도 통과했다는 건
이미지 안에서 **컴파일이 한 번도 안 일어난다**는 뜻이고, 곧 **빌더 스테이지 없이 단일
스테이지로 충분하다**는 뜻이다. `pandas 3.0.5`·`numpy 2.5.3`·`cryptography 50.0.1`·`cffi`
처럼 C 확장이 있는 것들도 전부 cp312 manylinux 휠로 잡혔다.

이 검사는 **버그를 찾는 도구가 아니라 "단일 스테이지" 라는 결정의 근거**다. 실패는
"고장났다"가 아니라 "결정이 뒤집혔다"는 뜻이고, 그때는 Dockerfile 을 멀티스테이지로 다시
짜야 한다. **`requirements.txt` 나 `FROM` 이 바뀔 때만 돌리면 되고** 코드 수정과는 무관하다.

---

## 1단계 — Dockerfile 작성 (설계도)

파일: `Dockerfile`(저장소 루트). 엔트리포인트는 `main:app`, 포트 5000.

```dockerfile
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PYTHONIOENCODING=utf-8 PIP_NO_CACHE_DIR=1
WORKDIR /code

COPY requirements.txt ./
RUN pip install --only-binary=:all: -r requirements.txt

COPY main.py ./
COPY routers ./routers
COPY services ./services

# ── 정적 자산 (Phase 1 에서 프론트가 Vercel 로 빠지면 이 블록만 지운다) ──
COPY frontend ./frontend
COPY data ./data

VOLUME ["/engine/data"]
EXPOSE 5000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5000"]
```

웹이라서 특별히 정한 것이 넷 있다.

**① `COPY` 를 두 번에 나눈다.** `requirements.txt` 만 먼저 넣고 설치한 뒤 소스를 넣는다.
Docker 는 레이어 단위로 캐시하므로 **소스만 고쳤을 때 `pip install` 레이어를 통째로
재사용**한다. 순서를 반대로 하면 주석 한 줄만 고쳐도 매번 26개 패키지를 다시 받는다.

**② 정적 파일 COPY 를 한 블록에 모았다.** `frontend/` 와 `data/` 는 **이미지 안에 있어야
`main.py` 의 `app.mount` 두 줄이 뜬다.** `StaticFiles` 는 폴더가 없으면 **요청이 올 때가 아니라
기동 시점에** 죽는다. 프론트가 Vercel 로 옮겨가는 Phase 1 이 끝나면 이 블록만 지우면 된다.

**③ `PYTHONIOENCODING=utf-8` 을 넣었다.** `main.py` 첫머리가 이렇게 시작한다 —

```python
if sys.stdout.encoding.lower() != "utf-8":     # None 이면 여기서 AttributeError
    sys.stdout.reconfigure(encoding="utf-8")
```

Windows 콘솔(cp949)에서 이모지 print 가 서버를 죽이는 걸 막으려고 넣은 코드인데, `encoding`
이 `None` 인 환경에서는 **서버 import 자체가 죽는다.** 리눅스 컨테이너에서 실제로 `None` 이
되지는 않았지만 환경변수로 못박아 두는 편이 싸다.

**④ 엔진 DB 가 붙을 자리를 `/code/data` 가 아닌 `/engine/data` 로 뒀다.** 이유는 아래 질문에서.

### 질문 — 웹인데 왜 엔진의 `life.db` 가 필요한가, 어떻게 넣나

`services/engine.py` 는 KAN-69 로 `sys.path` 직접 import 를 버리고 **엔진 서버를 `httpx` 로
호출**하도록 바뀌었다. 그래서 두 저장소를 컨테이너 둘로 나눌 수 있게 됐는데, **그건 2차
추천(회원, `/api/predict`) 경로만 그렇다.** 1차 유형(비회원, `/api/lifetype`) 은 아직 엔진을
거치지 않고 DB 파일을 직접 읽는다 —

```python
# services/typespot.py:65
DB_PATH = os.environ.get("LIFE_DB_PATH") or _find("life.db")
# _find 는 형제 폴더 Life-Embed*/data 를 뒤진다 — 컨테이너 안에는 형제 폴더가 없다
```

선택지는 둘이었다.

| 안 | 내용 | 판단 |
|---|---|---|
| **마운트 + `LIFE_DB_PATH`** | 엔진의 `data/` 를 읽기 전용으로 붙이고 환경변수로 경로를 준다 | **채택.** `LIFE_DB_PATH` 가 최우선이라 **코드 수정 0줄**이다 |
| 엔진 API 로 돌리기 | 1차 채점을 엔진 엔드포인트로 만들고 웹은 `httpx` 로 부른다 | 구조는 깨끗하지만 **양쪽 저장소 코드가 바뀐다** → Docker 범위 밖, 별도 티켓 |

**마운트 위치가 `/code/data` 면 안 된다.** 거기엔 이미 이미지에 구운 `frontend`·`LH평면도`·
CSV 가 들어 있어서, 같은 곳에 볼륨을 붙이면 **그게 통째로 가려진다.** 그래서 `/engine/data`
라는 별도 경로에 붙이고 `LIFE_DB_PATH=/engine/data/life.db` 를 준다.

주의 — `typespot.py` 는 DB 를 못 찾아도 죽지 않고 **빈 결과를 돌려준다**("가짜로 정상인 척하는
편보다 비어 있는 편이 낫다"는 그 파일의 정책). 즉 **마운트 실패가 조용히 넘어간다.** 대신
응답에 `dataStatus` 가 실려 오므로 3단계에서 그걸로 확인한다.

---

## 2단계 — Docker Image 생성 (`docker build`)

### 먼저 `.dockerignore` — 엔진 것을 복사하면 안 된다

`.dockerignore` 는 **이미지 내용물을 바꾸는 파일이 아니라, 빌드가 시작되기 전에 Docker 에게
넘길 짐의 크기를 정하는 파일**이다. `docker build .` 은 **폴더 전체를 데몬으로 전송**한 뒤에야
Dockerfile 첫 줄을 읽기 때문에, 큰 폴더를 그냥 두면 빌드마다 그만큼을 넘기게 된다.

**여기서 규칙이 엔진과 정반대인 곳이 있다.**

| | Life-Embed-jh | Life-Web (이 저장소) |
|---|---|---|
| `data/` | **제외** (DB 는 볼륨, CSV 는 적재 전용) | **포함** — `LH평면도`·CSV 가 이미지에 있어야 mount 가 뜬다 |
| `frontend/` | 없음 | **포함** — `/` 에 mount 한다 |
| `.git` | 제외 | 제외 (**719MB**. 262개 PNG 가 LFS 없이 그대로 tracked 돼 있다) |
| `.env` | 제외 | 제외 (env_file / 플랫폼 환경변수로 주입) |
| 문서·캐시·에디터 설정 | 제외 | 제외 |

그래서 이 저장소에서 실제로 걷어낸 것은 `.git` 719MB 가 대부분이다. 남은 컨텍스트가 412MB
라 첫 빌드는 64초 걸렸지만, 반복 빌드는 레이어 캐시로 넘어간다.

`.env` 를 제외하는 이유는 용량이 아니라 **비밀** 때문이다. 지금 Dockerfile 은 COPY 범위가
좁아 `.env` 가 들어갈 길이 없지만, 누군가 편의상 `COPY . .` 한 줄로 바꾸는 순간 토큰이
이미지 레이어에 박힌다. **이미지를 받은 사람은 누구나 그 레이어를 꺼내볼 수 있고**, 뒤에
지우는 레이어를 추가해도 앞 레이어에 남아 소용없다. `.dockerignore` 에 넣어두면 그 파일은
애초에 데몬까지 가지 않으므로 COPY 를 어떻게 쓰든 구워질 수 없다.

### 빌드

```bash
docker build -t life-web:dev .
# -> exit 0, 64초
#    DISK USAGE 1.29GB / CONTENT SIZE 520MB
```

레이어별로 뜯어보면 무게가 어디서 오는지 분명하다.

```
430MB   COPY data ./data          ← 대부분 LH평면도 262개 PNG
193MB   RUN pip install           ← pandas · numpy · cryptography
569kB   COPY frontend ./frontend
307kB   COPY routers / services / main.py
        + python:3.12-slim 베이스 (엔진 이미지와 공유한다)
```

### 질문 — 웹 이미지가 700MB~1GB 가 되면 구동에 문제가 없나

**구동 자체(메모리·응답 속도)에는 영향이 없다.** 이미지 크기는 디스크에 놓인 레이어의
크기일 뿐이고, 컨테이너의 RAM 사용량은 **실행되는 프로세스가 결정**한다. 411MB 의 PNG 는
요청이 올 때 `StaticFiles` 가 디스크에서 스트리밍해 내보내므로 메모리에 올라가지 않는다.
3단계에서 실제로 재보니 **73.99MiB** 였다. 512MB 급 티어에서 진짜 변수는 평면도가 아니라
`pandas` import 가 잡아먹는 메모리이고, 그건 굽든 마운트하든 똑같다.

실제로 커지는 비용은 **전부 배포 쪽**이다.

| 어디 | 굽지 않았을 때 | 구웠을 때 |
|---|---|---|
| 이미지 빌드 | 정적 COPY 없음 | 첫 빌드에 430MB COPY (로컬 디스크라 십수 초) |
| **레지스트리 push/pull** | 수백 MB 적게 전송 | **배포 1회마다 수백 MB 업로드** ← 가장 체감되는 비용 |
| 플랫폼 디스크 | 적게 씀 | 이미지 보관 용량 증가 |
| 콜드 스타트 | 빠름 | 플랫폼이 이미지를 새로 pull 하면 시작이 늦어짐 |

**그래서 "굽는다"로 확정했다.** Render 는 서비스별 단독 배포라 이미지 안에 없으면 평면도가
아예 없고, 읽기 전용 자산 411MB 때문에 유료 Persistent Disk 를 붙이는 편이 더 번거롭다.
대신 **`COPY data ./data` 한 줄만 지우면 볼륨으로 뒤집을 수 있게** 정적 COPY 를 한 블록에
모아 뒀다. Render 저가 티어의 실제 이미지·디스크 상한은 `render.yaml` 전환(16번) 때 확인한다.

---

## 3단계 — Docker Container 실행 (`docker run`)

```bash
MSYS_NO_PATHCONV=1 docker run -d --name life-web-test -p 5010:5000 \
  --env-file .env \
  -e LIFE_DB_PATH=/engine/data/life.db \
  -v <Life-Embed-jh>/data:/engine/data:ro \
  life-web:dev
```

플래그들이 **2단계에서 일부러 이미지에 넣지 않은 것들을 실행 시점에 채워 넣는다.**

| 플래그 | 왜 필요한가 |
|---|---|
| `-d` | 백그라운드 실행. 터미널을 붙잡지 않는다 |
| `-p 5010:5000` | **호스트 5010 → 컨테이너 5000.** `EXPOSE` 는 표시일 뿐이라 이게 없으면 밖에서 못 붙는다. 호스트 쪽을 5010 으로 둔 건 로컬에서 직접 띄운 uvicorn(5000)과 겹치지 않게 하려는 것 |
| `--env-file .env` | `ADMIN_TOKEN`·`ADMIN_WRITE_ENABLED`·`EMBED_API_BASE` 등. `.env` 를 이미지에 안 굽기로 했으니 여기서 넣는다 |
| `-e LIFE_DB_PATH` + `-v ...:ro` | 1단계 질문에서 정한 방식. 엔진의 `data/` 를 **읽기 전용**(`:ro`)으로 붙인다 — 웹은 이 DB 를 읽기만 한다 |

컨테이너 안에서 `uvicorn` 이 `--host 0.0.0.0` 으로 뜬다. **`127.0.0.1` 로 열면 컨테이너
안에서만 접속 가능**해서 `-p` 를 줘도 밖에서 못 붙는다.

### 함정 — Git Bash 에서는 `MSYS_NO_PATHCONV=1` 이 필요하다

이걸 빼먹고 한 번 걸렸다. Git Bash 가 `/engine/data/life.db` 를 Windows 경로로 좋게 바꿔주는
바람에 컨테이너가 이런 값을 받았다 —

```
"dbPath": "C:/Program Files/Git/engine/data/life.db",  "dbFound": false,  "regions": 0
```

서버는 정상 기동했고 응답도 200 이었다. **DB 를 못 찾아도 죽지 않는 정책** 때문에 화면에는
"추천 동네가 없음"으로만 보인다 — 로그만 봐서는 알 수 없었다.

### 검증 — 무엇을 보고 "됐다"고 판단했나

```
기동 로그                     동_좌표.csv 427개 / LH 평면도 281행 로드
                              Application startup complete
GET  /                        200 (14KB, index.html)
GET  /api/lifetype/keywords   200
POST /api/lifetype            200
                              dataStatus {dbFound:true, regions:427, priceLoaded:427}
                              spots 2곳 — 양천구 신정4동 / 중구 신당제5동
GET  /LH평면도/<한글경로>.png  200  image/png  365,943 bytes
메모리 (docker stats)         73.99MiB
```

**`regions:427` 이 핵심이다.** 위 함정 때문에 200 만으로는 아무것도 증명되지 않는다. 행 수를
돌려주는 `dataStatus` 가 427 이라는 것이 **엔진 `data/` 마운트가 실제로 붙었다는 증거**다
(실패했다면 0).

**한글 경로도 그대로 통과했다.** `data/LH평면도` 처럼 한글 디렉터리명이 URL 에 들어가는데
`python:3.12-slim` 기본 로케일에서 문제없이 PNG 를 내보냈고, 기동 로그의 ✅ 이모지도 깨지지
않았다.

---

## 여기까지의 결과

| 단계 | 산출물 | 상태 |
|---|---|---|
| 0 준비 | 휠 dry-run 26개 통과 → `python:3.12-slim` 단일 스테이지 | 완료 |
| 1 Dockerfile | `Life-Web/Dockerfile` | 완료 (DOCKER.md 6번) |
| 2 Image | `.dockerignore` + `life-web:dev` (콘텐츠 520MB) | 완료 (7번 Web 분) |
| 3 Container | 기동·정적 서빙·1차 유형·마운트 검증, 메모리 74MB | 완료 (15번 한글 경로 포함) |

**아직 못 한 것 — 2차 추천(`/api/predict`) 왕복.** 이 경로는 `services/engine.py` 가
`EMBED_API_BASE` 로 엔진 서버를 부르는데, 지금은 기본값 `http://127.0.0.1:8000` 이라
**컨테이너 자기 자신**을 가리킨다. 두 컨테이너를 같은 네트워크에 띄우고
`EMBED_API_BASE=http://embed:8000` 으로 덮어써야 하며, 그게 `docker-compose.yml`(11번)이
할 일이다. 실제 추천 1회 왕복 확인은 그 다음 스모크 테스트(17번) 몫이다.

**별도 티켓으로 남긴 것** — 1차 유형 채점도 엔진 API 로 돌려 웹이 `life.db` 를 아예 모르게
하는 일. 지금은 마운트로 우회했고, 이건 두 저장소 코드가 함께 바뀌는 작업이라 Docker 범위
밖이다.

**되짚어 볼 점** — 이번에 "200 이 떴다"가 증거가 되지 못한 경우가 두 번 있었다(경로 변환
함정, 마운트 실패). 둘 다 **응답 안의 숫자**(`regions`, 파일 크기)까지 봐야 판별됐다.
