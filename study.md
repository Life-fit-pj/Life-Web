# 기록 방법
    - 사용자는 코딩을 막 시작한 초보개발자.
    - 함수나 기능에 대한 설명 필요
    - 원본 코드 -> 수정할 코드를 알기 쉽게 표기
    - 예시:
        클릭은 되는데 드래그만 안 되는 이유

        슬라이더를 끄는 건 mousedown → mousemove → mouseup 세 단계예요. 그런데 search.js가 문서 전체에 mousemove 리스너를 걸어놨죠:

       ```
        document.addEventListener("mousemove", (e) => {
        ...
        updateMagnetic(mx, my);
        });
        ```

        떠다니는 단어의 자석 효과예요. 이게 계속 돌면서 getBoundingClientRect()를 14번씩 호출해요. 검색 화면이 사라진 뒤에도요.

        클릭(한 번의 이벤트)은 되는데 드래그(연속 이벤트)가 버벅이는 게 이 증상과 맞아요.

        고치기 — 화면이 걷히면 자석을 멈춘다

        search.js의 updateMagnetic 맨 앞에 한 줄 넣으세요.

        ```
        function updateMagnetic(mx, my) {
        // 검색 화면이 걷힌 뒤에는 계산할 이유가 없다.
        // 그대로 두면 mousemove 마다 getBoundingClientRect 를 14번씩 부르느라
        // 슬라이더 드래그 같은 다른 조작이 버벅인다
        const screen = document.getElementById("searchScreen");
        if (!screen || screen.classList.contains("out")) return;

        document.querySelectorAll(".ss-word").forEach((word) => {
            ...    
        ```

---

# 우측 상단 원형 버튼 → 메뉴 버튼 전환

## 1. 왜 한 번에 다 못 만드는가 — 이 기능은 프론트만의 문제가 아니다

요청하신 항목을 두 그룹으로 나눠보면:

- **로그인 전 메뉴**: 회원가입, 로그인
- **로그인 후 메뉴**: 마이페이지, 검색·대화 기록 저장소, 좋아요 한 거주지,
  관리자 페이지, 데이터 출처 안내

뒤 네 개 중 "데이터 출처 안내"를 뺀 나머지는 전부 **"이 사람이 누구인지 서버가
기억하고 있어야" 동작하는 기능**이에요. 그런데 지금 이 저장소(Life-Web)에는:

- 회원 정보를 저장할 데이터베이스가 없습니다. `services/coords.py`,
  `services/floorplan.py`가 다루는 CSV는 동 좌표·평면도 데이터일 뿐 회원 정보가
  아니고, 추천 엔진이 쓰는 `Life-Embed-jh/data/life.db`도 성격이 다른 DB예요.
- 로그인/회원가입 API가 `main.py`에 전혀 없습니다(`/api/predict`,
  `/api/region`, `/api/region/explain`, `/api/chat` 네 개가 전부).
- `main.py`의 `ChatRequest`에 `history` 필드가 이미 있긴 한데, 주석에 "지금은
  안 쓰지만 자리를 열어 둔다 — 로그인·저장 기능을 붙이면 여기로 들어온다"고
  적혀 있어요(main.py:71-73). 즉 이 확장을 어느 정도 예상하고 자리만 비워둔
  상태입니다.

그래서 이 작업은 **프론트 전용으로 바로 가능한 부분**과 **백엔드·DB가 먼저
필요한 부분**으로 나눠서 정리해 둡니다. 백엔드가 없어도 화면 흐름은 미리
만들어서 눈으로 확인해 볼 수 있으니, 아래 절에서 그 방법을 정리합니다.

## 2. 메뉴 항목별로 실제 필요한 백엔드 작업

지금 당장 만들 필요는 없지만, 항목별로 뭐가 걸려 있는지 미리 알아두면
설계할 때 도움이 될 거예요.

**회원가입 / 로그인**
- 새 DB(회원 테이블: 이메일, 비밀번호 해시, 가입일, 권한(`role`))와
  `main.py`에 `/api/auth/signup`, `/api/auth/login`, `/api/auth/me` 라우트가
  필요합니다.
- 비밀번호는 반드시 해시해서 저장해야 합니다(평문 저장 금지) — `bcrypt`나
  `passlib` 같은 라이브러리를 씁니다.
- 로그인 성공 시 세션 또는 JWT 토큰을 내려주고, 프론트는 그 값을
  `localStorage`에 저장해서 이후 요청마다 실어 보냅니다. `isLoggedIn()`은
  이 토큰의 존재 여부를 보게 됩니다.

**마이페이지**
- `/api/auth/me` 응답(이메일, 가입일 등)을 보여주는 화면 하나만 있으면 됩니다.
  로그인 시스템이 생긴 다음의 일입니다.

