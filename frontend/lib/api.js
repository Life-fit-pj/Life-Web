/**
 * 서버 API 호출을 모아둔 곳.
 *
 * 화면 코드는 fetch 를 직접 부르지 않는다.
 * 주소·헤더·에러 처리가 한 곳에 모여 있어야
 * 나중에 주소가 바뀌거나 로그인 토큰이 붙을 때 여기만 고치면 된다.
 */

/** POST + JSON 을 보내고 JSON 을 받는 공통 부분. extraHeaders 는 로그인 토큰 등에 쓴다 */
async function postJSON(url, body, extraHeaders) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = new Error(`${url} 응답 오류 ${res.status}`);
    err.status = res.status;   // 409(중복) 처럼 상태코드로 갈라 보여줄 때 쓴다
    throw err;
  }

  return res.json();
}

/** 보낼 것이 없는 조회용 */
async function getJSON(url, extraHeaders) {
  const res = await fetch(url, { headers: extraHeaders });

  if (!res.ok) {
    const err = new Error(`${url} 응답 오류 ${res.status}`);
    err.status = res.status;
    throw err;
  }

  return res.json();
}

/** DELETE + JSON 을 보내고 JSON 을 받는 공통 부분 */
async function deleteJSON(url, body) {
  const res = await fetch(url, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`${url} 응답 오류 ${res.status}`);

  return res.json();
}


/** 추천 요청. 검색어만 보내도 되고, 슬라이더 값을 다 보내도 된다 */
export function postPredict(payload) {
  return postJSON("/api/predict", payload);
}

/** 1차 라이프스타일 유형 판정. LLM 을 안 타서 즉시 돌아온다 */
export function postLifeType(query) {
  return postJSON("/api/lifetype", { query });
}

/** 첫 화면에 뿌릴 키워드 목록. 서버가 쥐고 있어야 lifetype.py 와 안 어긋난다 */
export function getLifeTypeKeywords() {
  return getJSON("/api/lifetype/keywords");
}

/** 구 → 동 목록. 회원가입 화면의 2단 드롭다운이 쓴다 */
export function getGuDong() {
  return getJSON("/api/regions/gudong");
}

/** 핀 클릭 — 시설 정보 */
export function postRegion(gu, dong) {
  return postJSON("/api/region", { gu, dong });
}

/** 핀 클릭 — LLM 설명.
 *  housing 은 /api/predict 응답에서 받은 값을 그대로 실어 보낸다.
 *  여기서 조립하지 않는다 — 만드는 규칙은 services/engine.py 의 to_housing() 하나뿐이다 */
export function postRegionExplain(gu, dong, query, weights, scores, housing) {
  return postJSON("/api/region/explain", {
    gu, dong,
    query: query || "",
    weights: weights || null,
    scores: scores || null,
    housing: housing || null,
  });
}

/** 결과 화면 후속 질문 */
export function postChat(question, regions, weights, anonId) {
  return postJSON("/api/chat", {
    question,
    regions: regions || null,
    weights: weights || null,
    anonId,
  });
}

/** 검색·대화 기록 조회 */
export function getHistory(anonId) {
  return getJSON(`/api/history?anonId=${encodeURIComponent(anonId)}`);
}

/** 좋아요 추가 */
export function postLike(anonId, gu, dong) {
  return postJSON("/api/likes", { anonId, gu, dong });
}

/** 좋아요 취소 */
export function deleteLike(anonId, gu, dong) {
  return deleteJSON("/api/likes", { anonId, gu, dong });
}

/** Authorization 헤더 조립. Supabase 세션의 access_token 을 그대로 싣는다 */
function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

/** Supabase 로그인 직후 부른다. 이미 가입된 계정이면 customerId, 아니면 404
 *  (postJSON 이 err.status 로 담아 던진다 — 호출한 쪽이 회원가입 뎁스로 보낸다) */
export function authLogin(token) {
  return postJSON("/api/auth/login", {}, authHeader(token));
}

/** 이 Supabase 사용자가 이미 customer 로 가입돼 있나. 회원가입 뎁스로 보낼지 판단할 때 쓴다 */
export function getSignedUp(token) {
  return getJSON("/api/auth/signed-up", authHeader(token));
}

/** 회원가입. Supabase 인증 토큰 + 기본정보 + 설문 답변을 한 번에 보낸다 — 성공하면
 *  그 자리에서 customer 가 새로 만들어진다. 이미 가입돼 있으면 409 로 실패한다 */
export function signup(token, basicInfo, answers) {
  return postJSON("/api/signup", { ...basicInfo, answers }, authHeader(token));
}

/** 마이페이지 — 로그인한 회원의 기본정보 */
export function getMe(customerId) {
  return getJSON(`/api/auth/me?customerId=${encodeURIComponent(customerId)}`);
}