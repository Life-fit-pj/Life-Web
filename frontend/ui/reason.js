import { postRegion, postRegionExplain } from "../lib/api.js";
import { state } from "../lib/state.js";
import { escapeAndFormat, splitRegionName } from "../lib/format.js";

// ===== 추천 사유 패널 =====

// 서버는 한국어 지표명을 주고, 슬라이더는 영문 id 를 쓴다
const CRITERIA = ["녹지", "안전", "교통", "상권", "의료", "교육", "문화"];

const CRITERIA_EMOJI = {
  "녹지": "🌳", "안전": "🛡️", "교통": "🚇", "상권": "🏪",
  "의료": "🏥", "교육": "📚", "문화": "🎨",
};


// 모달 껍데기
let modalEl = null;

function ensureModal() {
  if (modalEl) return modalEl;

  modalEl = document.createElement("div");
  modalEl.className = "reason-backdrop";
  modalEl.innerHTML = `
    <div class="reason-modal" role="dialog" aria-modal="true">
      <button class="reason-close" aria-label="닫기">&times;</button>
      <div class="reason-body"></div>
    </div>`;
  document.body.appendChild(modalEl);

  // 배경(어두운 영역)을 클릭하면 닫힘. 카드 안쪽 클릭은 무시
  modalEl.addEventListener("click", (e) => {
    if (e.target === modalEl) closeReasonModal();
  });
  modalEl.querySelector(".reason-close").addEventListener("click", closeReasonModal);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeReasonModal();
  });

  return modalEl;
}


export function openReasonModal(item, weights) {
  const el = ensureModal();
  el.querySelector(".reason-body").innerHTML = buildReasonCard(item, weights);
  el.classList.add("is-open");
  document.body.style.overflow = "hidden";     // 뒤 화면 스크롤 잠금
  el.querySelector(".reason-close").focus();

  bindReasonTabs(el, item);

  // 카드가 화면에 붙은 뒤에 그려야 canvas 크기가 잡힌다
  drawRadar(buildRows(item, weights));

  // 막대는 이미 있는 데이터로 즉시 보여 주고,
  // 시설 정보/LLM 설명은 서버 응답이 오는 대로 나중에 채운다
  loadFacilities(item.name);
  loadRegionExplain(item, weights);
}


/** 시설 정보를 받아 카드에 채운다 */
async function loadFacilities(fullName) {
  const box = document.getElementById("rcFacility");
  if (!box) return;

  const { gu, dong } = splitRegionName(fullName);

  try {
    const data = await postRegion(gu, dong);
    box.innerHTML = buildFacilityHtml(data);
  } 

    catch (err) {
    console.error(err);
    box.innerHTML = "";      // 실패하면 조용히 비운다. 나머지는 이미 보인다
  }
}


/** 동네 하나에 대한 LLM 설명을 받아 채운다 */
async function loadRegionExplain(item, weights) {
  const box = document.getElementById("rcLlm");
  if (!box) return;

  const { gu, dong } = splitRegionName(item.name);

  box.innerHTML = `<div class="rc-loading">이 동네가 왜 맞는지 정리하는 중...</div>`;

  try {
    const data = await postRegionExplain(
      gu, dong, state.lastQuery, weights, item.scores, state.lastHousing);
    if (!data.explanation) { box.innerHTML = ""; return; }

    box.innerHTML = `
      <div class="rc-fac-head">💬 이 동네를 고른 이유</div>
      <div class="rc-llm-body">${escapeAndFormat(data.explanation)}</div>`;

  } catch (err) {
    console.error(err);
    box.innerHTML = "";      // 실패하면 조용히 비운다. 나머지는 이미 보인다
  }
}


function closeReasonModal() {
  if (!modalEl) return;
  modalEl.classList.remove("is-open");
  document.body.style.overflow = "";
  roadviewInstance = null;     // 다음에 열릴 모달에서 로드뷰가 다시 초기화되도록
}


/** 탭 버튼 클릭에 맞춰 패널을 바꿔 보여준다 */
function bindReasonTabs(el, item) {
  el.querySelectorAll(".rc-tab-head").forEach((head) => {
    head.addEventListener("click", () => {
      const name = head.dataset.tab;

      el.querySelectorAll(".rc-tab-head")
        .forEach((h) => h.classList.toggle("is-active", h === head));
      el.querySelectorAll(".rc-tab-panel")
        .forEach((p) => p.classList.toggle("is-active", p.dataset.tabPanel === name));

      if (name === "roadview") initRoadview(item);
    });
  });
}


// 모달을 새로 열 때마다 buildReasonCard()가 #rcRoadview 를 완전히 새로 만들기 때문에,
// 이전 모달에서 만든 Roadview 인스턴스는 더 이상 쓸 수 있는 DOM에 붙어있지 않다.
// closeReasonModal()에서 null 로 되돌려야 다음 모달에서 다시 초기화된다
let roadviewInstance = null;

