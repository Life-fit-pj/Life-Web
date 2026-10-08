/**
 * "이용 안내 · 데이터 출처" 모달 — 탭 둘. 패널의 둥근 i 가 연다.
 *
 * 글은 아래 GUIDE(안내) · SOURCES(출처) 둘에만 있다 — 바뀌면 이 배열만 고친다(HTML 을 만지지 않는다).
 * 안내 그림은 img/guide/*.webp, 번호 동그라미는 그림 위에 % 좌표로 얹는다(그림에 안 박는다 — 글을 고칠 때 다시 안 찍는다).
 * 출처의 근거는 Life-Fit-main/docs/데이터-출처-대조.md. 랜딩(landing.html .sources)과 엔진 README 의 출처 글도 같은 내용이어야 한다.
 *
 * 링크는 아직 안 단다. 달 때는 항목에 url 을 더하고 renderItem 의 .sources-org 를 <a> 로 바꾼다.
 */

import { escapeAndFormat } from "../lib/format.js";

// 아이콘은 핀 상세(ui/reason.js 의 지표 아이콘)와 슬라이더 절 머리글(index.html)과 같은 것을 쓴다 — 한쪽을 바꾸면 같이 바꾼다
const SOURCES = [
  {
    icon: "📊",
    title: "동네 점수에 쓴 데이터 — 슬라이더 일곱",
    items: [
      { icon: "🌳", what: "녹지 — 공원 면적", org: "각 구청(공공데이터포털)" },
      { icon: "🛡️", what: "안전 — CCTV · 경찰관서", org: "서울 열린데이터 광장 · 경찰청(공공데이터포털)" },
      { icon: "🚇", what: "교통 — 버스정류장 · 지하철역", org: "서울 열린데이터 광장 · 서울교통공사(공공데이터포털)" },
      { icon: "🏪", what: "상권 — 점포 수 · 대형점포와 전통시장", org: "서울 열린데이터 광장" },
      { icon: "🏥", what: "의료 — 병원 · 의원 · 보건소", org: "서울 열린데이터 광장" },
      { icon: "📚", what: "교육 — 학교 · 학원", org: "서울특별시교육청(공공데이터포털) · 서울 열린데이터 광장" },
      { icon: "🎨", what: "문화 — 문화시설 · 도서관", org: "서울 열린데이터 광장" },
    ],
  },
  {
    icon: "📍",
    title: "동네 상세에 쓴 데이터",
    items: [
      { icon: "🌫️", what: "소음 · 초미세먼지 (자치구 단위)", org: "한국환경공단 · 국가소음정보시스템 · 서울 열린데이터 광장" },
      { icon: "👥", what: "세대원수 · 인구 이동", org: "서울 열린데이터 광장" },
      { icon: "🏢", what: "건물 수", org: "주소정보누리집 · 국토교통부 건축물대장" },
    ],
  },
  {
    icon: "🏠",
    title: "시세 · 평면도",
    items: [
      { what: "매매 · 전세 · 월세 시세", org: "국토교통부 실거래가 공개시스템" },
      { what: "평면도", org: "한국토지주택공사(LH)" },
    ],
  },
  {
    icon: "🗺️",
    title: "지도 · 행정동",
    items: [
      { what: "지도와 좌표", org: "카카오맵 API" },
      { what: "행정동 경계 · 면적 · 코드", org: "통계청 SGIS · 행정안전부 · 국가데이터처" },
    ],
  },
  {
    icon: "👤",
    title: "가상 회원(페르소나)",
    items: [
      { what: "서울 거주자 1,000명의 생활 묘사", org: "NVIDIA Nemotron-Personas-Korea" },
    ],
  },
  {
    icon: "📋",
    title: "지표와 가중치의 설계 근거",
    items: [
      { what: "일곱 지표(녹지 · 안전 · 교통 · 상권 · 의료 · 교육 · 문화)와 슬라이더 가중치의 기준 — 2024년 서울시 주거실태조사 마이크로데이터 (15,730명)",
        org: "국토교통부 · 서울특별시" },
    ],
  },
];

// 데이터가 못 보는 것. 채팅 안내문과 같은 내용이어야 한다
const LIMITS = [
  "산림(북한산 등)은 공원 데이터에 없습니다.",
  "소음과 초미세먼지는 자치구 평균이며, 소음은 측정값이 없는 동이 있습니다.",
  "거래가 적은 동의 시세는 법정동 · 자치구 값으로 대신합니다.",
];

