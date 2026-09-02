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

# (2026-09-02) 교안 — 관리자 화면 첨삭: 대시보드 정리 + 시스템 이슈 카드

> 지난 기록(2026-08-31 ~ 09-02)은 전부 끝나서 **`study아카이브.md`** 로 옮겼습니다.
> 거기 "여기서 얻은 교훈" 다섯 개는 지금도 유효하니 한 번 훑어 두시면 좋습니다.

---

## 0. 이 교안은 무엇인가

관리자 화면(`http://127.0.0.1:5000/admin.html`)을 두 군데 손봅니다.

| | 지금 | 바꾼 뒤 |
|---|---|---|
| **대시보드** | KPI 박스 5개 + 카드 7장 = 너무 많다 | 카드 5장 |
| **시스템** | 상태 · 캐시 · 수정 이력 | 상태 · **이슈** · **청킹** · **가중치** · 캐시 · 토큰 |

핵심은 **이슈 카드**입니다. DB에 회원 데이터가 덜 실렸을 때
(예: 서술형 답변이 유실됐을 때) 화면이 스스로 알아채고 알려 주는 카드입니다.

### 고칠 파일은 딱 하나입니다

```
frontend/admin.html      ← 이 파일만 고칩니다 (1342줄)
```

관리자 화면은 **일체형 단일 페이지**입니다. HTML·CSS·JavaScript가 한 파일에 다 들어 있어요.
서버 코드(`routers/`, `services/`)는 **건드리지 않습니다.**

### 시작하기 전에 — 3분 준비

**① 지금 파일을 백업해 두세요.** 뭔가 꼬이면 되돌릴 수 있습니다.

```bash
cp frontend/admin.html frontend/admin.html.bak
```

**② 서버를 띄웁니다.**

```bash
py -m uvicorn main:app --reload --port 5000
```

> `--reload`는 **이 저장소의 파일만** 감시합니다. `admin.html`은 정적 파일이라
> 저장하고 브라우저에서 **새로고침(Ctrl+Shift+R)** 하면 바로 반영됩니다.
> 서버를 다시 띄울 필요 없습니다.

**③ 문법 검사하는 법을 알아 두세요.** 중괄호 하나 빠뜨리면 화면이 통째로 안 뜹니다.

```bash
# admin.html 안의 <script> 만 뽑아서 검사합니다
py -c "import io,re,subprocess,os; s=io.open('frontend/admin.html',encoding='utf-8').read(); m=re.findall(r'<script>(.*?)</script>',s,re.S); o=os.path.join(os.environ['TEMP'],'chk.js'); io.open(o,'w',encoding='utf-8').write('\n'.join(m)); r=subprocess.run(['node','--check',o],capture_output=True,text=True); print('OK' if r.returncode==0 else r.stderr)"
```

`OK`가 나오면 문법은 통과입니다. **한 단계 고칠 때마다 돌려 보세요.**

### 이 교안을 읽는 법

- 각 단계는 **왜 → 원본 → 수정 → 확인** 순서입니다.
- 줄 번호를 적어 두긴 했지만, **한 번 고칠 때마다 줄 번호가 밀립니다.**
  그러니 줄 번호보다 **`Ctrl+F`로 코드를 찾는 쪽**을 쓰세요. 찾을 문구를 같이 적어 뒀습니다.
- 순서대로 하시는 걸 권합니다. 뒤 단계가 앞 단계 결과를 전제로 합니다.

---

## 1. 먼저 알아 둘 것 — `admin.html`은 어떻게 생겼나

고치기 전에 이 파일의 지도를 그려 봅시다. 대략 이렇게 나뉩니다.

```
1 ~ 400줄쯤     <style>   — 화면 꾸미기(CSS)
400 ~ 480줄쯤   <body>    — 화면 뼈대(HTML)
480 ~ 1342줄    <script>  — 동작(JavaScript)
```

### 1-1. 화면은 "글자로 HTML을 만들어 밀어 넣는" 방식입니다

이 파일에는 React 같은 프레임워크가 없습니다. 대신 이렇게 합니다.

```js
$('#dash').innerHTML = `<div class="card">안녕</div>`;
```

`$('#dash')`는 `id="dash"`인 상자를 찾는다는 뜻이고,
`.innerHTML = ...`는 **그 상자 안을 이 HTML로 통째로 갈아 끼운다**는 뜻입니다.

> **`` ` ``(백틱)이 뭔가요?**
> 작은따옴표 `'` 대신 쓰는 문자열 기호입니다. 백틱 안에서는 두 가지가 됩니다.
> ① 줄바꿈을 그대로 쓸 수 있고 ② **`${ }` 안에 값을 끼워 넣을 수 있습니다.**
>
> ```js
> const 이름 = '지혜';
> console.log(`안녕 ${이름}님`);   // → 안녕 지혜님
> ```
> 이걸 **템플릿 리터럴**이라고 부릅니다. 이 파일 전체가 이걸로 화면을 만듭니다.

### 1-2. 카드와 차트를 만드는 도우미 함수 4개

이미 만들어져 있어서 **가져다 쓰기만 하면 됩니다.**

| 함수 | 무엇을 만드나 | 예 |
|---|---|---|
| `card(제목, 내용, 힌트, 클래스)` | 흰 상자 한 장 | `card('성별', donut(...))` |
| `bars(자료)` | 가로 막대그래프 | 희망 조건 평균 |
| `cols(자료)` | 세로 막대그래프 | 연령대 |
| `donut(자료)` | 도넛 그래프 | 성별 |

`자료`는 항상 **`[{ label: '녹지', value: 3.53 }, ...]` 모양의 배열**입니다.
서버(`/api/admin/summary`)가 이 모양으로 보내 줍니다.

`card()`의 네 번째 인자에 `'wide'`를 주면 **카드가 화면 폭 전체**를 씁니다.

### 1-3. 서버가 주는 자료 — `/summary`

대시보드와 시스템 화면은 둘 다 이 한 덩어리를 씁니다. 모양을 알아 두면 나머지가 쉽습니다.

```js
{
  ok: true,
  counts: {
    members: 105,     // 회원 수
    regions: 427,     // 행정동 수
    gu: 25,           // 자치구 수
    chunks: 900,      // 페르소나 청크(=벡터로 만든 글 조각) 개수
    edits: 1          // 관리자 수정 횟수
  },
  charts: {
    joins:    [{label:'2024-01', value:3}, ...],   // 월별 가입
    ages:     [{label:'20대',   value:29}, ...],   // 연령대
    genders:  [{label:'여성',   value:50}, ...],   // 성별
    weights:  [{label:'녹지',   value:3.53}, ...], // 희망 조건 7개
    memberGu: [{label:'광진구', value:9}, ...],    // 회원이 사는 자치구
    dealType: [{label:'전세',   value:52}, ...],   // 희망 거래형태
    persona:  [{label:'professional_persona', value:156}, ...]  // 칸별 평균 글자 수
  },
  recent: [ ...관리자 수정 이력 8건... ]
}
```

> **중요 — 차트는 "값이 있는 회원"만 셉니다.**
> 예를 들어 `ages`는 서버에서 `WHERE age IS NOT NULL`로 뽑습니다.
> 그래서 **`ages`의 합계가 `members`보다 작으면, 그 차이가 곧 "나이가 빈 회원 수"**입니다.
> 3장에서 이 성질을 그대로 써서 데이터 유실을 잡아냅니다.

---

## 2. 대시보드 정리

### 2-0. 무엇을 왜 지우나

