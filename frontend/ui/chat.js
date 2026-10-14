import { postChat, getQuota, getMemory, deleteMemory } from "../lib/api.js";
import { state, getAnonId, isLoggedIn } from "../lib/state.js";
import { escapeAndFormat } from "../lib/format.js";


// ===== 채팅 패널 =====

// 지금 추천 결과를 두고 주고받은 말. "거기", "두 번째 동네는?" 을 알아듣게 매 질문에 같이 보낸다.
// 새로 검색하면 비운다 — 다른 동네 목록에 대한 대화가 섞이면 안 된다. 길이는 엔진이 자른다
let chatHistory = [];

function openChat() {
  document.getElementById("chatPanel").classList.add("open");
  getQuota().then(renderQuota).catch(() => {});
  loadMemoryStrip();
  setTimeout(() => document.getElementById("chatInput").focus(), 300);
}


function closeChat() {
  document.getElementById("chatPanel").classList.remove("open");
}


/** "오늘 남은 질문 N/20" 을 채팅창 머리에 보여 준다. 다 쓰면 입력을 막는다 */
function renderQuota({ limit, remaining, member }) {
  document.getElementById("chatQuota").textContent = `오늘 남은 질문 ${remaining}/${limit}`;
  const empty = remaining <= 0;
  document.getElementById("chatInput").disabled = empty;
  document.getElementById("chatSend").disabled = empty;
  document.getElementById("chatInput").placeholder = empty
    ? (member ? "오늘 질문을 다 썼어요. 내일 다시 물어봐 주세요" : "로그인하면 하루 20번까지 물어볼 수 있어요")
    : "궁금한 점을 입력하세요";
}


/** 기억 -> 띠에 놓을 조건 [[칸, 값, 보이는 글]]. 목록 칸은 값 하나가 조건 하나다 */
function memoryChips(m) {
  const won = (v) => (v >= 10000 ? `${Math.floor(v / 10000)}억 ${v % 10000 ? (v % 10000).toLocaleString() + "만원" : ""}` : `${v.toLocaleString()}만원`).trim();
  const chips = [];
  if (m.budget_manwon) chips.push(["budget_manwon", null, `예산 ${won(m.budget_manwon)}`]);
  if (m.deal_type) chips.push(["deal_type", null, m.deal_type]);
  if (m.commute) chips.push(["commute", null, `통근 ${m.commute}`]);
  (m.priorities || []).forEach((p) => chips.push(["priorities", p, `중요 ${p}`]));
  (m.avoid || []).forEach((a) => chips.push(["avoid", a, `피함 ${a}`]));
  return chips;
}


/** 채팅창 위 "기억하는 조건" 띠. 손님은 숨기고, 회원은 기억이 없어도 띠를 보여 기억한다는 걸 알린다 */
async function loadMemoryStrip() {
  const strip = document.getElementById("chatMemory");
  if (!isLoggedIn()) { strip.hidden = true; return; }
  let chips = [];
  try { chips = memoryChips((await getMemory()) || {}); } catch (err) { console.error(err); }
  strip.hidden = false;
  strip.replaceChildren();

  const label = document.createElement("span");
  label.className = "chat-memory-label";
  label.textContent = "기억하는 조건";
  strip.appendChild(label);

  if (!chips.length) {
    const empty = document.createElement("span");
    empty.className = "chat-memory-empty";
    empty.textContent = "예산·통근지·피하고 싶은 것을 말하면 기억해 둘게요";
    strip.appendChild(empty);
    return;
  }

  for (const [field, value, text] of chips) {
    const chip = document.createElement("span");
    chip.className = "chat-memory-chip";
    chip.textContent = text;
    const x = document.createElement("button");
    x.type = "button";
    x.textContent = "✕";
    x.setAttribute("aria-label", `${text} 잊기`);
    x.addEventListener("click", async () => {
      x.disabled = true;
      try { await deleteMemory(field, value); } catch (err) { console.error(err); }
      loadMemoryStrip();
    });
    chip.appendChild(x);
    strip.appendChild(chip);
  }
}


/** 말풍선 하나를 대화창에 붙인다 */
function addChatMsg(text, kind) {
  const body = document.getElementById("chatBody");
  const div = document.createElement("div");
  div.className = `chat-msg ${kind}`;
  div.textContent = text;
  body.appendChild(div);

  // 새 말풍선이 보이도록 맨 아래로 내린다
  body.scrollTop = body.scrollHeight;
  return div;
}


