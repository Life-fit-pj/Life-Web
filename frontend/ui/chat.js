import { postChat, getQuota } from "../lib/api.js";
import { state, getAnonId } from "../lib/state.js";
import { escapeAndFormat } from "../lib/format.js";


// ===== 채팅 패널 =====

// 지금 추천 결과를 두고 주고받은 말. "거기", "두 번째 동네는?" 을 알아듣게 매 질문에 같이 보낸다.
// 새로 검색하면 비운다 — 다른 동네 목록에 대한 대화가 섞이면 안 된다. 길이는 엔진이 자른다
let chatHistory = [];

function openChat() {
  document.getElementById("chatPanel").classList.add("open");
  getQuota().then(renderQuota).catch(() => {});
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