| 지울 것 | 이유 |
|---|---|
| KPI **행정동 427개** | 화면 맨 위 상태 알약에 **같은 숫자가 이미** 있습니다. 게다가 서울 행정동 전체라 회원이 늘어도 안 변하는 상수예요 |
| KPI **관리자 수정 N건** | 바로 아래 "최근 수정" 카드가 누가 뭘 고쳤는지까지 보여줍니다 |
| KPI **페르소나 청크 900개** | 운영 점검용 숫자라 **시스템 화면**이 제자리입니다 (3장에서 옮깁니다) |
| KPI **평균 희망 가중치** | 7개 평균의 평균이라 정보가 거의 없습니다. 아래 막대그래프가 각 값을 다 보여줘요 |
| **월별 가입 추이** | 100명 남짓한 자료로는 월 3~9명 진동만 보입니다. 추세가 아니라 잡음인데 화면 폭 전체를 먹습니다 |
| **최근 수정** 카드 | 시스템 화면의 수정 이력과 겹칩니다 (3장에서 이슈 카드로 합칩니다) |

**숫자를 없애는 게 아니라 자리를 옮기는 것**이 핵심입니다.
회원 수는 제목 줄로, 7지표 평균은 카드 힌트로 갑니다.

---

### 2-1. KPI 박스 줄 없애기 ①  — CSS 지우기

**왜 CSS부터?** 화면에서 안 쓸 상자의 꾸밈은 남겨 둬 봐야 헷갈리기만 합니다.

`Ctrl+F`로 **`.kpis {`** 를 찾으세요. 207번째 줄 근처입니다.

```css
/* ── 원본 (206~212번째 줄) ── */
/* ══ 대시보드 ═══════════════════════════════════════════════ */
.kpis { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); margin-bottom: 16px; }
.kpi { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 15px 17px; box-shadow: var(--shadow); }
.kpi .k-lab { font-size: 12px; color: var(--muted); margin-bottom: 6px; }
.kpi .k-val { font-size: 27px; font-weight: 680; letter-spacing: -.02em; line-height: 1.15; }
.kpi .k-val small { font-size: 13px; font-weight: 500; color: var(--muted); margin-left: 3px; }
.kpi .k-sub { font-size: 11.5px; color: var(--muted); margin-top: 4px; }
```

```css
/* ── 수정 ── */
/* ══ 대시보드 ═══════════════════════════════════════════════ */
/* 규모(회원 수)는 박스가 아니라 제목 줄에 적는다 — 숫자 하나에 카드 한 장은 과하다 */
#dash-sub b { color: var(--ink); font-weight: 650; font-variant-numeric: tabular-nums; }
```

`.kpi`로 시작하는 6줄을 지우고, 그 자리에 `#dash-sub b` 한 줄을 넣습니다.

> **`#dash-sub b`가 무슨 뜻인가요?**
> `#dash-sub`는 `id="dash-sub"`인 요소, 그 뒤의 `b`는 **그 안에 있는 `<b>` 태그**를 뜻합니다.
> 곧 제목 줄에 `회원 <b>105</b>명`을 넣을 건데, 그 `105`만 진하게 만드는 규칙입니다.
>
> `font-variant-numeric: tabular-nums`는 **숫자 폭을 고정**하는 옵션입니다.
> 이게 없으면 `1`과 `8`의 폭이 달라서, 숫자가 바뀔 때 글자가 들썩입니다.

---

### 2-2. KPI 박스 줄 없애기 ② — HTML에서 자리 지우기

`Ctrl+F`로 **`class="kpis"`** 를 찾으세요. 434번째 줄입니다.

```html
<!-- ── 원본 (433~434번째 줄) ── -->
        <div class="kpis" id="kpis"></div>
        <div class="dash" id="dash"></div>
```

```html
<!-- ── 수정 ── -->
        <div class="dash" id="dash"></div>
```

`kpis` 줄 **하나만** 지웁니다. `dash` 줄은 그대로 두세요 — 카드들이 들어갈 자리입니다.

---

### 2-3. KPI 박스 줄 없애기 ③ — JavaScript 고치기

`Ctrl+F`로 **`async function loadDashboard`** 를 찾으세요. 725번째 줄입니다.
이 함수가 대시보드 전체를 그립니다. **여기가 이번 작업의 중심**이라 통째로 보여 드립니다.

```js
/* ── 원본 (725~766번째 줄) ── */
async function loadDashboard() {
  $('#dash').innerHTML = '<div class="skel">불러오는 중…</div>';
  let d;
  try { d = await api('/summary'); }
  catch (e) { $('#dash').innerHTML = '<div class="card">집계를 불러오지 못했습니다.</div>'; return; }

  loaded.dash = true;
  paintStatus(d);
  $('#dash-sub').textContent = new Date().toLocaleString('ko-KR') + ' 기준';

  if (!d.ok) {
    $('#kpis').innerHTML = '';
    $('#dash').innerHTML = `<div class="card wide">DB 를 읽지 못했습니다 — ${esc(d.error || '원인 불명')}</div>`;
    return;
  }

  const c = d.counts, ch = d.charts;
  const avgWeight = ch.weights.length
    ? (ch.weights.reduce((s, w) => s + w.value, 0) / ch.weights.length).toFixed(2) : '-';

  $('#kpis').innerHTML = [
    kpi('회원', c.members, '명', '가입 기록이 있는 계정'),
    kpi('행정동', c.regions, '개', `서울 ${c.gu}개 자치구`),
    kpi('페르소나 청크', c.chunks, '개', `회원당 ${(c.chunks / (c.members || 1)).toFixed(1)}칸`),
    kpi('평균 희망 가중치', avgWeight, '/5', '7개 지표 평균'),
    kpi('관리자 수정', c.edits, '건', d.recent[0] ? when(d.recent[0].changed_at) + ' 최근' : '아직 없음'),
  ].join('');

  const top10 = ch.memberGu.slice(0, 10);
  $('#dash').innerHTML = `
    ${card('월별 가입 추이', area(ch.joins), '가입일이 있는 회원만 센다', 'wide')}
    ${card('희망 조건 평균 <span class="hint">1~5</span>', bars(ch.weights, { max: 5, fmt: v => v.toFixed(2) }),
           '회원들이 무엇을 더 중요하게 꼽았는지')}
    ${card('연령대', cols(ch.ages), '10살 단위')}
    ${card('성별', donut(ch.genders))}
    ${card('희망 거래형태', donut(ch.dealType))}
    ${card('회원이 사는 자치구 <span class="hint">상위 10</span>', bars(top10, { color: 'var(--s3)' }),
           `25개 구 중 ${ch.memberGu.length}개 구에 회원이 있다`)}
    ${card('최근 수정', logList(d.recent), '무엇을 고쳤는지 칸 이름까지 남는다')}
  `;
  wireArea($('#dash'), ch.joins);
}
```

