/* =========================================================
   mobile.js — 폰(768px 이하)에서만 하는 "열고 닫기"

   모양은 mobile.css 가 바꾼다. 여기서는 버튼을 눌렀을 때 시트를 여닫고,
   카드를 옆으로 넘기면 지도를 그 동네로 옮기는 것만 한다. 웹에서는 아무 일도 안 한다
   ========================================================= */

import { state } from "../lib/state.js";
import { isPhone, PHONE_QUERY } from "../lib/screen.js";
import { panToRegion } from "./map.js";

const $ = (id) => document.getElementById(id);

/** 시트 하나만 연다 — 조건 패널(.ctrl-panel) 또는 평면도(#floorplanArea) */
function openSheet(el) {
  if (!isPhone() || !el) return;
  closeSheets();
  el.classList.add("is-sheet-open");
  $("sheetScrim").hidden = false;
}

function closeSheets() {
  document.querySelectorAll(".is-sheet-open").forEach((el) => el.classList.remove("is-sheet-open"));
  $("sheetScrim").hidden = true;
}

/** 평면도가 없으면(아파트가 아니면) "평면도" 버튼도 숨긴다 — result.js 가 #floorplanArea 에 hidden 을 붙인다 */
function syncFloorButton() {
  const area = $("floorplanArea"), btn = $("openFloor");
  if (area && btn) btn.hidden = area.hidden;
}

/** 카드를 옆으로 넘기면 그 동네로 지도를 옮긴다(목록을 누른 것과 같은 동작) */
function bindCardSwipe() {
  const strip = $("resTopRegions");
  let timer = null, last = -1;
  strip.addEventListener("scroll", () => {
    if (!isPhone()) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const cards = strip.querySelectorAll(".list-item");
      if (!cards.length) return;
      const step = cards[0].getBoundingClientRect().width + 12;
      const i = Math.round(strip.scrollLeft / step);
      if (i === last) return;
      last = i;
      cards.forEach((c, k) => c.classList.toggle("active", k === i));
      const item = state.lastResult?.topRegions?.[i];
      if (item) panToRegion(item);
    }, 120);
  }, { passive: true });
}

document.addEventListener("DOMContentLoaded", () => {
  $("openCtrl")?.addEventListener("click", () => openSheet(document.querySelector(".ctrl-panel")));
  $("openFloor")?.addEventListener("click", () => openSheet($("floorplanArea")));
  $("sheetScrim")?.addEventListener("click", closeSheets);
  document.querySelectorAll("[data-sheet-close]").forEach((b) => b.addEventListener("click", closeSheets));
  // 조건 패널에서 "이 조건으로 다시 찾기"를 누르면 시트를 내린다 — 결과는 지도와 카드에서 본다
  $("runBtn")?.addEventListener("click", () => { if (isPhone()) closeSheets(); });

  // 채팅 입력창을 누르면 패널을 펼친다. 💬 버튼(chatToggle)이 하는 일과 같아서 그 버튼을 대신 누른다
  $("chatInput")?.addEventListener("focus", () => {
    if (isPhone() && !$("chatPanel").classList.contains("open")) $("chatToggle").click();
  });

  // 평면도 영역의 hidden 이 바뀔 때마다 버튼을 맞춘다
  const area = $("floorplanArea");
  if (area) new MutationObserver(syncFloorButton).observe(area, { attributes: true, attributeFilter: ["hidden"] });
  syncFloorButton();

  bindCardSwipe();
  // 폰 → 웹으로 넓어지면 열린 시트를 닫는다(웹에서는 패널이 원래 자리에 있다)
  matchMedia(PHONE_QUERY).addEventListener("change", (e) => { if (!e.matches) closeSheets(); });
});