**검색 및 대화 기록 저장소**
- `main.py`의 `ChatRequest.history`가 지금은 비어 있는 자리인데, 로그인
  상태일 때 `/api/predict`·`/api/chat` 호출 결과를 회원별로 DB에 쌓는
  로직을 추가해야 합니다. 새 테이블(예: `search_history`, `chat_history`)이
  필요합니다.

**좋아요 한 거주지**
- 지도 핀 클릭 시 뜨는 `openReasonModal`(script.js:287) 안에 "좋아요" 버튼을
  추가하고, `/api/likes`(POST로 추가, DELETE로 취소) 라우트와 `likes`
  테이블(회원, 구, 동)이 필요합니다.

**관리자 페이지**
- 회원 테이블에 권한 필드가 있어야 하고, 관리자 전용 라우트/화면이
  필요합니다. 실제로 뭘 관리할지(회원 목록? 신고 처리?)는 별도로 정해야
  합니다.

**원본 데이터 및 출처 안내**
- 이 항목만 백엔드가 필요 없습니다. `about-data.html` 같은 정적 페이지 하나에
  `Life-Embed-jh`가 사용하는 공공데이터 출처를 나열하면 끝입니다.

---

# 메뉴 항목을 <a>로 되돌리기 + 로그아웃 추가 (2026-08-29)

## 0. 지금까지 상황 정리

- `comingSoonEl` 선언 누락 버그는 이미 고쳐졌습니다(`menu.js` 맨 위에
  `let comingSoonEl = null;`이 들어가 있는 걸 확인했습니다) — 더 손댈 것 없음.
- 반면 로그인 후 목록 4개 항목과 "로그인" 항목을 `<button>`으로 만들고
  CSS로 버튼 기본 스타일을 지우는 방식은 **취소**합니다. `<a>`를 쓰면서
  `e.preventDefault()`로 이동만 막으면 애초에 상자 스타일 문제 자체가 안
  생기기 때문입니다. 아래 1번에서 다시 `<a>`로 되돌리는 방법을 정리합니다.
- 여기에 더해, 로그인 후 메뉴에서 다시 로그인 전 상태로 돌아갈 수 있는
  "로그아웃"을 관리자 링크 바로 위에 추가합니다(2번).

## 1. `<button>` 대신 `<a href="#">` + `e.preventDefault()`

**왜 `<a>`로 되돌리는 게 더 간단한가**: `<button>`은 "페이지 이동이 없는
동작"이라는 의미에 더 정확히 맞는 태그이지만, 그 대가로 브라우저가 자동으로
입혀주는 회색 상자 스타일을 CSS로 일일이 지워야 합니다. `<a>`는 원래
페이지 이동 태그이지만, 클릭 이벤트 핸들러 안에서 `e.preventDefault()`를
불러주면 그 이동 동작만 막을 수 있습니다 — 즉 `<a>`를 쓰면서도 실제로는
아무 데도 이동하지 않고 원하는 JS 함수만 실행되게 만들 수 있고, 브라우저가
`<a>`에는 애초에 상자 모양 기본 스타일을 입히지 않으므로 CSS를 따로 지울
필요도 없습니다. (스크린리더 같은 접근성 도구는 `<a>`와 `<button>`을 다르게
안내하긴 하지만, 지금 단계에서는 화면을 빨리 확인하는 게 더 급하니 나중에
실제 로그인 기능을 붙일 때 다시 검토해도 됩니다.)

`frontend/menu.js`의 `renderMenuItems()` 안, 로그인 전 분기(원본):
```js
    if (!isLoggedIn()) {
        box.innerHTML = `
            <a class="menu-item" href="signup.html">회원가입</a>
            <button class="menu-item" type="button" id="menuLogin">로그인</button>
        `;

        document.getElementById("menuLogin").addEventListener("click", () => {
            localStorage.setItem("lifefit-token", "dev-fake-token");
            renderMenuItems();
        });
        return;
    }
```

수정:
```js
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
```

로그인 후 분기(원본):
```js
    box.innerHTML = `
        <button class="menu-item" type="button" data-feature="마이페이지">마이페이지</button>
        <button class="menu-item" type="button" data-feature="검색 및 대화 기록 저장소">검색 및 대화 기록 저장소</button>
        <button class="menu-item" type="button" data-feature="좋아요 한 거주지">좋아요 한 거주지</button>
        <button class="menu-item" type="button" data-feature="원본 데이터 및 출처 안내">원본 데이터 및 출처 안내</button>
    `;
    box.querySelectorAll("button[data-feature]").forEach((btn) => {
        btn.addEventListener("click", () => openComingSoon(btn.dataset.feature));
    });
```