/** 로드뷰 탭을 처음 열 때만 실행된다(지연 초기화) — 숨겨진 상태에서 만들면 지도가 깨진다 */
function initRoadview(item) {
  if (roadviewInstance) return;

  const container = document.getElementById("rcRoadview");
  if (!container || typeof kakao === "undefined") return;

  const position = new kakao.maps.LatLng(item.lat, item.lng);
  const client = new kakao.maps.RoadviewClient();

  // 반경 50m 안에서 가장 가까운 로드뷰 파노라마를 찾는다
  client.getNearestPanoId(position, 50, (panoId) => {
    if (!panoId) {
      container.innerHTML = "<div class='rc-empty'>이 위치는 로드뷰를 지원하지 않아요.</div>";
      return;
    }
    roadviewInstance = new kakao.maps.Roadview(container);
    roadviewInstance.setPanoId(panoId, position);
  });
}


// 카드내용

/** 지표별 판단을 계산한다. 카드와 레이더 차트가 같은 값을 쓴다 */
function buildRows(item, weights) {
  return CRITERIA.map((key) => {
    const want = Math.round(weights?.[key] ?? 3);
    const pct = item.scores?.[key] ?? 50;
    const got = Math.max(1, Math.min(5, Math.ceil(pct / 20)));

    const gap = got - want;
    let matchState, word;
    if (gap >= 1)       { matchState = "over";  word = "넉넉해요"; }
    else if (gap === 0) { matchState = "match"; word = "딱 맞아요"; }
    else                { matchState = "under"; word = "조금 아쉬워요"; }

    const dots = [1, 2, 3, 4, 5]
      .map((n) => `<i class="${n <= got ? "on" : ""}"></i>`)
      .join("");

    const pctText = pct >= 70 ? `상위 ${100 - Math.round(pct)}%` : "";

    return { key, want, got, pct, gap, matchState, word, dots, pctText };
  });
}


function buildReasonCard(item, weights) {
  const rows = buildRows(item, weights);
  
  const short = rows.filter((r) => r.gap < 0);
  // 기대보다 얼마나 넉넉한지를 먼저 보고, 같으면 중요하게 본 순
  const strong = rows
    .filter((r) => r.gap > 0)
    .sort((a, b) => (b.gap - a.gap) || (b.want - a.want) || (b.pct - a.pct));

  const headline = short.length === 0
    ? "원하신 조건을 모두 충족하는 지역이에요 👍"
    : `${short.map((r) => r.key).join("·")}만 조금 아쉽고, 나머지는 잘 맞아요`;

  const sub = strong.length
    ? `특히 <b>${strong.slice(0, 2).map((r) => CRITERIA_EMOJI[r.key] + " " + r.key).join(", ")}</b> 항목이 기대하신 수준 이상이에요.`
    : "요청하신 수준에 고르게 맞는 지역이에요.";

  const rowsHtml = rows.map((r) => `
    <div class="rc-row">
      <div class="rc-row-name">${CRITERIA_EMOJI[r.key]} ${r.key}</div>
      <div class="rc-dots ${r.matchState}">${r.dots}</div>
      <div class="rc-word ${r.matchState}">${r.word}</div>
      <div class="rc-pct">${r.pctText}</div>
    </div>`).join("");

  return `
    <div class="reason-card">
      <div class="rc-eyebrow">${item.rank}순위 추천 지역</div>
      <div class="rc-head">
        <div class="rc-name">${item.name.replace("서울특별시 ", "")}</div>
        <div class="rc-score">${Math.round(item.score ?? 0)}<span>MATCH</span></div>
      </div>
      <div class="rc-reason">
        <div class="rc-headline">${headline}</div>
        ${sub ? `<div class="rc-sub">${sub}</div>` : ""}
      </div>

      <div class="rc-chart"><canvas id="rcRadar"></canvas></div>

      <!-- LLM 설명이 채워지는 자리. 시설보다 오래 걸린다 -->
      <div class="rc-llm" id="rcLlm"></div>

      <div class="rc-tabs">
        <div class="rc-tab-heads">
          <button class="rc-tab-head is-active" data-tab="score">5점 점수표</button>
          <button class="rc-tab-head" data-tab="living">생활 여건</button>
          <button class="rc-tab-head" data-tab="price">주변 시세</button>
          <button class="rc-tab-head" data-tab="roadview">로드뷰</button>
        </div>

        <div class="rc-tab-panel is-active" data-tab-panel="score">
          <div class="rc-rows">${rowsHtml}</div>
        </div>

        <!-- 시설 정보가 비동기로 채워지는 자리. id 는 loadFacilities()가 그대로 찾아 쓴다 -->
        <div class="rc-tab-panel" data-tab-panel="living" id="rcFacility">
          <div class="rc-loading">이 동네를 살펴보는 중...</div>
        </div>

        <div class="rc-tab-panel" data-tab-panel="price">
          ${buildPriceHtml(item)}
        </div>

        <div class="rc-tab-panel" data-tab-panel="roadview">
          <div id="rcRoadview" class="rc-roadview"></div>
        </div>
      </div>

      <div class="rc-source">서울 427개 행정동 공공데이터 기준 백분위</div>

    </div>`;
}


