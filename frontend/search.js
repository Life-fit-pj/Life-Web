/* =========================================================
   search.js — 1차 검색 화면
   검색어를 서버(/api/predict)로 보내면 LLM 이 7개 지표 가중치를
   만들어 준다. 그 값을 슬라이더에 반영하고 결과 화면으로 넘어간다.
   ========================================================= */

// 배경에 떠다닐 단어들. 클릭하면 검색창에 들어간다.
// 우리 7개 지표로 답할 수 있는 것만 넣는다 —
// 답 못 하는 걸 예시로 주면 첫인상을 망친다
const FLOAT_WORDS = [
  "조용한 골목", "역세권", "공세권", "산책로", "학군", "치안",
  "한강뷰", "카페거리", "도서관", "녹지", "신축", "전세",
  "반려동물", "재택근무", "출퇴근 30분", "병원 가까운",
  "문화공간", "원룸", "숲세권", "대형마트",
  "학원가", "전통시장", "아이 키우기 좋은", "부모님과 함께",
  "밤에도 밝은", "혼자 살기 좋은", "공원 산책", "동네 병원",
  "전시 보러 가기", "장 보기 편한",
];

const VISIBLE_COUNT = 14;   // 한 번에 화면에 띄울 개수. 나머지는 교체용 예비
const PULL_RADIUS = 140;    // 마우스가 이 거리(px) 안에 오면 반응
const PULL_MAX = 18;        // 최대로 끌려오는 거리(px)

// 서버가 주는 한국어 지표명 → 슬라이더 id
const SLIDER_ID = {
  "녹지": "greenery", "안전": "safety", "교통": "transport",
  "상권": "commercial", "의료": "medical", "교육": "education",
  "문화": "culture",
};


/**
 * 단어를 화면에 흩뿌린다.
 * 두 가지를 피한다.
 *   1) 중앙make(검색창 영역) — 글자가 검색창과 겹치지 않게
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
    const current = inner.textContent.trim();

    const input = document.getElementById("searchInput");
    input.value = input.value ? input.value + " " + current : current;
    input.focus();
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
    const words = document.querySelectorAll(".ss-word");
    if (!words.length) return;

    const target = words[Math.floor(Math.random() * words.length)];
    const inner = target.firstElementChild;

    // 지금 화면에 없는 단어 중에서 고른다
    const showing = new Set([...words].map((w) => w.textContent.trim()));
    const pool = FLOAT_WORDS.filter((w) => !showing.has(w));
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


/**
 * 검색어를 서버로 보내 가중치를 받고, 슬라이더에 반영한 뒤
 * 결과 화면으로 넘어간다.
 *
 * 기존 데모는 키워드 규칙(parseQuery)으로 즉시 처리했지만,
 * 지금은 LLM 을 태우므로 3~6초가 걸린다.
 * 그동안 아무 반응이 없으면 고장난 줄 알기 때문에
 * 진행 문구를 단계별로 바꿔 준다
 */
async function runSearch(query) {
  const btn = document.getElementById("searchBtn");
  const status = document.getElementById("searchStatus");

  btn.disabled = true;                    // 중복 클릭 방지
  const stopSteps = showSteps(status);    // 진행 문구 시작

  try {
    const res = await fetch("/api/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: query }),
    });

    if (!res.ok) throw new Error("서버 응답 오류 " + res.status);

    const data = await res.json();

    stopSteps();
    applyWeights(data.weights);            // 슬라이더에 반영
    renderResult(data);                    // 같은 응답으로 결과 화면 채우기

    // 무엇을 읽었는지 알려 준다
    status.textContent = topLabel(data.weights) + " 조건으로 찾았어요";

    setTimeout(closeSearch, 800);

  } catch (err) {
    // LLM 이 실패해도 슬라이더 화면으로는 보내 준다.
    // 검색 화면에 갇히는 것보다 낫다
    console.error(err);
    stopSteps();
    status.textContent = "검색어 분석에 실패했어요. 슬라이더로 조절해 주세요.";
    setTimeout(closeSearch, 1600);

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

function reopenSearch() {
  const el = document.getElementById("searchScreen");
  el.classList.remove("out");
  const input = document.getElementById("searchInput");
  input.value = "";
  document.getElementById("searchStatus").textContent = "";
  setTimeout(() => input.focus(), 400);
}

/** 버튼과 키 입력을 연결한다 */
function bindEvents() {
  const input = document.getElementById("searchInput");
  const submit = () => {
    const q = input.value.trim();
    if (!q) { input.focus(); return; }
    runSearch(q);
  };

  document.getElementById("searchBtn").addEventListener("click", submit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });

  document.getElementById("skipSearch").addEventListener("click", closeSearch);
  document.getElementById("reopenSearch").addEventListener("click", reopenSearch);
}

// 페이지가 다 읽히면 시작한다
document.addEventListener("DOMContentLoaded", () => {
  placeWords();
  startMagnetic();
  startRotation();
  bindEvents();
  setTimeout(() => document.getElementById("searchInput").focus(), 400);
});