```js
/* ── 수정 ── */
async function loadDashboard() {
  $('#dash').innerHTML = '<div class="skel">불러오는 중…</div>';
  let d;
  try { d = await api('/summary'); }
  catch (e) { $('#dash').innerHTML = '<div class="card">집계를 불러오지 못했습니다.</div>'; return; }

  loaded.dash = true;
  paintStatus(d);
  const stamp = new Date().toLocaleString('ko-KR') + ' 기준';

  if (!d.ok) {
    $('#dash-sub').textContent = stamp;
    $('#dash').innerHTML = `<div class="card wide">DB 를 읽지 못했습니다 — ${esc(d.error || '원인 불명')}</div>`;
    return;
  }

  const c = d.counts, ch = d.charts;
  const avgWeight = ch.weights.length
    ? (ch.weights.reduce((s, w) => s + w.value, 0) / ch.weights.length).toFixed(2) : '-';

  /* 규모는 카드가 아니라 제목 줄에 적는다 — 행정동 수와 캐시 상태는 상단 알약이 이미 들고 있다 */
  $('#dash-sub').innerHTML = `회원 <b>${num(c.members)}</b>명 · ${esc(stamp)}`;

  /* 성별이 빈 회원(로그인만 발급된 계정)은 라벨이 없다.
     서버가 str(None) 으로 바꿔 보내는 탓에 빈 값이 문자열 'None' 으로 온다 —
     숨기지 않고 이름을 붙인다. 숨기면 합계가 왜 안 맞는지 알 수 없어진다 */
  const isEmptyLabel = v => !v || v === 'None' || v === 'null';
  const genders = ch.genders.map(g => ({
    ...g, label: isEmptyLabel(g.label) ? '미입력' : g.label,
  }));

  const top10 = ch.memberGu.slice(0, 10);
  $('#dash').innerHTML = `
    ${card('희망 조건 평균 <span class="hint">1~5</span>', bars(ch.weights, { max: 5, fmt: v => v.toFixed(2) }),
           `회원들이 무엇을 더 중요하게 꼽았는지 · 7개 지표 평균 ${avgWeight}`)}
    ${card('연령대', cols(ch.ages), '10살 단위')}
    ${card('성별', donut(genders))}
    ${card('희망 거래형태', donut(ch.dealType))}
    ${card('회원이 사는 자치구 <span class="hint">상위 10</span>', bars(top10, { color: 'var(--s3)' }),
           `25개 구 중 ${ch.memberGu.length}개 구에 회원이 있다`, 'wide')}
  `;
}
```

**무엇이 달라졌는지 하나씩**

**① 시각 문구를 변수로 뺐습니다**

```js
$('#dash-sub').textContent = new Date().toLocaleString('ko-KR') + ' 기준';   // 원본
const stamp = new Date().toLocaleString('ko-KR') + ' 기준';                  // 수정
```

원본은 시각을 **바로 화면에 찍었습니다.** 그런데 이제 `회원 105명 · (시각)`처럼
회원 수와 같이 찍어야 하는데, 회원 수는 **아래에서 `d.counts`를 읽어야 알 수 있습니다.**
그래서 일단 `stamp`에 담아 두고, 회원 수를 안 뒤에 합쳐서 찍습니다.

DB를 못 읽은 경우(`if (!d.ok)`)에는 회원 수가 없으니 시각만 찍습니다.

**② `$('#kpis')` 두 곳을 없앴습니다**

`kpis` 상자를 2-2에서 지웠으니 `$('#kpis')`는 이제 **아무것도 못 찾습니다(`null`).**
`null.innerHTML = ...`은 **오류**라 대시보드가 통째로 안 그려집니다.
그래서 반드시 같이 지워야 합니다.

**③ 제목 줄에 회원 수를 넣었습니다**

```js
$('#dash-sub').innerHTML = `회원 <b>${num(c.members)}</b>명 · ${esc(stamp)}`;
```

- `textContent` → `innerHTML`로 바꿨습니다. `<b>` 태그를 **태그로** 해석시키려는 것입니다.
  `textContent`는 `<b>`를 글자 그대로 보여줍니다.
- `num()`은 이 파일에 있는 도우미로, `1234` → `1,234`처럼 쉼표를 넣어 줍니다.
- `esc()`는 `<`, `>`, `&` 같은 글자를 안전하게 바꿔 줍니다.
  **`innerHTML`에 값을 끼워 넣을 때는 습관적으로 `esc()`를 씌우세요.**

**④ 성별 도넛의 빈 라벨을 "미입력"으로** ← 여기 함정이 있습니다

로그인 기능이 만든 계정들은 성별이 비어 있습니다. 그래서 범례에 이런 항목이 하나 생깁니다.

```
● None      5    5%
● 여성     50   48%
● 남성     50   48%
```

**왜 `None`이라는 글자가 나오나** — 엔진이 차트 자료를 만들 때 값을 문자열로 바꿉니다.

```python
# Life-Embed-jh/app/features/admin.py — _pairs() 243번째 줄
return [{"label": str(a), "value": b} for a, b in cur.fetchall()]
```

파이썬에서 `str(None)`은 **빈 값이 아니라 `'None'`이라는 다섯 글자 문자열**입니다.
그래서 화면에는 `label: "None"`이 도착합니다.

여기서 초보가 반드시 한 번 데는 지점 —

```js
const genders = ch.genders.map(g => ({ ...g, label: g.label || '미입력' }));   // ❌ 안 먹습니다
```

`||`는 **왼쪽이 "거짓 같은 값"일 때만** 오른쪽을 씁니다.
JavaScript에서 거짓 같은 값은 `''`, `null`, `undefined`, `0`, `false` 다섯뿐이고,
**`'None'`은 글자가 들어 있는 멀쩡한 문자열이라 참**입니다. 그래서 그대로 통과합니다.

```js
Boolean('')       // false  → 바뀜
Boolean(null)     // false  → 바뀜
Boolean('None')   // true   → 안 바뀜  ← 이것 때문
```

**고친 코드**

```js
  const isEmptyLabel = v => !v || v === 'None' || v === 'null';
  const genders = ch.genders.map(g => ({
    ...g, label: isEmptyLabel(g.label) ? '미입력' : g.label,
  }));
```

- `isEmptyLabel`은 "이 라벨은 사실상 빈 값인가?"를 판단하는 작은 함수입니다.
  `!v`가 진짜 빈 값들을, `=== 'None'`이 파이썬이 남긴 글자를 잡습니다.
  (`'null'`은 다른 칸에서 같은 일이 생길 때를 대비한 것입니다.)
- `.map(...)`은 배열의 **각 항목을 하나씩 바꿔 새 배열을 만드는** 함수입니다.
- `{ ...g, label: ... }`에서 `...g`는 **원래 항목을 그대로 복사**하라는 뜻이고,
  뒤에 쓴 `label`이 그중 라벨만 덮어씁니다. (원본 `ch.genders`는 안 건드립니다.)

> **왜 엔진을 안 고치고 화면에서 막나요?**
> `_pairs()`의 `str()`을 고치는 게 근본이지만, 그 함수는 연령대·자치구·거래형태 등
> **차트 7종이 전부** 쓰고 있어서 영향 범위가 넓고 **엔진 저장소에 커밋**이 필요합니다.
> 지금은 성별에서만 문제가 되니 화면에서 막고, 근본 수정은 5-3에 적어 뒀습니다.

**⑤ 카드 두 장을 지우고, 자치구를 전폭으로**

- `월별 가입 추이` 줄과 `최근 수정` 줄을 통째로 지웠습니다.
- 마지막 `wireArea($('#dash'), ch.joins);` 도 지웠습니다 — 가입 추이 그래프에
  마우스 툴팁을 붙이는 코드인데, 그래프가 없어졌으니 부를 이유가 없습니다.
  (남겨 두면 못 찾고 조용히 지나가긴 하지만, 죽은 코드입니다.)
- 자치구 카드에 네 번째 인자 `'wide'`를 붙였습니다.
  카드가 5장이 되면서 2열 배치의 마지막 줄이 반쪽으로 비기 때문입니다.

