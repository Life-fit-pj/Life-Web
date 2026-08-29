let menuModalEl = null;

// 메뉴 패널 DOM을 처음 열릴 때 한 번만 만든다.
function ensureMenu() {
    if (menuModalEl) return menuModalEl;
    menuModalEl = document.createElement("div");
    menuModalEl.className = "menu-backdrop";
    menuModalEl.innerHTML = `
        <nav class="menu-panel">
            <button class="menu-close" aria-label="닫기">&times;</button>
            <div class="menu-items" id="menuItems"></div>
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
            <a class="menu-item" href="login.html">로그인</a>
        `;
        return;
    }

    box.innerHTML = `
        <a class="menu-item" href="mypage.html">마이페이지</a>
        <a class="menu-item" href="history.html">검색 및 대화 기록 저장소</a>
        <a class="menu-item" href="likes.html">좋아요 한 거주지</a>
        <a class="menu-item" href="admin.html">관리자 페이지</a>
        <a class="menu-item" href="about-data.html">원본 데이터 및 출처 안내</a>
    `;
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


