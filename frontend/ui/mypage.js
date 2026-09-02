/**
 * "마이페이지" 모달 — 로그인한 회원의 기본정보.
 *
 * 계약: GET /api/auth/me?customerId=... → customers 표 한 줄
 * (name, email, phone, gender, age, city, city_dong, work_city, work_dong, joined_at)
 */

import { getMe } from "../lib/api.js";
import { getAnonId, isLoggedIn } from "../lib/state.js";
import { escapeAndFormat } from "../lib/format.js";

let mypageModalEl = null;

const FIELD_LABELS = {
  name: "이름",
  email: "이메일",
  phone: "전화번호",
  gender: "성별",
  age: "나이",
  city: "거주 시/도",
  city_dong: "거주 동",
  work_city: "직장 시/도",
  work_dong: "직장 동",
  joined_at: "가입일",
};

function ensureMypagePanel() {
  if (mypageModalEl) return mypageModalEl;

  mypageModalEl = document.createElement("div");
  mypageModalEl.className = "mypage-backdrop";
  mypageModalEl.innerHTML = `
    <div class="mypage-modal">
      <button class="mypage-close" aria-label="닫기">&times;</button>
      <h3 class="mypage-title">마이페이지</h3>
      <div id="mypageBody"></div>
    </div>
  `;
  document.body.appendChild(mypageModalEl);

  mypageModalEl.addEventListener("click", (e) => {
    if (e.target === mypageModalEl) closeMypage();
  });
  mypageModalEl.querySelector(".mypage-close").addEventListener("click", closeMypage);

  return mypageModalEl;
}

export async function openMypage() {
  const el = ensureMypagePanel();
  el.classList.add("is-open");

  const body = el.querySelector("#mypageBody");

  if (!isLoggedIn()) {
    body.innerHTML = `<p class="mypage-empty">로그인 후 볼 수 있어요.</p>`;
    return;
  }

  body.innerHTML = `<p class="mypage-empty">불러오는 중...</p>`;

  try {
    const me = await getMe(getAnonId());
    body.innerHTML = Object.entries(FIELD_LABELS)
      .map(([key, label]) => `
        <div class="mypage-row">
          <span class="mypage-label">${label}</span>
          <span class="mypage-value">${escapeAndFormat(String(me[key] ?? "-"))}</span>
        </div>
      `).join("");
  } catch (err) {
    console.error(err);
    body.innerHTML = `<p class="mypage-empty">정보를 불러오지 못했어요.</p>`;
  }
}

function closeMypage() {
  if (!mypageModalEl) return;
  mypageModalEl.classList.remove("is-open");
}
