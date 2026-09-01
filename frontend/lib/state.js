/**
 * 여러 화면이 함께 보는 값.
 *
 * ⚠️ import 한 이름에는 값을 다시 넣을 수 없다.
 *      import { lastResult } from "./state.js";
 *      lastResult = data;          // ❌ TypeError
 *
 * 그래서 값이 아니라 "값을 담는 상자"를 내보낸다.
 * 상자 이름(state)은 안 바뀌니 괜찮고, 상자 안(state.lastResult)은 누구나 바꾼다.
 */
export const state = {
  lastResult: null,   // 마지막 추천 응답 전체. 채팅이 질문과 함께 보낸다
  lastQuery: "",      // 마지막 검색어. 핀 클릭 설명에 같이 보낸다

  // 1차 유형 판정 결과(/api/lifetype). 2차 요청에 함께 보내 뿌리를 잇는다 —
  // 이게 없으면 1차에서 본 동네가 2차에서 아무 설명 없이 사라진다
  lastType: null,
};


// 요청마다 번호를 붙인다.
// 검색을 연달아 하면 응답이 보낸 순서대로 오지 않는다.
// 번호가 최신이 아니면 그 응답은 버려서 과거 결과가 화면에 남는 것을 막는다
let requestSeq = 0;

export function nextSeq() {
  return ++requestSeq;
}

export function isLatest(seq) {
  return seq === requestSeq;
}