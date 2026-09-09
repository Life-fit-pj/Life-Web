# DOCKER.md

`Life-Web` 저장소의 컨테이너화 작업 목록이다. 2026-09-09 기준.

**항목 번호는 `Life-Embed-jh/DOCKER.md` 의 17개 목록을 그대로 쓴다.** 그쪽이 두 저장소를
아우르는 대장이고, 여기에는 **웹이 실제로 손대는 항목만** 같은 번호로 옮겨 적었다. 번호를
새로 매기면 회의에서 "6번" 이 서로 다른 것을 가리키게 된다. 반대로 엔진에서만 해당되는
항목(엔진 Dockerfile, `life.db` 주입 방식 결정 등)은 여기에 적지 않는다.

- **이 문서** = 무엇을 왜 하기로 했는가, 무엇이 남았는가 (작업 대장)
- **`DOCKERSTUDY.md`** = 그중 끝난 것을 어떤 순서로 밟았는가 (진행 기록)

## 엔진 저장소와 이어지는 지점 셋

컨테이너가 둘로 나뉘어도 웹은 엔진과 세 곳에서 붙어 있다. 나머지는 서로 몰라도 된다.

| 지점 | 내용 |
|---|---|
| 베이스 이미지 | 둘 다 `python:3.12-slim`. 베이스 레이어를 공유해 디스크가 덜 든다 |
| `life.db` | 1차 유형 경로가 엔진의 DB 파일을 **읽기 전용으로 빌려 쓴다** (아래 6번) |
| `EMBED_API_BASE` | 2차 추천이 엔진 서버를 `httpx` 로 호출한다. compose 에서 `http://embed:8000` 으로 덮어쓴다 (11번) |

## 작업 목록 (웹 해당분)

| # | 제목 | 상태 | 선행 |
|---|---|---|---|
| 6 | `Life-Web/Dockerfile` 작성 — `uvicorn main:app --port 5000` + 정적 프론트 | **완료 (2026-09-09)** | 2, 7 |
| 7 | `.dockerignore` 추가 (빌드 컨텍스트 축소) | **완료 (2026-09-09)** | — (6번보다 **먼저**) |
| 15 | UTF-8 로케일 및 한글 경로(`data/LH평면도`) 동작 검증 | **완료 (6번과 함께)** | 6 |
| 9 | 환경변수 주입 체계 — `.env` 복사 금지, `env_file`/시크릿 사용 | 착수 가능 | 6 |
| 10 | `HEALTHCHECK` 연결 (**엔드포인트는 이미 있다**) | 착수 가능 | 6 |
| 11 | `docker-compose.yml` — 엔진과 2개 서비스, 내부 네트워크, `EMBED_API_BASE` | 착수 가능 | 6, 9 |
| 12 | 개발용 compose override — 소스·프론트 bind mount + `--reload` | 착수 가능 | 11 |
| 13 | 비루트 사용자 실행 등 컨테이너 보안 기본값 | 착수 가능 | 6 |
| 14 | 로그를 stdout 으로 — 웹은 **이미 충족**, 확인만 | 착수 가능 | 6 |
| 16 | `render.yaml` 의 `env: docker` 규격 맞추기 (**이 저장소엔 아직 없다**) | 착수 가능 | 6 |
| 17 | 이미지 빌드·기동 스모크 테스트 + 실행 문서 | 부분 완료 | 11 |
| — | (별도 티켓) 1차 유형 채점을 엔진 API 로 이관 | 미착수 | — |

---

## 완료된 항목

### 6. `Life-Web/Dockerfile` — **작성·검증 완료 (2026-09-09)**

엔트리포인트 `main:app`, 포트 5000, `python:3.12-slim` **단일 스테이지**.
이 저장소 `requirements.txt` 로 휠 가용성 dry-run 을 따로 돌려 근거를 만들었다 —
`pandas 3.0.5`·`cryptography 50.0.1` 포함 **26개 전부 cp312 휠, exit 0**.

```bash
docker run --rm -v <repo>/requirements.txt:/tmp/req.txt:ro python:3.12-slim \
  sh -c "pip install --dry-run --only-binary=:all: -r /tmp/req.txt"
```

이 검사는 **`requirements.txt` 나 `FROM` 이 바뀔 때만** 다시 돌린다. 실패는 "고장났다"가
아니라 "단일 스테이지라는 결정이 뒤집혔다"는 뜻이다.

**이미지에 굽는 것과 굽지 않는 것**

