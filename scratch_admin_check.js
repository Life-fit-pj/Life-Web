
/* ═══════════════════════════════════════════════════════════
   0. 공통 — 통신 · 토스트 · 문자열
   ═══════════════════════════════════════════════════════════ */
const API = '/api/admin';
let TOKEN = localStorage.getItem('adminToken') || '';

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* HTML 로 해석될 글자를 막는다 — 회원 이름·페르소나가 그대로 화면에 들어간다 */
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
));

/* 모든 요청이 이 함수를 지난다. 401 이면 토큰이 틀린 것이므로 입력 화면으로 되돌린다 */
async function api(path, options = {}) {
  const res = await fetch(API + path, {
    ...options,
    headers: { Authorization: 'Bearer ' + TOKEN, ...options.headers },
  });
  if (res.status === 401) { lock('토큰이 맞지 않습니다'); throw new Error('unauthorized'); }
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

let toastTimer = null;
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
}

const num = n => Number(n ?? 0).toLocaleString('ko-KR');

/* ═══════════════════════════════════════════════════════════
   1. 테마 — 시스템 / 라이트 / 다크
   고른 값만 저장한다. 'system' 이면 data-theme 를 아예 지워서
   CSS 의 @media (prefers-color-scheme) 가 그대로 먹게 둔다.
   ═══════════════════════════════════════════════════════════ */
function applyTheme(mode) {
  if (mode === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = mode;
  localStorage.setItem('adminTheme', mode);
  $$('#theme button').forEach(b =>
    b.setAttribute('aria-pressed', String(b.dataset.themeSet === mode)));
}
applyTheme(localStorage.getItem('adminTheme') || 'system');
$('#theme').addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (btn) applyTheme(btn.dataset.themeSet);
});

/* ═══════════════════════════════════════════════════════════
   2. 차트 — 바깥 라이브러리 없이 HTML·SVG 로 그린다
   전부 [{label, value}] 한 가지 모양만 받는다.
   ═══════════════════════════════════════════════════════════ */
const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)'];

/* 가로 막대 — 값이 늘 오른쪽에 붙으므로 축이 없어도 읽힌다 */
function bars(data, { color = 'var(--s1)', fmt = num, max = null, labelWidth = null } = {}) {
  if (!data.length) return '<div class="skel">자료 없음</div>';
  const top = max ?? Math.max(...data.map(d => d.value), 1);
  return `<div class="bars" ${labelWidth ? `style="--lab-w:${labelWidth}"` : ''}>` + data.map(d => `
    <div class="bar-row">
      <span class="bar-lab" title="${esc(d.label)}">${esc(d.label)}</span>
      <span class="bar-track"><i style="width:${(d.value / top * 100).toFixed(1)}%;background:${color}"></i></span>
      <span class="bar-val">${fmt(d.value)}</span>
    </div>`).join('') + '</div>';
}

/* 세로 막대 — 항목이 적고 순서가 있는 것(연령대)에 쓴다 */
function cols(data, { color = 'var(--s1)' } = {}) {
  if (!data.length) return '<div class="skel">자료 없음</div>';
  const top = Math.max(...data.map(d => d.value), 1);
  return '<div class="cols">' + data.map(d => `
    <div class="col">
      <span class="c-val">${num(d.value)}</span>
      <i style="height:${Math.max(d.value / top * 100, 2)}%;background:${color}"></i>
      <span class="c-lab">${esc(d.label)}</span>
    </div>`).join('') + '</div>';
}

/* 도넛 — 조각마다 값과 비율을 범례에 적는다(색만으로 구분하지 않게) */
function donut(data) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const R = 52, C = 2 * Math.PI * R;
  let at = 0;
  const arcs = data.map((d, i) => {
    const len = d.value / total * C;
    const seg = `<circle cx="66" cy="66" r="${R}" fill="none"
        stroke="${SERIES[i % SERIES.length]}" stroke-width="17"
        stroke-dasharray="${Math.max(len - 2, 0.5)} ${C - Math.max(len - 2, 0.5)}"
        stroke-dashoffset="${-at}" transform="rotate(-90 66 66)"/>`;
    at += len;
    return seg;
  }).join('');

  const legend = data.map((d, i) => `
    <div>
      <span class="chip" style="background:${SERIES[i % SERIES.length]}"></span>
      <span class="lg-lab">${esc(d.label)}</span>
      <span class="lg-val">${num(d.value)}</span>
      <span class="lg-pct">${(d.value / total * 100).toFixed(0)}%</span>
    </div>`).join('');

  return `<div class="donut-wrap">
    <svg class="donut" viewBox="0 0 132 132">${arcs}
      <text x="66" y="63" text-anchor="middle" fill="var(--ink)" font-size="21" font-weight="680">${num(total)}</text>
      <text x="66" y="79" text-anchor="middle" fill="var(--muted)" font-size="10.5">합계</text>
    </svg>
    <div class="legend">${legend}</div>
  </div>`;
}


/* ═══════════════════════════════════════════════════════════
   3. 화면 전환
   ═══════════════════════════════════════════════════════════ */
const VIEWS = ['dash', 'member', 'region', 'system'];
let loaded = {};

function showView(name) {
  VIEWS.forEach(v => { $('#view-' + v).hidden = v !== name; });
  $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.view === name));

  if (name === 'dash'   && !loaded.dash)   loadDashboard();
  if (name === 'member' && !loaded.member) loadMembers();
  if (name === 'region' && !loaded.region) loadRegions();
  if (name === 'system') loadSystem();     /* 상태·이력은 늘 최신을 본다 */
}
$('#nav').addEventListener('click', e => {
  const btn = e.target.closest('button[data-view]');
  if (btn) showView(btn.dataset.view);
});

