/**
 * "원본 데이터 및 출처 안내" 모달.
 *
 * 글은 아래 SOURCES 하나에만 있다 — 출처가 바뀌면 이 배열만 고친다(HTML 을 만지지 않는다).
 * 무엇이 어디서 왔는지의 근거는 Life-Fit-main/docs/데이터-출처-대조.md.
 * 랜딩(landing.html .sources)과 엔진 README 의 출처 글도 같은 내용이어야 한다.
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

function ensureSourcesPanel() {
  if (sourcesModalEl) return sourcesModalEl;

  sourcesModalEl = document.createElement("div");
  sourcesModalEl.className = "sources-backdrop";
  sourcesModalEl.innerHTML = `
    <div class="sources-modal">
      <button class="sources-close" aria-label="닫기">&times;</button>
      <h3 class="sources-title">원본 데이터 및 출처 안내</h3>
      <div id="sourcesBody">${renderBody()}</div>
    </div>
  `;
  document.body.appendChild(sourcesModalEl);

  sourcesModalEl.addEventListener("click", (e) => {
    if (e.target === sourcesModalEl) closeSources();
  });
  sourcesModalEl.querySelector(".sources-close").addEventListener("click", closeSources);

  return sourcesModalEl;
}

export function openSources() {
  ensureSourcesPanel().classList.add("is-open");
}

function closeSources() {
  if (!sourcesModalEl) return;
  sourcesModalEl.classList.remove("is-open");
}
