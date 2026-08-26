let map = null;
let currentMarkers = []; // 지도 위의 마커 및 뱃지를 관리하는 배열
let geocoder = null;    // 카카오 주소-좌표 변환 객체

// 페이지 로드 시 카카오 지도 초기화
document.addEventListener('DOMContentLoaded', () => {
  initKakaoMap();
});

// 1. 카카오 지도 초기화 함수
function initKakaoMap() {
  const mapContainer = document.getElementById('map');
  if (!mapContainer) return;

  if (typeof kakao !== 'undefined' && kakao.maps) {
    kakao.maps.load(() => {
      const mapOption = {
        center: new kakao.maps.LatLng(37.5665, 126.9780), // 기본 중심 좌표 (서울시청)
        level: 7 // 지도 확대 레벨
      };

      map = new kakao.maps.Map(mapContainer, mapOption);

      // 카카오 주소->좌표 변환 서비스 객체 생성
      if (kakao.maps.services) {
        geocoder = new kakao.maps.services.Geocoder();
      }

      // 지도 오른쪽 상단 확대/축소 컨트롤러 추가
      const zoomControl = new kakao.maps.ZoomControl();
      map.addControl(zoomControl, kakao.maps.ControlPosition.RIGHT);

      console.log("✅ 카카오 지도 초기화 성공!");
    });
  } else {
    console.error("❌ 카카오 지도 SDK 로드 실패! index.html의 App Key를 확인해 주세요.");
  }
}

// 2. [AI 분석 실행] 버튼 클릭 시 실행되는 메인 함수
async function runSimulation() {
  const loadingEl = document.getElementById('loading');
  if (loadingEl) loadingEl.style.display = 'block';

  // index.html의 입력값들을 수집
  const payload = {
    bldgType: document.getElementById('bldgType')?.value || "1",
    area: document.getElementById('area')?.value || 59,
    builtYear: document.getElementById('builtYear')?.value || 2015,
    greenery: document.getElementById('greenery')?.value || 3,
    safety: document.getElementById('safety')?.value || 3,
    transport: document.getElementById('transport')?.value || 3,
    commercial: document.getElementById('commercial')?.value || 3,
    medical: document.getElementById('medical')?.value || 3,
    education: document.getElementById('education')?.value || 3,
    culture: document.getElementById('culture')?.value || 3,
  };

  try {
    // API 주소는 상대 경로로. localhost 고정이면 배포할 때 못 쓴다
    const response = await fetch('/api/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error("서버 응답 에러");

    renderResult(await response.json());

  } catch (error) {
    console.error("❌ 분석 중 오류 발생:", error);
    alert("AI 분석 실행 중 오류가 발생했습니다. 백엔드 서버 상태를 확인해 주세요.");
  } finally {
    if (loadingEl) loadingEl.style.display = 'none';
  }
}

/**
 * 서버 응답 하나로 화면 전체를 갱신한다.
 *
 * 검색(search.js)과 슬라이더(runSimulation) 둘 다 이 함수만 부른다.
 * 예전에는 검색이 슬라이더 분석을 다시 실행해서 API 가 두 번 불렸고,
 * 두 번째 결과가 첫 결과를 덮어써 LLM 설명이 버려졌다
 */
function renderResult(data) {
  if (!data) return;

  window.LAST_QUERY = data.query || "";

  // ① 주거 만족도 점수
  const elScore = document.getElementById('resScore');
  if (elScore) {
    elScore.innerHTML =
      `${data.score} <span style="font-size:16px; color:var(--muted, #888);">/ 100</span>`;
  }

  // ② 추천 TOP 5 리스트
  updateTopRegionsList(data.topRegions);

  // ③ 지도 마커
  renderKakaoMapMarkers(data.topRegions, data.weights);

  // ④ LH 평면도
  renderFloorplan(data.floorplanPath);

  // ⑤ LLM 설명문
  renderExplanation(data.explanation);
}


// ② 추천 TOP 5 리스트 : 우측 TOP 5 리스트 UI 갱신 함수
function updateTopRegionsList(regions) {
  const container = document.getElementById('resTopRegions');
  if (!container || !regions) return;

  container.innerHTML = ''; // 기존 문구 삭제

  regions.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'list-item';
    div.style.cursor = 'pointer';

    div.innerHTML = `
      <div class="li-main">
        <span class="rank">${item.rank}</span>
        <div class="list-name">${item.name}</div>
      </div>
    `;

    // 리스트 클릭 시 해당 행정동의 실제 지오코딩 위치로 지도 이동. 사유 패널은 핀을 눌렀을 때만 연다
    div.addEventListener('click', () => {
      if (!map) return;
      
      if (item.lat && item.lng) {
        map.panTo(new kakao.maps.LatLng(item.lat, item.lng));
      } else if (geocoder) {
        geocoder.addressSearch(item.name, (result, status) => {
          if (status === kakao.maps.services.Status.OK) {
            map.panTo(new kakao.maps.LatLng(result[0].y, result[0].x));
          }
        });
      }
    });

    container.appendChild(div);
  });
}

