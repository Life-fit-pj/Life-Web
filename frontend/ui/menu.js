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
        <a class="menu-item" href="#" data-feature="검색 및 대화 기록 저장소">검색 및 대화 기록 저장소</a>
        <a class="menu-item" href="#" data-feature="좋아요 한 거주지">좋아요 한 거주지</a>
        <a class="menu-item" href="#" data-feature="원본 데이터 및 출처 안내">원본 데이터 및 출처 안내</a>
    `;
    box.querySelectorAll("a[data-feature]").forEach((link) => {
        link.addEventListener("click", (e) => {
            e.preventDefault();
            openComingSoon(link.dataset.feature);
        });
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

// 헤더 "로그인" 버튼을 누르면 뜨는 안내 모달.
// 로그인/회원가입 둘 다 실제 기능이 없어서 "준비중" 문구만 보여준다.
// 크기는 맵 핀 클릭 시 뜨는 .reason-modal(ui/reason.css)과 동일하게 맞췄다.
function ensureAuthModal() {
    if (authModalEl) return authModalEl;

    authModalEl = document.createElement("div");
    authModalEl.className = "auth-backdrop";
    authModalEl.innerHTML = `
        <div class="auth-modal">
            <button class="auth-close" aria-label="닫기">&times;</button>
            <div class="auth-section">
                <h3 class="auth-title">로그인</h3>
                <p class="auth-notice">🔒 로그인 기능은 아직 준비 중입니다.</p>
            </div>
            <div class="auth-divider"></div>
            <div class="auth-section">
                <h3 class="auth-title">회원가입</h3>
                <p class="auth-notice">✍️ 회원가입 기능은 아직 준비 중입니다.</p>
            </div>
        </div>
    `;
    document.body.appendChild(authModalEl);

    authModalEl.addEventListener("click", (e) => {
        if (e.target === authModalEl) closeAuthModal();
    });
    authModalEl.querySelector(".auth-close").addEventListener("click", closeAuthModal);

    return authModalEl;
}

export function openAuthModal() {
    ensureAuthModal().classList.add("is-open");
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