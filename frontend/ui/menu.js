import { openHistory } from "./history.js";
import { login } from "../lib/api.js";
import { getAnonId, isLoggedIn } from "../lib/state.js";

let menuModalEl = null;
let comingSoonEl = null;
let authModalEl = null;

// 메뉴 패널 DOM을 처음 열릴 때 한 번만 만든다.
function ensureMenu() {
    if (menuModalEl) return menuModalEl;
    menuModalEl = document.createElement("div");
    menuModalEl.className = "menu-backdrop";
    menuModalEl.innerHTML = `
        <nav class="menu-panel">
            <button class="menu-close" aria-label="닫기">&times;</button>
            <div class="menu-items" id="menuItems"></div>
            <a class="menu-admin-link" href="admin.html">관리자 페이지 (개발용)</a>
        </nav>
    `;
    document.body.appendChild(menuModalEl);

    // 배경 클릭하면 닫기
    menuModalEl.addEventListener("click", (e) => {
        if (e.target === menuModalEl) closeMenu();
    });
    menuModalEl.querySelector(".menu-close").addEventListener("click", closeMenu);

    return menuModalEl;
}


// 로그인/회원가입은 헤더의 별도 버튼(#loginToggle)으로 옮겼기 때문에,
// 이 메뉴에는 실제 로그인 여부와 무관하게 로그인 이후 항목만 상시로 보여준다.
// 관리자 페이지는 로그인만으로는 부족하고 "이 사람이 관리자인가"까지 확인해야 하니,
// 나중에 `isAdmin()` 같은 별도 체크를 추가해서 일반 사용자에게는 이 항목 자체를 안 보여주는 게 맞다
// (지금은 뼈대만 잡아두는 단계라 menu-admin-link를 우선 그대로 둠).
function renderMenuItems() {
    const box = document.getElementById("menuItems");

    box.innerHTML = `
        <a class="menu-item" href="#" data-feature="마이페이지">마이페이지</a>
        <a class="menu-item" id="menuHistory" href="#">검색 및 대화 기록 저장소</a>
        <a class="menu-item" href="#" data-feature="좋아요 한 거주지">좋아요 한 거주지</a>
        <a class="menu-item" href="#" data-feature="원본 데이터 및 출처 안내">원본 데이터 및 출처 안내</a>
    `;
    box.querySelectorAll("a[data-feature]").forEach((link) => {
        link.addEventListener("click", (e) => {
            e.preventDefault();
            openComingSoon(link.dataset.feature);
        });
    });
    box.querySelector("#menuHistory").addEventListener("click", (e) => {
        e.preventDefault();
        closeMenu();
        openHistory();
    });
}

export function openMenu() {
    const el = ensureMenu();
    renderMenuItems();
    el.classList.add("is-open");
}

function closeMenu() {
    if (!menuModalEl) return;
    menuModalEl.classList.remove("is-open");
}

// 헤더 "로그인" 버튼을 누르면 뜨는 모달.
// 임시 로그인이라 별도 인증 프레임워크 없이, 처음 보는 아이디/비번을 입력하면
// 서버(auth.login)가 그 자리에서 계정을 발급하고 바로 로그인시킨다 —
// 발급과 로그인이 폼 하나로 합쳐져 있다. 로그인 성공 시 localStorage
// "lf-anon"을 customer_id로 덮어쓴다 —
// 좋아요/검색/채팅 기록이 전부 getAnonId() 하나만 보고 동작하므로(state.js),
// 새로고침 없이도 이거 하나로 그 기록들이 로그인한 사람에게 연결된다.
// 회원가입(설문)은 아직 별도 계정 발급과 안 이어져 있어 그대로 링크만 둔다.
function ensureAuthModal() {
    if (authModalEl) return authModalEl;

    authModalEl = document.createElement("div");
    authModalEl.className = "auth-backdrop";
    document.body.appendChild(authModalEl);

    authModalEl.addEventListener("click", (e) => {
        if (e.target === authModalEl) closeAuthModal();
    });

    return authModalEl;
}