// ③ 지도 마커 : 카카오 지도에 TOP 5 마커 및 뱃지 그리기 (지오코딩 이용)
function renderKakaoMapMarkers(regions, weights) {
  if (!map || !regions || regions.length === 0) return;

  // 기존에 있던 마커 전체 삭제
  currentMarkers.forEach(m => m.setMap(null));
  currentMarkers = [];

  const bounds = new kakao.maps.LatLngBounds();
  let processedCount = 0;

  regions.forEach((item) => {
    // 백엔드에 lat, lng가 이미 올바르게 존재하는 경우 바로 사용
    if (item.lat && item.lng && item.lat > 30) {
      const latLng = new kakao.maps.LatLng(item.lat, item.lng);
      addMarkerAndOverlay(item, latLng, bounds, weights);
      processedCount++;
      if (processedCount === regions.length) map.setBounds(bounds);
    } 
    // 좌표가 없거나 불안정한 경우 카카오 Geocoder로 주소 기반 검색 실행
    else if (geocoder) {
      geocoder.addressSearch(item.name, (result, status) => {
        if (status === kakao.maps.services.Status.OK) {
          const latLng = new kakao.maps.LatLng(result[0].y, result[0].x);
          addMarkerAndOverlay(item, latLng, bounds, weights);
        }
        processedCount++;
        if (processedCount === regions.length) {
          map.setBounds(bounds);
        }
      });
    }
  });
}


/** ④ LH 평면도 : 평면도를 그리거나, 경로가 없으면 깔끔히 비운다 */
function renderFloorplan(path) {
  const img = document.getElementById('floorplanImg');
  const txt = document.getElementById('fpFilename');
  const ph = document.getElementById('fpPlaceholder');

  if (path) {
    if (img) { img.src = path; img.style.display = 'block'; }
    if (txt) txt.innerText = `매칭 경로: ${path}`;
    if (ph) ph.style.display = 'none';
  } else {
    // 경로가 없으면 이전 이미지가 남지 않게 지운다
    if (img) { img.removeAttribute('src'); img.style.display = 'none'; }
    if (txt) txt.innerText = '';
    if (ph) ph.style.display = 'block';
  }
}


/** ⑤ LLM 설명문 : LLM 설명문을 표시한다. 슬라이더로만 왔으면 설명이 없으므로 숨긴다 */
function renderExplanation(text) {
  const box = document.getElementById('explainBox');
  const body = document.getElementById('explainBody');
  if (!box || !body) return;

  if (!text) {
    box.style.display = 'none';
    return;
  }

  // 서버가 **강조** 와 줄바꿈을 섞어 보낸다.
  // innerHTML 에 그대로 넣으면 마크다운이 글자로 보이므로 변환한다
  body.innerHTML = text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")     // 태그 주입 방지
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/^#+ .*$/gm, "")                          // '# 추천 결과 설명' 제거
    .trim()
    .replace(/\n/g, "<br>");

  box.style.display = 'block';
}


// 마커 및 오버레이 뱃지 추가 헬퍼 함수
function addMarkerAndOverlay(item, latLng, bounds, weights) {
  const marker = new kakao.maps.Marker({
    map: map,
    position: latLng,
    title: `${item.rank}위: ${item.name}`
  });

  // 핀을 누르면 추천 사유 패널이 열린다.
  // 오른쪽 목록 클릭은 지도 이동만 하고 패널을 열지 않는다 —
  // 훑어보는 것과 자세히 보려는 것은 다른 의도이기 때문이다
  kakao.maps.event.addListener(marker, "click", () => {
    openReasonModal(item, weights);
  });

  const overlayContent = `
    <div style="
      padding: 5px 12px;
      background: #111827;
      color: #ffffff;
      font-weight: 700;
      font-size: 13px;
      border-radius: 20px;
      border: 2px solid #3b82f6;
      box-shadow: 0 4px 10px rgba(0,0,0,0.3);
      white-space: nowrap;
    ">
      👑 ${item.rank}위 ${item.name}
    </div>
  `;

  const customOverlay = new kakao.maps.CustomOverlay({
    position: latLng,
    content: overlayContent,
    yAnchor: 2.2
  });

  customOverlay.setMap(map);

  currentMarkers.push(marker);
  currentMarkers.push(customOverlay);

  bounds.extend(latLng);
}


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

