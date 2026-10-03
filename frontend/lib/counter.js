/* 글자 수 표시 — 입력칸의 오른쪽 아래 가장자리에 "12/800" 을 붙이고, 한도에서 입력을 멈춘다.
   관리자 화면(admin.html)과 가입 화면(signup.html)이 같이 쓴다.
   관리자 화면의 한도 800 은 엔진의 config.MAX_PERSONA_LENGTH 와 같은 값이다 — 넘는 글은 엔진이 저장을 거절한다 */
function mountCounter(box, max) {
  if (box.dataset.counted) return;                 // 같은 칸에 두 번 붙이지 않는다
  box.dataset.counted = "1";
  box.maxLength = max;

  const wrap = document.createElement("div");
  wrap.style.position = "relative";
  box.replaceWith(wrap);
  wrap.append(box);

  const count = document.createElement("span");
  count.style.cssText = "position:absolute; right:10px; bottom:7px; font-size:11.5px; opacity:.6;"
                      + " pointer-events:none; font-variant-numeric:tabular-nums";
  wrap.append(count);

  // 글이 숫자 밑으로 들어가지 않게 자리를 비운다 — 여러 줄 칸은 아래를, 한 줄 칸은 오른쪽을
  if (box.tagName === "TEXTAREA") box.style.paddingBottom = "24px";
  else box.style.paddingRight = "64px";

  const paint = () => { count.textContent = `${box.value.length}/${max}`; };
  box.addEventListener("input", paint);
  paint();
}
