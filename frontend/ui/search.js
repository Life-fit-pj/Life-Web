/* =========================================================
   search.js — 1차 검색 화면

   흐름은 두 단계다.
     1차  떠다니는 단어를 골라 /api/lifetype 으로 보낸다.
          LLM 을 안 타서 즉시 유형 카드가 뜬다 (ui/lifetype.js)
     2차  카드에서 '5곳 보기' 를 누르면 /api/predict 로 간다.
          LLM 이 7개 지표 가중치를 만들고 결과 화면으로 넘어간다

   상단 검색창(결과 화면)은 1차를 건너뛰고 곧바로 2차로 간다 —
   이미 결과를 보고 있는 사람에게 유형 카드를 다시 띄울 이유가 없다
   ========================================================= */

import { postPredict, postLifeType, getLifeTypeKeywords } from "../lib/api.js";
import { nextSeq, isLatest, getAnonId } from "../lib/state.js";
import { renderResult } from "./result.js";
import { openMenu, openAuthModal } from "./menu.js";
import { showTypeCard, firstPayload } from "./lifetype.js";


// 배경에 떠다닐 단어들.
// 진짜 목록은 서버(services/lifetype.py)가 쥐고 있고, 시작할 때 받아 온다.
// 여기 적힌 것은 서버를 못 부를 때 쓰는 예비다 —
// 유형 판정의 축(axis)에 맞춰 고른 말들이라 아무 단어나 넣으면 안 된다
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

// 이보다 적게 고르면 축이 대부분 비어 유형이 아무 데나 떨어진다.
// 서버가 알려 주는 값으로 덮어쓴다
let MIN_PICK = 3;

const VISIBLE_COUNT = 20;   // 한 번에 화면에 띄울 개수. 나머지는 교체용 예비
const PULL_RADIUS = 140;    // 마우스가 이 거리(px) 안에 오면 반응
const PULL_MAX = 18;        // 최대로 끌려오는 거리(px)

// signup.html 이 설문 답을 넣어 두는 자리. 키 이름을 바꾸면 양쪽 다 고쳐야 한다
const SURVEY_KEY = "lifefit-survey";

// 서버가 준 한국어 지표명 → 슬라이더 id
const SLIDER_ID = {
  "녹지": "greenery", "안전": "safety", "교통": "transport",
  "상권": "commercial", "의료": "medical", "교육": "education",
  "문화": "culture",
};

// 거래유형 → 그 유형이 쓰는 예산 슬라이더 id
const PRICE_SLIDER_ID = { "매매": "salePrice", "전세": "jeonseDeposit", "월세": "wolseRent" };


/* =========================================================
   고른 키워드
   ========================================================= */

let selectedKeywords = [];

function toggleKeyword(keyword) {
  const i = selectedKeywords.indexOf(keyword);
  if (i > -1) selectedKeywords.splice(i, 1);
  else selectedKeywords.push(keyword);
  renderTags();
}

function removeKeyword(keyword) {
  selectedKeywords = selectedKeywords.filter((k) => k !== keyword);
  renderTags();
}

/** 고른 키워드를 검색창 안에 태그로 그린다 */
function renderTags() {
  const container = document.getElementById("tagContainer");
  const input = document.getElementById("searchInput");
  if (!container) return;

  container.innerHTML = "";

  selectedKeywords.forEach((keyword) => {
    const tag = document.createElement("div");
    tag.className = "keyword-tag";
    tag.textContent = keyword;
    tag.title = "누르면 지워집니다";

    tag.addEventListener("click", (e) => {
      // 검색 상자 전체에 걸린 "누르면 입력칸으로" 와 겹치지 않게 막는다
      e.stopPropagation();
      removeKeyword(keyword);
      input?.focus();
    });

    container.appendChild(tag);
  });

  // 태그가 있으면 안내 문구가 같이 보여 지저분하므로 잠시 숨긴다
  if (input) {
    input.placeholder = selectedKeywords.length
      ? ""
      : "예 : 애들 학원 보내기 좋은 조용한 동네";
  }

  updatePickCount();
}

/**
 * 몇 개 골랐는지 알려 준다.
 *
 * 고른 키워드는 태그(selectedKeywords)에 있고 입력칸에는 없다.
 * 직접 쓴 문장도 인정해 준다 — 안 그러면 길게 써 놓고도
 * "키워드를 고르세요" 를 계속 보게 된다
 */