/** 검색 결과가 나오면 채팅창을 그 검색으로 시작한다.
 *
 * 화면이 걷히면 사용자가 무엇을 검색했는지 알 수 없게 된다.
 * 검색어와 설명문을 첫 대화로 남겨 두면 맥락이 유지되고,
 * 나중에 대화를 저장할 때도 시작점이 분명해진다
 */
export function initChatWithResult(data) {
  const body = document.getElementById("chatBody");
  if (!body) return;
  chatHistory = [];

  if (data.query) {
    addChatMsg(data.query, "user");
  }

  const count = (data.topRegions || []).length;
  const top = topWeightLabel(data.weights);
  addChatMsg(
    data.query
      ? `${top}을 가장 중요하게 보고 ${count}곳을 찾았어요.`
      : `슬라이더 설정으로 ${count}곳을 찾았어요.`,
    "bot"
  );

  // LLM 설명문은 마크다운(**강조**)이 섞여 오므로 그대로 넣으면 안 된다.
  // textContent 를 쓰는 addChatMsg 대신 따로 처리한다
  if (data.explanation) {
    const div = document.createElement("div");
    div.className = "chat-msg bot";
    div.innerHTML = escapeAndFormat(data.explanation);
    body.appendChild(div);
  }

  addChatMsg("궁금한 점을 물어보세요.", "bot");
  body.scrollTop = body.scrollHeight;
}

/** 가장 높은 지표 이름을 돌려준다 */
function topWeightLabel(weights) {
  if (!weights) return "전체 조건";
  const sorted = Object.entries(weights).sort((a, b) => b[1] - a[1]);
  return sorted.length ? sorted[0][0] : "전체 조건";
}


/** 질문을 보내고 답을 받아 붙인다 */
async function sendChat() {
  const input = document.getElementById("chatInput");
  const btn = document.getElementById("chatSend");

  const question = input.value.trim();
  if (!question) return;

  addChatMsg(question, "user");
  input.value = "";
  btn.disabled = true;

  const loading = addChatMsg("생각하는 중...", "loading");

  try {
    const data = await postChat(question, state.lastResult?.topRegions, state.lastResult?.weights, getAnonId(), chatHistory);
    loading.remove();
    addChatMsg(data.answer || "답을 만들지 못했어요.", "bot");
    // 이번 답이 기억한 조건을 보고 만든 것이면 말풍선 아래에 밝힌다 — 말하지 않은 조건으로 답하면 사용자가 헷갈린다
    if (data.answer && data.memory) addChatMsg(`↳ 기억한 조건 반영: ${data.memory}`, "memo");
    // 엔진은 답을 보낸 뒤에 질문에서 선호를 뽑아 저장한다(Claude 1번, 몇 초). 그만큼 기다렸다 띠를 다시 읽는다
    // ponytail: 고정 대기라 저장이 더 늦으면 다음 답 때 보인다. 정확히 하려면 저장 결과를 답과 같이 돌려줘야 한다
    setTimeout(loadMemoryStrip, 5000);
    if (data.answer) {
      chatHistory.push({ role: "user", content: question }, { role: "assistant", content: data.answer });
    }
    getQuota().then(renderQuota).catch(() => {});

  } catch (err) {
    console.error(err);
    loading.remove();
    if (err.status === 429) {
      addChatMsg("오늘 물어볼 수 있는 횟수를 다 썼어요. 내일 다시 이용해 주세요.", "bot");
      getQuota().then(renderQuota).catch(() => {});
      return;   // 입력창은 renderQuota 가 잠근다
    }
    addChatMsg("답변을 가져오지 못했어요. 잠시 후 다시 시도해 주세요.", "bot");

  } finally {
    if (!document.getElementById("chatInput").disabled) {
      btn.disabled = false;
      input.focus();
    }
  }
}


/** 버튼과 키 입력을 연결한다 */
function bindChatEvents() {
  document.getElementById("chatToggle").addEventListener("click", openChat);
  document.getElementById("chatClose").addEventListener("click", closeChat);
  document.getElementById("chatSend").addEventListener("click", sendChat);

  document.getElementById("chatInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendChat();
  });
}

document.addEventListener("DOMContentLoaded", bindChatEvents);
