/**
 * 화면에 보여줄 문자열을 다듬는 함수들.
 * DOM 을 건드리지 않고, 값을 받아 값을 돌려주기만 한다.
 */

/** LLM 이 만든 글을 화면에 넣기 전에 다듬는다 */
export function escapeAndFormat(text) {
  return text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")   // 태그 주입 방지
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .trim()
    .replace(/\n/g, "<br>");
}


/** "서울특별시 노원구 중계1동" → { gu: "노원구", dong: "중계1동" } */
export function splitRegionName(fullName) {
  const parts = fullName.replace("서울특별시 ", "").split(" ");
  return { gu: parts[0], dong: parts.slice(1).join(" ") };
}