| 구운 것 | 이유 |
|---|---|
| `main.py`, `routers/`, `services/` | 애플리케이션 코드 |
| `frontend/` (569kB) | `main.py` 가 `/` 에 mount 한다 |
| `data/` (430MB) | `LH평면도` 를 `/LH평면도` 에 mount 한다. `StaticFiles` 는 폴더가 없으면 **기동 시점에** 죽는다. `floorplan.py` 가 import 시 읽는 CSV 도 여기 있다 |

| 안 구운 것 | 어떻게 넣나 |
|---|---|
| `.env` | 실행 시 `--env-file` / 플랫폼 환경변수 (9번) |
| 엔진의 `life.db` | 읽기 전용 볼륨 마운트 (아래) |

정적 파일 COPY 는 **한 블록에 모아 뒀다.** 프론트가 Vercel 로 빠지는 Phase 1 이 끝나면
그 블록만 지운다. 볼륨으로 돌리고 싶을 때도 `COPY data ./data` 한 줄만 손대면 된다.

**결정 — 웹도 `life.db` 를 파일로 직접 읽는다.**

KAN-69 로 `services/engine.py` 의 `sys.path` import 는 사라졌지만 **그건 2차 추천
(`/api/predict`) 경로만** 그렇다. 1차 유형(`/api/lifetype`) 은 `services/typespot.py` 가
`master_dataset_v3` 를 직접 읽는다.

```python
# services/typespot.py:65
DB_PATH = os.environ.get("LIFE_DB_PATH") or _find("life.db")
# _find 는 형제 폴더 Life-Embed*/data 를 뒤진다 — 컨테이너 안에는 형제 폴더가 없다
```

`LIFE_DB_PATH` 가 최우선이라 **코드 수정 0줄로 마운트가 먹는다.** 엔진의 `data/` 를 읽기
전용으로 붙이고 그 값을 준다. **마운트 위치는 `/code/data` 가 아니어야 한다** — 거기에
붙이면 이미지에 구운 `frontend`·`LH평면도` 가 통째로 가려진다. `/engine/data` 로 뒀다.

**실측 (2026-09-09)**

```
docker build -t life-web:dev .        exit 0, 64초
   DISK USAGE 1.29GB / CONTENT SIZE 520MB
   레이어: data 430MB + 의존성 193MB + frontend·코드 0.9MB + 베이스(엔진과 공유)

docker run -d -p 5010:5000 --env-file .env \
  -e LIFE_DB_PATH=/engine/data/life.db -v <Life-Embed-jh>/data:/engine/data:ro life-web:dev

   기동 로그        동_좌표 427개 / LH평면도 281행 로드, Application startup complete
   GET  /                        200 (14KB)
   GET  /api/lifetype/keywords   200
   POST /api/lifetype            200, dataStatus {dbFound:true, regions:427, priceLoaded:427}
                                 spots 2곳 (양천구 신정4동 / 중구 신당제5동)
   GET  /LH평면도/<한글경로>.png  200 image/png 365,943 bytes
   메모리 (docker stats)         73.99MiB
```

**이미지 크기 판단.** 콘텐츠 520MB 중 430MB 가 평면도 262개 PNG 다. **구동에는 영향이
없다** — 정적 파일은 요청 때 디스크에서 스트리밍되므로 메모리에 안 올라가고 실제 사용량은
74MB 였다. 비용은 전부 배포 쪽(레지스트리 push/pull, 플랫폼 디스크, 콜드 스타트)이므로
**굽는 쪽으로 확정**한다. Render 저가 티어의 이미지·디스크 상한은 16번에서 확인한다.

### 7. `.dockerignore` — **완료 (2026-09-09)**

**엔진 것을 복사하면 안 된다. `data/` 규칙이 정반대다.**

| | Life-Embed-jh | Life-Web |
|---|---|---|
| `data/` | 제외 | **포함** (`LH평면도`·CSV 가 이미지에 있어야 mount 가 뜬다) |
| `frontend/` | 없음 | **포함** |
| `.git` | 제외 (3.4GB) | 제외 (**719MB** — 262개 PNG 가 LFS 없이 그대로 tracked) |
| `.env` · 문서 · 캐시 · 에디터 설정 | 제외 | 제외 |

여기서 걷어낸 것은 사실상 `.git` 719MB 다. 남은 컨텍스트 412MB 라 첫 빌드가 64초 걸렸고,
그 뒤로는 레이어 캐시로 넘어간다. **`.env` 제외는 용량이 아니라 비밀 때문**이다 — 누군가
`COPY . .` 로 바꾸는 순간 토큰이 레이어에 박히고, 뒤에서 지워도 앞 레이어에 남는다.

