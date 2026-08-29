let menuModalEl = null;
let comingSoonEl = null;

// 메뉴 패널 DOM을 처음 열릴 때 한 번만 만든다.
function ensureMenu() {
    if (menuModalEl) return menuModalEl;
    menuModalEl = document.createElement("div");
    menuModalEl.className = "menu-backdrop";
    menuModalEl.innerHTML = `
        <nav class="menu-panel">
            <button class="menu-close" aria-label="닫기">&times;</button>
            <div class="menu-items" id="menuItems"></div>
            <a class="menu-logout-link" href="#" id="menuLogout" hidden>로그아웃</a>
            <a class="menu-admin-link" href="admin.html">관리자 페이지 (개발용)</a>
        </nav>
    `;
    document.body.appendChild(menuModalEl);

    // 배경 클릭하면 닫기
    menuModalEl.addEventListener("click", (e) => {
        if (e.target === menuModalEl) closeMenu();
    });
    menuModalEl.querySelector(".menu-close").addEventListener("click", closeMenu);

    // 로그아웃: 토큰을 지우고 목록을 다시 그린다 (로그인 전 화면으로 전환)
    menuModalEl.querySelector("#menuLogout").addEventListener("click", (e) => {
        e.preventDefault();
        localStorage.removeItem("lifefit-token");
        renderMenuItems();
    });

    return menuModalEl;
}


// 로그인 여부를 판별. 
// 실제 로그인 API가 생기기 전까지는 `localStorage`에 토큰이 있는지만 확인하는 임시 버전으로 시작해도 됩니다
// (2단계에서 진짜 로그인 API가 생기면 이 값을 그 응답으로 채워 넣게 됨)
function isLoggedIn() {
    return !!localStorage.getItem("lifefit-token");
}


// `isLoggedIn()` 결과에 따라 메뉴 항목을 다르게 그린다.
// 관리자 페이지는 로그인만으로는 부족하고 "이 사람이 관리자인가"까지확인해야 하니,
// 나중에 `isAdmin()` 같은 별도 체크를 추가해서 일반로그인 사용자에게는 이 항목 자체를 안 보여주는 게 맞습니다(지금은 뼈대만 잡아두는 단계라 우선 넣어둠).
function renderMenuItems() {
    const box = document.getElementById("menuItems");

    if (!isLoggedIn()) {
        box.innerHTML = `
            <a class="menu-item" href="signup.html">회원가입</a>
            <a class="menu-item" href="#" id="menuLogin">로그인</a>
        `;

        document.getElementById("menuLogin").addEventListener("click", (e) => {
            // href="#" 때문에 브라우저가 페이지 맨 위로 이동하려는 걸 막는다
            e.preventDefault();
            // TODO: 실제 로그인 API가 생기면 이 두 줄을 서버 호출로 바꾼다.
            // 지금은 로그인 후 화면을 미리 확인해 보기 위한 개발용 임시 로그인이다.
            localStorage.setItem("lifefit-token", "dev-fake-token");
            renderMenuItems();   // 패널을 닫지 않고 목록만 다시 그린다
        });
        document.getElementById("menuLogout").hidden = true;   // 2번에서 추가
        return;
    }

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
    document.getElementById("menuLogout").hidden = false;   // 2번에서 추가
   }

function openMenu() {
    const el = ensureMenu();
    renderMenuItems();
    el.classList.add("is-open");
}

function closeMenu() {
    if (!menuModalEl) return;
    menuModalEl.classList.remove("is-open");
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