function renderLoggedInAuthModal(el) {
    el.innerHTML = `
        <div class="auth-modal">
            <button class="auth-close" aria-label="닫기">&times;</button>
            <div class="auth-section">
                <h3 class="auth-title">로그인 중</h3>
                <p class="auth-notice">아이디: <strong>${getAnonId()}</strong></p>
                <button id="logoutBtn" class="auth-cta">로그아웃</button>
            </div>
        </div>
    `;
    el.querySelector(".auth-close").addEventListener("click", closeAuthModal);
    el.querySelector("#logoutBtn").addEventListener("click", () => {
        localStorage.setItem("lf-anon", crypto.randomUUID());
        renderGuestAuthModal(el);
    });
}

function renderGuestAuthModal(el) {
    el.innerHTML = `
        <div class="auth-modal">
            <button class="auth-close" aria-label="닫기">&times;</button>
            <div class="auth-section">
                <h3 class="auth-title">로그인</h3>
                <form id="loginForm" class="auth-form">
                    <input id="loginIdInput" type="text" placeholder="아이디" autocomplete="off" required>
                    <input id="loginPwInput" type="password" placeholder="비밀번호" autocomplete="off" required>
                    <button type="submit" class="auth-cta">로그인</button>
                </form>
                <p class="auth-notice">처음 쓰는 아이디·비밀번호를 입력하면 그 자리에서 계정이 만들어집니다.</p>
                <p id="loginError" class="auth-error"></p>
            </div>
            <div class="auth-divider"></div>
            <div class="auth-section">
                <h3 class="auth-title">회원가입</h3>
                <p class="auth-notice">라이프스타일 설문을 먼저 받습니다.</p>
                <a class="auth-cta" href="signup.html">설문 시작하기</a>
            </div>
        </div>
    `;
    el.querySelector(".auth-close").addEventListener("click", closeAuthModal);

    el.querySelector("#loginForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const loginId = el.querySelector("#loginIdInput").value.trim();
        const password = el.querySelector("#loginPwInput").value.trim();
        const errorEl = el.querySelector("#loginError");
        errorEl.textContent = "";
        try {
            const { customerId } = await login(loginId, password);
            localStorage.setItem("lf-anon", customerId);
            renderLoggedInAuthModal(el);
        } catch (err) {
            errorEl.textContent = "아이디 또는 비밀번호가 맞지 않아요.";
        }
    });
}

export function openAuthModal() {
    const el = ensureAuthModal();
    if (isLoggedIn()) {
        renderLoggedInAuthModal(el);
    } else {
        renderGuestAuthModal(el);
    }
    el.classList.add("is-open");
}

function closeAuthModal() {
    if (!authModalEl) return;
    authModalEl.classList.remove("is-open");
}

// 아직 안 만든 화면으로 이동하려 할 때 보여주는 공용 안내창.
// 페이지가 완성되면 그 항목의 버튼을 <a href="...html"> 로 되돌리고 이 함수 호출은 지우면 된다
function ensureComingSoon() {
    if (comingSoonEl) return comingSoonEl;

    comingSoonEl = document.createElement("div");
    comingSoonEl.className = "coming-soon-backdrop";
    comingSoonEl.innerHTML = `
        <div class="coming-soon-panel">
            <button class="coming-soon-close" aria-label="닫기">&times;</button>
            <p id="comingSoonText"></p>
        </div>
    `;
    document.body.appendChild(comingSoonEl);

    comingSoonEl.addEventListener("click", (e) => {
        if (e.target === comingSoonEl) closeComingSoon();
    });
    comingSoonEl.querySelector(".coming-soon-close").addEventListener("click", closeComingSoon);

    return comingSoonEl;
}

function openComingSoon(featureName) {
    const el = ensureComingSoon();
    el.querySelector("#comingSoonText").textContent = `"${featureName}" ⚙️준비 중`;
    el.classList.add("is-open");
}

function closeComingSoon() {
    if (!comingSoonEl) return;
    comingSoonEl.classList.remove("is-open");
}