function openReasonModal(item, weights) {
  const el = ensureModal();
  el.querySelector(".reason-body").innerHTML = buildReasonCard(item, weights);
  el.classList.add("is-open");
  document.body.style.overflow = "hidden";     // 뒤 화면 스크롤 잠금
  el.querySelector(".reason-close").focus();

  // 막대는 이미 있는 데이터로 즉시 보여 주고,
  // 시설 정보만 나중에 채운다. 기다리는 동안에도 읽을 것이 있게 한다
  loadFacilities(item.name);
  loadRegionExplain(item, weights);
}

/** 시설 정보를 받아 카드에 채운다 */
async function loadFacilities(fullName) {
  const box = document.getElementById("rcFacility");
  if (!box) return;

  // "서울특별시 노원구 중계1동" → ["노원구", "중계1동"]
  const parts = fullName.replace("서울특별시 ", "").split(" ");
  const gu = parts[0];
  const dong = parts.slice(1).join(" ");

  try {
    const res = await fetch("/api/region", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gu, dong }),
    });
    if (!res.ok) throw new Error("조회 실패");

    const data = await res.json();
    box.innerHTML = buildFacilityHtml(data);

  } catch (err) {
    console.error(err);
    box.innerHTML = "";      // 실패하면 조용히 비운다. 나머지는 이미 보인다
  }
}


/** 동네 하나에 대한 LLM 설명을 받아 채운다 */
async function loadRegionExplain(item, weights) {
  const box = document.getElementById("rcLlm");
  if (!box) return;

  const parts = item.name.replace("서울특별시 ", "").split(" ");
  const gu = parts[0];
  const dong = parts.slice(1).join(" ");

  box.innerHTML = `<div class="rc-loading">이 동네가 왜 맞는지 정리하는 중...</div>`;

  try {
    const res = await fetch("/api/region/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gu, dong,
        query: window.LAST_QUERY || "",
        weights: weights || null,
        scores: item.scores || null,
      }),
    });
    if (!res.ok) throw new Error("설명 요청 실패");

    const data = await res.json();
    if (!data.explanation) { box.innerHTML = ""; return; }

    box.innerHTML = `
      <div class="rc-fac-head">💬 이 동네를 고른 이유</div>
      <div class="rc-llm-body">${escapeAndFormat(data.explanation)}</div>`;

  } catch (err) {
    console.error(err);
    box.innerHTML = "";      // 실패하면 조용히 비운다. 나머지는 이미 보인다
  }
}

/** LLM 이 만든 글을 화면에 넣기 전에 다듬는다 */
function escapeAndFormat(text) {
  return text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")   // 태그 주입 방지
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .trim()
    .replace(/\n/g, "<br>");
}


function closeReasonModal() {
  if (!modalEl) return;
  modalEl.classList.remove("is-open");
  document.body.style.overflow = "";
}

// 카드내용

function buildReasonCard(item, weights) {
  const rows = CRITERIA.map((key) => {
    // 사용자가 원한 수준 (1~5)
    const want = Math.round(weights?.[key] ?? 3);

    // 동네의 실제 수준. 서버는 백분위(0~100)를 주므로 5단계로 바꾼다.
    //   0~20 → 1점, 81~100 → 5점
    const pct = item.scores?.[key] ?? 50;
    const got = Math.max(1, Math.min(5, Math.ceil(pct / 20)));

    const gap = got - want;
    let state, word;
    if (gap >= 1)       { state = "over";  word = "넉넉해요"; }
    else if (gap === 0) { state = "match"; word = "딱 맞아요"; }
    else                { state = "under"; word = "조금 아쉬워요"; }

    const dots = [1, 2, 3, 4, 5]
      .map((n) => `<i class="${n <= got ? "on" : ""}"></i>`)
      .join("");

    // 상위 30% 안에 들 때만 표시한다.
    // 58점을 "상위 42%" 라고 하면 실제보다 좋아 보인다
    const pctText = pct >= 70 ? `상위 ${100 - Math.round(pct)}%` : "";

    return { key, want, got, pct, gap, state, word, dots, pctText };
  });

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
      <div class="rc-dots ${r.state}">${r.dots}</div>
      <div class="rc-word ${r.state}">${r.word}</div>
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
      <div class="rc-rows">${rowsHtml}</div>

      <!-- 시설 정보가 비동기로 채워지는 자리 -->
      <div class="rc-facility" id="rcFacility">
        <div class="rc-loading">이 동네를 살펴보는 중...</div>
      </div>

      <!-- LLM 설명이 채워지는 자리. 시설보다 오래 걸린다 -->
      <div class="rc-llm" id="rcLlm"></div>

      <div class="rc-source">서울 427개 행정동 공공데이터 기준 백분위</div>

    </div>`;
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