/** 만원 단위 숫자를 "5억 8,000만원" 형태로 바꾼다 */
function fmtWon(man) {
  if (man == null) return null;
  if (man >= 10000) {
    const eok = Math.floor(man / 10000);
    const rest = Math.round(man % 10000);
    return rest ? `${eok}억 ${rest.toLocaleString()}만원` : `${eok}억원`;
  }
  return `${Math.round(man).toLocaleString()}만원`;
}

/** "주변 시세" 탭 내용을 만든다.
 *
 * item.price 는 main.py 가 엔진(Life-Embed-jh)의 attach_price() 결과를
 * 그대로 실어 보낸 것 — 사용자가 건물유형·거래유형·예산을 하나라도 안
 * 골랐으면(예: "건물·거래유형 고려안함") housing 조건 자체가 없어서
 * null 이다(준비 중이 아니라 조건을 안 골랐다는 뜻이라 문구를 구분한다)
 */
function buildPriceHtml(item) {
  const p = item.price;
  if (!p) {
    return `<div class="rc-empty">건물유형·거래유형·희망 가격을 고르면 이 동네 시세를 볼 수 있어요.</div>`;
  }

  // 매매·전세는 "예산" 하나(중앙값)뿐이고, 월세는 "예산"(월세)과 "보증금" 둘 다 있다
  const rows = p.거래유형 === "월세"
    ? [["보증금", fmtWon(p.보증금)], ["월 임대료", fmtWon(p.예산)]]
    : [[p.거래유형 === "매매" ? "매매가" : "전세 보증금", fmtWon(p.예산)]];

  if (p.금액_25 != null && p.금액_75 != null) {
    rows.push(["분포(25~75%)", `${fmtWon(p.금액_25)} ~ ${fmtWon(p.금액_75)}`]);
  }

  const rowsHtml = rows
    .filter(([, value]) => value != null)
    .map(([label, value]) => `
      <div class="rc-extra-row">
        <span class="rc-extra-label">${label}</span>
        <span class="rc-extra-value">${value}</span>
      </div>`)
    .join("");

  // 일치도 = 희망 가격과 얼마나 가까운지 0~100점(100이면 정확히 일치,
  // 0이면 tolerance 30% 밖). 표본이 너무 적어 계산을 못 한 동네는 null
  const fitNote = p.일치도 != null
    ? `<div class="rc-fac-names">희망 가격과의 일치도 ${p.일치도}점</div>`
    : "";

  // 거래건수·신뢰등급·출처는 시세_지역별_전처리에 그 조합이 없으면 전부 null —
  // 그럴 땐 이 줄 자체를 안 보여준다(빈 정보를 있는 척 보여주지 않기 위해)
  const sourceHtml = p.거래건수 != null
    ? `<div class="rc-fac-names">거래 ${p.거래건수}건 · 신뢰등급 ${p.신뢰등급} · 출처: ${p.출처}</div>`
    : "";

  return `
    <div class="rc-fac-head">${p.건물유형} · ${p.거래유형} 시세</div>
    <div class="rc-extras">${rowsHtml}</div>
    ${fitNote}
    ${sourceHtml}`;
}


// Chart.js 는 같은 canvas 에 두 번 그리면 겹친다.
// 이전 차트를 부수고 새로 그리려고 인스턴스를 들고 있는다
let radarChart = null;


/** 추천 사유 카드에 레이더 차트를 그린다.
 *
 * 두 겹으로 겹쳐 그린다 —
 * 안쪽은 사용자가 원한 수준, 바깥은 이 동네의 실제 수준.
 * 바깥이 안쪽을 감싸면 조건을 충족한 것이 한눈에 보인다
 */
