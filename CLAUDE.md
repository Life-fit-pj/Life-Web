# CLAUDE.md

이 파일은 이 저장소에서 작업할 때 Claude Code(claude.ai/code)에게 지침을 제공합니다.

## 이 저장소는 무엇인가

LIFE,FIT web — 사용자의 라이프스타일 선호도를 바탕으로 서울의 행정동(427개 중 하나)을
추천해주는 FastAPI 서버 + 정적 프론트엔드입니다(예전에는 Flask였으나 전환됨). 이 저장소는
UI와 HTTP 레이어**만** 담당합니다. 모든 추천 로직과 LLM 호출은 형제 저장소인 `Life-Embed-jh`에
있으며, 이 저장소는 `sys.path`를 통해 이를 직접 임포트합니다(pip 설치 방식이 아님).

## 필수 폴더 구조

이 저장소는 반드시 `Life-Embed-jh`와 같은 레벨에 위치해야 합니다:

```
Life-fit-main/
├── Life-Embed-jh/    # 추천 엔진 (DB, LLM, 파이프라인) — 별도 저장소
└── Life-Web/         # 이 저장소
```

`services/engine.py`는 `../Life-Embed-jh`를 `sys.path`에 추가하고 여기서
`app.features.pipeline_api.{search, recommend_by_weights}`와
`app.core.db.{facilities, facility_counts}`를 임포트합니다. `Life-Embed-jh`가 없거나 이름이
잘못되면 서버는 임포트 시점에 `ModuleNotFoundError: No module named 'app'` 오류로 실패합니다.
`Life-Embed-jh`는 자체 `.env`에 `ANTHROPIC_API_KEY`와 `data/life.db`(약 216MB, git에 포함되지
않음)가 필요합니다 — 해당 저장소의 README를 참고하세요.

## 실행 방법

```bash
py -m pip install fastapi uvicorn pydantic pandas numpy
py -m uvicorn main:app --reload --port 5000
```

`http://127.0.0.1:5000`에서 서비스됩니다. 이 저장소에는 테스트 스위트, 린터, 빌드 단계가
없습니다 — 대신 각 `services/*.py` 파일에 `if __name__ == "__main__":` 스모크 체크가 있으며,
해당 모듈을 단독으로 점검하려면 직접 실행하면 됩니다(예: `py services/coords.py`,
`py services/engine.py`, `py services/floorplan.py`).

`main.py` 맨 아래의 `if __name__ == '__main__': app.run(...)` 블록은 Flask 시절 코드가 그대로
남은 죽은 코드입니다 — `FastAPI` 인스턴스에는 `.run()`이 없어서 `py main.py`로 직접 실행하면
`AttributeError`가 납니다. 반드시 위의 `uvicorn` 명령으로 실행하세요.

Kakao Maps JS 키는 `frontend/index.html`에 내장되어 있습니다. Kakao Developers 콘솔의 Web
플랫폼에 `http://127.0.0.1:5000`이 등록되어 있어야 하며, 그렇지 않으면 지도가 아무 오류 없이
렌더링되지 않습니다.

## 아키텍처

**요청 흐름:** `frontend/*.js` → FastAPI 앱(`main.py`)의 `POST /api/predict` 또는 `/api/region`
(요청 본문은 pydantic 모델로 검증됨) → `services/engine.py`가 형제 패키지인 `Life-Embed-jh`를
호출 → 응답을 재구성해 JSON으로 반환 → 프론트엔드가 지도 핀/카드를 렌더링.

- `main.py` — FastAPI 앱 설정, 정적 파일 서빙(`StaticFiles` 마운트로 프론트엔드 + `data/LH평면도`
  이미지), 그리고 두 개의 API 라우트를 담당합니다. 라우트 핸들러는 입출력 형태만 다듬고, 실제
  작업은 모두 `services/`에 위임합니다. `/api/predict` 응답에서 지역명 앞에 `서울특별시`를
  붙이는 것도 이 파일이 합니다(엔진이 주는 `"구 행정동명"`은 접두어가 없음).
- `services/engine.py` — **`Life-Embed-jh`를 알고 있는 유일한 파일**입니다. 다른 추천 엔진으로
  교체하려면 여기 있는 두 개의 import 줄만 바꾸면 됩니다(아래 "교체 가능한 엔진 계약" 참고).
  또한 7개 라이프스타일 지표에 대한 한국어⇄영어 키 매핑과, 핀 클릭 시 필요한 시설 정보
  조회(`get_facilities`)도 이 파일이 담당합니다.
- `services/coords.py` — `data/동_좌표.csv`(427행)를 임포트 시점에 메모리 내
  `(구, 동) → (lat, lng)` 딕셔너리로 한 번만 로드합니다. `lookup_coords`가 이를 읽어옵니다.
  pandas가 아닌 `csv`를 사용합니다.
