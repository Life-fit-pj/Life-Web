/* =========================================================
   lifetype.js — 1차 라이프스타일 유형 카드

   검색 버튼을 누르면 곧바로 2차 추천으로 가지 않고, 먼저 이 카드를
   보여 준다. 1차는 LLM 을 안 타서 즉시 나오므로 키워드를 바꿔 가며
   여러 번 눌러 볼 수 있다 (판정 로직은 services/lifetype.py 참고).

   카드는 랜딩 테스트 칸(ui/landing-test.js)이 먼저 띄운다. '5곳 보기' 를 누르면 무엇을 할지는
   부르는 쪽이 넘겨준 onContinue 가 정한다 — 랜딩은 지도 화면으로 넘기고(손님은 로그인 창부터),
   지도 화면(search.js)은 같은 카드를 다시 띄워 '5곳 보기' 를 이어서 누른다. 그래서 "탐색 중"이 끊기지 않고
   결과가 나오면 카드가 걷힌다. search.js ↔ lifetype.js 가 서로를 import 하는 고리는 만들지 않는다
   ========================================================= */

import { state } from "../lib/state.js";


/**
 * 2차 요청에 함께 보낼 1차 결과.
 *
 * firstWeights 는 슬라이더를 안 만졌을 때만 서버가 쓴다.
 * firstSpots 는 2차 목록에서 "1차에도 있던 동네" 를 표시하는 데 쓴다
 */
export function firstPayload() {
  const t = state.lastType;
  if (!t) return {};

  return {
    // 키워드 말고 직접 쓴 문장이 있으면 1차 가중치로 덮지 않는다 — 낱말 사전보다 LLM 이 문장을 잘 읽는다
    // ("애들 학원 보내기 좋은 곳" 이 교육 3.1 로 읽혀 교육 약한 동네가 나오던 문제, 2026-10-14)
    firstWeights: t.freeText ? null : (t.weights || null),
    firstSpots: (t.spots || []).map((s) => ({ gu: s.gu, dong: s.dong })),
    typeName: t.typeName || "",
    housePicks: t.housePicks || null,      // 집 조건 키워드("방이 많은" 등). 평면도를 고를 때 쓴다
  };
}


function typeTitle(t) {
  // 부분 유형 이름에는 이미 '형'이 붙어 있다. '~형형' 이 되지 않게 한다
  const n = t.typeName || "";
  if (!n) return "「아직 판단하기 일러요」";
  return "「" + (n.endsWith("형") ? n : n + "형") + "」";
}


/** 동네 추천이 비었을 때 왜 비었는지 알려 준다 */
function noSpotReason(t) {
  const d = t.dataStatus || {};

  if (!d.dbFound) {
    console.warn("[lifetype] life.db 없음 ->", d.dbPath);
    return "동네 데이터를 불러오지 못했어요.";
  }
  if (!d.regions) return "동네 데이터가 비어 있어요.";

  return "조건에 맞는 동네를 찾지 못했어요. 키워드를 바꿔보세요.";
}


/** 1차를 건너뛸 때 지난 검색의 1차 결과가 2차에 섞이지 않게 비운다 */
export function clearType() {
  state.lastType = null;
}


export function closeTypeCard() {
  document.getElementById("typeResult")?.classList.remove("is-open");
}


/**
 * 화면을 뿌옇게 덮고 유형과 어울리는 동네를 보여 준다.
 * 결과를 다 보여 준 뒤에 다음 단계를 권한다 — 가리고 강요하면 이탈한다.
 *
 * onContinue(finish) : '5곳 보기' 를 눌렀을 때 2차를 돌리는 함수.
 *                      2차가 끝나면 finish() 를 불러 카드를 닫는다
 * onSkip()           : '먼저 둘러볼게요'
 */
export function showTypeCard(t, { onContinue, onSkip }) {
  state.lastType = t;                  // 2차로 넘길 값

  const box = document.getElementById("typeResult");
  if (!box) return;

  // weak 면 이름을 단정하지 않는다. 축이 2개도 안 찼다는 뜻이다
  const enough = t.enough && !t.weak;
  const hint = enough ? "" :
    `<p class="tr-hint">키워드를 ${t.minPick}개 이상 고르면 더 정확해요 (지금 ${t.picked}개)
       <button type="button" id="trPickMore" class="tr-btn-sub">키워드 더 고르기</button></p>`;

  const lines = (t.lines || [])
    .map((l) => `<div class="tr-line-row"><span class="tr-line">${l}</span></div>`)
    .join("");

  const spots = (t.spots || []).map((s) => `
    <div class="tr-spot">
      <div class="tr-spot-body">
        <div class="tr-spot-name">${s.gu} ${s.dong}</div>
        <div class="tr-spot-blurb">${s.blurb}</div>
      </div>
    </div>`).join("");

  box.innerHTML = `
    <div class="tr-card">
      <p class="tr-eyebrow">당신의 라이프스타일은</p>
      <h2 class="tr-name">${typeTitle(t)}</h2>
      ${t.typeDesc ? `<p class="tr-desc">${t.typeDesc}</p>` : ""}
      ${lines ? `<div class="tr-lines">${lines}</div>` : ""}
      ${hint}

      ${spots ? `
        <div class="tr-spots-head">
          <span>이런 동네가 어울려요</span>
          <em>예산은 다음 단계에서 맞춰 드려요</em>
        </div>
        <div class="tr-spots">${spots}</div>`
        : `<p class="tr-nodata">${noSpotReason(t)}</p>`}

      <div class="tr-cta">
        <p class="tr-cta-desc">예산과 면적을 넣으면 시세까지 맞춰 드려요</p>
        <button id="trContinue" class="tr-btn-main">내게 맞는 동네 5곳 보기</button>
        <button id="trSkip" class="tr-btn-sub">먼저 둘러볼게요</button>
      </div>
    </div>`;

  box.classList.add("is-open");

  // 2차는 3~6초 걸린다. 카드를 먼저 닫으면 빈 화면을 보게 되므로
  // 카드를 띄워 둔 채 버튼만 진행 중으로 바꾸고, 끝나면 그때 닫는다
  const btn = document.getElementById("trContinue");
  const desc = box.querySelector(".tr-cta-desc");

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "동네 구석구석 탐색 중...";
    desc.textContent = "427개 동네를 비교하고 있어요";

    const done = await onContinue();

    if (done) {
      closeTypeCard();
    } else {
      // 실패했으면 카드에 남겨 두고 다시 누를 수 있게 되돌린다
      btn.disabled = false;
      btn.textContent = "분석 실패 — 다시 시도";
      desc.textContent = "잠시 후 다시 눌러 주세요";
    }
  });

  // 키워드를 고르는 칸은 랜딩 맨 아래에 있다 — 카드를 닫고 그리로
  document.getElementById("trPickMore")?.addEventListener("click", () => { closeTypeCard(); location.href = "/#test"; });

  document.getElementById("trSkip").addEventListener("click", () => {
    closeTypeCard();
    onSkip();
  });
}
