import { openHistory } from "./history.js";
import { openLikes } from "./likes.js";
import { openMypage } from "./mypage.js";
import { authLogin, getSignedUp } from "../lib/api.js";
import { getAnonId, isLoggedIn } from "../lib/state.js";
import { supabase } from "../lib/supabaseClient.js";

let menuModalEl = null;
let comingSoonEl = null;
let authModalEl = null;

// Supabase 로그인 직후(이메일/비번, 구글 리디렉션 복귀 포함)마다 한 번씩 불린다.
//
// 원래는 "새로 열었을 때의 세션 복원은 SIGNED_IN 으로 안 온다"고 가정했지만,
// esm.sh 가 받아오는 supabase-js 버전에 따라 그 가정이 깨진다 — 예전에 로그인한
// 적 있는 브라우저는 새로고침/재방문마다 세션 복원이 SIGNED_IN 으로 와서, DB에
// 없는 계정이면 매번 회원가입으로 강제 이동해 버렸다(회원가입 첫 화면조차 못 봄).
// 그래서 "이 페이지에서 실제로 로그인 동작을 했는가"를 직접 표시해서 가른다 —
// 첫 이벤트는 구글 리디렉션 복귀(OAUTH_PENDING_KEY 표시가 있을 때)일 때만 처리한다.
const OAUTH_PENDING_KEY = "lifefit-oauth-pending";
let sawFirstAuthEvent = false;

supabase.auth.onAuthStateChange((event, session) => {
    const isFirst = !sawFirstAuthEvent;
    sawFirstAuthEvent = true;
    if (event !== "SIGNED_IN" || !session) return;

    if (isFirst) {
        let cameFromOAuth = false;
        try { cameFromOAuth = sessionStorage.getItem(OAUTH_PENDING_KEY) === "1"; } catch { /* 무시 */ }
        if (!cameFromOAuth) return;              // 새로고침 등으로 복원된 옛 세션 — 넘어간다
        try { sessionStorage.removeItem(OAUTH_PENDING_KEY); } catch { /* 무시 */ }
    }

    resolveBackendAccount(session.access_token);
});

// Supabase 인증은 끝났지만 이 서비스의 customer 인지는 아직 모르는 상태 — 여기서 가른다.
// 이미 가입돼 있으면 그대로 로그인, 처음 보는 사용자면 회원가입 뎁스(signup.html)로 보낸다
// ("계정이 없다면 바로 회원가입 뎁스로" — 구글/이메일 로그인 모두 같은 규칙을 탄다).
async function resolveBackendAccount(token) {
    try {
        const { signedUp } = await getSignedUp(token);
        if (!signedUp) {
            sessionStorage.setItem("lifefit-pending-token", token);
            location.href = "signup.html";
            return;
        }
        const { customerId } = await authLogin(token);
        localStorage.setItem("lf-anon", customerId);
        syncLoginToggle();
        if (authModalEl?.classList.contains("is-open")) closeAuthModal();
    } catch (err) {
        console.error("로그인 처리 실패", err);
    }
}

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
        <a class="menu-item" id="menuMypage" href="#">마이페이지</a>
        <a class="menu-item" id="menuHistory" href="#">검색 및 대화 기록 저장소</a>
        <a class="menu-item" id="menuLikes" href="#">좋아요 한 거주지</a>
        <a class="menu-item" href="#" data-feature="원본 데이터 및 출처 안내">원본 데이터 및 출처 안내</a>
    `;
    box.querySelectorAll("a[data-feature]").forEach((link) => {
        link.addEventListener("click", (e) => {
            e.preventDefault();
            openComingSoon(link.dataset.feature);
        });
    });
    box.querySelector("#menuMypage").addEventListener("click", (e) => {
        e.preventDefault();
        closeMenu();
        if (!isLoggedIn()) {
            openAuthModal();
            return;
        }
        openMypage();
    });
    box.querySelector("#menuHistory").addEventListener("click", (e) => {
        e.preventDefault();
        closeMenu();
        openHistory();
    });
    box.querySelector("#menuLikes").addEventListener("click", (e) => {
        e.preventDefault();
        closeMenu();
        openLikes();
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
// 실제 인증(비밀번호 확인, 구글 OAuth)은 Supabase SDK 가 처리한다 — 이 모달은
// 그 UI만 띄우고, 로그인 성공 뒤처리(resolveBackendAccount)는 위쪽
// onAuthStateChange 리스너가 로그인 방법과 무관하게 한 곳에서 담당한다.
// 좋아요/검색/채팅 기록이 전부 getAnonId() 하나만 보고 동작하므로(state.js),
// customerId 로 localStorage "lf-anon"을 덮어쓰면 그 기록들이 그대로 이어진다.
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
        supabase.auth.signOut();
        localStorage.setItem("lf-anon", crypto.randomUUID());
        syncLoginToggle();
        renderGuestAuthModal(el);
    });
}

function startGoogleLogin() {
    // 지금 페이지로 그대로 돌아온다 — 복귀하면 onAuthStateChange(SIGNED_IN)가
    // resolveBackendAccount 를 불러 로그인/회원가입 뎁스 이동까지 알아서 한다.
    // 복귀 후 첫 이벤트를 "진짜 로그인"으로 인식시키는 표시.
    try { sessionStorage.setItem(OAUTH_PENDING_KEY, "1"); } catch { /* 무시 */ }
    supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin + window.location.pathname },
    });
}

function renderGuestAuthModal(el) {
    el.innerHTML = `
        <div class="auth-modal">
            <button class="auth-close" aria-label="닫기">&times;</button>
            <div class="auth-section">
                <h3 class="auth-title">로그인</h3>
                <button type="button" id="googleLoginBtn" class="auth-cta auth-cta--google">Google로 로그인</button>
                <div class="auth-divider"></div>
                <form id="loginForm" class="auth-form">
                    <input id="loginEmailInput" type="email" placeholder="이메일" autocomplete="username" required>
                    <input id="loginPwInput" type="password" placeholder="비밀번호" autocomplete="current-password" required>
                    <button type="submit" class="auth-cta">로그인</button>
                </form>
                <button type="button" id="forgotPwBtn" class="auth-back">비밀번호를 잊으셨나요?</button>
                <p id="loginError" class="auth-error"></p>
            </div>
            <div class="auth-divider"></div>
            <div class="auth-section">
                <p class="auth-notice">아직 계정이 없으신가요?</p>
                <button type="button" id="gotoSignup" class="auth-cta auth-cta--ghost">회원가입</button>
            </div>
        </div>
    `;
    el.querySelector(".auth-close").addEventListener("click", closeAuthModal);
    el.querySelector("#googleLoginBtn").addEventListener("click", startGoogleLogin);

    el.querySelector("#loginForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = el.querySelector("#loginEmailInput").value.trim();
        const password = el.querySelector("#loginPwInput").value;
        const errorEl = el.querySelector("#loginError");
        errorEl.textContent = "";
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        // 성공하면 onAuthStateChange(SIGNED_IN)가 이어서 처리한다(모달 닫기까지 포함) —
        // 여기서는 실패만 보여주면 된다.
        if (error) errorEl.textContent = "이메일 또는 비밀번호가 맞지 않아요.";
    });

    el.querySelector("#forgotPwBtn").addEventListener("click", async () => {
        const email = prompt("가입한 이메일을 입력해 주세요.");
        if (!email) return;
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password.html`,
        });
        alert(error ? "메일 전송에 실패했어요." : "비밀번호 재설정 메일을 보냈어요. 메일함을 확인해 주세요.");
    });

    el.querySelector("#gotoSignup").addEventListener("click", () => renderSignupAuthModal(el));
}