/* ═══════════════════════════════════════════════════════════
   4. 상단 상태 알약
   ═══════════════════════════════════════════════════════════ */
let WRITE_ENABLED = true;

function paintStatus(s) {
  const box = $('#status');
  if (!s || !s.ok) {
    box.className = 'pill bad';
    box.innerHTML = '<span class="led"></span>' + esc(s?.error || '서버에 연결할 수 없음');
    return;
  }
  WRITE_ENABLED = s.write_enabled !== false;
  box.className = WRITE_ENABLED ? 'pill ok' : 'pill warn';
  box.innerHTML = '<span class="led"></span>' +
    `회원 ${num(s.members)} · 행정동 ${num(s.regions)} · 캐시 ${s.cache_warm ? '있음' : '비어 있음'}` +
    (WRITE_ENABLED ? '' : ' · 쓰기 잠김');
}

async function refreshStatus() {
  try { paintStatus(await api('/ready')); }
  catch { paintStatus(null); }
}

/* ═══════════════════════════════════════════════════════════
   5. 대시보드
   ═══════════════════════════════════════════════════════════ */
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

  /* 성별이 빈 회원(로그인만 발급된 계정)은 라벨이 없어 범례가 빈칸으로 뜬다.
     숨기지 않고 이름을 붙인다 — 숨기면 합계가 왜 안 맞는지 알 수 없어진다 */
  const isEmptyLabel = v => !v || v === 'None' || v === 'null';
  const genders = ch.genders.map(g => ({
    ...g, label: isEmptyLabel(g.label) ? '미입력' : g.label,
  }));

  const top10 = ch.memberGu.slice(0, 10);
  $('#dash').innerHTML = `
    ${analysisBar()}
    ${card('희망 조건 평균 <span class="hint">1~5</span>', bars(ch.weights, { max: 5, fmt: v => v.toFixed(2) }),
           `회원들이 무엇을 더 중요하게 꼽았는지 · 7개 지표 평균 ${avgWeight}`)}
    ${card('연령대', cols(ch.ages), '10살 단위')}
    ${card('성별', donut(genders))}
    ${card('희망 거래형태', donut(ch.dealType))}
    ${card('회원이 사는 자치구 <span class="hint">상위 10</span>', bars(top10, { color: 'var(--s3)' }),
           `25개 구 중 ${ch.memberGu.length}개 구에 회원이 있다`, 'wide')}
  `;
  /* 그리기(위)와 동작 붙이기(아래)는 순서를 지켜야 한다 —
     innerHTML 로 넣기 전에는 $('#an-send') 가 아직 없어서 못 찾는다 */
  wireAnalysis($('#dash'));
}

/* 분석 막대
   대시보드 맨 위에 접힌 채로 놓인다. 숫자를 보다가 바로 물어볼 수 있는 자리다.
   서버가 집계표를 만들어 Claude 에게 주므로, Claude 는 SQL 을 짜지 않는다 */

const EXAMPLES = [
  '회원들 성향에서 눈에 띄는 게 뭐야?',
  '어느 자치구에 회원이 몰려 있어?',
  '사람들이 많이 찾는 검색어가 뭐야?',
  '홈페이지 개선에 쓸 만한 게 있을까?',
];

