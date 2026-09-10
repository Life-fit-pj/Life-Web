/**
 * "좋아요 한 거주지" 모달.
 *
 * 저장/조회는 서버(anonId 기준)가 맡는다 — 여기는 받아서 그리기만 한다.
 * 계약: GET /api/likes?anonId=... → [{gu, dong, created_at}]
 */

import { getLikes } from "../lib/api.js";
import { getAnonId } from "../lib/state.js";
import { escapeAndFormat } from "../lib/format.js";

let likesModalEl = null;

function ensureLikesPanel() {
  if (likesModalEl) return likesModalEl;

  likesModalEl = document.createElement("div");
  likesModalEl.className = "history-backdrop";
  likesModalEl.innerHTML = `
    <div class="history-modal">
      <button class="history-close" aria-label="닫기">&times;</button>
      <h3 class="history-title">좋아요 한 거주지</h3>
      <div class="history-section">
        <div id="likesItems"></div>
      </div>
    </div>
  `;
  document.body.appendChild(likesModalEl);

  likesModalEl.addEventListener("click", (e) => {
    if (e.target === likesModalEl) closeLikes();
  });
  likesModalEl.querySelector(".history-close").addEventListener("click", closeLikes);

  return likesModalEl;
}

export async function openLikes() {
  const el = ensureLikesPanel();
  el.classList.add("is-open");

  const itemsEl = el.querySelector("#likesItems");
  itemsEl.innerHTML = `<p class="history-empty">불러오는 중...</p>`;

  try {
    const items = await getLikes(getAnonId());
    itemsEl.innerHTML = items.length
      ? items.map((i) => `<div class="history-item">${escapeAndFormat(i.gu + " " + i.dong)}</div>`).join("")
      : `<p class="history-empty">좋아요한 동네가 없어요.</p>`;
  } catch (err) {
    console.error(err);
    itemsEl.innerHTML = `<p class="history-empty">목록을 불러오지 못했어요.</p>`;
  }
}

function closeLikes() {
  if (!likesModalEl) return;
  likesModalEl.classList.remove("is-open");
}
