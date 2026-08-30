/**
 * 서버 API 호출을 모아둔 곳.
 *
 * 화면 코드는 fetch 를 직접 부르지 않는다.
 * 주소·헤더·에러 처리가 한 곳에 모여 있어야
 * 나중에 주소가 바뀌거나 로그인 토큰이 붙을 때 여기만 고치면 된다.
 */

/** POST + JSON 을 보내고 JSON 을 받는 공통 부분 */
async function postJSON(url, body) {
  const res = await fetch(url, {
    method: "POST",
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

/** 핀 클릭 — 시설 정보 */
export function postRegion(gu, dong) {
  return postJSON("/api/region", { gu, dong });
}

/** 핀 클릭 — LLM 설명 */
export function postRegionExplain(gu, dong, query, weights, scores) {
  return postJSON("/api/region/explain", {
    gu, dong,
    query: query || "",
    weights: weights || null,
    scores: scores || null,
  });
}

/** 결과 화면 후속 질문 */
export function postChat(question, regions, weights) {
  return postJSON("/api/chat", {
    question,
    regions: regions || null,
    weights: weights || null,
  });
}