**선행 관계 정정** — 엔진 문서는 원래 7번을 "3·6번 뒤"로 적어 뒀지만 실제로는 **6번보다
먼저** 해야 한다. 없으면 빌드마다 저장소 전체를 데몬으로 전송한다.

### 15. UTF-8 로케일 / 한글 경로 — **완료 (6번과 함께)**

```
GET /LH평면도/부산울산본부_부산기장(뉴스테이)_A-2BL/..._평면_55A-1210.png
-> 200 image/png 365,943 bytes
```

`python:3.12-slim` 기본 로케일에서 한글 디렉터리명이 그대로 동작했고 기동 로그의 ✅ 이모지도
깨지지 않았다. Dockerfile 에 `ENV PYTHONIOENCODING=utf-8` 을 넣어 뒀다 — `main.py` 가
`sys.stdout.encoding.lower()` 를 바로 부르기 때문에 그 값이 `None` 이면 **서버 import 자체가
죽는다.**

---

## 남은 항목

### 9. 환경변수 주입 체계

**이 저장소가 실제로 읽는 값은 넷이다** (`.env` 실측 + 코드 grep).

| 키 | 어디서 읽나 | 기본값 | 비고 |
|---|---|---|---|
| `ADMIN_TOKEN` | `routers/admin.py:34` | **`dev-admin-token`** | 주입을 잊으면 **기본값으로 그냥 뜬다.** 컨테이너에서 가장 위험한 항목 |
| `ADMIN_WRITE_ENABLED` | `routers/admin.py:35` | `1`(쓰기 허용) | 비상 잠금 스위치 |
| `EMBED_API_BASE` | `services/engine.py:28` | `http://127.0.0.1:8000` | 컨테이너에서는 **자기 자신**을 가리킨다. 반드시 덮어써야 한다 (11번) |
| `LIFE_DB_PATH` | `services/typespot.py:65` | (형제 폴더 탐색) | 컨테이너에서는 필수. `/engine/data/life.db` |

**정정** — 엔진 `DOCKER.md` 9번은 웹 환경변수에 "Google OAuth 클라이언트 ID" 를 적어 뒀는데
**이 저장소 코드에서는 확인되지 않는다.** `frontend/index.html` 이 Google Fonts 를 불러오는
것뿐이다(그래서 **컨테이너 아웃바운드가 막히면 폰트만 폴백**되고 기능은 멀쩡하다).
로그인은 `routers/auth.py` 의 자체 아이디/비밀번호 방식이다.

`.env` 는 이미지에 넣지 않는다. compose 는 `env_file`, Render 는 대시보드로 주입하고
저장소에는 `.env.example` 만 둔다.

### 10. `HEALTHCHECK` — **신규 엔드포인트가 필요 없다**

확인해 보니 웹에도 이미 둘 다 있다.

```
GET /api/admin/health   200 {"ok":true}                    토큰 불필요 — 프로세스가 살아 있나
GET /api/admin/ready     401 (토큰 필요)                    엔진 /admin/health 프록시 + write_enabled
```

- `HEALTHCHECK` 에는 **`/api/admin/health` 를 쓴다.** `/ready` 는 토큰이 필요해 컨테이너
  헬스체크로는 401 로 죽는다.
- 대신 `/health` 는 **엔진 연결을 보지 않는다.** "웹은 떴는데 엔진이 죽어 추천만 안 되는"
  상태는 이 체크로 안 잡힌다. compose 에서는 엔진 쪽 `service_healthy` 로 순서를 잡아 보완한다.
- slim 이미지에는 `curl` 이 없다. 패키지를 늘리지 말고
  `python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:5000/api/admin/health')"`
  로 쓴다.

### 11. `docker-compose.yml`

웹 서비스가 가져야 할 것 —

```yaml
environment:
  EMBED_API_BASE: http://embed:8000        # 컨테이너 DNS. 127.0.0.1 기본값을 반드시 덮는다
  LIFE_DB_PATH: /engine/data/life.db
volumes:
  - ../Life-Embed-jh/data:/engine/data:ro  # 1차 유형이 읽는다. 읽기 전용
env_file: .env                             # ADMIN_TOKEN, ADMIN_WRITE_ENABLED
depends_on:
  embed: { condition: service_healthy }
```