**⑥ 힌트에 평균값을 넣었습니다**

```js
'회원들이 무엇을 더 중요하게 꼽았는지'                      // 원본 — 작은따옴표
`회원들이 무엇을 더 중요하게 꼽았는지 · 7개 지표 평균 ${avgWeight}`  // 수정 — 백틱
```

`${avgWeight}`를 끼워 넣어야 해서 **작은따옴표를 백틱으로 바꿔야 합니다.**
작은따옴표 안에서는 `${ }`가 글자 그대로 나옵니다. 자주 하는 실수예요.

---

### 2-4. 안 쓰게 된 코드 걷어내기

이제 아무도 안 부르는 함수가 셋 생겼습니다. 지워야 파일이 깔끔해집니다.

**① `kpi()` 함수** — `Ctrl+F`로 **`function kpi(label`**

```js
/* ── 지울 것 (768~774번째 줄) ── */
function kpi(label, value, unit, sub) {
  return `<div class="kpi">
    <div class="k-lab">${label}</div>
    <div class="k-val">${typeof value === 'number' ? num(value) : esc(value)}<small>${unit}</small></div>
    <div class="k-sub">${esc(sub)}</div>
  </div>`;
}
```

**② `area()`와 `wireArea()`** — `Ctrl+F`로 **`/* 면적 차트 —`**

599번째 줄의 주석 `/* 면적 차트 — 점마다 값을...`부터
`function wireArea(...)`가 끝나는 `}`까지, **약 80줄을 통째로** 지웁니다.
바로 다음 줄이 `/* ═══...  3. 화면 전환` 주석이니 거기까지가 경계입니다.

**③ 면적 차트 전용 CSS** — `Ctrl+F`로 **`.area-wrap {`**

```css
/* ── 지울 것 (247~256번째 줄) ── */
.area-wrap { position: relative; }
.area-wrap svg { width: 100%; height: auto; display: block; }
.area-wrap .tip {
  position: absolute; pointer-events: none; transform: translate(-50%, -130%);
  background: var(--ink); color: var(--bg); font-size: 11.5px; font-weight: 550;
  padding: 5px 9px; border-radius: 7px; white-space: nowrap;
}
.g-line { stroke: var(--grid); stroke-width: 1; }
.g-axis { stroke: var(--axis); stroke-width: 1; }
.g-txt  { fill: var(--muted); font-size: 11px; }
```

> **`--grid`, `--axis` 변수는 지우지 마세요.** 파일 맨 위 `:root`에 있는데,
> 나중에 가입 추이 그래프를 되살릴 때 다시 씁니다. 안 쓰는 CSS 변수는 화면에
> 아무 영향이 없어서 남겨 둬도 손해가 없습니다.

> **지운 코드가 아까우면** — 걱정 마세요. `git`이 다 기억하고 있습니다.
> `git diff frontend/admin.html`로 언제든 볼 수 있고, `git checkout -- frontend/admin.html`로
> 통째로 되돌릴 수도 있습니다.

---

### 2-5. 여기까지 확인

1. 0장의 **문법 검사**를 돌려 `OK`가 나오는지 봅니다.
2. 브라우저에서 **Ctrl+Shift+R**로 새로고침합니다.
3. 이렇게 보이면 성공입니다.

```
한눈에 보기  회원 105명 · 2026. 9. 3. 오전 1:20 기준           [새로고침]

┌─ 희망 조건 평균  1~5 ─┐  ┌─ 연령대 ─┐
│  회원들이 무엇을 …    │  │          │
│  · 7개 지표 평균 2.80 │  │          │
└──────────────────┘  └──────────┘
┌─ 성별 ─────────────┐  ┌─ 희망 거래형태 ─┐
│  여성 50 / 남성 50   │  │                │
│  미입력 5           │  │                │
└──────────────────┘  └────────────────┘
┌────── 회원이 사는 자치구  상위 10 ──────┐
└────────────────────────────────────┘
```

**화면이 하얗게 비면** — `F12`를 눌러 개발자 도구의 **Console** 탭을 보세요.
빨간 오류 줄에 파일명과 줄 번호가 찍힙니다. 대개 이 셋 중 하나입니다.

| 오류 메시지 | 원인 |
|---|---|
| `Cannot set properties of null` | `$('#kpis')`가 남아 있습니다 (2-3의 ②) |
| `area is not defined` | `area(ch.joins)` 호출이 남아 있습니다 |
| `Unexpected token` | 중괄호나 백틱 짝이 안 맞습니다 |

---

## 3. 시스템 화면 — 이슈 · 청킹 · 가중치

### 3-0. 무엇을 만드나

시스템 화면은 지금 **상태 · 캐시 · 수정 이력** 셋뿐입니다. 여기에 세 가지를 더합니다.

1. **이슈 카드** — DB에 데이터가 덜 실렸는지 화면이 스스로 판단해서 알려 줍니다.
   기존 "수정 이력"은 이 카드 **안으로** 들어갑니다.
2. **청킹 카드** — 페르소나 글이 벡터로 얼마나 만들어졌나.
3. **가중치 카드** — 추천 점수에 쓰이는 7지표가 제대로 실렸나.

> **왜 대시보드가 아니라 시스템인가?**
> **대시보드는 "우리 회원이 어떤 사람들인가"를 보는 화면**이고,
> **시스템은 "데이터가 제대로 실렸나"를 보는 화면**입니다.
> 청크 수나 가중치 평균은 회원의 성향이 아니라 적재 상태라서 시스템 쪽이 맞습니다.

### 3-1. 지금 실제로 잡히는 문제가 있습니다

> **이 숫자는 계속 늘어납니다.** 로그인 화면에서 새 아이디를 넣을 때마다 계정이 하나씩
> 발급되기 때문입니다(2026-09-03 기준 5개). 교안의 숫자와 화면의 숫자가 다르면
> **화면 쪽이 맞습니다.**

머지 이후 DB가 이렇습니다.

```
회원 105명 · member_chunk 900개 (회원당 8.6칸, 정상은 9칸)
user_preferences 100행 · 나이 있는 회원 100명 · 성별 [없음×5, 여×50, 남×50]
```

`C101` 이후 — **로그인 기능이 발급한 계정 5개**가
이름·나이·성별·거주지·선호도·페르소나가 **전부 비어 있는 채로** 들어와 있습니다.

이슈 카드를 다 만들면 이 상황을 이렇게 잡아냅니다.

```
┌─ 이슈  1건 ────────────────────────────────────────┐
│ [주의] 가입이 덜 끝난 회원 5명                        │
│        기본정보 · 선호도 · 페르소나가 모두 비어 있습니다.  │
│        로그인만 발급되고 설문을 안 마친 계정이면 정상입니다 │
└───────────────────────────────────────────────────┘
```

---

### 3-2. 작은 지표 상자 만들기 — CSS

`Ctrl+F`로 **`.logs { display: grid`** 를 찾으세요(354번째 줄).
**그 줄 바로 위에** 아래를 통째로 붙여 넣습니다.