// 로그인 화면의 "회원가입" 버튼을 눌러야 나오는 회원가입 폼.
// 로그인 폼과 한 화면에 같이 두면 "지금 어디에 입력하고 있는지" 헷갈리기 쉬워
// 화면을 통째로 바꿔 끼운다. 여기서는 Supabase 계정만 만들고(이메일+비번, 또는 구글),
// 이름·나이·거주지 같은 기본정보/설문은 signup.html 이 이어받아 /api/signup 을 부른다
// (onAuthStateChange 가 "가입 안 된 계정"으로 판단해 자동으로 그리로 보낸다).
function renderSignupAuthModal(el) {
    el.innerHTML = `
        <div class="auth-modal">
            <button class="auth-close" aria-label="닫기">&times;</button>
            <div class="auth-section">
                <h3 class="auth-title">회원가입</h3>
                <button type="button" id="googleSignupBtn" class="auth-cta auth-cta--google">Google로 시작하기</button>
                <div class="auth-divider"></div>
                <form id="signupForm" class="auth-form">
                    <input id="signupEmailInput" type="email" placeholder="이메일" autocomplete="username" required>
                    <input id="signupPwInput" type="password" placeholder="비밀번호 (6자 이상)" autocomplete="new-password" required>
                    <p id="signupError" class="auth-error"></p>
                    <button type="submit" class="auth-cta">다음: 정보 입력하기</button>
                </form>
                <button type="button" id="backToLogin" class="auth-back">← 로그인으로 돌아가기</button>
            </div>
        </div>
    `;
    el.querySelector(".auth-close").addEventListener("click", closeAuthModal);
    el.querySelector("#googleSignupBtn").addEventListener("click", startGoogleLogin);
    el.querySelector("#backToLogin").addEventListener("click", () => renderGuestAuthModal(el));

    el.querySelector("#signupForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = el.querySelector("#signupEmailInput").value.trim();
        const password = el.querySelector("#signupPwInput").value;
        const errorEl = el.querySelector("#signupError");
        errorEl.textContent = "";

        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) {
            errorEl.textContent = "회원가입에 실패했어요: " + error.message;
            return;
        }
        if (!data.session) {
            // 프로젝트에 이메일 확인이 켜져 있으면 세션이 바로 안 생긴다 — 메일의 링크를
            // 눌러 돌아오면 그때 onAuthStateChange(SIGNED_IN)가 이어서 처리한다.
            alert("가입 확인 메일을 보냈어요. 메일의 링크를 눌러 인증을 마치면 계속할 수 있어요.");
            return;
        }
        // 세션이 바로 생기면 onAuthStateChange(SIGNED_IN)가 signup.html 로 자동으로 넘긴다.
    });
}

// 우상단 로그인 버튼의 표시 문구. 로그아웃은 계정을 지우는 게 아니라
// 새 익명 id를 발급하는 것뿐이라(state.js), 로그인 폼과 별도 화면 없이 그 자리에서 처리한다.
export function syncLoginToggle() {
    const btn = document.getElementById("loginToggle");
    if (!btn) return;
    btn.textContent = isLoggedIn() ? "로그아웃" : "로그인";
}

export function handleLoginToggleClick() {
    if (isLoggedIn()) {
        supabase.auth.signOut();
        localStorage.setItem("lf-anon", crypto.randomUUID());
        syncLoginToggle();
    } else {
        openAuthModal();
    }
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