function analysisBar() {
  return `<details class="ask wide" id="ask">
    <summary>분석 <span class="hint">집계된 숫자를 Claude 에게 물어봅니다</span></summary>
    <div class="body">
      <div class="an-ex">${EXAMPLES.map(q =>
        `<button class="btn sm an-ex-b" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
      <div class="an-ask">
        <textarea id="an-q" rows="2" placeholder="집계된 숫자에 대해 물어보세요"></textarea>
        <button class="btn primary" id="an-send" ${WRITE_ENABLED ? '' : 'disabled title="쓰기가 잠겨 있다"'}>물어보기</button>
      </div>
      <div class="hint" style="margin-top:8px">답변은 집계된 숫자만 보고 만들어집니다. 자료에 없는 건 없다고 답합니다.</div>
      <div id="an-out"></div>
      <div class="card-title" style="margin:18px 0 8px">지난 대화</div>
      <div id="an-list"><div class="skel">펼치면 불러옵니다</div></div>
    </div>
  </details>`;
}

function wireAnalysis(root) {
  const bar = $('#ask', root);
  const out = $('#an-out', root);
  const box = $('#an-q', root);
  let listLoaded = false;

  /* 펼칠 때 딱 한 번만 지난 대화를 불러온다.
     대시보드를 열 때마다 부르면, 한 번도 안 펼친 사람에게도 요청이 나간다 */
  bar.addEventListener('toggle', () => {
    if (bar.open && !listLoaded) { listLoaded = true; loadAnalysisList(); }
  });

  $$('.an-ex-b', root).forEach(b => b.onclick = () => { box.value = b.dataset.q; box.focus(); });
  $('#an-send', root).onclick = () => askAnalysis(box.value);
  box.onkeydown = e => {
    /* Ctrl+Enter 로 보낸다. 그냥 Enter 는 줄바꿈이어야 긴 질문을 쓸 수 있다 */
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) askAnalysis(box.value);
  };

  async function askAnalysis(question) {
    if (!(question || '').trim()) return;
    out.innerHTML = '<div class="skel">Claude 가 집계를 읽는 중… (3~5초)</div>';
    try {
      const r = await api('/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      out.innerHTML = answerBlock(r.question, r.answer);
      box.value = '';
      listLoaded = true;
      loadAnalysisList();
    } catch (e) {
      out.innerHTML = `<div class="an-a" style="color:var(--danger)">답을 못 받았습니다. ${esc(String(e).slice(0, 120))}</div>`;
    }
  }

  function answerBlock(q, a) {
    return `<div class="an-item"><div class="an-q">${esc(q)}</div>
      <div class="an-a">${esc(a)}</div></div>`;
  }

  async function loadAnalysisList() {
    const list = $('#an-list', root);
    const rows = await api('/analysis');
    if (!rows.length) { list.innerHTML = '<div class="empty" style="padding:14px 0">아직 저장된 대화가 없습니다</div>'; return; }
    list.innerHTML = `<ul class="hist">${rows.map(r => `
      <li data-id="${r.chat_id}" class="an-row">
        <span class="t">${esc(when(r.created_at))}</span>
        <div><div class="q">${esc(r.question)}</div>
          <div class="a">${esc(r.preview || '')}…</div></div>
        <button class="btn sm an-del" data-id="${r.chat_id}" title="지우기">&times;</button>
      </li>`).join('')}</ul>`;

    $$('.an-row', list).forEach(li => li.onclick = e => {
      if (e.target.classList.contains('an-del')) return;
      openAnalysis(li.dataset.id);
    });
    $$('.an-del', list).forEach(b => b.onclick = async e => {
      e.stopPropagation();
      await api(`/analysis/${b.dataset.id}`, { method: 'DELETE' });
      loadAnalysisList();
    });
  }

  async function openAnalysis(id) {
    out.innerHTML = '<div class="skel">불러오는 중…</div>';
    const r = await api(`/analysis/${id}`);
    /* 그때의 집계도 같이 저장해 뒀다. 지금 숫자와 다를 수 있으므로
       "언제 기준인지"를 반드시 같이 보여준다 */
    out.innerHTML = answerBlock(r.question, r.answer) +
      `<div class="an-when">${esc(when(r.created_at))} 기준 집계로 만든 답입니다</div>`;
  }
}

function card(title, body, hint = '', cls = '') {
  return `<div class="card ${cls}">
    <div class="card-title">${title}${hint ? `<span class="hint">${esc(hint)}</span>` : ''}</div>
    ${body}
  </div>`;
}

function when(iso) {
  if (!iso) return '';
  return String(iso).replace('T', ' ').slice(5, 16);
}

/* 좋아요·검색·채팅 — 전부 anon_id 를 customer_id 로 삼아 쌓인 것만 잡힌다.
   로그인 전(임시 UUID로 활동) 기록은 이 회원 것으로 안 이어진다 */
function activityBody(likes, searches, chats) {
  const likeChips = likes.length
    ? likes.map(l => `<span class="tag">${esc(l.구)} ${esc(l.행정동명)}</span>`).join(' ')
    : '<div class="skel">좋아요 기록이 없습니다</div>';

  const searchRows = searches.length
    ? searches.map(s => `<div class="log"><span class="l-fields">${esc(s.query)}</span><span class="l-when">${when(s.created_at)}</span></div>`).join('')
    : '<div class="skel">검색 기록이 없습니다</div>';

  const chatRows = chats.length
    ? chats.map(c => `
      <div class="log" style="flex-direction:column; align-items:flex-start; gap:4px">
        <div><b>Q.</b> ${esc(c.question)}</div>
        <div style="color:var(--muted)"><b>A.</b> ${esc(c.answer)}</div>
        <span class="l-when">${when(c.created_at)}</span>
      </div>`).join('')
    : '<div class="skel">대화 기록이 없습니다</div>';

  return `
    <div style="margin-bottom:14px"><div class="card-title" style="margin-bottom:6px">좋아요</div>${likeChips}</div>
    <div style="margin-bottom:14px"><div class="card-title" style="margin-bottom:6px">검색 기록</div><div class="logs">${searchRows}</div></div>
    <div><div class="card-title" style="margin-bottom:6px">채팅 기록</div><div class="logs">${chatRows}</div></div>`;
}

function logList(list) {
  if (!list || !list.length) return '<div class="skel">아직 수정 기록이 없습니다</div>';
  return '<div class="logs">' + list.map(l => `
    <div class="log">
      <span class="tag">${l.target === 'member' ? '회원' : '행정동'}</span>
      <b>${esc(l.target_id)}</b>
      <span class="l-fields">${esc(l.fields.join(', '))}${l.field_count > l.fields.length ? ` 외 ${l.field_count - l.fields.length}칸` : ''}</span>
      <span class="l-when">${when(l.changed_at)}</span>
    </div>`).join('') + '</div>';
}

$('#dash-reload').addEventListener('click', () => { loaded.dash = false; loadDashboard(); });

/* ═══════════════════════════════════════════════════════════
   6. 회원
   ═══════════════════════════════════════════════════════════ */
const CUSTOMER_LABELS = {
  customer_id: '아이디', name: '이름', gender: '성별', age: '나이', phone: '전화번호', email: '이메일',
  city: '거주 자치구', city_dong: '거주 행정동',
  work_city: '직장 자치구', work_dong: '직장 행정동', joined_at: '가입일',
};
const PERSONA_LABELS = {
  persona: '총괄 요약', professional_persona: '직업', sports_persona: '운동',
  arts_persona: '예술 · 취미', travel_persona: '여행', culinary_persona: '음식',
  family_persona: '가족', cultural_background: '문화 배경',
  career_goals_and_ambitions: '커리어 목표',
};
/* 서버의 화이트리스트(CUSTOMER_FIELDS)에 없는 칸은 보내 봐야 조용히 버려진다.
   읽기 전용으로 그려서 "고칠 수 있는 것처럼" 보이지 않게 한다 */
const READONLY = ['customer_id', 'joined_at'];

let members = [];
let currentMember = null;
let initial = {};          /* 화면에 처음 실린 값 — 저장할 때 바뀐 칸만 골라내는 기준 */

async function loadMembers() {
  members = await api('/members');
  loaded.member = true;
  renderMemberRows(members);
}

function renderMemberRows(list) {
  $('#member-count').textContent = `${list.length}명${list.length !== members.length ? ` / 전체 ${members.length}명` : ''}`;
  $('#member-rows').innerHTML = list.map(m => `
    <div class="row ${m.customer_id === currentMember ? 'on' : ''}" data-id="${esc(m.customer_id)}">
      <span class="r-main">${esc(m.name)}</span>
      <span class="r-sub">${esc(m.customer_id)} · ${esc(m.city || '')}</span>
    </div>`).join('') || '<div class="skel">찾는 회원이 없습니다</div>';
}

/* 목록을 다시 그리지 않고 표시만 옮긴다 — 검색으로 걸러 둔 상태가 유지된다 */
function markMemberRow() {
  $$('#member-rows .row').forEach(el => el.classList.toggle('on', el.dataset.id === currentMember));
}

$('#member-search').addEventListener('input', e => {
  const q = e.target.value.trim();
  /* 이름이 없는 계정(로그인만 발급)은 name 이 null 이다.
     그냥 더하면 "null" + "C101" = "nullC101" 이 되어 검색어 "null" 에 걸린다 */
  renderMemberRows(members.filter(m => ((m.name || '') + m.customer_id).includes(q)));
});
$('#member-rows').addEventListener('click', e => {
  const row = e.target.closest('.row');
  if (row) openMember(row.dataset.id);
});
$('#member-add').addEventListener('click', openNewMemberForm);


// ── 새로 추가 ──
function openNewMemberForm() {
  currentMember = null;
  markMemberRow();          // 목록에서 켜져 있던 회원 표시를 끈다
  const board = $('#member-detail');

  const editable = Object.keys(CUSTOMER_LABELS).filter(k => !READONLY.includes(k));
  const basic = editable.map(k => `
    <div>
      <label class="lab" for="f-${k}">${esc(CUSTOMER_LABELS[k])}</label>
      ${k === 'gender'
        ? `<select id="f-${k}" name="${k}">
             <option value="">선택 안 함</option>
             <option value="M">남성</option>
             <option value="F">여성</option>
           </select>`
        : `<input id="f-${k}" name="${k}" type="${k === 'age' ? 'number' : 'text'}">`}
      <div class="err" data-err="${k}"></div>
    </div>`).join('');

  // 기본값 3으로 둔다 — 안 건드리면 "보통"으로 저장된다
  const sliders = INDICATORS.map(k => `
    <div class="w-item">
      <div class="slider-row">
        <span class="s-lab">${esc(k)}</span>
        <input type="range" class="w-bar" min="1" max="5" step="0.01" value="3"
               oninput="this.nextElementSibling.value = this.value">
        <input type="number" class="w-num" name="${k}" min="1" max="5" step="any" value="3"
               oninput="this.previousElementSibling.value = this.value">
      </div>
    </div>`).join('');

  const personas = Object.keys(PERSONA_LABELS).map(k => `
    <details class="persona" ${k === 'persona' ? 'open' : ''}>
      <summary>${esc(PERSONA_LABELS[k])}<span class="len">0자</span></summary>
      <div class="body">
        <textarea name="${k}"
          oninput="this.closest('details').querySelector('.len').textContent = this.value.length + '자'"></textarea>
        <div class="err" data-err="${k}"></div>
      </div>
    </details>`).join('');

  board.innerHTML = `
    <div class="detail-head">
      <h3>새 회원</h3>
      <span class="id">아이디는 저장할 때 자동으로 붙는다</span>
      <div class="acts">
        <button class="btn sm primary" id="member-create"
          ${WRITE_ENABLED ? '' : 'disabled title="쓰기가 잠겨 있다"'}>추가</button>
      </div>
    </div>
    <div class="detail-body" id="member-form">
      ${card('기본 정보', `<div class="grid2">${basic}</div>`, '이름만 있어도 저장된다')}
      ${card('희망 조건 <span class="hint">1~5</span>', `<div class="sliders">${sliders}</div>`,
             '기본값 3 · 안 건드리면 그대로 저장된다')}
      ${card('페르소나 <span class="hint">서술형</span>', personas,
             `20자 미만으로 쓰면 저장은 되지만 벡터는 안 만들어진다 (MIN_LENGTH=20)`)}
    </div>`;

  $('#member-create').addEventListener('click', createMember);
}


async function openMember(id) {
  currentMember = id;
  markMemberRow();
  const board = $('#member-detail');
  board.innerHTML = '<div class="empty">불러오는 중…</div>';

  const { customer, preferences, preferences_initial, persona, likes, searches, chats } = await api('/members/' + id);
  /* initial 은 "저장할 때 바뀐 칸 골라내는 기준"이다. preferences_initial(가입 시 값)과
     이름이 비슷하지만 전혀 다른 것이니 섞지 말 것 */
  initial = { ...customer, ...preferences, ...persona };

  const basic = Object.entries(customer).map(([k, v]) => `
    <div>
      <label class="lab" for="f-${k}">${esc(CUSTOMER_LABELS[k] || k)}</label>
      ${k === 'gender'
        ? `<select id="f-${k}" name="${k}">${['M', 'F'].map(g =>
            `<option value="${g}" ${g === v ? 'selected' : ''}>${g === 'M' ? '남성' : '여성'}</option>`).join('')}</select>`
        : `<input id="f-${k}" name="${k}" type="${k === 'age' ? 'number' : 'text'}"
             value="${esc(v)}" ${READONLY.includes(k) ? 'readonly' : ''}>`}
      <div class="err" data-err="${k}"></div>
    </div>`).join('');

  /* 가중치 블록을 둘로 나눈다.
       위 = 가입 때 받은 값(고정, 읽기 전용)   아래 = 지금 값(조정 가능)
     같은 지표를 위아래 같은 자리에 놓아 눈으로 바로 비교되게 한다 */
  const movedKeys = new Set(
    Object.keys(preferences).filter(k => {
      const init = preferences_initial?.[k];
      return init != null && Math.abs(Number(preferences[k]) - Number(init)) >= 0.005;
    }));

  /* 고정 블록 — disabled 이고 name 이 없으므로 저장에 안 잡힌다 */
  const fixedSliders = Object.entries(preferences_initial || {}).map(([k, v]) => `
    <div class="w-item${movedKeys.has(k) ? ' moved' : ''}">
      <div class="slider-row">
        <span class="s-lab">${esc(k)}</span>
        <input type="range" class="w-bar" min="1" max="5" step="0.01"
               value="${esc(round4(v))}" disabled>
        <span class="w-init">${esc(round4(v))}</span>
      </div>
    </div>`).join('');

  /* 변동 블록 — 실제로 저장되는 값 */
  const sliders = Object.entries(preferences).map(([k, v]) => `
    <div class="w-item${movedKeys.has(k) ? ' moved' : ''}">
      <div class="slider-row">
        <span class="s-lab">${esc(k)}</span>

        <!-- 보여주기·대충 조절용. name 이 없으므로 저장 대상이 아니다 -->
        <input type="range" class="w-bar" min="1" max="5" step="0.01" value="${esc(round4(v))}"
               oninput="this.nextElementSibling.value = this.value">

        <!-- 진짜 값. name 이 여기에만 있다 -->
        <input type="number" class="w-num" name="${k}" min="1" max="5" step="any"
               value="${esc(round4(v))}"
               oninput="this.previousElementSibling.value = this.value">
      </div>
      <div class="err" data-err="${k}"></div>
    </div>`).join('');

  const personas = Object.entries(persona).map(([k, v]) => `
    <details class="persona">
      <summary>${esc(PERSONA_LABELS[k] || k)}<span class="len">${String(v ?? '').length}자</span></summary>
      <div class="body"><textarea name="${k}">${esc(v)}</textarea>
        <div class="err" data-err="${k}"></div></div>
    </details>`).join('');

  board.innerHTML = `
    <div class="detail-head">
      <h3>${esc(customer.name)}</h3>
      <span class="id">${esc(customer.customer_id)}</span>
      <div class="acts">
        <button class="btn sm" data-act="preview">추천 돌려보기</button>
        <button class="btn sm" data-act="similar">비슷한 회원</button>
        <button class="btn sm" data-act="privacy">개인정보 점검</button>
        <button class="btn sm primary" data-act="save" ${WRITE_ENABLED ? '' : 'disabled title="쓰기가 잠겨 있다"'}>저장</button>
        <button class="btn sm danger" data-act="delete" ${WRITE_ENABLED ? '' : 'disabled title="쓰기가 잠겨 있다"'}>탈퇴</button>
      </div>
    </div>
    <div class="detail-body" id="member-form">
      ${card('기본 정보', `<div class="grid2">${basic}</div>`, '아이디와 가입일은 고칠 수 없다')}
      ${Object.keys(preferences_initial || {}).length ? card(
          '가입 시 희망 조건 <span class="hint">고정</span>',
          `<div class="sliders fixed">${fixedSliders}</div>`,
          '회원가입 때 받은 값이다. 여기서는 못 고친다') : ''}
      ${card('현재 희망 조건 <span class="hint">1~5 · 조정 가능</span>', `<div class="sliders">${sliders}</div>`,
             '추천 점수를 매기는 가중치다. 가입 때와 달라진 칸은 점(•)으로 표시된다')}
      ${card('페르소나 <span class="hint">9칸</span>', personas,
             '이 글을 고치면 벡터가 다시 만들어진다')}
      ${card('활동', activityBody(likes, searches, chats),
             '로그인한 뒤 쌓인 좋아요·검색·채팅만 보인다')}
      <div id="panel-preview"></div>
      <div id="panel-similar"></div>
      <div id="panel-privacy"></div>
    </div>`;

  $('.acts', board).addEventListener('click', e => {
    const act = e.target.closest('button')?.dataset.act;
    if (act === 'save')    saveMember(id);
    if (act === 'preview') previewMember(id);
    if (act === 'similar') showSimilar(id);
    if (act === 'privacy') showPrivacy(id);
    if (act === 'delete')  deleteMember(id);
  });
}

/* 되돌릴 수 없다 — customers·preferences·member 청크·로그인·활동 기록이 한 번에 지워진다 */
async function deleteMember(id) {
  if (!confirm(`${id} 회원을 탈퇴시킵니다. 되돌릴 수 없습니다. 계속할까요?`)) return;

  await api('/members/' + id, { method: 'DELETE' });

  currentMember = null;
  $('#member-detail').innerHTML = '<div class="empty">회원을 골라주세요</div>';
  members = await api('/members');
  renderMemberRows(members);
  loaded.dash = false;
  refreshStatus();
  toast(`${id} 탈퇴 처리했습니다`);
}

/* 처음 값과 달라진 칸만 모은다.
   전부 보내면 페르소나를 안 고쳤어도 벡터를 900번 다시 만들고,
   수정 이력에도 "26칸 고침" 이 남아 무엇을 바꿨는지 알 수 없게 된다 */
function collectPatch() {
  const patch = {};
  $$('#member-form [name]').forEach(el => {
    if (el.readOnly) return;
    const value = el.type === 'range' || el.type === 'number' ? Number(el.value) : el.value;
    if (String(value) !== String(initial[el.name] ?? '')) patch[el.name] = value;
  });
  return patch;
}

const clearErrors = () => $$('[data-err]').forEach(el => { el.textContent = ''; });

function showErrors(e) {
  let detail;
  try { detail = JSON.parse(e.message).detail; }
  catch { return toast('저장 실패: ' + e.message); }        /* detail 이 문자열인 경우 */
  if (typeof detail !== 'object') return toast('저장 실패: ' + detail);
  for (const [name, message] of Object.entries(detail)) {
    const box = $(`[data-err="${name}"]`);
    if (box) box.textContent = message;
  }
  toast('값이 올바르지 않습니다');
}

const INDICATORS = ['녹지', '안전', '교통', '상권', '의료', '교육', '문화'];

// ── 새로 추가 ──
async function createMember() {
  const payload = {};
  $$('#member-form [name]').forEach(el => {
    const raw = el.type === 'number'
      ? (el.value === '' ? null : Number(el.value))
      : el.value.trim();
    if (raw !== '' && raw !== null) payload[el.name] = raw;
  });
  if (!payload.name) return toast('이름은 있어야 합니다');

  clearErrors();
  let created;
  try {
    created = await api('/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return showErrors(e);
  }

  members = await api('/members');
  renderMemberRows(members);
  await openMember(created.customer.customer_id);   // 방금 만든 회원을 바로 연다
  loaded.dash = false;                                // 대시보드 숫자가 낡았다
  refreshStatus();
  toast(`${created.customer.customer_id} 로 추가했습니다`);
}

async function saveMember(id) {
  const patch = collectPatch();
  const changed = Object.keys(patch);
  if (!changed.length) return toast('바뀐 값이 없습니다');

  /* 가중치를 건드렸을 때만 순위 비교가 의미 있다 — 아니면 두 번 계산할 이유가 없다 */
  const weightsTouched = changed.some(k => INDICATORS.includes(k));
  const before = weightsTouched ? await api(`/members/${id}/preview`) : null;

  clearErrors();
  try {
    await api('/members/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
  } catch (e) {
    return showErrors(e);          /* 저장이 실패했으면 아래를 하면 안 된다 */
  }

  const after = weightsTouched ? await api(`/members/${id}/preview`) : null;

  members = await api('/members');
  renderMemberRows(members);
  await openMember(id);            /* 판을 다 그릴 때까지 기다린 다음에 */
  if (before) renderDiff(before, after);   /* 결과를 얹어야 안 지워진다 */
  loaded.dash = false;             /* 대시보드 숫자가 낡았다 */
  refreshStatus();
  toast(`저장했습니다 · ${changed.length}칸`);
}

async function previewMember(id) {
  const box = $('#panel-preview');
  box.innerHTML = card('이 회원 조건으로 뽑은 추천', '<div class="skel">계산 중…</div>');
  const regions = await api(`/members/${id}/preview`);
  box.innerHTML = card('이 회원 조건으로 뽑은 추천 <span class="hint">TOP 5</span>',
    '<div class="rank">' + regions.map((r, i) => `
      <div class="rank-row"><span class="no">${i + 1}</span>
        <span class="nm">${esc(r.name)}</span>
        <span class="sc">${r.total}점</span></div>`).join('') + '</div>',
    '지금 저장된 가중치 기준');
}

/* 저장 전후 순위를 나란히 놓는다. 화살표가 곧 "내 수정이 무엇을 바꿨나" 다 */
function renderDiff(before, after) {
  const names = before.map(r => r.name);
  const rows = after.map((r, i) => {
    const was = names.indexOf(r.name);
    const tag = was === -1 ? '<span class="tag new">NEW</span>'
      : was === i ? '<span class="tag">—</span>'
      : was > i ? `<span class="tag up">▲${was - i}</span>`
      : `<span class="tag down">▼${i - was}</span>`;
    return `<div class="rank-row"><span class="no">${i + 1}</span>
      <span class="nm">${esc(r.name)}</span>${tag}
      <span class="sc">${r.total}점</span></div>`;
  }).join('');
  $('#panel-preview').innerHTML =
    card('저장 전 → 후 순위 변화', `<div class="rank">${rows}</div>`, '가중치를 고쳤을 때만 나온다');
}

async function showSimilar(id) {
  const box = $('#panel-similar');
  box.innerHTML = card('페르소나가 비슷한 회원', '<div class="skel">벡터에서 찾는 중…</div>');
  const list = await api(`/members/${id}/similar`);
  box.innerHTML = card('페르소나가 비슷한 회원',
    list.length ? list.map(s => {
      const found = members.find(m => m.customer_id === s.customer_id);
      return `<div class="sim">
        <div class="s-top">
          <b>${esc(found ? found.name : s.customer_id)}</b>
          <span class="id" style="color:var(--muted);font-size:11.5px">${esc(s.customer_id)} · ${esc(s.category)}</span>
          <span class="s-score">${s.score}</span>
        </div>
        <div class="s-text">${esc(s.text)}</div>
      </div>`;
    }).join('') : '<div class="skel">비슷한 회원을 찾지 못했습니다</div>',
    '신규 회원의 7지표를 물려받을 이웃들');
}

async function showPrivacy(id) {
  const box = $('#panel-privacy');
  box.innerHTML = card('개인정보 점검', '<div class="skel">확인 중…</div>');
  const data = await api(`/members/${id}/privacy`);

  const rows = Object.keys(data.raw).map(name => {
    const same = data.raw[name] === data.masked[name];
    return `<div style="margin-bottom:12px">
      <div class="card-title" style="margin-bottom:6px">
        ${esc(PERSONA_LABELS[name] || name)}
        ${same ? '<span class="hint">안 가려짐</span>' : ''}
      </div>
      <div class="two">
        <pre class="raw">${esc(data.raw[name])}</pre>
        <pre class="${same ? 'raw' : 'safe'}">${esc(data.masked[name])}</pre>
      </div>
    </div>`;
  }).join('');

  box.innerHTML = card(`개인정보 점검 <span class="hint">9칸 중 ${data.changed}칸이 가려짐</span>`,
    `<div style="font-size:12px;color:var(--muted);margin-bottom:12px">
       왼쪽이 우리 DB, 오른쪽이 밖으로 나갈 글입니다.
       <b>안 가려진 칸에 개인정보가 남아 있는지</b>를 보는 게 목적입니다.
     </div>${rows}`);
}

/* ═══════════════════════════════════════════════════════════
   7. 행정동
   ═══════════════════════════════════════════════════════════ */
let regions = [];
let currentRegion = null;

/* 3.5615613876428966 같은 원값을 그대로 보여 주면 읽기도 고치기도 어렵다.
   소수점 4자리까지만 보여 주고, "바뀌었나" 판정도 이 값으로 한다 —
   그래야 손대지 않은 칸이 반올림된 값으로 조용히 덮어써지지 않는다 */
const round4 = v => (v === null || v === undefined || v === '')
  ? '' : String(Math.round(Number(v) * 1e4) / 1e4);

async function loadRegions() {
  regions = await api('/regions');
  loaded.region = true;

  const gus = [...new Set(regions.map(r => r['구']))].sort();
  $('#region-gu').innerHTML = '<option value="">자치구 전체</option>' +
    gus.map(g => `<option>${esc(g)}</option>`).join('');

  renderRegionRows(regions);
  showRegionEmpty();
}

function renderRegionRows(list) {
  $('#region-count').textContent = `${list.length}개${list.length !== regions.length ? ` / 전체 ${regions.length}개` : ''}`;
  $('#region-rows').innerHTML = list.map(r => `
    <div class="row ${currentRegion === r['구'] + r['행정동명'] ? 'on' : ''}"
         data-gu="${esc(r['구'])}" data-dong="${esc(r['행정동명'])}">
      <span class="r-main">${esc(r['행정동명'])}</span>
      <span class="r-sub">${esc(r['구'])}</span>
    </div>`).join('') || '<div class="skel">찾는 행정동이 없습니다</div>';
}

function filterRegions() {
  const gu = $('#region-gu').value;
  const q = $('#region-search').value.trim();
  renderRegionRows(regions.filter(r =>
    (!gu || r['구'] === gu) && (r['구'] + r['행정동명']).includes(q)));
}
$('#region-gu').addEventListener('change', filterRegions);
$('#region-search').addEventListener('input', filterRegions);
$('#region-rows').addEventListener('click', e => {
  const row = e.target.closest('.row');
  if (row) openRegion(row.dataset.gu, row.dataset.dong);
});

/* 아무것도 안 골랐을 때 빈 화면 대신 자치구별 행정동 수를 보여 준다 */
async function showRegionEmpty() {
  const box = $('#region-detail');
  const counts = {};
  regions.forEach(r => { counts[r['구']] = (counts[r['구']] || 0) + 1; });
  const data = Object.entries(counts)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  box.innerHTML = `<div class="detail-body">
    ${card('자치구별 행정동 수', bars(data, { color: 'var(--s2)' }),
           `서울 ${data.length}개 구 · ${regions.length}개 동`)}
    <div class="card"><div class="card-title">고치기 전에</div>
      <div style="font-size:13px;color:var(--ink-2);line-height:1.7">
        지표 값을 고치면 427개 동 전체의 백분위가 함께 움직입니다.
        한 동만 올려도 다른 동의 "상위 몇 %" 가 바뀐다는 뜻입니다.<br>
        저장하면 캐시가 비워지므로 다음 추천부터 새 값이 쓰입니다.
      </div></div>
  </div>`;
}

async function openRegion(gu, dong) {
  currentRegion = gu + dong;
  $$('#region-rows .row').forEach(el =>
    el.classList.toggle('on', el.dataset.gu + el.dataset.dong === currentRegion));

  const box = $('#region-detail');
  box.innerHTML = '<div class="empty">불러오는 중…</div>';
  const data = await api(`/regions/${encodeURIComponent(gu)}/${encodeURIComponent(dong)}`);

  const metrics = Object.entries(data.values).map(([k, v]) => {
    const pct = data.percentiles[k];
    return `<div class="metric">
      <div class="m-top">
        <span class="m-name">${esc(k)}</span>
        <span class="m-rank">${pct === null ? '순위 없음' : `상위 ${100 - pct}%`}</span>
      </div>
      <input type="number" name="${k}" min="0" step="any" value="${esc(round4(v))}">
      <div class="meter"><i style="width:${pct ?? 0}%"></i></div>
      <div class="err" data-err="${k}"></div>
    </div>`;
  }).join('');

  box.innerHTML = `
    <div class="detail-head">
      <h3>${esc(data['행정동명'])}</h3>
      <span class="id">${esc(data['구'])}</span>
      ${data.likes ? `<span class="tag">♥ ${data.likes}</span>` : ''}
      <div class="acts">
        <button class="btn sm primary" id="region-save" ${WRITE_ENABLED ? '' : 'disabled title="쓰기가 잠겨 있다"'}>저장</button>
      </div>
    </div>
    <div class="detail-body" id="region-form">
      ${card('지표 <span class="hint">12개</span>', `<div class="grid2">${metrics}</div>`,
             '막대는 427개 동 중 이 동의 위치다 · 값은 소수점 4자리까지 보여 준다')}
    </div>`;

  $('#region-save').addEventListener('click', () => saveRegion(gu, dong, data.values));
}

async function saveRegion(gu, dong, before) {
  const patch = {};
  $$('#region-form input[name]').forEach(el => {
    if (el.value !== round4(before[el.name])) patch[el.name] = Number(el.value);
  });
  if (!Object.keys(patch).length) return toast('바뀐 값이 없습니다');

  clearErrors();
  try {
    await api(`/regions/${encodeURIComponent(gu)}/${encodeURIComponent(dong)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
  } catch (e) { return showErrors(e); }

  await openRegion(gu, dong);
  loaded.dash = false;
  refreshStatus();
  toast(`저장했습니다 · ${Object.keys(patch).length}칸`);
}