function updatePickCount() {
  const input = document.getElementById("searchInput");
  const el = document.getElementById("pickCount");
  if (!input || !el) return;

  const n = selectedKeywords.length;
  const typed = input.value.trim().replace(/\s+/g, "").length >= 4;

  if (!n && !typed) {
    el.textContent = "";
    el.className = "pick-count";
  } else if (n && typed) {
    el.textContent = `키워드 ${n}개 + 직접 입력`;
    el.className = "pick-count ok";
  } else if (typed) {
    el.textContent = "직접 입력한 내용으로 찾아볼게요";
    el.className = "pick-count ok";
  } else if (n < MIN_PICK) {
    el.textContent = `${MIN_PICK}개 이상 고르면 더 정확해요 (지금 ${n}개)`;
    el.className = "pick-count";
  } else {
    el.textContent = `${n}개 선택됨`;
    el.className = "pick-count ok";
  }
}


/** 검색어에서 LLM이 읽어낸 건물유형·거래유형·예산을 "건축" 패널에 반영한다.
 *  가격 언급이 없었던 검색이면 housing이 null이라 아무것도 안 건드린다 */
function applyHousing(housing) {
  if (!housing) return;

  const bldg = document.getElementById("bldgType");
  if (bldg && housing.건물유형) {
    bldg.value = housing.건물유형;
    // change 이벤트를 직접 일으켜야 deal.js의 updatePriceAnyState() 같은
    // 연결된 로직도 같이 갱신된다 (applyWeights가 input 이벤트를 쏘는 것과 같은 이유)
    bldg.dispatchEvent(new Event("change", { bubbles: true }));
  }

  if (housing.거래유형) {
    // 이미 initDealType()(ui/deal.js)이 걸어둔 클릭 핸들러를 그대로 태운다 —
    // is-on 클래스 토글과 showDealGroup()까지 한 번에 해결된다
    document.querySelector(`.seg-btn[data-deal="${housing.거래유형}"]`)?.click();
  }

  const targets = housing.targets || {};
  const sliderId = PRICE_SLIDER_ID[housing.거래유형];
  if (sliderId && targets.예산 != null) {
    const slider = document.getElementById(sliderId);
    if (slider) {
      slider.value = targets.예산;
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }
  if (housing.거래유형 === "월세" && targets.보증금 != null) {
    const slider = document.getElementById("wolseDeposit");
    if (slider) {
      slider.value = targets.보증금;
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }
}


/**
 * 단어를 화면에 흩뿌린다.
 * 두 가지를 피한다.
 *   1) 중앙 부근(검색창 영역) — 글자가 검색창과 겹치지 않게
 *   2) 이미 놓인 단어 근처 — 단어끼리 겹쳐 읽히지 않게
 */
function placeWords() {
  const box = document.getElementById("ssWords");
  const cx = 50, cy = 50;          // 중앙 (%)
  const safeX = 32, safeY = 26;    // 중앙 여백
  const minGap = 11;               // 단어 사이 최소 간격 (%)
  const placed = [];

  // 세로는 화면이 납작하므로 0.55 를 곱해 실제 거리에 가깝게 본다
  const tooClose = (x, y) =>
    placed.some((p) => Math.hypot(p.x - x, (p.y - y) * 0.55) < minGap);

  // 목록을 섞어서 앞에서부터 VISIBLE_COUNT 개만 쓴다
  const shuffled = [...FLOAT_WORDS].sort(() => Math.random() - 0.5);

  shuffled.slice(0, VISIBLE_COUNT).forEach((word) => {
    let x, y, tries = 0;
    do {
      x = 5 + Math.random() * 86;
      y = 9 + Math.random() * 82;
      tries++;
    } while (
      tries < 200 &&
      ((Math.abs(x - cx) < safeX && Math.abs(y - cy) < safeY) || tooClose(x, y))
    );
    if (tries >= 200) return;      // 자리를 못 찾으면 건너뛴다
    placed.push({ x, y });

    box.appendChild(makeWord(word, x, y));
  });
}

/** 단어 하나를 만든다. 바깥은 표류, 안쪽은 자석 담당 */
function makeWord(word, x, y) {
  const outer = document.createElement("span");
  outer.className = "ss-word";
  outer.style.left = x + "%";
  outer.style.top = y + "%";
  // 단어마다 주기를 다르게 해야 전체가 규칙적으로 안 보인다
  outer.style.animationDuration = (18 + Math.random() * 22).toFixed(1) + "s";
  outer.style.animationDelay = (-Math.random() * 20).toFixed(1) + "s";

  const inner = document.createElement("span");
  inner.className = "ss-word-in";
  inner.textContent = word;
  inner.style.fontSize = (11 + Math.random() * 7).toFixed(1) + "px";
  inner.style.opacity = (0.35 + Math.random() * 0.3).toFixed(2);

  outer.appendChild(inner);

  outer.addEventListener("click", () => {
    // 여기서 word 를 쓰면 안 된다.
    // startRotation 이 글씨를 바꿔도 이 함수는 옛날 값을 기억하고 있다.
    // 눌리는 순간 화면에 적힌 글씨를 읽어야 항상 맞는다
    toggleKeyword(inner.textContent.trim());
    document.getElementById("searchInput")?.focus();
  });

  return outer;
}


/** 마우스에 가까운 단어가 끌려오게 한다 */
function startMagnetic() {
  let mx = -9999, my = -9999;
  let pending = false;

  document.addEventListener("mousemove", (e) => {
    mx = e.clientX;
    my = e.clientY;

    // mousemove 는 1초에 수십 번 일어난다.
    // 매번 계산하면 버벅이므로 화면 그릴 때 한 번만 계산한다
    if (!pending) {
      pending = true;
      requestAnimationFrame(() => {
        updateMagnetic(mx, my);
        pending = false;
      });
    }
  });
}

function updateMagnetic(mx, my) {
  // 검색 화면이 걷힌 뒤에는 계산할 이유가 없다.
  // 그대로 두면 mousemove 마다 getBoundingClientRect 를 20번씩 부르느라
  // 슬라이더 드래그 같은 다른 조작이 버벅인다
  const screen = document.getElementById("searchScreen");
  if (!screen || screen.classList.contains("out")) return;

  document.querySelectorAll(".ss-word").forEach((word) => {
    const inner = word.firstElementChild;
    const box = word.getBoundingClientRect();
    const dx = mx - (box.left + box.width / 2);
    const dy = my - (box.top + box.height / 2);
    const dist = Math.hypot(dx, dy);

    if (dist > PULL_RADIUS || dist === 0) {
      inner.style.transform = "translate(0, 0)";
      word.classList.remove("near");
      return;
    }

    // 가까울수록 강하게. dx/dist 는 방향만 남긴 값이다
    const pull = PULL_MAX * (1 - dist / PULL_RADIUS);
    inner.style.transform =
      `translate(${(dx / dist) * pull}px, ${(dy / dist) * pull}px)`;
    word.classList.add("near");
  });
}

/** 몇 초마다 단어 하나를 다른 것으로 바꾼다 */
function startRotation() {
  setInterval(() => {
    const screen = document.getElementById("searchScreen");
    if (screen && screen.classList.contains("out")) return;   // 안 보이면 건너뛴다

    const words = document.querySelectorAll(".ss-word");
    if (!words.length) return;

    const target = words[Math.floor(Math.random() * words.length)];
    const inner = target.firstElementChild;

    // 지금 화면에 없는 단어 중에서 고른다.
    // 이미 고른 키워드도 빼야 태그와 배경에 같은 말이 두 번 보이지 않는다
    const showing = new Set([...words].map((w) => w.textContent.trim()));
    const pool = FLOAT_WORDS.filter(
      (w) => !showing.has(w) && !selectedKeywords.includes(w)
    );
    if (!pool.length) return;

    const next = pool[Math.floor(Math.random() * pool.length)];
    const opacity = inner.style.opacity;

    // 사라졌다가 → 글자를 바꾸고 → 다시 나타난다
    inner.style.transition = "opacity 1s ease";
    inner.style.opacity = "0";

    setTimeout(() => {
      inner.textContent = next;
      inner.style.fontSize = (11 + Math.random() * 7).toFixed(1) + "px";
      inner.style.opacity = opacity;
      // 자석 transition 을 되돌려 놓는다
      setTimeout(() => {
        inner.style.transition = "";
      }, 1000);
    }, 1000);
  }, 4000);
}


/* =========================================================
   1차 — 유형 판정
   ========================================================= */

/**
 * 고른 키워드로 유형을 판정하고 카드를 띄운다.
 * LLM 을 안 타므로 거의 즉시 돌아온다
 */
async function runLifeType(query) {
  const btn = document.getElementById("searchBtn");
  const status = document.getElementById("searchStatus");

  const seq = nextSeq();
  btn.disabled = true;
  status.textContent = "라이프스타일을 살펴보는 중...";

  try {
    const t = await postLifeType(query);
    if (!isLatest(seq)) return;      // 오래된 응답은 버린다

    status.textContent = "";

    showTypeCard(t, {
      // 카드가 이 두 개를 눌렀을 때 부른다.
      // 2차 결과는 성공 여부(true/false)로 돌려줘야 카드가 닫을지 정한다
      onContinue: async () => {
        const ok = await runPredict(query, { autoClose: false });
        if (ok) closeSearch();
        return ok;
      },
      onSkip: () => runPredict(query),
    });

  } catch (err) {
    if (!isLatest(seq)) return;
    // 1차가 실패해도 2차로는 보내 준다. 검색 화면에 갇히는 것보다 낫다.
    // await 를 빼면 아래 finally 가 먼저 돌아 2차가 도는 동안 버튼이 다시 눌린다
    console.error(err);
    status.textContent = "유형 분석에 실패했어요. 바로 추천해 드릴게요.";
    await runPredict(query);

  } finally {
    btn.disabled = false;
  }
}


/* =========================================================
   2차 — 추천
   ========================================================= */

/**
 * 검색어를 서버로 보내 가중치를 받고, 슬라이더에 반영한 뒤
 * 결과 화면으로 넘어간다.
 *
 * LLM 을 태우므로 3~6초가 걸린다. 그동안 아무 반응이 없으면
 * 고장난 줄 알기 때문에 진행 문구를 단계별로 바꿔 준다.
 *
 * 성공하면 true 를 돌려준다 — 유형 카드가 이 값을 보고 닫을지 정한다
 */
async function runPredict(query, { from = "screen", autoClose = true } = {}) {
  const isTop = from === "top";
  const btn = document.getElementById(isTop ? "topSearchBtn" : "searchBtn");
  const status = document.getElementById(isTop ? "topSearchStatus" : "searchStatus");

  const seq = nextSeq();
  btn.disabled = true;                    // 중복 클릭 방지
  const stopSteps = showSteps(status);    // 진행 문구 시작

  try {
    // firstPayload() 는 1차를 거쳤을 때만 값이 있다.
    // 슬라이더를 직접 만졌으면 서버가 알아서 firstWeights 를 무시한다
    const data = await postPredict({ query, anonId: getAnonId(), ...firstPayload() });
    if (!isLatest(seq)) return false;     // 오래된 응답은 버린다

    stopSteps();
    applyWeights(data.weights);            // 슬라이더에 반영
    applyHousing(data.housing);            // "건축" 패널에 반영 — 가격 언급 없었으면 아무 일도 안 함
    renderResult(data);                    // 같은 응답으로 결과 화면 채우기
    fillTopSearch(query);                  // 결과 화면 상단 검색창에도 검색어를 남긴다

    // 무엇을 읽었는지 알려 준다
    status.textContent = topLabel(data.weights) + " 조건으로 찾았어요";

    if (autoClose) setTimeout(closeSearch, 800);
    return true;

  } catch (err) {
    if (!isLatest(seq)) return false;
    // LLM 이 실패해도 슬라이더 화면으로는 보내 준다.
    // 검색 화면에 갇히는 것보다 낫다
    console.error(err);
    stopSteps();
    status.textContent = "검색어 분석에 실패했어요. 슬라이더로 조절해 주세요.";
    if (autoClose) setTimeout(closeSearch, 1600);
    return false;

  } finally {
    btn.disabled = false;
  }
}


/** 몇 초 걸리는 동안 문구를 바꿔 준다. 멈추는 함수를 돌려준다 */
function showSteps(status) {
  const STEPS = [
    "검색어를 이해하는 중...",
    "비슷한 분들을 찾는 중...",
    "427개 동네를 비교하는 중...",
    "설명을 정리하는 중...",
  ];

  let i = 0;
  status.textContent = STEPS[0];

  const timer = setInterval(() => {
    i = Math.min(i + 1, STEPS.length - 1);   // 마지막에서 멈춘다
    status.textContent = STEPS[i];
  }, 1800);

  return () => clearInterval(timer);
}


/** 서버가 준 가중치를 슬라이더에 반영한다 */
function applyWeights(weights) {
  if (!weights) return;

  for (const [kor, value] of Object.entries(weights)) {
    const slider = document.getElementById(SLIDER_ID[kor]);
    if (!slider) continue;

    slider.value = Math.round(value);
    // input 이벤트를 직접 일으켜야 옆의 숫자 표시도 같이 갱신된다
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

/** 가장 높은 지표 두 개를 문구로 만든다 */
function topLabel(weights) {
  if (!weights) return "전체 조건을";
  return Object.entries(weights)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([kor]) => kor)
    .join(" · ");
}


function closeSearch() {
  document.getElementById("searchScreen").classList.add("out");
}


/* =========================================================
   설문(signup.html)에서 돌아왔을 때
   ========================================================= */

/**
 * 회원가입 설문을 마치고 돌아왔으면 그 답으로 바로 추천한다.
 *
 * 답은 persona 칸 이름(추천 엔진의 CHUNK_COLUMNS)으로 담겨 온다.
 * 여기서는 문장을 이어 붙여 검색어처럼 보낼 뿐이고,
 * 서버에 저장하는 것은 회원가입 백엔드가 생기면 붙인다
 *
 * @returns 설문으로 시작했으면 true — 그러면 유형 카드는 건너뛴다
 */
function runSurveyIfPending() {
  let raw;
  try {
    raw = sessionStorage.getItem(SURVEY_KEY);
  } catch {
    return false;                 // 사생활 보호 모드 등으로 막혀 있으면 그냥 넘어간다
  }
  if (!raw) return false;

  // 한 번 쓰고 지운다. 새로고침할 때마다 다시 돌면 곤란하다
  try { sessionStorage.removeItem(SURVEY_KEY); } catch { /* 무시 */ }

  let persona;
  try {
    persona = JSON.parse(raw);
  } catch {
    return false;
  }

  const answers = Object.values(persona).filter(Boolean).join(" ");
  if (!answers) return false;

  // 15개 답이 통째로 오므로 무엇인지 알려 주고 보낸다.
  // (저장용 persona 에는 이런 머리말을 붙이지 않는다 — signup.html 주석 참고)
  runPredict("다음은 사용자의 라이프스타일 설문 답변입니다. " + answers);
  return true;
}


/* =========================================================
   연결
   ========================================================= */

function bindEvents() {
  const input = document.getElementById("searchInput");

  const submit = () => {
    // 태그로 고른 단어와 직접 쓴 글자를 하나로 묶는다
    const combined = [...selectedKeywords, input.value.trim()]
      .filter(Boolean)
      .join(" ");

    if (!combined) { input.focus(); return; }
    runLifeType(combined);
  };

  document.getElementById("searchBtn").addEventListener("click", submit);

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });

  // 직접 쓰는 동안에도 안내 문구를 갱신한다
  input.addEventListener("input", updatePickCount);

  // 상자 아무 데나 눌러도 입력칸으로 간다. 태그는 stopPropagation 으로 막아 뒀다
  document.getElementById("searchBox")?.addEventListener("click", () => input.focus());

  document.getElementById("skipSearch").addEventListener("click", closeSearch);
  document.getElementById("menuToggle").addEventListener("click", openMenu);
  document.getElementById("loginToggle").addEventListener("click", openAuthModal);
}


// 페이지가 다 읽히면 시작한다
document.addEventListener("DOMContentLoaded", async () => {
  // 키워드 목록은 서버가 쥔다. 프론트에 박아 두면 lifetype.py 와 어긋난다
  try {
    const d = await getLifeTypeKeywords();
    if (d.all?.length) FLOAT_WORDS = d.all;
    if (d.minPick) MIN_PICK = d.minPick;
  } catch (err) {
    console.warn("[search] 키워드를 못 받아 예비 목록을 씁니다", err);
  }

  placeWords();
  startMagnetic();
  startRotation();
  bindEvents();

  // 설문을 마치고 돌아온 길이면 검색 화면을 띄우지 않고 바로 추천한다
  if (!runSurveyIfPending()) {
    setTimeout(() => document.getElementById("searchInput").focus(), 400);
  }
});


// ===== 상단 검색창 =====
// 결과 화면에서도 검색어를 보고 다시 검색할 수 있게 한다.
// 이미 결과를 보고 있으므로 1차 유형 카드는 건너뛰고 곧바로 2차로 간다

/** 검색이 끝나면 상단 검색창에 그 검색어를 채운다 */
function fillTopSearch(query) {
  const input = document.getElementById("topSearchInput");
  if (input) input.value = query || "";
}


function bindTopSearch() {
  const input = document.getElementById("topSearchInput");
  const btn = document.getElementById("topSearchBtn");
  if (!input || !btn) return;

  const submit = () => {
    const q = input.value.trim();
    if (!q) { input.focus(); return; }
    runPredict(q, { from: "top" });        // "top" 은 어느 창에서 왔는지 알리는 표시
  };

  btn.addEventListener("click", submit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });
}

document.addEventListener("DOMContentLoaded", bindTopSearch);
