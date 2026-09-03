import { openHistory } from "./history.js";
import { openMypage } from "./mypage.js";
import { login, checkLoginId, signup, googleLogin } from "../lib/api.js";
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
        <a class="menu-item" id="menuMypage" href="#">마이페이지</a>
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
// 회원가입은 로그인 화면의 "회원가입" 버튼을 눌러야 나오는 별도 화면이다
// (renderSignupAuthModal) — 아이디 중복확인 + 비밀번호 확인만 보는 최소 폼이고,
// 계정을 만든 뒤에는 그대로 라이프스타일 설문(signup.html)으로 넘어간다.
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

                <div class="auth-or"><span>또는</span></div>
                <div id="googleBtn" class="auth-google"></div>
                <p id="googleError" class="auth-error"></p>
            </div>
            <div class="auth-divider"></div>
            <div class="auth-section">
                <p class="auth-notice">아직 계정이 없으신가요?</p>
                <button type="button" id="gotoSignup" class="auth-cta auth-cta--ghost">회원가입</button>
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

    setupGoogleButton(el);
    el.querySelector("#gotoSignup").addEventListener("click", () => renderSignupAuthModal(el));
}

// 로그인 화면의 "회원가입" 버튼을 눌러야 나오는 회원가입 폼.
// 로그인 폼과 한 화면에 같이 두면 "지금 어디에 입력하고 있는지" 헷갈리기 쉬워
// 화면을 통째로 바꿔 끼운다 — 로그인/구글 로그인 쪽으로는 아래 "로그인으로 돌아가기"로 되돌아간다.
function renderSignupAuthModal(el) {
    el.innerHTML = `
        <div class="auth-modal">
            <button class="auth-close" aria-label="닫기">&times;</button>
            <div class="auth-section">
                <h3 class="auth-title">회원가입</h3>
                <form id="signupForm" class="auth-form">
                    <p id="signupIdError" class="auth-error auth-error--above"></p>
                    <div class="auth-id-row">
                        <input id="signupIdInput" type="text" placeholder="아이디" autocomplete="off" required>
                        <button type="button" id="checkIdBtn" class="auth-check-btn">중복확인</button>
                    </div>
                    <p id="signupIdStatus" class="auth-hint"></p>

                    <input id="signupPwInput" type="password" placeholder="비밀번호" autocomplete="off" required>

                    <p id="signupPwError" class="auth-error auth-error--above"></p>
                    <input id="signupPwConfirmInput" type="password" placeholder="비밀번호 확인" autocomplete="off" required>

                    <button type="submit" class="auth-cta">가입하고 설문 시작하기</button>
                </form>
                <button type="button" id="backToLogin" class="auth-back">← 로그인으로 돌아가기</button>
            </div>
        </div>
    `;
    el.querySelector(".auth-close").addEventListener("click", closeAuthModal);
    el.querySelector("#backToLogin").addEventListener("click", () => renderGuestAuthModal(el));

    setupSignupForm(el);
}

// 구글 로그인 버튼. Google Identity Services 스크립트(index.html)가 만드는
// window.google.accounts.id 를 쓴다. 클라이언트 ID(window.GOOGLE_CLIENT_ID, index.html에서
// 정의)가 아직 비어 있으면 안내 문구만 보여주고 버튼은 그리지 않는다 — 키 없이 그려봐야
// 눌러도 실패하기만 하는 버튼을 보여주는 셈이라 혼란만 준다.
function setupGoogleButton(el) {
    const mount = el.querySelector("#googleBtn");
    const errorEl = el.querySelector("#googleError");
    const clientId = window.GOOGLE_CLIENT_ID;

    if (!clientId || !window.google?.accounts?.id) {
        mount.textContent = "구글 로그인은 아직 준비 중이에요.";
        return;
    }

    window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async ({ credential }) => {
            errorEl.textContent = "";
            try {
                const { customerId } = await googleLogin(credential);
                localStorage.setItem("lf-anon", customerId);
                renderLoggedInAuthModal(el);
            } catch (err) {
                errorEl.textContent = "구글 로그인에 실패했어요.";
            }
        },
    });
    window.google.accounts.id.renderButton(mount, {
        theme: "outline", size: "large", width: 280, text: "signin_with",
    });
}

// 회원가입 폼. 아이디 중복확인 + 비밀번호/비밀번호 확인 일치만 보는 최소 구성이다.
function setupSignupForm(el) {
    const form = el.querySelector("#signupForm");
    const idInput = el.querySelector("#signupIdInput");
    const idError = el.querySelector("#signupIdError");
    const idStatus = el.querySelector("#signupIdStatus");
    const checkBtn = el.querySelector("#checkIdBtn");
    const pwInput = el.querySelector("#signupPwInput");
    const pwConfirmInput = el.querySelector("#signupPwConfirmInput");
    const pwError = el.querySelector("#signupPwError");

    // 중복확인을 통과한 아이디만 가입을 허용한다. 확인 후 아이디를 다시 고치면
    // 그 확인은 무효가 된다 — 확인 안 한 다른 아이디로 가입되는 것을 막는다
    let idConfirmed = false;

    idInput.addEventListener("input", () => {
        idConfirmed = false;
        idStatus.textContent = "";
        idStatus.classList.remove("auth-hint--ok");
        idError.textContent = "";
    });

    checkBtn.addEventListener("click", async () => {
        const loginId = idInput.value.trim();
        idError.textContent = "";
        idStatus.textContent = "";
        idStatus.classList.remove("auth-hint--ok");

        if (!loginId) {
            idError.textContent = "아이디를 먼저 입력해 주세요.";
            return;
        }

        checkBtn.disabled = true;
        try {
            const { available } = await checkLoginId(loginId);
            idConfirmed = available;
            if (available) {
                idStatus.textContent = "사용할 수 있는 아이디예요.";
                idStatus.classList.add("auth-hint--ok");
            } else {
                idError.textContent = "이미 사용 중인 아이디예요.";
            }
        } catch (err) {
            idError.textContent = "중복확인에 실패했어요. 다시 시도해 주세요.";
        } finally {
            checkBtn.disabled = false;
        }
    });

    // 비밀번호 확인 칸 위 빨간 오류 문자. 다시 쓰기 시작하면 지운다
    // (signup.html 설문 칸이 에러 표시를 지우는 방식과 같다)
    pwConfirmInput.addEventListener("input", () => { pwError.textContent = ""; });
    pwInput.addEventListener("input", () => { pwError.textContent = ""; });

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const loginId = idInput.value.trim();
        const password = pwInput.value;
        const passwordConfirm = pwConfirmInput.value;

        if (!idConfirmed) {
            idError.textContent = "아이디 중복확인을 먼저 해 주세요.";
            idInput.focus();
            return;
        }

        if (password !== passwordConfirm) {
            pwError.textContent = "비밀번호가 서로 달라요. 다시 입력해 주세요.";
            pwConfirmInput.focus();
            return;
        }

        try {
            const { customerId } = await signup(loginId, password);
            localStorage.setItem("lf-anon", customerId);
            // 가입 다음은 그대로 라이프스타일 설문으로 넘어간다(기존 흐름 유지)
            location.href = "signup.html";
        } catch (err) {
            if (err.status === 409) {
                idConfirmed = false;
                idError.textContent = "이미 사용 중인 아이디예요.";
                idInput.focus();
            } else {
                pwError.textContent = "가입에 실패했어요. 잠시 후 다시 시도해 주세요.";
            }
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