const FOOTNOTE = "각 자료는 제공 기관의 공개 시점 기준이며 현재와 다를 수 있습니다.";

/* 이용 안내 — 장마다 그림 하나와 영역별 설명. x · y 는 **설명하는 영역의 왼쪽 위 모서리**(그림 폭 · 높이에 대한 %, 왼쪽 위가 0).
   한 영역에 번호 하나 — 세부는 lines 로 나눈다. chip 은 위의 넘기기 버튼 글. 그림을 다시 찍으면 숫자만 맞춘다 */
const GUIDE = [
  {
    icon: "🔍", chip: "검색", title: "조건을 정하고 검색하기", img: "img/guide/guide-search.webp",
    intro: "문장으로 적거나 슬라이더로 조건을 잡고 검색하면, 서울 427개 행정동 중 다섯 곳을 추천해요.",
    marks: [
      { n: 1, x: 2.2, y: 8.9, head: "검색창", lines: [
        "원하는 동네를 문장으로 — \"애들 학원 보내기 좋고 조용한 동네\"",
        "가격 조건도 같이 — \"월세 60만원 이내의 원룸\"",
        "검색을 누르면 3~6초 뒤 TOP 5",
      ] },
      { n: 2, x: 1.8, y: 15.7, head: "왼쪽 패널 — 조건", lines: [
        "건물 유형 · 거래 유형(매매 · 전세 · 월세) — 맞는 동네만 추려요",
        "희망 가격 · 면적 — 검색어에 적은 금액이 있으면 여기에도 반영돼요",
        "만족도 일곱(녹지 · 안전 · 교통 · 상권 · 의료 · 교육 · 문화) — AI 가 먼저 채우고, 손으로 고치면 그쪽으로 순위가 기울어요",
        "오른쪽 위 i — 이 안내와 데이터 출처",
      ] },
      { n: 3, x: 89.5, y: 3.2, head: "로그인 · 마이페이지", lines: [
        "로그인하면 검색 · 대화 · 좋아요가 남아요",
        "나의 라이프스타일에 더 적합한 지역을 찾을 수 있어요.",
      ] },
    ],
  },
  {
    icon: "📍", chip: "결과", title: "결과 읽기", img: "img/guide/guide-search.webp",
    intro: "오른쪽 패널의 점수 · 순위와 지도의 핀이 같은 다섯 곳이에요.",
    marks: [
      { n: 1, x: 74.1, y: 15.7, head: "오른쪽 패널 — 결과", lines: [
        "추천 1위 종합 점수 — 1위 동네의 점수(0~100). 지표 일곱의 백분위와 상대 강점을 섞은 값",
        "추천 지역 TOP 5 — 지도의 핀과 같은 번호",
        "맞춤형 LH 평면도 — 설정한 면적에 가까운 공공주택 평면도",
      ] },
      { n: 2, x: 35.9, y: 61.7, head: "지도의 순위 핀", lines: ["누르면 그 동네의 자세한 정보가 열려요"] },
      { n: 3, x: 48.2, y: 92.1, head: "채팅", lines: ["결과에 대해 더 물어봐요 — \"교통은 어디가 제일 좋아?\", \"지하철역 많은 순으로 다시 뽑아줘\""] },
    ],
  },
  {
    icon: "🏘️", chip: "동네 상세", title: "동네 자세히 보기", img: "img/guide/guide-detail.webp",
    intro: "지도의 핀을 누르면 열려요 — 내 조건과 얼마나 맞는지, 왜 골랐는지.",
    marks: [
      { n: 1, x: 35.2, y: 10.0, head: "머리 — 이름 · ♥ · MATCH · 한 줄 요약", lines: [
        "♥ 를 누르면 좋아요(로그인 필요). 마이페이지에서 모아 봐요",
        "MATCH — 내 조건과 얼마나 맞는지",
        "한 줄 요약 — 모자란 지표와 기대 이상인 지표",
      ] },
      { n: 2, x: 42.5, y: 31.5, head: "레이더", lines: ["실선이 이 동네, 점선이 내가 원한 수준"] },
      { n: 3, x: 34.0, y: 56.7, head: "이 동네를 고른 이유", lines: ["AI 가 데이터를 근거로 쓴 설명. 시세는 동네 전체 중앙값이에요"] },
      { n: 4, x: 34.0, y: 72.4, head: "탭 넷", lines: [
        "5점 점수표 — 지표 일곱의 점수와 서울 안에서 상위 몇 %인지",
        "생활 여건 — 학원 · 의료기관 · 학교 · 공원 · 점포 개수와 이름, 거주 안정성(전입 · 전출) · 가구 구성 · 보행 편의 · 소음 · 초미세먼지(자치구 평균). 점수는 서울 427개 행정동 안에서의 백분위",
        "주변 시세 — 고른 건물 · 거래 유형의 동네 전체 중앙값(실제 매물이 아니에요) · 희망 가격과의 일치도 · 거래 건수 · 신뢰등급 · 출처(거래가 적으면 법정동 · 자치구 값으로 대신해요)",
        "로드뷰 — 거리 모습",
      ] },
    ],
  },
  {
    icon: "👤", chip: "마이페이지", title: "마이페이지", img: "img/guide/guide-mypage.webp",
    intro: "로그인하면 오른쪽 위 버튼이 마이페이지로 바뀌어요.",
    marks: [
      { n: 1, x: 25.8, y: 12.6, head: "탭 넷", lines: [
        "내 정보 — 가입 때 적은 기본정보. 지금은 보기만 할 수 있어요",
        "나의 이야기 — 가입 설문에 적은 글 아홉 칸. 추천에만 쓰여요",
        "검색 · 대화 기록 — 로그인한 뒤의 검색어와 채팅 문답",
        "좋아요 한 거주지 — 핀 상세의 ♥ 로 모은 동네. 취소도 여기서",
      ] },
      { n: 2, x: 26.9, y: 17.8, head: "내 정보", lines: ["가입 때 적은 정보. 지금은 보기만 할 수 있어요"] },
      { n: 3, x: 26.9, y: 78.8, head: "계정", lines: ["회원 번호 · 가입일 · 로그아웃"] },
    ],
  },
];

