/**
 * "검색 및 대화 기록 저장소" 모달.
 *
 * 저장/조회는 서버(anonId 기준)가 맡는다 — 여기는 받아서 그리기만 한다.
 * 계약: GET /api/history?anonId=... → { searches: [{query, created_at}], chats: [{question, answer, created_at}] }
 */

import { getHistory } from "../lib/api.js";
import { anonId } from "../lib/state.js";
import { escapeAndFormat } from "../lib/format.js";

let historyModalEl = null;

function ensureHistoryPanel() {
  if (historyModalEl) return historyModalEl;

  historyModalEl = document.createElement("div");
  historyModalEl.className = "history-backdrop";
  historyModalEl.innerHTML = `
    <div class="history-modal">
      <button class="history-close" aria-label="닫기">&times;</button>
      <h3 class="history-title">검색 및 대화 기록</h3>
      <div class="history-section">
        <h4>최근 검색어</h4>
        <div id="historySearches"></div>
      </div>
      <div class="history-section">
        <h4>최근 대화</h4>
        <div id="historyChats"></div>
      </div>
    </div>
  `;
  document.body.appendChild(historyModalEl);

  historyModalEl.addEventListener("click", (e) => {
    if (e.target === historyModalEl) closeHistory();
  });
  historyModalEl.querySelector(".history-close").addEventListener("click", closeHistory);

  return historyModalEl;
}

function renderList(el, items, empty, toHtml) {
  el.innerHTML = items.length
    ? items.map(toHtml).join("")
    : `<p class="history-empty">${empty}</p>`;
}

export async function openHistory() {
  const el = ensureHistoryPanel();
  el.classList.add("is-open");

  const searchesEl = el.querySelector("#historySearches");
  const chatsEl = el.querySelector("#historyChats");
  searchesEl.innerHTML = `<p class="history-empty">불러오는 중...</p>`;
  chatsEl.innerHTML = "";

  try {
    const { searches = [], chats = [] } = await getHistory(anonId);

    renderList(searchesEl, searches, "검색 기록이 없어요.",
      (s) => `<div class="history-item">${escapeAndFormat(s.query)}</div>`);

    renderList(chatsEl, chats, "대화 기록이 없어요.",
      (c) => `<div class="history-item">
        <div class="history-q">Q. ${escapeAndFormat(c.question)}</div>
        <div class="history-a">A. ${escapeAndFormat(c.answer)}</div>
      </div>`);

  } catch (err) {
    console.error(err);
    searchesEl.innerHTML = `<p class="history-empty">기록을 불러오지 못했어요.</p>`;
  }
}

function closeHistory() {
  if (!historyModalEl) return;
  historyModalEl.classList.remove("is-open");
}