/* ═══════════════════════════════════════════════════════════
   8. 시스템
   ═══════════════════════════════════════════════════════════ */
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

   async function loadSystem() {
  const pane = $('#system-pane');
  pane.innerHTML = '<div class="skel">불러오는 중…</div>';

  const [s, logs, sum] = await Promise.all([
    api('/ready'), api('/logs?limit=50'), api('/summary'),
  ]);
  paintStatus(s);

  const rows = [
    ['DB 연결', s.ok ? '정상' : '문제 있음 — ' + (s.error || ''), s.ok],
    ['행정동', num(s.regions) + '개', s.regions > 0],
    ['회원', num(s.members) + '명', s.members > 0],
    ['추천 캐시', s.cache_warm ? '데워져 있음' : '비어 있음 (다음 요청 때 채워진다)', true],
    ['쓰기 스위치', s.write_enabled ? '열림 (ADMIN_WRITE_ENABLED=1)' : '잠김 — 수정이 405 로 막힌다', s.write_enabled],
  ].map(([k, v, ok]) => `
    <div class="log">
      <span class="pill ${ok ? 'ok' : 'bad'}" style="min-width:0"><span class="led"></span>${esc(k)}</span>
      <span class="l-val">${esc(v)}</span>
    </div>`).join('');

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
      <div style="font-size:13px;color:var(--ink-2);line-height:1.7;margin-bottom:12px">
        추천 결과와 지역 설명을 메모리에 들고 있습니다.
        DB 를 화면 밖에서 직접 고쳤다면 여기서 한 번 비워야 새 값이 반영됩니다.
        (관리자 화면에서 저장한 것은 서버가 알아서 비웁니다.)
      </div>
      <button class="btn" id="cache-clear" ${s.write_enabled ? '' : 'disabled'}>캐시 비우기</button>`)}

    ${card('토큰', `
      <div style="font-size:13px;color:var(--ink-2);line-height:1.7;margin-bottom:12px">
        이 브라우저에 저장된 관리자 토큰을 지우고 입력 화면으로 돌아갑니다.
      </div>
      <button class="btn" id="token-reset">토큰 지우기</button>`)}
  `;

  $('#cache-clear')?.addEventListener('click', async () => {
    await api('/cache/clear', { method: 'POST' });
    toast('캐시를 비웠습니다');
    loadSystem();
  });
  $('#token-reset').addEventListener('click', () => lock());
}