let sourcesModalEl = null;

// 아이콘은 우리가 적은 글자(이모지)라 escape 하지 않는다. 없으면 빈 칸
function renderIcon(icon) {
  return icon ? `<span class="sources-icon" aria-hidden="true">${icon}</span>` : "";
}

function renderItem(item) {
  return `
    <div class="sources-row">
      <span class="sources-what">${renderIcon(item.icon)}${escapeAndFormat(item.what)}</span>
      <span class="sources-org">${escapeAndFormat(item.org)}</span>
    </div>
  `;
}

function renderBody() {
  const groups = SOURCES.map((group) => `
    <section class="sources-group">
      <h4 class="sources-group-title">${renderIcon(group.icon)}${escapeAndFormat(group.title)}</h4>
      ${group.items.map(renderItem).join("")}
    </section>
  `).join("");

  const limits = `
    <section class="sources-group">
      <h4 class="sources-group-title">${renderIcon("⚠️")}이 서비스가 모르는 것</h4>
      <ul class="sources-limits">
        ${LIMITS.map((line) => `<li>${escapeAndFormat(line)}</li>`).join("")}
      </ul>
    </section>
  `;

  return groups + limits + `<p class="sources-footnote">${escapeAndFormat(FOOTNOTE)}</p>`;
}

// 안내 한 장 — 왼쪽 그림(영역마다 번호 하나), 오른쪽 흰 카드에 제목 · 소개 · 영역별 글. 처음에는 첫 장만 보인다.
// 글은 escape 하고 좌표 · 번호 · 아이콘은 우리가 적은 것이다
function renderGuidePage(page, i) {
  const marks = page.marks.map((m) => `<span class="guide-mark" style="left:${m.x}%;top:${m.y}%">${m.n}</span>`).join("");
  const items = page.marks.map((m) => `
      <li><span class="guide-num">${m.n}</span><div><b>${escapeAndFormat(m.head)}</b>
        <ul>${m.lines.map((l) => `<li>${escapeAndFormat(l)}</li>`).join("")}</ul></div></li>`).join("");
  return `
    <section class="guide-page${i === 0 ? " is-active" : ""}" data-page="${i}">
      <div class="guide-shot"><img src="${page.img}" alt="${escapeAndFormat(page.title)}">${marks}</div>
      <div class="guide-text">
        <h4 class="sources-group-title">${renderIcon(page.icon)}${i + 1}. ${escapeAndFormat(page.title)}</h4>
        <p class="guide-intro">${escapeAndFormat(page.intro)}</p>
        <ol class="guide-list">${items}</ol>
      </div>
    </section>`;
}

