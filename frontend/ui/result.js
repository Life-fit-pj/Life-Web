import { postPredict } from "../lib/api.js";
import { state, nextSeq, isLatest, getAnonId } from "../lib/state.js";
import { currentDeal, isPriceAny } from "./deal.js";
import { renderKakaoMapMarkers, panToRegion } from "./map.js";
import { initChatWithResult } from "./chat.js";


// 2. [AI 분석 실행] 버튼 클릭 시 실행되는 메인 함수
export async function runSimulation() {
  const loadingEl = document.getElementById('loading');
  if (loadingEl) loadingEl.style.display = 'block';

  const seq = nextSeq();
  const priceAny = isPriceAny();
  const payload = {
    anonId: getAnonId(),
    // "가격 상관없음"이 켜지면 null 로 보낸다.
    // 슬라이더 값을 그대로 보내면 서버가 "이 가격을 원한다" 로 알아듣기 때문이다
    bldgType: priceAny ? null : (document.getElementById('bldgType')?.value || "아파트"),
    dealType: priceAny ? null : currentDeal(),
    salePrice: priceAny ? null : Number(document.getElementById('salePrice')?.value || 58000),
    jeonseDeposit: priceAny ? null : Number(document.getElementById('jeonseDeposit')?.value || 23000),
    wolseDeposit: priceAny ? null : Number(document.getElementById('wolseDeposit')?.value || 3000),
    wolseRent: priceAny ? null : Number(document.getElementById('wolseRent')?.value || 60),
    area: document.getElementById('area')?.value || 59,
    greenery: document.getElementById('greenery')?.value || 3,
    safety: document.getElementById('safety')?.value || 3,
    transport: document.getElementById('transport')?.value || 3,
    commercial: document.getElementById('commercial')?.value || 3,
    medical: document.getElementById('medical')?.value || 3,
    education: document.getElementById('education')?.value || 3,
    culture: document.getElementById('culture')?.value || 3,
  };

  
    // API 주소는 상대 경로로. localhost 고정이면 배포할 때 못 쓴다
  try {
    const data = await postPredict(payload);
    if (!isLatest(seq)) return;     // 그 사이 새 요청이 있었으면 버린다

    renderResult(data);

  } catch (error) {
    if (!isLatest(seq)) return;
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
export function renderResult(data) {
  if (!data) return;

  state.lastQuery = data.query || "";
  state.lastResult = data;
  state.lastHousing = data.housing || null;   // 가격 조건이 없었으면 null 그대로
  initChatWithResult(data); // 채팅이 이 결과를 근거로 답한다

  // ① 주거 만족도 점수
  const elScore = document.getElementById('resScore');
  if (elScore) {
    elScore.innerHTML =
      `${data.score} <span style="font-size:16px; color:var(--muted, #888);">/ 100</span>`;
  }

  // ② 추천 TOP 5 리스트
  updateTopRegionsList(data.topRegions, data.droppedFromFirst);

  // ③ 지도 마커
  renderKakaoMapMarkers(data.topRegions, data.weights);

  // ④ LH 평면도
  renderFloorplan(data.floorplanPath);
}


/**
 * ② 추천 TOP 5 리스트 : 우측 TOP 5 리스트 UI 갱신 함수
 *
 * dropped 는 1차 유형 카드에서 봤는데 2차 목록에서 빠진 동네들이다.
 * 아무 말 없이 사라지면 "아까 그 동네는 어디 갔지" 가 되므로 알려 준다.
 * 1차를 안 거쳤으면 빈 배열이라 아무것도 안 뜬다
 */
function updateTopRegionsList(regions, dropped) {
  const container = document.getElementById('resTopRegions');
  if (!container || !regions) return;

  container.innerHTML = ''; // 기존 문구 삭제

  regions.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'list-item';
    div.style.cursor = 'pointer';

    // 1차에서도 나왔던 동네에 표시를 달아 준다
    const mark = item.fromFirst
      ? '<span class="li-from-first" title="1차 유형에서도 추천된 동네">처음부터</span>'
      : '';

    div.innerHTML = `
      <div class="li-main">
        <span class="rank">${item.rank}</span>
        <div class="list-name">${item.name}</div>
        ${mark}
      </div>
    `;

    // 리스트 클릭 시 해당 행정동의 실제 지오코딩 위치로 지도 이동. 사유 패널은 핀을 눌렀을 때만 연다
    div.addEventListener('click', () => panToRegion(item));

    container.appendChild(div);
  });

  if (dropped?.length) {
    const note = document.createElement('p');
    note.className = 'li-dropped';
    note.textContent =
      `${dropped.join(' · ')} 은(는) 예산·면적 조건에서 밀려 목록에 없어요`;
    container.appendChild(note);
  }
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
