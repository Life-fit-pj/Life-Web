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
만들어서 눈으로 확인해 볼 수 있으니, 아래 "앞으로 할 일" 절에서 그 방법을
정리합니다.

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

# 앞으로 할 일 — 로그인 메뉴 흐름 마무리 (2026-08-29)

메뉴 버튼(☰)과 메뉴 패널 자체는 이미 동작합니다(`frontend/menu.js`,
`index.html`, `style.css`). 지금 메뉴 안의 "회원가입"/"로그인"과, 로그인 후
목록의 다섯 항목은 전부 존재하지 않는 페이지(`signup.html`, `login.html`,
`mypage.html` 등)를 가리키고 있어서 누르면 404가 납니다. 아래 세 가지를
순서대로 고치면 됩니다. **아직 코드에는 적용하지 않았고, 이 study.md에만
정리해 둔 계획입니다.**

## 1. "로그인" 버튼을 누르면 메뉴 목록이 그 자리에서 "로그인 후" 목록으로 바뀌게 하기

실제 로그인 서버가 없으니, 지금은 "진짜 로그인"을 만들 수 없습니다. 대신
개발 중에 로그인 후 화면이 잘 만들어졌는지 눈으로 확인할 수 있도록, 로그인
버튼을 누르면 **로그인한 척**(가짜 토큰을 잠깐 저장)하고 메뉴 목록만 즉시
바꿔서 보여주는 방법을 씁니다.

이게 가능한 이유: `frontend/menu.js`의 `isLoggedIn()`은 서버에 물어보지
않고, 그냥 브라우저에 `localStorage.getItem("lifefit-token")` 값이 있는지만
봅니다(진짜 로그인 기능이 생기기 전까지 쓰기로 한 임시 버전이었죠). 그러니
이 값을 아무 문자열로나 채워 넣기만 해도 `isLoggedIn()`은 "로그인
했다"고 착각합니다.

`frontend/menu.js`의 `renderMenuItems()` 안, 로그인 전 분기(원본):
```js
    if (!isLoggedIn()) {
        box.innerHTML = `
            <a class="menu-item" href="signup.html">회원가입</a>
            <a class="menu-item" href="login.html">로그인</a>
        `;
        return;
    }
```

수정:
```js
    if (!isLoggedIn()) {
        box.innerHTML = `
            <a class="menu-item" href="signup.html">회원가입</a>
            <button class="menu-item" type="button" id="menuLogin">로그인</button>
        `;

        document.getElementById("menuLogin").addEventListener("click", () => {
            // TODO: 실제 로그인 API가 생기면 이 두 줄을 서버 호출로 바꾼다.
            // 지금은 로그인 후 화면을 미리 확인해 보기 위한 개발용 임시 로그인이다.
            localStorage.setItem("lifefit-token", "dev-fake-token");
            renderMenuItems();   // 패널을 닫지 않고 목록만 다시 그린다
        });
        return;
    }
```

왜 `<a href="login.html">`이 아니라 `<button>`으로 바꾸는지: `<a href>`는
클릭하면 그 주소로 페이지 이동을 "시도"하는 태그라서, 페이지가 없으면
404가 뜹니다. 지금은 어디로도 이동하지 않고 "메뉴 목록만 바꿔치기"하면
되므로, 페이지 이동이 없는 `<button>`이 맞습니다.

왜 `renderMenuItems()`를 다시 부르기만 하면 되는지: 이 함수는 매번
`document.getElementById("menuItems")`로 같은 상자를 찾아서 그 안의
`innerHTML`을 새로 채웁니다. 메뉴 패널(`.menu-backdrop`) 자체를 닫았다 여는
게 아니라, 그 안의 목록 부분만 다시 그리는 것이므로 사용자 눈에는 "같은
패널 안에서 목록만 바뀌는" 것처럼 보입니다 — 이게 요청하신 "로그인 클릭 시
메뉴창 리스트가 로그인 이후 메뉴창으로 전환"되는 동작입니다.

> **참고 (선택 사항)**: 로그인 후 화면을 여러 번 반복해서 확인하려면
> 다시 로그아웃 상태로 되돌릴 방법도 있으면 편합니다. 브라우저 개발자
> 도구 콘솔에 `localStorage.removeItem("lifefit-token")`을 직접 쳐서
> 초기화할 수도 있고, 원하시면 로그인 후 목록 맨 아래에 작은 "로그아웃
> (테스트용)" 버튼을 하나 추가해서 `localStorage.removeItem(...)` 후
> `renderMenuItems()`를 다시 부르게 만들 수도 있습니다. 이 부분은
> 요청하신 4가지 항목에는 없어서 지금 코드로 적어두지 않았고, 필요하시면
> 말씀해 주세요.

## 2. 로그인 후 메뉴의 각 항목 — 클릭하면 "준비 중" 안내창이 뜨게 하기

로그인 후 목록의 네 항목(마이페이지, 기록 저장소, 좋아요, 데이터 출처)은
전부 `mypage.html`처럼 아직 만들지 않은 페이지를 가리키고 있어서 지금
클릭하면 404가 뜹니다(관리자 페이지는 3번에서 따로 다룹니다). 아직 그
페이지들을 만들 단계는 아니니, 당장은 클릭했을 때 "아직 준비 중이에요"
라고 알려주는 공용 안내창 하나만 만들어 두고, 각 페이지가 실제로
완성되는 대로 그 항목만 원래 `<a href="...">` 형태로 되돌리면 됩니다.

