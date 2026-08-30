// ===== 거래 유형 =====
// 만원 단위 숫자를 "5억 8,000만" 형태로 바꾼다.
// 슬라이더 옆에 580000 이라고만 뜨면 얼마인지 읽히지 않는다
function fmtMoney(man) {
  if (man >= 10000) {
    const eok = Math.floor(man / 10000);
    const rest = man % 10000;
    return rest ? `${eok}억 ${rest.toLocaleString()}만` : `${eok}억`;
  }
  return `${man.toLocaleString()}만`;
}

const MONEY_SLIDERS = [
  ["salePrice", "salePriceVal"],
  ["jeonseDeposit", "jeonseDepositVal"],
  ["wolseDeposit", "wolseDepositVal"],
  ["wolseRent", "wolseRentVal"],
];

/** 지금 선택된 거래 유형 */
export function currentDeal() {
  return document.querySelector(".seg-btn.is-on")?.dataset.deal || "전세";
}

/** 선택된 유형의 금액 칸만 보여준다 */
function showDealGroup(deal) {
  document.querySelectorAll("[data-deal-group]").forEach((g) => {
    g.style.display = g.dataset.dealGroup === deal ? "" : "none";
  });
}

function initDealType() {
  const seg = document.getElementById("dealSeg");
  if (!seg) return;

  // 버튼마다 걸지 않고 부모에 한 번만 건다
  seg.addEventListener("click", (e) => {
    const btn = e.target.closest(".seg-btn");
    if (!btn) return;
    seg.querySelectorAll(".seg-btn")
       .forEach((b) => b.classList.toggle("is-on", b === btn));
    showDealGroup(btn.dataset.deal);
  });

  MONEY_SLIDERS.forEach(([id, valId]) => {
    const s = document.getElementById(id);
    const v = document.getElementById(valId);
    if (!s || !v) return;
    const sync = () => { v.innerText = fmtMoney(Number(s.value)); };
    s.addEventListener("input", sync);
    sync();                      // 첫 화면 숫자도 채워 준다
  });

  showDealGroup(currentDeal());
}

document.addEventListener("DOMContentLoaded", initDealType);