- `services/floorplan.py` — LH 평면도 CSV(cp949 인코딩)를 임포트 시점에 pandas로 로드합니다.
  `find_floorplan(area)`는 *실제로 디스크에 이미지 파일이 존재하는* 평면도 중 면적이 가장
  가까운 것을 선택합니다 — CSV에는 227행이 있지만 그중 66개만 대응하는 이미지 폴더가 있어서,
  면적 차이순으로 정렬한 후보들을 순회하며 실제로 존재하는 경로가 나올 때까지 탐색합니다.
- `frontend/` — 빌드 단계도, 프레임워크도 없습니다. `index.html`/`search.css`/`search.js`는
  초기 검색 화면(떠다니는 클릭 가능한 키워드, 자연어 질의 입력창)이고, `style.css`/`script.js`는
  결과 화면(Kakao 지도, 순위 목록, 핀별 추천 사유 카드, 채팅 패널)입니다.

### API 계약

- `POST /api/predict` — 요청 본문은 `{ query: "..." }`(LLM이 텍스트를 7개 지표 가중치로 변환)
  또는 영어 키 `greenery, safety, transport, commercial, medical, education, culture` 아래의
  슬라이더 값(가중치로 그대로 사용됨) 중 하나입니다. `area`/`builtYear`/`bldgType`도 함께
  받으며, `area`가 59㎡ 이상이거나 `builtYear`가 2015년 이후면 종합 점수(`score`)에 소폭
  가산점이 붙습니다. 두 경로 모두 `services.engine.get_regions`로 수렴하며, 동일한 형태를
  반환합니다: `score`, `topRegions`(좌표 포함, `name`에 `서울특별시` 접두어가 붙음),
  `floorplanPath`, `fallback`(현재 항상 `False`, 실제 폴백 감지는 미구현), `explanation`,
  `weights`(프론트엔드가 슬라이더를 다시 동기화할 수 있도록).
- `POST /api/region` — 요청 본문 `{ gu, dong }`, 지도 핀 클릭 시 표시되는 모달용으로 인근 시설
  개수/항목(`services.engine.get_facilities`가 주는 `counts`/`items`)을 반환합니다. 핀 클릭 시
  427개 동 전체 점수를 다시 계산하지 않도록 `/api/predict`와 의도적으로 분리되어 있습니다.
- `frontend/script.js`는 `POST /api/region/explain`(동네별 개별 LLM 설명)과
  `POST /api/chat`(결과 화면에서의 추가 질문)도 호출하지만, **`main.py`에 이 두 라우트는 아직
  없습니다.** 요청은 404로 실패하고 프론트엔드가 이를 조용히 삼켜 해당 UI 영역만 비워 두므로,
  화면이 깨지진 않지만 기능은 동작하지 않습니다. 이 두 엔드포인트를 구현하는 것이 남은 작업입니다.

### 교체 가능한 엔진 계약

어떤 엔진이든 아래 두 함수를 정확히 이 반환 형태로 노출하기만 하면 `Life-Embed-jh`를 대체할
수 있습니다(자세한 내용과 셀프 체크 스니펫은 README.md 참고):

- `search(query, top_k=5)` → `{"weights": {<7개 한국어 지표명>: 1-5 float}, "regions": [{"name": "구 행정동명", "total": float, "scores": {<7개 지표>: 0-100}}], "explanation": str}`
- `recommend_by_weights(weights, top_k=5)` → 위와 같은 `regions` 목록 형태만 반환

위반 시 프론트엔드가 아무 오류 없이 조용히 망가지는 강제 제약 조건:
- 7개 지표명은 고정된 한국어 문자열입니다: `녹지 안전 교통 상권 의료 교육 문화`.
- `name`은 정확히 `"구 행정동명"` 형태여야 합니다 — 공백 하나, `서울특별시` 접두어 없음.
  백엔드가 `name.split(" ", 1)`로 좌표를 조회하므로, 이 형식을 벗어나면 좌표 조회가 실패합니다.
- `scores` 값은 0-100 범위이며 높을수록 좋은 값이어야 합니다(정확한 백분위일 필요는 없음).
- `weights` 값은 숫자형이어야 하며(`"4.6"`이 아닌 `4.6`), 범위는 1-5입니다.
- `explanation`은 값이 없을 때 `None`이 아닌 `""`이어야 합니다.

엔진을 교체하려면 `services/engine.py` 상단의 import 두 줄(형제 폴더 경로 + 그 안의 모듈
경로)만 수정하면 됩니다.

## 보안 주의사항

API 키, 토큰, 기타 비밀 정보는 반드시 `.env`(gitignore 처리됨)에 두고 절대 커밋하지 마세요.
추천 엔진이 사용하는 Anthropic 키는 이 저장소의 `.env`가 아닌 `Life-Embed-jh/.env`에
있습니다.
