/* =========================================================
   search.js — 검색 (지도 화면)

   흐름은 두 단계다.
     1차  랜딩 맨 아래 테스트 칸(ui/landing-test.js)이 /api/lifetype 을 불러 유형 카드를 랜딩 위에 띄운다.
          LLM 을 안 타서 즉시 나오고, 로그인하지 않아도 볼 수 있다
     2차  카드에서 '5곳 보기' 를 누르면(손님은 로그인을 마치면) 검색어와 1차 결과를 sessionStorage 에 맡기고
          이 화면으로 온다. 여기서 /api/predict 로 보낸다 — LLM 이 7개 지표 가중치를 만들고 결과를 그린다

   상단 검색창은 1차를 건너뛰고 곧바로 2차로 간다 —
   이미 결과를 보고 있는 사람에게 유형 카드를 다시 띄울 이유가 없다
   ========================================================= */

import { postPredict } from "../lib/api.js";
import { nextSeq, isLatest, getAnonId, isLoggedIn } from "../lib/state.js";
import { renderResult } from "./result.js";
import { handleLoginToggleClick, syncLoginToggle, openAuthModal } from "./menu.js";
import { openSources } from "./sources.js";
import { showTypeCard, firstPayload, clearType } from "./lifetype.js";


// signup.html 이 설문 답을 넣어 두는 자리. 키 이름을 바꾸면 양쪽 다 고쳐야 한다
const SURVEY_KEY = "lifefit-survey";

// 랜딩 테스트 칸(ui/landing-test.js)이 검색어를 맡겨 두는 자리. 키 이름을 바꾸면 양쪽 다 고친다. 담는 것은 { query: 검색어, type: 1차 결과 }
const PENDING_KEY = "lifefit-pending-query";

// 서버가 준 한국어 지표명 → 슬라이더 id
const SLIDER_ID = {
  "녹지": "greenery", "안전": "safety", "교통": "transport",
  "상권": "commercial", "의료": "medical", "교육": "education",
  "문화": "culture",
};

// 거래유형 → 그 유형이 쓰는 예산 슬라이더 id
const PRICE_SLIDER_ID = { "매매": "salePrice", "전세": "jeonseDeposit", "월세": "wolseRent" };

// 진행 문구를 띄울 곳. 예전 첫 화면이 없어져 상단 검색창 아래 한 곳만 쓴다
const statusEl = () => document.getElementById("topSearchStatus");
const busyBtn = () => document.getElementById("topSearchBtn");


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


/* =========================================================
   2차 — 추천
   ========================================================= */

/**
 * 검색어를 서버로 보내 가중치를 받고, 슬라이더에 반영한 뒤 결과를 그린다.
 *
 * LLM 을 태우므로 3~6초가 걸린다. 그동안 아무 반응이 없으면
 * 고장난 줄 알기 때문에 진행 문구를 단계별로 바꿔 준다.
 *
 * 성공하면 true 를 돌려준다 — 유형 카드가 이 값을 보고 닫을지 정한다
 */
async function runPredict(query) {
  if (!isLoggedIn()) {
    openAuthModal();
    return false;
  }

  const btn = busyBtn();
  const status = statusEl();
  const seq = nextSeq();
  if (btn) btn.disabled = true;           // 중복 클릭 방지
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
    fillTopSearch(query);                  // 상단 검색창에도 검색어를 남긴다

    // 무엇을 읽었는지 알려 준다
    if (status) status.textContent = topLabel(data.weights) + " 조건으로 찾았어요";
    return true;

  } catch (err) {
    if (!isLatest(seq)) return false;
    console.error(err);
    stopSteps();
    if (status) {
      status.textContent = err.status === 429
        ? "오늘 AI 검색 횟수를 다 썼어요. 슬라이더로 찾아보시거나 로그인해 주세요."
        : "검색어 분석에 실패했어요. 슬라이더로 조절해 주세요.";
    }
    return false;

  } finally {
    if (btn) btn.disabled = false;
  }
}