`frontend/menu.js`의 `renderMenuItems()` 안, 로그인 후 분기(원본):
```js
    box.innerHTML = `
        <a class="menu-item" href="mypage.html">마이페이지</a>
        <a class="menu-item" href="history.html">검색 및 대화 기록 저장소</a>
        <a class="menu-item" href="likes.html">좋아요 한 거주지</a>
        <a class="menu-item" href="admin.html">관리자 페이지</a>
        <a class="menu-item" href="about-data.html">원본 데이터 및 출처 안내</a>
    `;
```

수정 (관리자 페이지 항목은 3번에서 패널 하단으로 옮기므로 여기서는 뺍니다):
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

`data-feature` 속성에 눈여겨볼 점: 버튼마다 이름이 다른데 클릭했을 때 뜨는
안내 문구도 각각 달라야 하니, "이 버튼이 어떤 기능인지"를 `data-feature`라는
HTML 속성에 적어두고, 클릭 이벤트 안에서 `btn.dataset.feature`로 그 값을
다시 읽어와 안내창에 넘겨줍니다. 함수 하나(`openComingSoon`)를 항목 4개가
공유해서 쓸 수 있는 이유가 이것입니다.

`menu.js` 맨 아래에 새로 추가할 공용 안내창(이미 있는 `ensureMenu()`와 같은
"한 번만 만들고 재사용하는" 패턴입니다):
```js
let comingSoonEl = null;

// 아직 안 만든 화면으로 이동하려 할 때 보여주는 공용 안내창.
// 페이지가 완성되면 그 항목의 버튼을 <a href="...html"> 로 되돌리고
// 이 함수 호출은 지우면 된다
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
    el.querySelector("#comingSoonText").textContent = `"${featureName}" 기능은 아직 준비 중이에요.`;
    el.classList.add("is-open");
}

function closeComingSoon() {
    if (!comingSoonEl) return;
    comingSoonEl.classList.remove("is-open");
}
```

`style.css`에 추가할 스타일(`.menu-backdrop` 근처에 두면 메뉴 관련 스타일이
한자리에 모입니다):
```css
.coming-soon-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 9500;               /* 메뉴(.menu-backdrop, 9000)보다 위에 뜨도록 */
  display: none;
  align-items: center;
  justify-content: center;
}
.coming-soon-backdrop.is-open { display: flex; }

.coming-soon-panel {
  position: relative;
  width: min(320px, 90vw);
  background: var(--surface-2);
  border-radius: 16px;
  padding: 28px 24px;
  box-shadow: var(--shadow);
  text-align: center;
  font-size: 14px;
  color: var(--text);
}

.coming-soon-close {
  position: absolute;
  top: 12px;
  right: 12px;
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
}
```

## 3. 관리자 페이지 전용 통로를 메뉴 패널 맨 아래에 작게 만들기

관리자 페이지는 원래 "로그인만으로는 부족하고, 이 사람이 관리자인지까지
확인해야 하는" 항목이라 일반 사용자 메뉴 목록에 나란히 두는 게 맞지
않습니다(위 "2. 메뉴 항목별로 실제 필요한 백엔드 작업" 참고). 그런데 지금은
`admin.html` 자체를 아직 만들지 않았고, 앞으로 그 화면을 만들면서 계속
들어가 볼 통로가 필요합니다. 그래서 눈에 잘 띄는 목록 안이 아니라, 메뉴
패널 맨 아래에 작은 글씨 링크 하나로 따로 둡니다 — "이건 일반 사용자용
메뉴가 아니라 개발 중인 화면으로 가는 지름길"이라는 걸 크기로도 구분해
두는 것입니다.

`frontend/menu.js`의 `ensureMenu()` 안(원본):
```js
    menuModalEl.innerHTML = `
        <nav class="menu-panel">
            <button class="menu-close" aria-label="닫기">&times;</button>
            <div class="menu-items" id="menuItems"></div>
        </nav>
    `;
```

수정:
```js
    menuModalEl.innerHTML = `
        <nav class="menu-panel">
            <button class="menu-close" aria-label="닫기">&times;</button>
            <div class="menu-items" id="menuItems"></div>
            <a class="menu-admin-link" href="admin.html">관리자 페이지 (개발용)</a>
        </nav>
    `;
```

`style.css`에 추가할 스타일:
```css
.menu-admin-link {
  display: block;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
  font-size: 11px;
  color: var(--text-muted);
  text-align: center;
  text-decoration: none;
}
.menu-admin-link:hover { color: var(--text); }
```

`admin.html` 파일 자체는 아직 없으니 지금 눌러보면 404가 뜹니다 — 이건
당연한 상태이고, 앞으로 그 파일을 만들면서 이 링크로 계속 들어가 확인하면
됩니다. 로그인 여부와 상관없이 항상 이 링크가 보이는 이유도 같습니다:
지금은 "일반 사용자에게 보여줄지 말지"를 정할 단계가 아니라 "화면을 만드는
동안 개발자가 쉽게 들어갈 수 있어야 하는" 단계이기 때문입니다. 나중에
실제로 로그인·관리자 권한 시스템이 생기면, 이 링크를 `isAdmin()` 체크로
감싸서 관리자가 아니면 아예 안 보이게 바꾸면 됩니다.
