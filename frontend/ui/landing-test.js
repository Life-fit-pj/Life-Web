/* =========================================================
   landing-test.js — 랜딩 맨 아래 1차 테스트 칸

   예전 index.html 첫 화면(search.js 의 떠다니는 말 부분)을 옮겼다.
   여기서는 말을 고르고 검색어를 만드는 데까지만 한다. "찾기"를 누르면 검색어를
   sessionStorage 에 맡기고 index.html 로 넘어간다 — 유형 카드 · 로그인 · 2차 추천은
   지금처럼 index.html(search.js · lifetype.js)이 한다. 로직을 두 벌 두지 않는다
   ========================================================= */

import { getLifeTypeKeywords } from "../lib/api.js";
import { isPhone } from "../lib/screen.js";

// 서버(services/lifetype.py)가 진짜 목록을 준다. 못 받으면 이 예비를 쓴다 — search.js 에 있던 것
let FLOAT_WORDS = [
  "주말엔 무조건 외출", "약속으로 꽉 찬 주말", "핫플 카페 도장 깨기",
  "완벽한 집순이 집돌이", "퇴근하면 바로 귀가", "내 방이 최고의 힐링",
  "슬리퍼 신고 쇼핑몰", "맛집 탐방이 일상", "24시간 밝은 거리",
  "지하철역이 코앞", "소음 없는 한적한 곳", "흙길 따라 걷는 산책",
  "창문 열면 녹지", "공원이 앞마당인 집", "단골집 사장님과 수다",
  "오가며 인사하는 이웃", "동네 모임이 활발한", "혼자만의 고요한 시간",
  "마주칠 일 없는 동네", "조용히 지내고 싶은", "모든 걸 걸어서 해결",
  "1분 컷 편의점 필수", "장 보러 걸어가는 길", "주차 걱정 없는 동네",
  "친구 만나러 드라이브", "대형마트는 차로 한 번", "면적은 작아도 분리된",
  "새 집이면 좋겠는", "방이 많은", "넓은 게 최고인",
];
let MIN_PICK = 3;

// index.html(search.js)이 읽는 자리. 키 이름을 바꾸면 양쪽 다 고친다
const PENDING_KEY = "lifefit-pending-query";

const PULL_RADIUS = 140;    // 마우스가 이 거리(px) 안에 오면 끌려온다(웹만)
const PULL_MAX = 18;
const visibleCount = () => (isPhone() ? 11 : 20);

let picks = [];       // 고른 말
let slots = [];       // 화면에 떠 있는 말 [{ word, el, x, y, w, h }]
let inView = false;   // 테스트 칸이 보일 때만 말을 바꾼다

const $ = (id) => document.getElementById(id);
const shuffled = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};


/* ---------- 말 하나 만들기 · 자리 잡기 ---------- */

function styleWord(btn) {
  // 웹은 지금처럼 크기·진하기가 조금씩 다르게, 폰은 누르기 좋게 크고 진하게
  const m = isPhone();
  btn.style.fontSize = (m ? 14 + Math.random() * 4 : 12 + Math.random() * 6).toFixed(1) + "px";
  btn.style.opacity = (m ? 0.75 + Math.random() * 0.25 : 0.55 + Math.random() * 0.35).toFixed(2);
}

function makeWord(word) {
  const outer = document.createElement("span");
  outer.className = "ss-word";
  // 말마다 주기를 다르게 해야 전체가 규칙적으로 안 보인다
  outer.style.setProperty("--dur", (18 + Math.random() * 22).toFixed(1) + "s");
  outer.style.setProperty("--delay", (-Math.random() * 20).toFixed(1) + "s");
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = word;
  styleWord(btn);
  // 눌린 순간 화면에 적힌 글씨를 읽는다 — 4초마다 글씨가 바뀌므로 word 를 기억해 쓰면 틀린다
  btn.addEventListener("click", () => togglePick(btn.textContent.trim()));
  outer.appendChild(btn);
  return outer;
}

/** 말이 피해야 하는 자리: 다른 말 보기 버튼, (웹이면) 가운데 검색 무리 */
function blockedRects(field) {
  const f = field.getBoundingClientRect();
  const rel = (el, px, py) => {
    const r = el.getBoundingClientRect();
    return { x: r.left - f.left - px, y: r.top - f.top - py, w: r.width + px * 2, h: r.height + py * 2 };
  };
  const out = [rel($("shuffleWords"), 14, 10)];
  if (!isPhone()) out.push(rel(document.querySelector(".search-inner"), 30, 24));
  return out;
}