/* ═══════════════════════════════════════════════════════════
   9. 들어가기 · 잠그기
   ═══════════════════════════════════════════════════════════ */
function lock(message = '') {
  localStorage.removeItem('adminToken');
  TOKEN = '';
  $('#app').hidden = true;
  $('#gate').hidden = false;
  $('#gate-err').textContent = message;
  $('#gate-token').value = '';
}

async function unlock(token) {
  const err = $('#gate-err');
  err.textContent = '';
  const res = await fetch(API + '/ready', { headers: { Authorization: 'Bearer ' + token } });
  if (!res.ok) { err.textContent = res.status === 401 ? '토큰이 맞지 않습니다' : '서버에 연결할 수 없습니다'; return; }

  TOKEN = token;
  localStorage.setItem('adminToken', token);
  $('#gate').hidden = true;
  $('#app').hidden = false;
  paintStatus(await res.json());
  loaded = {};
  showView('dash');
}

$('#gate-go').addEventListener('click', () => unlock($('#gate-token').value.trim()));
$('#gate-token').addEventListener('keydown', e => {
  if (e.key === 'Enter') unlock($('#gate-token').value.trim());
});

/* 저장된 토큰이 있으면 바로 들어간다 — 없으면 입력 화면에 머문다 */
if (TOKEN) unlock(TOKEN);
else $('#gate-token').focus();