/** 몇 초 걸리는 동안 문구를 바꿔 준다. 멈추는 함수를 돌려준다 */
function showSteps(status) {
  if (!status) return () => {};
  const STEPS = [
    "검색어를 이해하는 중...",
    "비슷한 분들을 찾는 중...",
    "427개 동네를 비교하는 중...",
    "설명을 정리하는 중...",
  ];

  let i = 0;
  status.textContent = STEPS[0];
  status.classList.add("is-loading");   // 문구 옆에 로딩 원을 띄운다

  const timer = setInterval(() => {
    i = Math.min(i + 1, STEPS.length - 1);   // 마지막에서 멈춘다
    status.textContent = STEPS[i];
  }, 1800);

  return () => {
    clearInterval(timer);
    status.classList.remove("is-loading");
  };
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


/* =========================================================
   다른 페이지에서 넘어왔을 때
   ========================================================= */

/** sessionStorage 에서 한 번 꺼내고 지운다. 새로고침할 때마다 다시 돌면 곤란하다 */
function takeOnce(key) {
  try {
    const v = sessionStorage.getItem(key);
    if (v) sessionStorage.removeItem(key);
    return v;
  } catch {
    return null;                  // 사생활 보호 모드 등으로 막혀 있으면 그냥 넘어간다
  }
}

/**
 * 회원가입 설문을 마치고 돌아왔으면 그 답으로 바로 추천한다.
 * 답은 persona 칸 이름(추천 엔진의 CHUNK_COLUMNS)으로 담겨 온다.
 *
 * @returns 설문으로 시작했으면 true
 */
function runSurveyIfPending() {
  const raw = takeOnce(SURVEY_KEY);
  if (!raw) return false;

  let persona;
  try { persona = JSON.parse(raw); } catch { return false; }

  const answers = Object.values(persona).filter(Boolean).join(" ");
  if (!answers) return false;

  // 15개 답이 통째로 오므로 무엇인지 알려 주고 보낸다.
  // (저장용 persona 에는 이런 머리말을 붙이지 않는다 — signup.html 주석 참고)
  runPredict("다음은 사용자의 라이프스타일 설문 답변입니다. " + answers);
  return true;
}

/**
 * 랜딩에서 맡긴 검색어와 1차 결과가 있으면 2차를 돌린다.
 * 1차 결과가 있으면 랜딩에서 본 유형 카드를 다시 띄우고 '5곳 보기' 를 누른다 — 카드가 "탐색 중"을 보여 주다가
 * 결과가 나오면 걷힌다(lifetype.js 의 원래 동작). 문장만 왔으면(1차 없음) 카드 없이 바로 2차
 *
 * 보통은 랜딩에서 로그인까지 마치고 온다. 로그인이 풀려 있으면 여기서 로그인 창부터 —
 * 구글에서 돌아오는 중이면 로그인 창이 입력칸 대신 "확인 중"을 보여 준다(menu.js).
 * 로그인이 끝나면 menu.js 가 "lifefit:login" 을 알린다 — 그때 이어서 돈다
 */
function runPendingQuery() {
  const raw = takeOnce(PENDING_KEY);
  if (!raw) return;
  let p;
  try { p = JSON.parse(raw); } catch { return; }

  fillTopSearch(p.query);
  const go = () => {
    if (!p.type) { clearType(); runPredict(p.query); return; }
    showTypeCard(p.type, { onContinue: () => runPredict(p.query), onSkip: () => {} });
    document.getElementById("trContinue")?.click();
  };
  if (isLoggedIn()) { go(); return; }

  // 구글 로그인은 페이지를 떠났다 오므로 다시 맡겨 둔다
  try { sessionStorage.setItem(PENDING_KEY, raw); } catch { /* 무시 */ }
  openAuthModal();
  window.addEventListener("lifefit:login", () => {
    takeOnce(PENDING_KEY);
    go();
  }, { once: true });
}


/* =========================================================
   연결
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("sourcesLink")?.addEventListener("click", openSources);
  document.getElementById("loginToggle").addEventListener("click", handleLoginToggleClick);
  syncLoginToggle();

  // 설문을 마치고 왔으면 그 답으로, 아니면 랜딩에서 맡긴 검색어로 시작한다.
  // 둘 다 아니면(직접 설정할게요 · 먼저 둘러볼게요 · 주소로 바로 옴) 지도 화면을 그대로 보여 준다
  if (runSurveyIfPending()) takeOnce(PENDING_KEY);   // 설문으로 시작했으면 맡겨 둔 검색어는 버린다 — 남겨 두면 다음에 혼자 돈다
  else runPendingQuery();
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
    // 버튼 클릭은 disabled 로 막히지만, 이 함수는 Enter 키로도 불려서
    // 그쪽은 disabled 를 안 본다 — 여기서 직접 막는다
    if (btn.disabled) return;

    const q = input.value.trim();
    if (!q) { input.focus(); return; }
    runPredict(q);
  };

  btn.addEventListener("click", submit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });
}

document.addEventListener("DOMContentLoaded", bindTopSearch);