function drawRadar(rows) {
  const canvas = document.getElementById("rcRadar");
  if (!canvas || typeof Chart === "undefined") return;

  if (radarChart) radarChart.destroy();

  // CSS 변수를 읽어 온다. 테마가 바뀌어도 차트 색이 따라간다
  const css = getComputedStyle(document.documentElement);
  const v = (name) => css.getPropertyValue(name).trim();

  const accent = v("--accent");
  const text = v("--text");
  const muted = v("--text-muted");
  const line = v("--line-strong");

  radarChart = new Chart(canvas.getContext("2d"), {
    type: "radar",
    data: {
      labels: rows.map((r) => r.key),
      datasets: [
        {
          label: "이 동네",
          data: rows.map((r) => r.got),
          borderColor: accent,
          backgroundColor: hexToRgba(accent, 0.18),
          pointBackgroundColor: accent,
          pointRadius: 3,
          borderWidth: 2,
        },
        {
          label: "원하신 수준",
          data: rows.map((r) => r.want),
          borderColor: muted,
          backgroundColor: "transparent",
          borderDash: [4, 4],       // 점선. 기준선이라는 느낌을 준다
          pointRadius: 0,
          borderWidth: 1.5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          min: 0,
          max: 5,
          angleLines: { color: line },
          grid: { color: line },
          pointLabels: { color: text, font: { size: 11.5, weight: "600" } },
          ticks: { display: false, stepSize: 1 },
        },
      },
      plugins: {
        legend: {
          labels: { color: muted, boxWidth: 12, font: { size: 11 } },
        },
      },
    },
  });
}


/** #RRGGBB 를 rgba() 로 바꾼다. Chart.js 는 반투명 배경을 이 형태로 받는다 */
function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  if (h.length !== 6) return hex;      // rgba() 등 다른 형식이면 그대로
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

const FACILITY_EMOJI = {
  "문화시설": "🎨", "의료기관": "🏥", "학원": "📚",
  "공원": "🌳", "점포": "🏪",
};


function buildFacilityHtml(data) {
  const counts = data.counts || {};
  const items = data.items || {};
  const extras = data.extras || {};

  const parts = [];

  // ── 시설 개수 ──
  if (Object.keys(counts).length) {
    const summary = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${FACILITY_EMOJI[k] || ""} ${k} ${n.toLocaleString()}곳`)
      .join(" · ");

    const topKind = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    const names = (items[topKind] || []).slice(0, 4).map((i) => i.name).join(", ");

    parts.push(`
      <div class="rc-fac-head">이 동네에 있는 것</div>
      <div class="rc-fac-summary">${summary}</div>
      ${names ? `<div class="rc-fac-names">${topKind} · ${names} 등</div>` : ""}`);
  }

  // ── 생활 여건 (슬라이더 7개 지표 밖의 정보) ──
  const lines = buildExtraLines(extras);
  if (lines.length) {
    parts.push(`
      <div class="rc-fac-head" style="margin-top:14px;">이 동네 생활 여건</div>
      <div class="rc-extras">${lines.join("")}</div>`);
  }

  return parts.join("");
}


/** 슬라이더 밖 정보를 한 줄씩 만든다 */
function buildExtraLines(e) {
  const lines = [];
  const row = (label, value, note) => `
    <div class="rc-extra-row">
      <span class="rc-extra-label">${label}</span>
      <span class="rc-extra-value">${value}</span>
      ${note ? `<span class="rc-extra-note">${note}</span>` : ""}
    </div>`;

  if (e.거주안정성_점수 != null) {
    const v = Math.round(e.거주안정성_점수);
    const note = v >= 70 ? "주민 교체가 적은 편이에요"
               : v >= 40 ? "평균 수준이에요"
                         : "주민 이동이 잦은 편이에요";
    lines.push(row("🏘️ 거주 안정성", `${v}점`, note));
  }

  if (e.평균가구원수 != null) {
    const one = e["1인_비율"] != null ? ` · 1인 가구 ${Math.round(e["1인_비율"])}%` : "";
    lines.push(row("👥 가구 구성", `평균 ${e.평균가구원수}명${one}`, ""));
  }

  if (e.보행편의_백분위 != null) {
    // 쓰레기통 개수로 "깨끗하다" 를 말하면 측정하지 않은 것을 주장하게 된다.
    // 우리가 아는 건 "버릴 곳을 찾기 쉽다" 까지다
    lines.push(row("🚶 보행 편의",
      `상위 ${100 - e.보행편의_백분위}%`,
      "걷다가 쓰레기를 버릴 곳을 찾기 쉬워요"));
  }

  if (e.지하철역_수) {
    lines.push(row("🚉 지하철역", `${e.지하철역_수}개`, ""));
  }

  // 구 단위 값은 반드시 "OO구 평균" 임을 밝힌다.
  // 같은 구의 동네가 전부 같은 값이므로, 동네 값인 척하면 안 된다
  if (e.소음_주간_구 != null) {
    lines.push(row("🔊 소음", `주간 ${Math.round(e.소음_주간_구)}dB`, "자치구 평균"));
  }

  if (e.초미세먼지_구 != null) {
    lines.push(row("🌫️ 초미세먼지", `${e.초미세먼지_구.toFixed(1)}㎍/㎥`, "자치구 평균"));
  }

  return lines;
}