```css
/* 작은 지표 상자 — 시스템 화면에서 "얼마나 실려 있나"를 숫자로 짚어 준다 */
.facts { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(132px, 1fr)); margin-bottom: 14px; }
.fact { background: var(--surface-2); border-radius: 10px; padding: 10px 12px; }
.fact .f-lab { font-size: 11.5px; color: var(--muted); margin-bottom: 4px; }
.fact .f-val { font-size: 17px; font-weight: 650; letter-spacing: -.01em; font-variant-numeric: tabular-nums; }
.fact .f-val small { font-size: 12px; font-weight: 500; color: var(--muted); margin-left: 2px; }
.fact .f-sub { font-size: 11px; color: var(--muted); margin-top: 3px; }
.fact.bad  .f-val { color: var(--bad); }
.fact.warn .f-val { color: var(--warn); }

.tag.bad  { background: color-mix(in srgb, var(--bad) 15%, transparent);  color: var(--bad); }
.tag.warn { background: color-mix(in srgb, var(--warn) 18%, transparent); color: var(--warn); }
.log.issue { align-items: flex-start; }
.log.issue b { flex: none; }
.ok-note { font-size: 13px; color: var(--ink-2); line-height: 1.7; }
```

> **`repeat(auto-fit, minmax(132px, 1fr))`이 뭔가요?**
> "상자를 최소 132px 폭으로 두되, 자리가 남으면 늘리고, 좁아지면 알아서 줄바꿈해라"입니다.
> 상자를 4개 넣든 5개 넣든 **레이아웃을 다시 안 짜도 됩니다.**
>
> **`var(--bad)`는?** 파일 맨 위 `:root`에 정해 둔 색 이름입니다.
> 라이트/다크 테마마다 값이 따로 있어서, 이렇게 쓰면 **테마를 자동으로 따라갑니다.**
> 색을 `#d03b3b`처럼 직접 쓰면 다크 모드에서 눈이 아픕니다.
>
> **`color-mix(in srgb, var(--bad) 15%, transparent)`는?**
> "빨강을 15%만 섞고 나머지는 투명" = **아주 연한 빨강 배경**입니다.
> 색을 따로 정의하지 않고 이미 있는 색에서 만들어 쓰는 방법이에요.

---

### 3-3. 도우미 함수 3개 만들기

`Ctrl+F`로 **`async function loadSystem`** 을 찾으세요(1247번째 줄).
**그 줄 바로 위에** 아래를 통째로 붙여 넣습니다. 길지만 하나씩 설명하겠습니다.

```js
/* 엔진 config.py 와 맞춰 둔 상수 — 여기 숫자를 고치기 전에 그쪽부터 확인한다 */
const CHUNK_SLOTS    = 9;   /* CHUNK_COLUMNS 칸 수 */
const CHUNK_MIN_LEN  = 20;  /* MIN_LENGTH — 이보다 짧은 글은 청킹에서 통째로 버려진다 */
const CHUNK_WARN_LEN = 60;  /* 기존 900청크의 실측 최소가 55자 — 평균이 이 밑이면 눈에 띄게 짧다 */

/* 차트 한 장에 담긴 사람 수를 센다.
   /summary 의 차트는 값이 없는 회원을 빼고 만들어지므로,
   합계가 회원 수보다 적으면 그만큼 그 칸이 빈 회원이 있다는 뜻이다 */
const sumOf = list => (list || []).reduce((total, item) => total + item.value, 0);

/* DB 특이사항 점검 — /ready · /summary 가 이미 주는 숫자만 보고 판단한다.
   서버에 이슈 표가 없어 "지금 보이는 것"만 나온다 — 사람이 직접 적어 넣거나
   해결 표시를 하려면 엔진 쪽에 표가 하나 필요하다 */
function findIssues(s, sum) {
  const out = [];
  const add = (level, title, detail) => out.push({ level, title, detail });

  if (!s.ok)   add('bad', 'DB 연결', s.error || '원인 불명');
  if (!sum.ok) return out;

  const c = sum.counts, ch = sum.charts;
  const members = c.members || 0;
  if (!members) return out;

  /* 세 방향에서 "비어 있는 회원 수"를 센다 */
  const noProfile = members - sumOf(ch.ages);            /* 나이가 빈 회원 */
  const noPrefs   = members - sumOf(ch.dealType);        /* 선호도 행이 없는 회원 */
  const gap       = members * CHUNK_SLOTS - c.chunks;    /* 비어 있는 페르소나 칸 */
  const asMembers = gap / CHUNK_SLOTS;                   /* 그 칸을 사람 수로 환산 */

  /* 셋이 딱 맞으면 같은 계정들이다 — 세 번 말할 이유가 없다 */
  if (noProfile > 0 && noProfile === noPrefs && asMembers === noProfile) {
    add('warn', `가입이 덜 끝난 회원 ${noProfile}명`,
      '기본정보 · 선호도 · 페르소나가 모두 비어 있습니다. '
      + '로그인만 발급되고 설문을 안 마친 계정이면 정상입니다');
  } else {
    /* 숫자가 어긋나면 "일부만 실리다 말았다"는 뜻이다 — 이게 진짜 유실 신호다 */
    if (gap > 0) {
      const empty = Object.keys(PERSONA_LABELS)
        .filter(k => !ch.persona.some(x => x.label === k))
        .map(k => PERSONA_LABELS[k]);
      add('bad', '페르소나 칸 유실',
        `회원당 ${(c.chunks / members).toFixed(1)}칸 · `
        + `${num(gap)}칸(회원 ${asMembers.toFixed(1)}명분)이 비었습니다`
        + (empty.length ? ` — 한 명도 없는 칸: ${empty.join(', ')}` : '')
        + '. 빈 칸은 벡터가 안 만들어져 이웃 찾기에서 빠집니다');
    }
    if (noProfile > 0) {
      add('warn', '기본정보 결측',
        `나이가 빈 회원 ${noProfile}명 — 연령대 차트에서 빠집니다`);
    }
    if (noPrefs > 0) {
      add('bad', '선호도 미적재',
        `user_preferences 행이 없는 회원 ${noPrefs}명 — 추천 가중치가 없습니다`);
    }
  }

  /* 짧은 칸 — MIN_LENGTH 미만은 저장도 안 되므로,
     평균이 낮다는 건 간신히 통과한 글이 많다는 뜻이다 */
  const shorts = ch.persona.filter(x => x.value < CHUNK_WARN_LEN);
  if (shorts.length) {
    add('warn', '짧은 페르소나 칸',
      shorts.map(x => `${PERSONA_LABELS[x.label] || x.label} ${x.value}자`).join(' · ')
      + ` — 짧을수록 엉뚱한 이웃이 뽑힌다 (${CHUNK_MIN_LEN}자 미만은 아예 버려짐)`);
  }

  /* 가중치 미적재 — 0 이면 그 지표는 추천 점수에 전혀 안 실린다 */
  const zeros = ch.weights.filter(w => !w.value).map(w => w.label);
  if (zeros.length) {
    add('bad', '가중치 비어 있음',
      `${zeros.join(', ')} — user_preferences 적재를 확인하세요`);
  }

  return out;
}

function issueList(list, okNote) {
  if (!list.length) return `<div class="ok-note">${esc(okNote)}</div>`;
  return '<div class="logs">' + list.map(i => `
    <div class="log issue ${i.level}">
      <span class="tag ${i.level}">${i.level === 'bad' ? '심각' : '주의'}</span>
      <b>${esc(i.title)}</b>
      <span class="l-fields">${esc(i.detail)}</span>
    </div>`).join('') + '</div>';
}

/* value 만 날 HTML 을 받는다 — 단위를 <small> 로 작게 붙이려는 것이다 */
function fact(label, value, sub = '', level = '') {
  return `<div class="fact ${level}">
    <div class="f-lab">${esc(label)}</div>
    <div class="f-val">${value}</div>
    ${sub ? `<div class="f-sub">${esc(sub)}</div>` : ''}
  </div>`;
}
```

