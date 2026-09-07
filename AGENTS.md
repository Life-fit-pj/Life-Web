# AGENTS.md

<!-- agents.md 공개 스펙 파일. Claude Code 외 다른 AI 코딩 도구(Cursor, Codex, Aider, Gemini CLI 등)도 이 파일을 읽는다.
     이 저장소에서는 "도구 무관 공통 지침"만 여기 쓰고, Claude Code 전용 사항은 CLAUDE.md에 남긴다. -->

## Project overview

LIFE,FIT 웹 — 서울 행정동(427개 중 하나)을 라이프스타일 선호도에 맞춰 추천하는 서비스의
FastAPI 서버 + 정적 프론트엔드. 이 저장소는 UI/HTTP 레이어만 담당한다. 추천 로직과 LLM 호출은
형제 저장소 `Life-Embed-jh`가 맡고, 이 저장소는 그 저장소가 띄우는 자체 FastAPI 서버를
`httpx`로 호출한다(`EMBED_API_BASE`, 기본 `http://127.0.0.1:8000`) — 예전엔 `sys.path`로
코드를 직접 임포트했으나 2026-09-08에 HTTP 호출로 바꿨다
(`Life-Embed-jh/docs/adr/0001-move-fastapi-to-embed.md`).
두 저장소는 반드시 같은 상위 폴더 아래 나란히 있어야 하고, 실행 시 두 uvicorn을 각각 띄운다.

## Reference projects


## Setup / commands

```bash
py -m pip install fastapi uvicorn pydantic pandas numpy python-dotenv httpx

# 1) Life-Embed-jh 저장소에서 먼저 엔진 서버를 띄운다
py -m uvicorn app.main:app --reload --port 8000

# 2) 이 저장소(Life-Web)에서 웹 서버를 띄운다
py -m uvicorn main:app --reload --port 5000
```

`http://127.0.0.1:5000`에서 서비스된다. `services/engine.py`가 `EMBED_API_BASE`
(기본 `http://127.0.0.1:8000`)로 1)을 호출하므로 두 uvicorn을 **둘 다** 띄워야 한다.
사전 준비물: `Life-Embed-jh/.env`(`ANTHROPIC_API_KEY`)와
`Life-Embed-jh/data/life.db`(약 216MB, git 미포함). 테스트 스위트·린터·빌드 단계는 없다 — 대신
각 `services/*.py`에 `if __name__ == "__main__":` 스모크 체크가 있어 단독 실행으로 점검한다
(예: `py services/engine.py`, `py services/coords.py`).


## Code style

디자인패턴을 준수하고, 파일에서 정해진 역할외에 의존성을 어기지않는 코드 설계를 한다.
함수 인자값에는 자료형을 명시하고 (doc : str), 핵심 주석을 간단 명료하게 작성한다.
코드 네이밍을 규격화하고 모두가 읽기 편한 방식으로 구조를 설계한다.
<!-- 이 저장소에서 지키는 코드 스타일/컨벤션. -->

## Testing instructions


## Security considerations

API, Key 등 민감정보가 포함된 데이터는 .env파일에서 별도로 관리하며, 외부로 노출시키지 않는다.
<!-- 예: selectory.db는 더미 데이터라 민감정보 없음, API 키/자격증명 다루는 부분이 생기면 여기 추가. -->

## Commit / PR guidelines

사용자가 직접 git 에 접근하며, Agent는 Commit, Push는 하지않는다.
<!-- 커밋 메시지 컨벤션(예: 이 repo의 "fix :", "feat :" 접두사 패턴), PR 규칙. -->

## Architecture

요청 흐름: `frontend/main.js` → `frontend/ui/*.js` → FastAPI 라우트(`routers/`) →
`services/engine.py`가 `httpx`로 `Life-Embed-jh`의 FastAPI 서버(8000번 포트)를 호출 →
응답을 JSON으로 재구성 → 프론트엔드가 지도 핀/카드를 렌더링.

- `main.py` — 앱 설정과 정적 파일 서빙만 한다. 라우트는 전부 `routers/`에 있고
  `include_router`만 호출한다.
- `routers/` — `recommend.py`(`/api/predict`, `/api/region`, `/api/region/explain`,
  `/api/chat`, `/api/regions/gudong`), `lifetype.py`(`/api/lifetype*`, LLM 미사용 1차 판정),
  `admin.py`(`/api/admin/*`, 토큰 인증 필요).
- `services/engine.py` — **`Life-Embed-jh`를 아는 유일한 파일.** `httpx.Client`로
  `EMBED_API_BASE`(기본 `http://127.0.0.1:8000`)를 호출한다(2026-09-08 이전엔 `sys.path`
  직접 임포트였음 — `Life-Embed-jh/docs/adr/0001-move-fastapi-to-embed.md`). 다른 추천
  엔진으로 교체하려면 여기만 고치면 된다(계약: `search(query, top_k)` /
  `recommend_by_weights(weights, top_k)`, 자세한 내용은 README 참고). 7개 지표
  (녹지·안전·교통·상권·의료·교육·문화)의 한국어⇄영어 키 매핑도 여기 하나만 있다.
- `services/coords.py`, `lifetype.py`, `typespot.py`, `floorplan.py` — 각각 행정동 좌표 조회,
  1차 유형 판정, 유형에 맞는 동네 매칭, LH 평면도 선택을 맡는다.
- `frontend/` — 빌드 단계·프레임워크 없음. `index.html`이 `main.js` 하나만 모듈로 불러오고
  나머지는 ES 모듈 import로 연결된다. `lib/`는 공용(서버 호출·상태·문자열 다듬기), `ui/`는
  화면 단위.

## Logging