// 위의 흐름 칩이 넘기기 버튼이다. 키보드 ← → 도 같은 일. 양 끝 화살표는 없앴다 — 칩으로 충분하다
function renderGuide() {
  const chips = GUIDE.map((p, i) => `<button type="button" class="guide-chip${i === 0 ? " is-active" : ""}" data-page="${i}">${p.icon} ${escapeAndFormat(p.chip)}</button>`).join("<i>→</i>");
  return `
    <div class="guide-flow">${chips}</div>
    <div class="guide-stage">${GUIDE.map(renderGuidePage).join("")}</div>`;
}

let guideIndex = 0;

// 장 넘기기 — 새 장이 이동 방향에서 미끄러져 들어온다(sources.css 의 guide-in-left · guide-in-right). 끝에서 다음은 첫 장으로
function showGuidePage(i) {
  const next = (i + GUIDE.length) % GUIDE.length;
  if (next === guideIndex && sourcesModalEl.querySelector(".guide-page.is-active")) return;
  const fromRight = next > guideIndex || (guideIndex === GUIDE.length - 1 && next === 0);
  guideIndex = next;
  sourcesModalEl.querySelectorAll(".guide-page").forEach((p) => {
    const on = Number(p.dataset.page) === guideIndex;
    p.classList.remove("from-left", "from-right");
    if (on) p.classList.add(fromRight ? "from-right" : "from-left");
    p.classList.toggle("is-active", on);
  });
  sourcesModalEl.querySelectorAll(".guide-chip").forEach((b) => b.classList.toggle("is-active", Number(b.dataset.page) === guideIndex));
}

function showTab(name) {
  sourcesModalEl.querySelectorAll(".sources-tab").forEach((b) => b.classList.toggle("is-active", b.dataset.tab === name));
  sourcesModalEl.querySelectorAll(".sources-pane").forEach((p) => p.classList.toggle("is-active", p.dataset.tab === name));
  const modal = sourcesModalEl.querySelector(".sources-modal");
  modal.classList.toggle("is-guide", name === "guide");    // 안내 탭은 그림 + 글을 나란히 두려고 모달이 넓다(sources.css)
  modal.scrollTop = 0;
}

function ensureSourcesPanel() {
  if (sourcesModalEl) return sourcesModalEl;

  sourcesModalEl = document.createElement("div");
  sourcesModalEl.className = "sources-backdrop";
  sourcesModalEl.innerHTML = `
    <div class="sources-modal">
      <button class="sources-close" aria-label="닫기">&times;</button>
      <h3 class="sources-title">이용 안내 · 데이터 출처</h3>
      <nav class="sources-tabs">
        <button type="button" class="sources-tab is-active" data-tab="guide">이용 안내</button>
        <button type="button" class="sources-tab" data-tab="sources">데이터 출처</button>
      </nav>
      <div class="sources-pane is-active" data-tab="guide">${renderGuide()}</div>
      <div class="sources-pane" data-tab="sources" id="sourcesBody">${renderBody()}</div>
    </div>
  `;
  document.body.appendChild(sourcesModalEl);

  sourcesModalEl.addEventListener("click", (e) => {
    if (e.target === sourcesModalEl) closeSources();
  });
  sourcesModalEl.querySelector(".sources-close").addEventListener("click", closeSources);
  sourcesModalEl.querySelectorAll(".sources-tab").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
  sourcesModalEl.querySelectorAll(".guide-chip").forEach((b) => b.addEventListener("click", () => showGuidePage(Number(b.dataset.page))));
  document.addEventListener("keydown", (e) => {        // 핀 상세(reason.js)처럼 Escape 로 닫고, 안내 탭에서는 ← → 로 장을 넘긴다
    if (!sourcesModalEl.classList.contains("is-open")) return;
    const onGuide = sourcesModalEl.querySelector(".sources-modal").classList.contains("is-guide");
    if (e.key === "Escape") closeSources();
    else if (onGuide && e.key === "ArrowRight") showGuidePage(guideIndex + 1);
    else if (onGuide && e.key === "ArrowLeft") showGuidePage(guideIndex - 1);
  });

  return sourcesModalEl;
}

/** tab 은 "guide"(기본) 또는 "sources" — 출처를 바로 열고 싶은 곳(랜딩 등)은 openSources("sources") */
export function openSources(tab = "guide") {
  ensureSourcesPanel().classList.add("is-open");
  showTab(typeof tab === "string" ? tab : "guide");      // 클릭 이벤트가 그대로 들어와도 기본 탭
}

function closeSources() {
  if (!sourcesModalEl) return;
  sourcesModalEl.classList.remove("is-open");
}