**한 조각씩 뜯어봅시다**

**① 상수 3개를 왜 맨 위에 뒀나**

`CHUNK_SLOTS = 9`는 엔진의 `app/core/config.py`에 있는 `CHUNK_COLUMNS` 칸 수를 **베낀 값**입니다.
`9`라는 숫자를 코드 여기저기에 흩어 놓으면, 나중에 칸이 10개로 늘었을 때
**고쳐야 할 곳을 하나 빠뜨립니다.** 이름을 붙여 한 군데 모아 두는 이유예요.

> 이런 걸 **매직 넘버를 없앤다**고 합니다. 초보 때 가장 빨리 효과를 보는 습관입니다.
> 대신 **엔진 값과 어긋나면 조용히 틀리므로**, 주석에 출처를 꼭 적어 두세요.

**② `sumOf` — 화살표 함수**

```js
const sumOf = list => (list || []).reduce((total, item) => total + item.value, 0);
```

이건 아래와 같은 뜻입니다.

```js
function sumOf(list) {
  if (!list) list = [];
  let total = 0;
  for (const item of list) total = total + item.value;
  return total;
}
```

- `list => ...`는 **화살표 함수**로, `function`을 짧게 쓴 것입니다.
- `.reduce(...)`는 배열을 **하나의 값으로 접는** 함수입니다.
  첫 인자가 "어떻게 합칠지", 두 번째 `0`이 "시작값"입니다.
- `(list || [])`는 "`list`가 없으면 빈 배열로 쳐라" — 서버가 그 차트를 안 보낼 때
  오류가 나지 않게 막는 안전장치입니다.

**③ `add`를 왜 따로 만들었나**

```js
const add = (level, title, detail) => out.push({ level, title, detail });
```

이슈를 넣는 코드가 6번 나오는데, 매번 `out.push({ level: 'bad', title: ..., ... })`라고
쓰면 길고 실수하기 쉽습니다. 짧은 이름을 하나 만들어 두면 읽기도 쉬워집니다.

> `{ level, title, detail }`은 `{ level: level, title: title, detail: detail }`의 줄임입니다.
> 이름이 같으면 한 번만 써도 됩니다.

**④ 핵심 — 세 숫자를 비교하는 이유**

```js
const noProfile = members - sumOf(ch.ages);
const noPrefs   = members - sumOf(ch.dealType);
const gap       = members * CHUNK_SLOTS - c.chunks;
```

지금 값을 넣어 보면:

| | 계산 | 값 |
|---|---|---|
| `noProfile` | `105 - 100` | **5** |
| `noPrefs` | `105 - 100` | **5** |
| `gap` | `105 × 9 - 900` | **45칸** |
| `asMembers` | `45 ÷ 9` | **5명** |

셋이 전부 5를 가리킵니다 → **같은 계정 5개** 이야기입니다. 그래서 한 줄로 묶습니다.

만약 `noProfile`은 5인데 `asMembers`가 7.5처럼 **어긋나면**, 그건
"어떤 회원은 기본정보만 있고 페르소나는 반쯤 실렸다"는 뜻이고
**진짜 적재 사고**입니다. 그때는 셋을 따로 띄웁니다.

> **왜 성별(`genders`)이 아니라 나이(`ages`)로 세나요?**
> 서버가 나이는 `WHERE age IS NOT NULL`로 거르지만, 성별은 안 거릅니다.
> 그래서 `genders`의 합은 값이 비어도 105가 나와 버려 셀 수가 없습니다.
> **"거르고 나온 차트"만 이 방법을 쓸 수 있습니다.**

**⑤ `.filter()`와 `.some()`**

```js
const empty = Object.keys(PERSONA_LABELS)
  .filter(k => !ch.persona.some(x => x.label === k))
  .map(k => PERSONA_LABELS[k]);
```

"한 명도 없는 페르소나 칸"의 **한글 이름**을 뽑는 코드입니다.

- `Object.keys(PERSONA_LABELS)` → `['persona', 'professional_persona', ...]` 영문 칸 이름 9개
- `.some(x => x.label === k)` → "차트에 `k`인 항목이 **하나라도 있나**?" (true/false)
- `!` 를 붙여 **없는 것만** 남깁니다
- `.map(k => PERSONA_LABELS[k])` → 영문 이름을 `총괄 요약` 같은 한글로 바꿉니다

**⑥ `issueList` — 이슈가 없을 때도 뭔가 보여준다**

```js
if (!list.length) return `<div class="ok-note">${esc(okNote)}</div>`;
```

이슈가 0건이면 카드를 **빈 채로 두지 않고** "특이사항 없음 …" 문장을 보여줍니다.
빈 카드는 "점검이 안 된 건지, 문제가 없는 건지" 알 수가 없어서 불안합니다.

**⑦ `fact` — 여기만 `esc()`를 안 씌운 곳이 있습니다**

```js
<div class="f-val">${value}</div>          <!-- esc 없음! -->
<div class="f-lab">${esc(label)}</div>     <!-- esc 있음 -->
```

`value`에 `900<small>개</small>`처럼 **태그를 넣어 단위를 작게** 쓰려는 것이라
일부러 `esc()`를 뺐습니다. 그래서 주석에 이유를 적어 뒀습니다.

> **이건 예외이고, 원칙은 "`innerHTML`에 넣는 값은 `esc()`"입니다.**
> 사용자가 입력한 값을 `esc()` 없이 넣으면 화면이 깨지거나 보안 문제가 생깁니다.
> 여기서는 **우리가 직접 만든 문자열만** 들어가서 안전합니다.

---

### 3-4. 시스템 화면 다시 짜기

`loadSystem` 안에서 `pane.innerHTML = \`` 로 시작하는 부분을 고칩니다.
`Ctrl+F`로 **`<span class="sub">상태 · 캐시 · 수정 이력</span>`** 을 찾으면 빠릅니다.

```js
/* ── 원본 (1268~1295번째 줄) ── */
  pane.innerHTML = `
    <div class="pane-head"><h2>시스템</h2>
      <span class="sub">상태 · 캐시 · 수정 이력</span></div>

    ${card('상태', `<div class="logs">${rows}</div>`)}

    ${card('캐시', `
      ... (그대로 둡니다) ...
      <button class="btn" id="cache-clear" ${s.write_enabled ? '' : 'disabled'}>캐시 비우기</button>`)}

    ${sum.ok ? card('페르소나 칸별 평균 길이 <span class="hint">글자</span>',
        bars(sum.charts.persona.map(d => ({ ...d, label: PERSONA_LABELS[d.label] || d.label })),
             { color: 'var(--s3)', labelWidth: '110px' }),
        '짧은 칸이 많으면 엉뚱한 이웃이 뽑힌다') : ''}

    ${card(`수정 이력 <span class="hint">최근 ${logs.length}건</span>`, logList(logs))}

    ${card('토큰', ` ... (그대로 둡니다) ... `)}
  `;
```