수정:
```js
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
```

`style.css`의 `.menu-item` 규칙은 이제 버튼 기본 스타일을 지울 필요가 없어져서
원래 형태로 되돌려도 됩니다(지금 들어가 있는 `border: none`, `background: none`,
`font: inherit` 같은 속성들은 `<a>`에는 원래 해당 사항이 없는 값이라 남겨둬도
동작에 지장은 없지만, 정리하는 김에 단순하게 되돌립니다).

원본(현재 style.css):
```css
.menu-item {
  display: block;
  width: 100%;
  padding: 12px 8px;
  color: var(--text);
  text-decoration: none;
  border: none;
  border-bottom: 1px solid var(--line);
  border-radius: 0;
  background: none;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
```

수정:
```css
.menu-item {
  display: block;
  padding: 12px 8px;
  color: var(--text);
  text-decoration: none;
  border-bottom: 1px solid var(--line);
}
```

## 2. 로그아웃 — 관리자 링크 바로 위에 작게 추가

로그인 상태를 벗어날 방법이 지금은 브라우저 개발자 도구를 여는 것뿐이라,
누르면 로그인 전 화면(회원가입/로그인 목록)으로 바로 돌아가는 "로그아웃"
링크를 만듭니다. 관리자 링크(`.menu-admin-link`)처럼 항상 패널에 존재하되,
로그인 상태일 때만 보이게 합니다.

**왜 로그인 전용 요소를 매번 새로 만들지 않고 "숨기기/보이기"로 처리하는가**:
`menu-admin-link`처럼 `ensureMenu()`가 패널을 한 번 만들 때 로그아웃 링크도
같이 만들어 두고, `renderMenuItems()`가 불릴 때마다 로그인 여부에 따라
보였다 숨었다만 하면 됩니다. 이렇게 하면 클릭 이벤트도 `ensureMenu()`에서
딱 한 번만 연결해 두면 되고(패널 자체가 싱글턴이니까), `renderMenuItems()`가
매번 `innerHTML`을 새로 쓸 때 이벤트가 같이 사라지는 문제(1번 항목의 메뉴
목록들이 왜 매번 이벤트를 다시 걸어야 했는지와 같은 이유)를 신경 쓰지
않아도 됩니다.

`frontend/menu.js`의 `ensureMenu()`(원본):
```js
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
```

수정:
```js
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
```

`hidden`이라는 속성 설명: HTML 표준 속성으로, 붙어 있으면 브라우저가 그
엘리먼트를 화면에서 안 보이게 처리합니다(`style="display:none"`과 거의
같은 효과). JS에서는 `엘리먼트.hidden = true`나 `= false`로 간단히 켜고 끌
수 있어서, 위 1번 코드에서 로그인 전 분기 끝에는
`document.getElementById("menuLogout").hidden = true;`, 로그인 후 분기 끝에는
`document.getElementById("menuLogout").hidden = false;`를 넣어 로그인
상태가 바뀔 때마다 로그아웃 링크가 자동으로 나타나거나 사라지게 됩니다.

`style.css`에 `.menu-admin-link` 규칙 바로 위(또는 아래)에 추가:
```css
.menu-logout-link {
  display: block;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
  font-size: 12px;
  color: var(--text-muted);
  text-align: center;
  text-decoration: none;
}
.menu-logout-link:hover { color: var(--text); }
.menu-logout-link[hidden] { display: none; }
```

**`[hidden] { display: none; }` 줄이 왜 필요한가**: 브라우저는 원래
`hidden` 속성이 붙은 엘리먼트를 자동으로 안 보이게 하지만, 그건 브라우저가
기본으로 깔아 두는 아주 약한 우선순위의 스타일입니다. 우리가 만든
`.menu-logout-link { display: block; }` 같은 스타일은 그보다 우선순위가
높아서, `hidden` 속성만 믿고 있으면 오히려 `display: block`이 이겨서 숨겨야
할 때도 계속 보이는 문제가 생길 수 있습니다. 그래서 `.menu-logout-link[hidden]`
처럼 우리 클래스 이름에 `hidden`까지 같이 걸어서, 확실하게 `display: none`이
이기도록 명시해 둡니다.

로그아웃을 누르면 `renderMenuItems()`가 다시 불려서 `isLoggedIn()`이
`false`가 된 상태로 로그인 전 목록(회원가입/로그인)을 다시 그리고,
`menuLogout.hidden = true`도 같이 실행되어 로그아웃 링크 자체도 사라집니다
— 이게 "로그아웃 누르면 로그인/회원가입 화면으로 돌아간다"는 동작입니다.