/** 무작위로 던져 보고 겹치면 다시. 못 찾으면 빈자리를 무작위 순서로 훑는다 */
function place(slot, W, H, blocks) {
  const free = (x, y) =>
    !blocks.some((b) => x < b.x + b.w && b.x < x + slot.w && y < b.y + b.h && b.y < y + slot.h) &&
    !slots.some((o) => o !== slot && x < o.x + o.w + 8 && o.x < x + slot.w + 8 && y < o.y + o.h + 8 && o.y < y + slot.h + 8);
  for (let t = 0; t < 400; t++) {
    const x = 8 + Math.random() * Math.max(1, W - slot.w - 16);
    const y = 12 + Math.random() * Math.max(1, H - slot.h - 24);
    if (free(x, y)) { slot.x = x; slot.y = y; return true; }
  }
  const spots = [];
  for (let y = 12; y <= H - slot.h - 12; y += 8) for (let x = 8; x <= W - slot.w - 8; x += 10) spots.push([x, y]);
  for (const [x, y] of shuffled(spots)) if (free(x, y)) { slot.x = x; slot.y = y; return true; }
  return false;
}

function setPos(slot) {
  slot.el.style.setProperty("--x", slot.x.toFixed(1) + "px");
  slot.el.style.setProperty("--y", slot.y.toFixed(1) + "px");
}

function measure(slot, field) {
  slot.el.style.setProperty("--x", "-9999px");
  slot.el.style.setProperty("--y", "0px");
  field.appendChild(slot.el);
  const r = slot.el.firstElementChild.getBoundingClientRect();
  slot.w = r.width; slot.h = r.height;
}

/** 말을 채운다. all 이면 고르지 않은 말을 모두 새로 뽑는다(= 다른 말 보기) */
function fillWords(all) {
  const field = $("ssWords");
  const W = field.clientWidth, H = field.clientHeight;
  if (!W || !H) return;
  if (all) {
    slots.filter((s) => !picks.includes(s.word)).forEach((s) => s.el.remove());
    slots = slots.filter((s) => picks.includes(s.word));
  }
  const blocks = blockedRects(field);
  const showing = new Set(slots.map((s) => s.word));
  for (const word of shuffled(FLOAT_WORDS.filter((w) => !showing.has(w) && !picks.includes(w)))) {
    if (slots.length >= visibleCount()) break;
    const slot = { word, el: makeWord(word) };
    measure(slot, field);
    if (place(slot, W, H, blocks)) { setPos(slot); slots.push(slot); }
    else slot.el.remove();
  }
  syncWords();
}

/** 말 상자 크기가 바뀌면 고른 말까지 전부 다시 놓는다 */
function relayout() {
  slots.forEach((s) => s.el.remove());
  slots = [];
  const field = $("ssWords");
  const blocks = blockedRects(field);
  picks.forEach((word) => {
    const slot = { word, el: makeWord(word) };
    measure(slot, field);
    if (place(slot, field.clientWidth, field.clientHeight, blocks)) { setPos(slot); slots.push(slot); }
    else slot.el.remove();
  });
  fillWords(false);
}

/** 4초마다 고르지 않은 말 하나를 다른 말로 바꾼다 — search.js startRotation */
function rotateOne() {
  if (!inView || document.hidden) return;
  const free = slots.filter((s) => !picks.includes(s.word));
  if (!free.length) return;
  const slot = free[Math.floor(Math.random() * free.length)];
  const showing = new Set(slots.map((s) => s.word));
  const pool = FLOAT_WORDS.filter((w) => !showing.has(w) && !picks.includes(w));
  if (!pool.length) return;
  const next = pool[Math.floor(Math.random() * pool.length)];

  slot.el.classList.add("is-fading");          // 사라졌다가 → 글씨를 바꾸고 → 다시 나타난다
  setTimeout(() => {
    const field = $("ssWords");
    const btn = slot.el.firstElementChild;
    btn.textContent = next;
    styleWord(btn);
    slot.word = next;
    const r = btn.getBoundingClientRect();
    slot.w = r.width; slot.h = r.height;
    if (place(slot, field.clientWidth, field.clientHeight, blockedRects(field))) setPos(slot);
    slot.el.classList.remove("is-fading");
    if (slots.length < visibleCount()) fillWords(false);   // 처음에 자리가 모자랐으면 하나씩 더 채운다
    else syncWords();
  }, 800);
}

/** 마우스에 가까운 말이 끌려온다 — 웹(마우스)에서만. search.js startMagnetic */
function startMagnetic() {
  let mx = -9999, my = -9999, pending = false;
  $("test").addEventListener("mousemove", (e) => {
    if (isPhone()) return;
    mx = e.clientX; my = e.clientY;
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      slots.forEach((s) => {
        const b = s.el.getBoundingClientRect();
        const dx = mx - (b.left + b.width / 2), dy = my - (b.top + b.height / 2), d = Math.hypot(dx, dy);
        const btn = s.el.firstElementChild;
        if (d > PULL_RADIUS || d === 0) { btn.style.translate = "0 0"; s.el.classList.remove("near"); return; }
        const pull = PULL_MAX * (1 - d / PULL_RADIUS);
        btn.style.translate = `${((dx / d) * pull).toFixed(1)}px ${((dy / d) * pull).toFixed(1)}px`;
        s.el.classList.add("near");
      });
    });
  });
}