```js
/* ── 수정 ── */
  const issues = findIssues(s, sum);
  const okNote = sum.ok
    ? `특이사항 없음 — 회원 ${num(sum.counts.members)}명의 기본정보 · 선호도 · `
      + `페르소나가 모두 실려 있고, 7개 지표도 비지 않았습니다`
    : '집계를 읽지 못해 적재 상태를 점검하지 못했습니다';

  /* 청킹 · 가중치 상자 — 대시보드에서 빼 낸 숫자들의 제자리다.
     "지금 몇 명인가"가 아니라 "제대로 실렸나"를 보는 자리라 시스템 쪽이 맞다 */
  let chunkCard = '', weightCard = '';
  if (sum.ok) {
    const c = sum.counts, ch = sum.charts;
    const per = c.members ? c.chunks / c.members : 0;
    const gap = Math.max(0, c.members * CHUNK_SLOTS - c.chunks);
    const filled = ch.persona.length;
    const shortest = filled ? ch.persona.reduce((x, y) => (x.value <= y.value ? x : y)) : null;

    chunkCard = card('청킹 <span class="hint">페르소나 → 벡터</span>', `
      <div class="facts">
        ${fact('총 청크', num(c.chunks) + '<small>개</small>', `회원 ${num(c.members)}명`)}
        ${fact('회원당', per.toFixed(1) + '<small>칸</small>', `${CHUNK_SLOTS}칸이면 정상`,
               per < CHUNK_SLOTS ? 'bad' : '')}
        ${fact('빈 칸', num(gap) + '<small>칸</small>',
               gap ? `회원 ${(gap / CHUNK_SLOTS).toFixed(1)}명분` : '없다', gap ? 'bad' : '')}
        ${fact('채워진 칸', `${filled}<small>/${CHUNK_SLOTS}</small>`, '한 명도 없는 칸은 제외',
               filled < CHUNK_SLOTS ? 'warn' : '')}
        ${shortest ? fact('가장 짧은 칸', shortest.value + '<small>자</small>',
               PERSONA_LABELS[shortest.label] || shortest.label,
               shortest.value < CHUNK_WARN_LEN ? 'warn' : '') : ''}
      </div>
      ${bars(ch.persona.map(d => ({ ...d, label: PERSONA_LABELS[d.label] || d.label })),
             { color: 'var(--s3)', labelWidth: '110px' })}`,
      `칸별 평균 길이 · ${CHUNK_MIN_LEN}자 미만은 청킹에서 버려진다`);

    const ws = ch.weights;
    const avg = ws.length ? (ws.reduce((t, w) => t + w.value, 0) / ws.length).toFixed(2) : '-';
    const hi = ws.length ? ws.reduce((x, y) => (x.value >= y.value ? x : y)) : null;
    const lo = ws.length ? ws.reduce((x, y) => (x.value <= y.value ? x : y)) : null;
    const noPrefs = Math.max(0, c.members - sumOf(ch.dealType));

    weightCard = card('가중치 <span class="hint">user_preferences 7지표</span>', `
      <div class="facts">
        ${fact('전체 평균', avg + '<small>/5</small>', '회원들이 준 점수')}
        ${hi ? fact('가장 높음', hi.value.toFixed(2), hi.label) : ''}
        ${lo ? fact('가장 낮음', lo.value.toFixed(2), lo.label) : ''}
        ${fact('선호도 없는 회원', num(noPrefs) + '<small>명</small>',
               noPrefs ? '추천 가중치가 없다' : '모두 실려 있다', noPrefs ? 'bad' : '')}
      </div>`,
      '추천 점수에 그대로 곱해지는 값 · 분포는 대시보드에서 본다');
  }

  pane.innerHTML = `
    <div class="pane-head"><h2>시스템</h2>
      <span class="sub">상태 · 이슈 · 적재 · 캐시</span></div>

    ${card('상태', `<div class="logs">${rows}</div>`)}

    ${card(`이슈 <span class="hint">${issues.length ? issues.length + '건' : '없음'}</span>`, `
      ${issueList(issues, okNote)}
      <div class="card-title" style="margin:18px 0 8px">관리자 수정 이력
        <span class="hint">최근 ${logs.length}건</span></div>
      ${logList(logs)}`,
      'DB 특이사항과 손대던 기록을 한자리에 모은다')}

    ${chunkCard}
    ${weightCard}

    ${card('캐시', `
      ... (원본 그대로) ...
      <button class="btn" id="cache-clear" ${s.write_enabled ? '' : 'disabled'}>캐시 비우기</button>`)}

    ${card('토큰', ` ... (원본 그대로) ... `)}
  `;
```

**설명**

**① 카드를 미리 만들어 변수에 담습니다**

```js
let chunkCard = '', weightCard = '';
if (sum.ok) { ... chunkCard = card(...); weightCard = card(...); }
```

`pane.innerHTML = \`...\`` 안에서 `if`를 쓰기가 어렵습니다(백틱 안에서는 `${ }`에
**값**만 넣을 수 있지 `if` 문을 쓸 수 없어요). 그래서 **밖에서 만들어 두고 이름만 끼워 넣습니다.**

`sum.ok`가 아니면 빈 문자열 `''`이 들어가서 **카드가 아예 안 나옵니다.**
빈 문자열은 화면에 아무것도 안 그리니까요.

**② 순서를 바꿨습니다**

`상태 → 이슈 → 청킹 → 가중치 → 캐시 → 토큰`

문제(이슈)를 먼저 보여주고, 그 근거가 되는 상세(청킹·가중치)가 뒤따르고,
손으로 누르는 버튼(캐시·토큰)이 맨 뒤로 갑니다.

**③ `reduce`로 최댓값·최솟값 찾기**

```js
const hi = ws.reduce((x, y) => (x.value >= y.value ? x : y));
```

`.reduce`를 합계가 아니라 **비교**에 쓴 것입니다.
"둘 중 값이 큰 쪽을 남긴다"를 배열 끝까지 반복하면 최댓값이 남습니다.

> `? :`는 **삼항 연산자**입니다. `조건 ? 참일때 : 거짓일때`.
> `if/else`를 한 줄로 쓴 것이고, **값을 만들어 내야 할 때** 씁니다.

**④ 시작값 없는 `reduce`는 빈 배열에서 오류가 납니다**

그래서 앞에 `ws.length ?`를 붙여 **비었으면 아예 안 부르게** 막았습니다.
`filled ? ... : null`도 같은 이유입니다. 초보가 자주 만나는 오류라 기억해 두세요.

---

### 3-5. 여기까지 확인

1. 문법 검사 → `OK`
2. 브라우저 새로고침 → 왼쪽 메뉴에서 **시스템** 클릭
3. 이렇게 보이면 성공입니다.

```
시스템   상태 · 이슈 · 적재 · 캐시

┌─ 상태 ────────────────────────────────┐
│ ● DB 연결        정상                   │
│ ● 행정동         427개                  │
└──────────────────────────────────────┘
┌─ 이슈  1건 ───────────────────────────┐
│ [주의] 가입이 덜 끝난 회원 5명            │
│        기본정보 · 선호도 · 페르소나가 …    │
│                                       │
│ 관리자 수정 이력  최근 1건               │
│ [회원] C001  name, gender, … 외 20칸    │
└──────────────────────────────────────┘
┌─ 청킹  페르소나 → 벡터 ─────────────────┐
│ 총 청크  회원당   빈 칸    채워진 칸  가장 짧은│
│  900개   8.6칸   45칸     9/9       79자   │
│         (빨강)  (빨강)                    │
│ ▁▂▃ 칸별 평균 길이 막대그래프 ▃▂▁          │
└──────────────────────────────────────┘
┌─ 가중치  user_preferences 7지표 ────────┐
│ 전체 평균  가장 높음  가장 낮음  선호도 없는 │
│  2.80/5    3.61     1.65        5명     │
│           상권      교육       (빨강)    │
└──────────────────────────────────────┘
```

---

## 4. 마지막 검증

**① 문법**