파일을 어느 저장소에 둘지는 엔진 쪽 11번에서 정한다(워크스페이스 루트는 git 저장소가 아니라
버전 관리에서 빠진다). **엔진의 `data/` 를 상대 경로로 참조**하므로 compose 파일 위치에
따라 그 경로가 달라진다는 점만 여기서 챙긴다.

### 12. 개발용 compose override

`main.py`·`routers/`·`services/` 를 bind mount 하고 `uvicorn --reload` 를 켠다. 웹은
**`frontend/` 를 같이 bind mount 하는 효과가 특히 크다** — 이 저장소엔 빌드 단계가 없어
HTML/JS 를 고치면 즉시 반영돼야 하고, `NoCacheStaticFiles` 가 이미 `Cache-Control: no-store`
를 붙이고 있어 브라우저 캐시도 걸리지 않는다.

### 13. 컨테이너 보안 기본값

- 비루트 사용자 생성 후 `USER` 전환.
- **웹은 런타임에 파일을 쓰지 않는다** (아래 14번 참고) — 읽기 전용 파일시스템 후보다.
  예외가 필요한지는 실제로 `--read-only` 로 띄워 확인한다.
- `ADMIN_TOKEN` 기본값 문제(9번)가 사실상 이 항목의 가장 큰 구멍이다.

### 14. 로그 — **웹은 이미 충족, 확인만**

이 저장소는 `logging` 모듈도 `logs/` 폴더도 쓰지 않는다. 전부 `print()` 이고 uvicorn 로그와
함께 stdout 으로 나간다. Dockerfile 의 `ENV PYTHONUNBUFFERED=1` 덕분에 버퍼에 갇히지도
않는다. **볼륨을 붙일 이유가 없다.** (엔진 쪽은 `logs/` 정책 결정이 남아 있다.)

### 16. `render.yaml`

**이 저장소에는 `render.yaml` 이 아직 없다.** 새로 만들 때 —

- Dockerfile 위치는 저장소 루트(지금 그대로).
- **포트는 `$PORT` 를 존중해야 한다.** 지금 `CMD` 는 5000 고정이라 그대로는 Render 규격이
  아니다. `CMD ["sh","-c","uvicorn main:app --host 0.0.0.0 --port ${PORT:-5000}"]` 처럼
  셸 형식으로 바꾸거나 Render 쪽에서 포트를 맞춘다.
- 헬스체크 경로는 `/api/admin/health`(10번).
- 이미지 크기(콘텐츠 520MB)가 저가 티어 제한에 걸리는지 이때 확인한다.

### 17. 스모크 테스트 — **부분 완료**

6번에서 웹 단독 기동·정적 서빙·1차 유형까지는 확인했다. **남은 것은 2차 추천
(`/api/predict`) 왕복 하나**다. `EMBED_API_BASE` 가 엔진 컨테이너를 가리켜야 하므로
11번 compose 이후에 확인한다. 엔진 LLM 호출이 포함되므로 컨테이너 아웃바운드 네트워크가
막히면 여기서 드러난다.

### (별도 티켓) 1차 유형 채점을 엔진 API 로 이관

지금은 `LIFE_DB_PATH` 마운트로 우회했지만, 근본은 **웹이 `life.db` 를 아예 모르게** 하는
것이다(엔진에 채점 엔드포인트를 만들고 웹은 `httpx` 로 호출). 두 저장소 코드가 함께 바뀌어
Docker 작업 범위를 넘으므로 별도 티켓으로 남긴다. KAN-79(Supabase 전환) 때 함께 정리된다.

---

## 이 저장소에서 밟은 함정 넷

1. **`/code/data` 에 볼륨을 붙이면 안 된다.** 이미지에 구운 `frontend`·`LH평면도` 가 가려진다.
   엔진 DB 는 `/engine/data` 로 붙인다.
2. **Git Bash 에서 `docker run` 은 `MSYS_NO_PATHCONV=1` 을 앞에 붙인다.** 안 그러면
   `-e LIFE_DB_PATH=/engine/data/life.db` 의 값이 `C:/Program Files/Git/engine/...` 로 변환된다.
3. **200 은 증거가 아니다.** `typespot.py` 는 DB 를 못 찾아도 죽지 않고 빈 결과를 돌려준다
   (하드코딩 금지 정책). 응답의 `dataStatus.regions` 가 427 인지까지 봐야 마운트 성공이다.
4. **`.dockerignore` 를 엔진에서 복사하지 않는다.** `data/` 규칙이 정반대다(7번).