/* ---------- 고른 말 · 태그 · 고른 개수 ---------- */

function syncWords() {
  slots.forEach((s) => {
    const on = picks.includes(s.word);
    s.el.classList.toggle("is-on", on);
    s.el.firstElementChild.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function togglePick(word) {
  const i = picks.indexOf(word);
  if (i > -1) picks.splice(i, 1); else picks.push(word);
  renderTags();
}

const X_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

function renderTags() {
  const box = $("tagContainer"), input = $("searchInput");
  box.replaceChildren(...picks.map((k) => {
    const tag = document.createElement("button");
    tag.type = "button";
    tag.className = "keyword-tag";
    tag.setAttribute("aria-label", `${k} 빼기`);
    tag.innerHTML = `${k}${X_ICON}`;
    tag.addEventListener("click", (e) => { e.stopPropagation(); togglePick(k); input.focus(); });
    return tag;
  }));
  input.placeholder = picks.length ? "" : "예 : 애들 학원 보내기 좋은 조용한 동네";
  syncWords();
  updatePickCount();
}

/** 고른 개수 — 점 세 개 + 문구. 고르기 전에도 흐린 안내로 자리를 지킨다 */
function updatePickCount() {
  const el = $("pickCount");
  const n = picks.length;
  const typed = $("searchInput").value.trim().replace(/\s+/g, "").length >= 4;
  const dots = `<span class="dots" aria-hidden="true">${[0, 1, 2].map((i) => `<i class="${i < n ? "on" : ""}"></i>`).join("")}</span>`;
  el.className = "pick-count";
  if (!n && !typed) { el.innerHTML = `${dots}${MIN_PICK}개 이상 고르면 더 정확해요`; el.classList.add("idle"); }
  else if (n && typed) el.innerHTML = `${dots}키워드 ${n}개 + 직접 입력`;
  else if (typed) el.textContent = "직접 입력한 내용으로 찾아볼게요";
  else if (n < MIN_PICK) el.innerHTML = `${dots}${n}개 골랐어요 · ${MIN_PICK}개면 더 정확해요`;
  else el.innerHTML = `${dots}${n}개 골랐어요`;
}


/* ---------- 찾기 · 직접 설정 ---------- */

function submit() {
  const input = $("searchInput");
  const query = [...picks, input.value.trim()].filter(Boolean).join(" ");
  if (!query) { input.focus(); return; }
  // 유형 카드 · 로그인 확인은 index.html 이 한다. 검색어만 맡기고 넘어간다
  try { sessionStorage.setItem(PENDING_KEY, query); } catch { /* 막혀 있으면 그냥 넘어간다 */ }
  location.href = "index.html";
}


/* ---------- 연결 ---------- */

document.addEventListener("DOMContentLoaded", async () => {
  if (!$("test")) return;

  // 키워드 목록은 서버가 쥔다. 프론트에 박아 두면 lifetype.py 와 어긋난다
  try {
    const d = await getLifeTypeKeywords();
    if (d.all?.length) FLOAT_WORDS = d.all;
    if (d.minPick) MIN_PICK = d.minPick;
  } catch (err) {
    console.warn("[landing-test] 키워드를 못 받아 예비 목록을 씁니다", err);
  }

  fillWords(true);
  updatePickCount();
  startMagnetic();
  setInterval(rotateOne, 4000);
  new IntersectionObserver(([e]) => { inView = e.isIntersecting; }, { threshold: 0.1 }).observe($("ssWords"));

  $("shuffleWords").addEventListener("click", () => fillWords(true));
  $("searchBtn").addEventListener("click", submit);
  $("searchInput").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) submit(); });
  $("searchInput").addEventListener("input", updatePickCount);
  $("searchBox").addEventListener("click", () => $("searchInput").focus());
  $("skipSearch").addEventListener("click", () => { location.href = "index.html"; });

  // 말 상자의 크기가 바뀌면 다시 놓는다 — 웹 ↔ 폰뿐 아니라 폰 안에서 폭만 바뀌어도(안 그러면 상자 밖 말이 잘려 안 보인다).
  // 창을 끄는 동안 계속 불리므로 멈추고 0.15초 뒤 한 번만
  const field = $("ssWords");
  let size = `${field.clientWidth}x${field.clientHeight}`, resizeTimer = null;
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const now = `${field.clientWidth}x${field.clientHeight}`;
      if (now !== size) { size = now; relayout(); }
    }, 150);
  }).observe(field);
});