```bash
py -c "import io,re,subprocess,os; s=io.open('frontend/admin.html',encoding='utf-8').read(); m=re.findall(r'<script>(.*?)</script>',s,re.S); o=os.path.join(os.environ['TEMP'],'chk.js'); io.open(o,'w',encoding='utf-8').write('\n'.join(m)); r=subprocess.run(['node','--check',o],capture_output=True,text=True); print('OK' if r.returncode==0 else r.stderr)"
```

**② 지운 이름이 남아 있지 않은지**

```bash
grep -n "kpi\|area(\|wireArea\|joins" frontend/admin.html
```

**아무것도 안 나와야 합니다.** 뭔가 나오면 그 줄이 지우다 만 자리입니다.

**③ 화면 네 곳을 직접 눌러 보기**

| 볼 것 | 기대 |
|---|---|
| 대시보드 | 카드 5장, 제목 줄에 `회원 105명`, 성별에 `미입력 5` |
| 시스템 | 이슈 1건 + 청킹/가중치 카드 |
| 회원 | 목록·상세가 예전처럼 열리는지 (안 건드렸지만 확인) |
| 다크 모드 | 오른쪽 위 `다크` 클릭 → 이슈 태그와 빨간 숫자가 읽히는지 |

> **다크 모드를 꼭 확인하세요.** 이 파일은 다크 값을 **두 벌** 갖고 있습니다
> (`@media (prefers-color-scheme: dark)`는 OS 설정용, `:root[data-theme="dark"]`는
> 화면 토글용). 우리는 `var(--bad)` 같은 **이름으로만** 색을 썼으니 자동으로 따라오지만,
> 눈으로 한 번 보는 게 확실합니다.

**④ 되돌리는 법**

```bash
# 백업으로 되돌리기
cp frontend/admin.html.bak frontend/admin.html

# 또는 git 으로 마지막 커밋 상태로
git checkout -- frontend/admin.html
```

---

## 5. 다 하고 나서 — 남은 것 세 가지

### 5-1. `preferences_initial` 회귀 (엔진 수정 필요)

**증상** — 회원 상세의 가중치 박스에서 *고정 블록*과 *가입 때와 달라진 칸 표시(•)*가
**오류 없이 조용히** 사라져 있습니다.

**원인** — 이 기능은 웹에 들어와 있지만, 값을 주던 쪽이 **엔진의 미커밋 변경분**이었고
`dev-embed` 머지 때 걷어내졌습니다. 지금 `get_member()`가 주는 것은 이렇습니다.

```python
{"customer", "preferences", "persona", "likes", "searches", "chats"}
#  preferences_initial 이 없다
```

**고치려면** — 엔진 `Life-Embed-jh/app/features/admin.py`의 `get_member()`에 한 줄:

```python
"preferences_initial": customer_preferences_initial(customer_id) or {},
```

`app/core/db.py`의 `customer_preferences_initial` 함수도 함께 필요합니다.
둘 다 `C:\Users\lecra\Desktop\life-db-backup\salvage\` 의
`admin.py.patch` · `db.py.patch`에 그대로 있습니다.

**엔진 저장소에 커밋이 필요한 작업**이라 이 교안에는 넣지 않았습니다.

### 5-2. `_pairs()`의 `str()` — 빈 값이 `'None'` 글자로 오는 문제 (엔진 수정 필요)

2-3 ④ 에서 화면 쪽으로 막은 것의 **근본 원인**입니다.

```python
# Life-Embed-jh/app/features/admin.py — 243번째 줄
return [{"label": str(a), "value": b} for a, b in cur.fetchall()]
```

`str(None)` → `'None'`. 비어 있다는 사실이 **다섯 글자짜리 멀쩡한 문자열**로 바뀌어
화면에 도착합니다. 지금은 성별에서만 드러나지만, 다른 칸에 빈 값이 생기면 그대로 반복됩니다.

**고친다면**

```python
return [{"label": "" if a is None else str(a), "value": b} for a, b in cur.fetchall()]
```

다만 `_pairs()`는 연령대 · 성별 · 자치구 · 거래형태 · 가입추이 등 **차트 7종이 전부**
쓰는 함수라, 고치기 전에 각 화면이 빈 문자열을 어떻게 그리는지 확인해야 합니다.
그리고 **엔진 저장소에 커밋이 필요**합니다.

고치고 나면 화면 쪽 `isEmptyLabel`의 `v === 'None'` 조건은 지워도 됩니다
(남겨 둬도 해롭지 않습니다).

### 5-3. 이슈를 사람이 적어 넣기 (엔진 표 필요)

지금 이슈 카드는 **자동 감지만** 합니다. "이런 문제가 있었다"를 손으로 적거나
"해결함"으로 닫을 수는 없습니다. 그러려면 엔진 DB에 `issue` 표 하나와
`POST /api/admin/issues` 같은 라우터가 필요합니다.

지금 구조로도 적재 유실은 다 잡히니, 수동 기록이 정말 필요해진 뒤에 붙이는 편이 좋습니다.

---

## 6. 이번에 나온 개념 정리

| 개념 | 한 줄 설명 | 나온 곳 |
|---|---|---|
| 템플릿 리터럴 `` `${}` `` | 문자열 안에 값을 끼워 넣는다. 작은따옴표에선 안 된다 | 전부 |
| `innerHTML` vs `textContent` | 앞은 태그로 해석, 뒤는 글자 그대로 | 2-3 ③ |
| `esc()` | `innerHTML`에 값을 넣기 전 안전하게 바꾼다 | 2-3 ③, 3-3 ⑦ |
| `.map()` | 배열의 각 항목을 바꿔 새 배열을 만든다 | 2-3 ④ |
| `.filter()` | 조건에 맞는 항목만 남긴다 | 3-3 ⑤ |
| `.some()` | 하나라도 있으면 `true` | 3-3 ⑤ |
| `.reduce()` | 배열을 값 하나로 접는다 (합계·최댓값) | 3-3 ②, 3-4 ③ |
| 전개 `{ ...g, label: x }` | 원본을 복사하고 일부만 덮어쓴다 | 2-3 ④ |
| 삼항 `조건 ? A : B` | 값을 만들어야 할 때 쓰는 짧은 `if` | 3-4 ③ |
| `a || b` | `a`가 비면 `b`를 쓴다. **문자열 'None' 은 "비었다"가 아니다** | 2-3 ④ |
| 거짓 같은 값 | `''` · `null` · `undefined` · `0` · `false` **다섯뿐** | 2-3 ④ |
| CSS 변수 `var(--bad)` | 테마를 자동으로 따라가는 색 이름 | 3-2 |
| 매직 넘버 제거 | 숫자에 이름을 붙여 한 곳에 모은다 | 3-3 ① |

---

## 7. 기록 남기는 법

이 작업을 끝내면 아래 두 가지를 갱신해 주세요. 다음 사람(과 미래의 나)이 헤매지 않습니다.

1. **`CLAUDE.md`** — 관리자 화면 설명 중 두 곳
   - `**시스템**(상태·캐시·수정 이력)` → `**시스템**(상태·이슈·적재·캐시)`
   - 차트 함수 `` `bars`/`cols`/`donut`/`area` 네 함수 `` → `` `bars`/`cols`/`donut` 세 함수 ``
2. **이 파일(`study.md`)** — 하다가 막힌 곳, 오류 메시지, 어떻게 풀었는지.
   **막혔던 기록이 제일 값집니다.** 같은 곳에서 또 막히거든요.
