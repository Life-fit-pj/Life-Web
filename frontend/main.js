/**
 * 모듈 시작점.
 * index.html 은 이 파일 하나만 불러오고, 나머지는 import 가 끌고 온다.
 */

import "./ui/deal.js";
import "./ui/map.js";
import "./ui/reason.js";
import "./ui/chat.js";
import "./ui/result.js";
import "./ui/menu.js";
import "./ui/search.js";

import { runSimulation } from "./ui/result.js";


// onclick 속성은 모듈 안 함수를 못 찾는다. 여기서 직접 연결한다
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("runBtn")?.addEventListener("click", runSimulation);
});