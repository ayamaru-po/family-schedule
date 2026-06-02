/* ===========================
   Members
   =========================== */
const MEMBERS = [
  { id: '貴之',   name: '貴之',   color: '#7C4DFF', initial: '貴' },
  { id: '亜耶',   name: '亜耶',   color: '#29B6F6', initial: '亜' },
  { id: '凌',    name: '凌',    color: '#1E6EE8', initial: '凌' },
  { id: '慶',    name: '慶',    color: '#26A869', initial: '慶' },
  { id: '家族全員', name: '家族全員', color: '#FF7043', initial: '全' },
];

/* ===========================
   Japanese National Holidays
   =========================== */
const HOLIDAYS = {
  // 2024
  '2024-01-01': '元日', '2024-01-08': '成人の日', '2024-02-11': '建国記念の日',
  '2024-02-12': '振替休日', '2024-02-23': '天皇誕生日', '2024-03-20': '春分の日',
  '2024-04-29': '昭和の日', '2024-05-03': '憲法記念日', '2024-05-04': 'みどりの日',
  '2024-05-05': 'こどもの日', '2024-05-06': '振替休日', '2024-07-15': '海の日',
  '2024-08-11': '山の日', '2024-08-12': '振替休日', '2024-09-16': '敬老の日',
  '2024-09-22': '振替休日', '2024-09-23': '秋分の日', '2024-10-14': 'スポーツの日',
  '2024-11-03': '文化の日', '2024-11-04': '振替休日', '2024-11-23': '勤労感謝の日',
  // 2025
  '2025-01-01': '元日', '2025-01-13': '成人の日', '2025-02-11': '建国記念の日',
  '2025-02-23': '天皇誕生日', '2025-02-24': '振替休日', '2025-03-20': '春分の日',
  '2025-04-29': '昭和の日', '2025-05-03': '憲法記念日', '2025-05-04': 'みどりの日',
  '2025-05-05': 'こどもの日', '2025-05-06': '振替休日', '2025-07-21': '海の日',
  '2025-08-11': '山の日', '2025-09-15': '敬老の日', '2025-09-22': '秋分の日（予）',
  '2025-09-23': '振替休日', '2025-10-13': 'スポーツの日', '2025-11-03': '文化の日',
  '2025-11-23': '勤労感謝の日', '2025-11-24': '振替休日',
  // 2026
  '2026-01-01': '元日', '2026-01-12': '成人の日', '2026-02-11': '建国記念の日',
  '2026-02-23': '天皇誕生日', '2026-03-20': '春分の日', '2026-04-29': '昭和の日',
  '2026-05-03': '憲法記念日', '2026-05-04': 'みどりの日', '2026-05-05': 'こどもの日',
  '2026-07-20': '海の日', '2026-08-11': '山の日', '2026-09-21': '敬老の日',
  '2026-09-22': '国民の休日', '2026-09-23': '秋分の日', '2026-10-12': 'スポーツの日',
  '2026-11-03': '文化の日', '2026-11-23': '勤労感謝の日',
  // 2027
  '2027-01-01': '元日', '2027-01-11': '成人の日', '2027-02-11': '建国記念の日',
  '2027-02-23': '天皇誕生日', '2027-03-21': '春分の日', '2027-03-22': '振替休日',
  '2027-04-29': '昭和の日', '2027-05-03': '憲法記念日', '2027-05-04': 'みどりの日',
  '2027-05-05': 'こどもの日', '2027-07-19': '海の日', '2027-08-11': '山の日',
  '2027-09-20': '敬老の日', '2027-09-23': '秋分の日', '2027-10-11': 'スポーツの日',
  '2027-11-03': '文化の日', '2027-11-23': '勤労感謝の日',
};

const BASE_URL = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? `http://${location.hostname}:${location.port || 3000}`
  : '';

/* ===========================
   State
   =========================== */
let events        = [];
let currentDate   = new Date();
let selectedDate  = toDateStr(new Date());
let currentUser   = '貴之';
let editingId     = null;
let activeFilters = new Set();
let sse           = null;
let sseTimer      = null;
let selectedMembers = ['貴之']; // 複数対応
let viewMode = 'month'; // 'month' | 'week'
let pendingImageFiles = [];    // 選択済みだが未アップロードのファイル群
let currentImageUrls  = [];   // 保存済みまたは新規アップロードのURL群
const MAX_IMAGES = 5;

/* ===========================
   Utilities
   =========================== */
function toDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function pad(n) { return String(n).padStart(2, '0'); }

function formatDateJP(str) {
  if (!str) return '';
  const [y, m, d] = str.split('-').map(Number);
  const dow = ['日','月','火','水','木','金','土'][new Date(y, m-1, d).getDay()];
  return `${m}月${d}日（${dow}）`;
}
function formatDateShort(str) {
  if (!str) return '';
  const [, m, d] = str.split('-').map(Number);
  return `${m}/${d}`;
}
function formatTime(t) { return t ? t.slice(0, 5) : ''; }

function colorOf(id) {
  return MEMBERS.find(m => m.id === id)?.color ?? '#888';
}

// イベントのメンバーを常に配列で返す（後方互換）
function membersOf(ev) {
  if (!ev.member) return [];
  return Array.isArray(ev.member) ? ev.member : [ev.member];
}

// チップ用の背景スタイルを返す（2色グラデーション対応）
function chipStyle(ev) {
  const ms = membersOf(ev);
  if (ms.length === 1) return { background: colorOf(ms[0]) };
  if (ms.length === 2) {
    return { background: `linear-gradient(90deg, ${colorOf(ms[0])} 50%, ${colorOf(ms[1])} 50%)` };
  }
  // 3人以上は1人目の色＋表示
  return { background: colorOf(ms[0]) };
}

/* ===========================
   API
   =========================== */
async function fetchEvents() {
  try {
    const r = await fetch(`${BASE_URL}/api/events`);
    events = await r.json();
    renderAll();
  } catch (e) { console.warn('fetch error', e); }
}

async function saveEvent(data) {
  const isEdit = Boolean(data.id);
  const r = await fetch(
    isEdit ? `${BASE_URL}/api/events/${data.id}` : `${BASE_URL}/api/events`,
    { method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data) }
  );
  if (!r.ok) throw new Error('保存に失敗しました');
  return r.json();
}

async function deleteEvent(id) {
  const r = await fetch(`${BASE_URL}/api/events/${id}`, { method: 'DELETE' });
  if (!r.ok) throw new Error('削除に失敗しました');
}

/* ===========================
   SSE (Server-Sent Events)
   =========================== */
function connectSSE() {
  if (sse) sse.close();
  try {
    sse = new EventSource(`${BASE_URL}/api/events/stream`);
    sse.onopen  = () => setStatus(true);
    sse.onerror = () => {
      setStatus(false);
      sse.close();
      sseTimer = setTimeout(connectSSE, 4500);
    };
    sse.onmessage = ({ data }) => {
      const msg = JSON.parse(data);
      if (msg.type === 'add') {
        if (!events.find(e => e.id === msg.event.id)) events.push(msg.event);
      } else if (msg.type === 'update') {
        const i = events.findIndex(e => e.id === msg.event.id);
        if (i >= 0) events[i] = msg.event;
      } else if (msg.type === 'delete') {
        events = events.filter(e => e.id !== msg.id);
      }
      renderAll();
    };
  } catch { setStatus(false); }
}

function setStatus(ok) {
  const el = document.getElementById('connectionStatus');
  el.className = 'connection-badge' + (ok ? '' : ' offline');
  el.querySelector('.connection-text').textContent = ok ? '同期中' : 'オフライン';
}

/* ===========================
   Visible events (filtered)
   =========================== */
function visible() {
  if (!activeFilters.size) return events;
  return events.filter(e => membersOf(e).some(m => activeFilters.has(m)));
}

/* ===========================
   Render – all
   =========================== */
function renderAll() {
  renderCalendar();
  renderDayEvents();
  renderUpcoming();
}

/* ===========================
   Render – calendar
   =========================== */
function getWeekDates(base) {
  const d = new Date(base);
  d.setDate(d.getDate() - d.getDay()); // 週の日曜日
  return Array.from({ length: 7 }, (_, i) => {
    const dd = new Date(d);
    dd.setDate(d.getDate() + i);
    return dd;
  });
}

function renderCalendar() {
  if (viewMode === 'week') { renderWeekView(); return; }

  const y = currentDate.getFullYear();
  const m = currentDate.getMonth();
  document.getElementById('monthTitle').textContent = `${y}年 ${m+1}月`;

  const grid = document.getElementById('calendarGrid');
  grid.className = 'calendar-grid';
  const headers = Array.from(grid.querySelectorAll('.day-header'));
  grid.innerHTML = '';
  headers.forEach(h => grid.appendChild(h));

  const firstDow  = new Date(y, m, 1).getDay();
  const lastDate  = new Date(y, m+1, 0).getDate();
  const prevLast  = new Date(y, m, 0).getDate();
  const todayStr  = toDateStr(new Date());
  const vis       = visible();

  const cells = [];
  for (let i = firstDow-1; i >= 0; i--)
    cells.push({ d: new Date(y, m-1, prevLast-i), other: true });
  for (let d = 1; d <= lastDate; d++)
    cells.push({ d: new Date(y, m, d), other: false });
  while (cells.length < 42)
    cells.push({ d: new Date(y, m+1, cells.length - firstDow - lastDate + 1), other: true });

  cells.forEach(({ d, other }) => {
    const ds  = toDateStr(d);
    const dow = d.getDay();
    const isHoliday = !!HOLIDAYS[ds];
    const cls = ['day-cell',
      other            ? 'other-month' : '',
      ds === todayStr  ? 'today'       : '',
      ds === selectedDate ? 'selected' : '',
      dow === 0        ? 'sunday'      : '',
      dow === 6        ? 'saturday'    : '',
      isHoliday        ? 'holiday'     : '',
    ].filter(Boolean).join(' ');

    const cell = document.createElement('div');
    cell.className = cls;
    cell.dataset.date = ds;

    const num = document.createElement('div');
    num.className = 'day-num';
    num.textContent = d.getDate();
    cell.appendChild(num);

    if (isHoliday && !other) {
      const hl = document.createElement('div');
      hl.className = 'holiday-label';
      hl.textContent = HOLIDAYS[ds];
      cell.appendChild(hl);
    }

    const dayEvs = vis.filter(ev =>
      ev.date === ds || (ev.endDate && ev.date <= ds && ev.endDate >= ds)
    );
    const MAX = 2;
    dayEvs.slice(0, MAX).forEach(ev => {
      const chip = document.createElement('div');
      chip.className = 'event-chip';
      const cs = chipStyle(ev);
      Object.assign(chip.style, cs);
      chip.textContent = (ev.startTime ? formatTime(ev.startTime) + ' ' : '') + ev.title;
      chip.addEventListener('click', e => { e.stopPropagation(); openDetail(ev); });
      cell.appendChild(chip);
    });
    if (dayEvs.length > MAX) {
      const more = document.createElement('div');
      more.className = 'more-chip';
      more.textContent = `+${dayEvs.length - MAX}`;
      cell.appendChild(more);
    }

    cell.addEventListener('click', () => {
      selectedDate = ds;
      document.querySelectorAll('.day-cell.selected')
        .forEach(c => c.classList.remove('selected'));
      cell.classList.add('selected');
      updateDateDisplay();
      renderDayEvents();
    });
    grid.appendChild(cell);
  });
}

function renderWeekView() {
  const weekDates = getWeekDates(currentDate);
  const first = weekDates[0], last = weekDates[6];
  const fmt = d => `${d.getMonth()+1}/${d.getDate()}`;
  document.getElementById('monthTitle').textContent =
    `${first.getFullYear()}年 ${fmt(first)} 〜 ${fmt(last)}`;

  const grid = document.getElementById('calendarGrid');
  grid.className = 'calendar-grid week-view';
  const headers = Array.from(grid.querySelectorAll('.day-header'));
  grid.innerHTML = '';
  headers.forEach(h => grid.appendChild(h));

  const todayStr = toDateStr(new Date());
  const vis = visible();

  weekDates.forEach(d => {
    const ds = toDateStr(d);
    const dow = d.getDay();
    const isHoliday = !!HOLIDAYS[ds];
    const cls = ['day-cell', 'week-day-cell',
      ds === todayStr    ? 'today'    : '',
      ds === selectedDate? 'selected' : '',
      dow === 0          ? 'sunday'   : '',
      dow === 6          ? 'saturday' : '',
      isHoliday          ? 'holiday'  : '',
    ].filter(Boolean).join(' ');

    const cell = document.createElement('div');
    cell.className = cls;
    cell.dataset.date = ds;

    const num = document.createElement('div');
    num.className = 'day-num';
    num.textContent = d.getDate();
    cell.appendChild(num);

    if (isHoliday) {
      const hl = document.createElement('div');
      hl.className = 'holiday-label';
      hl.textContent = HOLIDAYS[ds];
      cell.appendChild(hl);
    }

    // 週ビューは全件表示（上限なし）
    const dayEvs = vis.filter(ev =>
      ev.date === ds || (ev.endDate && ev.date <= ds && ev.endDate >= ds)
    ).sort((a, b) => (a.startTime||'99').localeCompare(b.startTime||'99'));

    dayEvs.forEach(ev => {
      const chip = document.createElement('div');
      chip.className = 'event-chip';
      Object.assign(chip.style, chipStyle(ev));
      chip.textContent = (ev.startTime ? formatTime(ev.startTime) + ' ' : '') + ev.title;
      chip.addEventListener('click', e => { e.stopPropagation(); openDetail(ev); });
      cell.appendChild(chip);
    });

    cell.addEventListener('click', () => {
      selectedDate = ds;
      updateDateDisplay();
      renderDayEvents();
      document.querySelectorAll('.day-cell').forEach(c =>
        c.classList.toggle('selected', c.dataset.date === ds));
    });
    grid.appendChild(cell);
  });
}

/* ===========================
   Render – day events (sidebar)
   =========================== */
function renderDayEvents() {
  const container = document.getElementById('dayEvents');
  const vis = visible();
  const dayEvs = vis
    .filter(ev =>
      ev.date === selectedDate ||
      (ev.endDate && ev.date <= selectedDate && ev.endDate >= selectedDate)
    )
    .sort((a, b) => (a.startTime||'99').localeCompare(b.startTime||'99'));

  if (!dayEvs.length) {
    container.innerHTML = `
      <div class="no-events-wrap">
        <div class="no-events-icon">🐙</div>
        <div class="no-events-text">予定はありません</div>
        <div class="no-events-hint">＋ ボタンで追加しよう！</div>
      </div>`;
    return;
  }
  container.innerHTML = '';
  dayEvs.forEach(ev => {
    const item = document.createElement('div');
    item.className = 'day-event-item';

    const bar = document.createElement('div');
    bar.className = 'day-event-bar';
    const cs = chipStyle(ev);
    Object.assign(bar.style, cs);

    const info = document.createElement('div');
    info.className = 'day-event-info';

    const title = document.createElement('div');
    title.className = 'day-event-title';
    title.textContent = ev.title;

    const meta = document.createElement('div');
    meta.className = 'day-event-meta';

    // 複数メンバータグを表示
    membersOf(ev).forEach(m => {
      const tag = document.createElement('span');
      tag.className = 'day-event-member-tag';
      tag.style.background = colorOf(m);
      tag.textContent = m;
      meta.appendChild(tag);
    });

    if (ev.startTime) {
      const t = document.createElement('span');
      t.className = 'day-event-time';
      t.textContent = formatTime(ev.startTime) + (ev.endTime ? ' 〜 ' + formatTime(ev.endTime) : '');
      meta.appendChild(t);
    }
    if (ev.note) {
      const n = document.createElement('span');
      n.className = 'day-event-note';
      n.textContent = ev.note;
      meta.appendChild(n);
    }

    info.appendChild(title);
    info.appendChild(meta);
    item.appendChild(bar);
    item.appendChild(info);
    item.addEventListener('click', () => openDetail(ev));
    container.appendChild(item);
  });
}

/* ===========================
   Render – upcoming list
   =========================== */
function renderUpcoming() {
  const container = document.getElementById('upcomingEvents');
  const y = currentDate.getFullYear();
  const m = currentDate.getMonth();
  const first = toDateStr(new Date(y, m, 1));
  const last  = toDateStr(new Date(y, m+1, 0));
  const today = toDateStr(new Date());
  const vis   = visible();

  const list = vis
    .filter(ev => ev.date >= first && ev.date <= last)
    .sort((a, b) => (a.date+(a.startTime||'')).localeCompare(b.date+(b.startTime||'')));

  if (!list.length) {
    container.innerHTML = `<div class="no-events-wrap"><div class="no-events-icon">🏠</div><div class="no-events-text">今月の予定はありません</div></div>`;
    return;
  }
  container.innerHTML = '';
  list.forEach(ev => {
    const item = document.createElement('div');
    item.className = 'upcoming-item' + (ev.date < today ? ' past' : '');

    const dot = document.createElement('div');
    dot.className = 'upcoming-dot';
    dot.style.background = colorOf(ev.member);

    const date = document.createElement('div');
    date.className = 'upcoming-date';
    date.textContent = formatDateShort(ev.date);

    const t = document.createElement('div');
    t.className = 'upcoming-title';
    t.textContent = ev.title;

    item.appendChild(dot);
    item.appendChild(date);
    item.appendChild(t);
    item.addEventListener('click', () => openDetail(ev));
    container.appendChild(item);
  });
}

/* ===========================
   Render – member filters
   =========================== */
function renderFilters() {
  const c = document.getElementById('memberFilters');
  c.innerHTML = '';

  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  allBtn.className = 'filter-btn' + (!activeFilters.size ? ' active' : '');
  if (!activeFilters.size) allBtn.style.background = '#706C63';
  allBtn.textContent = '全員';
  allBtn.addEventListener('click', () => {
    activeFilters.clear();
    renderFilters();
    renderAll();
  });
  c.appendChild(allBtn);

  MEMBERS.forEach(m => {
    const btn = document.createElement('button');
    btn.type = 'button';
    const on = activeFilters.has(m.id);
    btn.className = 'filter-btn' + (on ? ' active' : '');
    if (on) btn.style.background = m.color;

    const dot = document.createElement('span');
    dot.className = 'filter-dot';
    dot.style.background = m.color;
    btn.appendChild(dot);
    btn.appendChild(document.createTextNode(m.name));

    btn.addEventListener('click', () => {
      activeFilters.has(m.id) ? activeFilters.delete(m.id) : activeFilters.add(m.id);
      renderFilters();
      renderAll();
    });
    c.appendChild(btn);
  });
}

/* ===========================
   Render – member legend
   =========================== */
function renderLegend() {
  const c = document.getElementById('memberLegend');
  c.innerHTML = '';
  MEMBERS.forEach(m => {
    const item = document.createElement('div');
    item.className = 'legend-item';
    const av = document.createElement('div');
    av.className = 'legend-avatar';
    av.style.background = m.color;
    av.textContent = m.initial;
    const name = document.createElement('span');
    name.className = 'legend-name';
    name.textContent = m.name;
    item.appendChild(av);
    item.appendChild(name);
    c.appendChild(item);
  });
}

/* ===========================
   Render – user select
   =========================== */
function renderUserSelect() {
  const sel = document.getElementById('currentUser');
  sel.innerHTML = '';
  MEMBERS.filter(m => m.id !== '家族全員').forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.name;
    if (m.id === currentUser) opt.selected = true;
    sel.appendChild(opt);
  });
}

/* ===========================
   Render – member options (modal) ※複数選択対応
   =========================== */
function renderMemberOptions(selected) {
  // selected は string または array
  selectedMembers = Array.isArray(selected)
    ? [...selected]
    : [selected || currentUser];

  const c = document.getElementById('memberSelect');
  c.innerHTML = '';

  // 固定メンバー
  MEMBERS.forEach(m => {
    const btn = document.createElement('button');
    btn.type = 'button';
    const isActive = selectedMembers.includes(m.id);
    btn.className = 'member-option' + (isActive ? ' active' : '');
    btn.style.setProperty('--member-color', m.color);

    const av = document.createElement('div');
    av.className = 'member-option-avatar';
    av.style.background = m.color;
    av.textContent = m.initial;

    const name = document.createElement('div');
    name.className = 'member-option-name';
    name.textContent = m.name;

    btn.appendChild(av);
    btn.appendChild(name);
    btn.addEventListener('click', () => {
      const idx = selectedMembers.indexOf(m.id);
      if (idx >= 0) {
        if (selectedMembers.length > 1) {
          selectedMembers.splice(idx, 1);
          btn.classList.remove('active');
        }
      } else {
        selectedMembers.push(m.id);
        btn.classList.add('active');
      }
    });
    c.appendChild(btn);
  });

  // カスタムメンバー（固定メンバー以外で選択済みのもの）
  const fixedIds = MEMBERS.map(m => m.id);
  const customMembers = selectedMembers.filter(id => !fixedIds.includes(id));
  customMembers.forEach(id => renderCustomMemberChip(c, id));

  // 「その他＋」ボタン
  const otherWrap = document.createElement('div');
  otherWrap.className = 'member-other-wrap';

  const otherBtn = document.createElement('button');
  otherBtn.type = 'button';
  otherBtn.className = 'member-option member-other-btn';
  otherBtn.innerHTML = '<div class="member-option-avatar" style="background:#9E9E9E">他</div><div class="member-option-name">その他</div>';
  otherBtn.addEventListener('click', () => {
    inp.style.display = '';
    inp.focus();
    otherBtn.style.display = 'none';
  });

  const inp = document.createElement('input');
  inp.type = 'text';
  inp.className = 'form-input member-other-input';
  inp.placeholder = '名前を入力（例：おじいちゃん）';
  inp.style.display = 'none';

  const addCustom = () => {
    const val = inp.value.trim();
    if (val && !selectedMembers.includes(val)) {
      selectedMembers.push(val);
      renderCustomMemberChip(c, val, otherWrap);
    }
    inp.value = '';
    inp.style.display = 'none';
    otherBtn.style.display = '';
  };
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } });
  inp.addEventListener('blur', addCustom);

  otherWrap.appendChild(otherBtn);
  otherWrap.appendChild(inp);
  c.appendChild(otherWrap);
}

function renderCustomMemberChip(container, id, before) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'member-option active';
  btn.style.setProperty('--member-color', '#9E9E9E');

  const av = document.createElement('div');
  av.className = 'member-option-avatar';
  av.style.background = '#9E9E9E';
  av.textContent = id.slice(0, 1);

  const name = document.createElement('div');
  name.className = 'member-option-name';
  name.textContent = id;

  const rm = document.createElement('span');
  rm.className = 'member-custom-remove';
  rm.textContent = '✕';
  rm.addEventListener('click', e => {
    e.stopPropagation();
    const idx = selectedMembers.indexOf(id);
    if (idx >= 0 && selectedMembers.length > 1) {
      selectedMembers.splice(idx, 1);
      btn.remove();
    }
  });

  btn.appendChild(av);
  btn.appendChild(name);
  btn.appendChild(rm);
  if (before) {
    container.insertBefore(btn, before);
  } else {
    container.appendChild(btn);
  }
}

/* ===========================
   Date display
   =========================== */
function updateDateDisplay() {
  document.getElementById('selectedDateDisplay').textContent = formatDateJP(selectedDate);
}

/* ===========================
   Modal
   =========================== */
/* ===========================
   Image helpers
   =========================== */
function compressImage(file, maxWidth, quality) {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    // 読み込み失敗（HEICなど）はオリジナルをそのまま使う
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.width, h = img.height;
      if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob => {
        // blobがnullまたは空の場合はオリジナルにフォールバック
        resolve((blob && blob.size > 0) ? blob : file);
      }, 'image/jpeg', quality);
    };
    img.src = url;
  });
}

async function uploadImageFile(file) {
  const compressed = await compressImage(file, 1200, 0.8);
  const uploadFile = (compressed instanceof Blob && !(compressed instanceof File))
    ? compressed
    : compressed;
  const fd = new FormData();
  fd.append('file', uploadFile, 'photo.jpg');
  const resp = await fetch(`${BASE_URL}/api/upload`, { method: 'POST', body: fd });
  if (!resp.ok) {
    let detail = '';
    try { const j = await resp.json(); detail = j.error || ''; } catch {}
    throw new Error('画像のアップロードに失敗しました' + (detail ? `\n(${detail})` : ''));
  }
  const data = await resp.json();
  return data.url;
}

// { type: 'pending', file, previewSrc } or { type: 'saved', url }
let imageSlots = [];

function renderImageGrid() {
  const grid = document.getElementById('multiImageGrid');
  const btn  = document.getElementById('imageUploadBtn');
  grid.innerHTML = '';
  imageSlots.forEach((slot, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'multi-img-thumb';
    const img = document.createElement('img');
    img.src = slot.type === 'pending' ? slot.previewSrc : slot.url;
    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'image-remove-btn';
    rm.textContent = '✕';
    rm.addEventListener('click', () => {
      imageSlots.splice(i, 1);
      renderImageGrid();
    });
    wrap.appendChild(img);
    wrap.appendChild(rm);
    grid.appendChild(wrap);
  });
  btn.style.display = imageSlots.length >= MAX_IMAGES ? 'none' : '';
}

function resetImageUI() {
  imageSlots = [];
  document.getElementById('eventImage').value = '';
  renderImageGrid();
}

function openDetail(ev) {
  document.getElementById('modalTitle').textContent = '予定の詳細';
  document.getElementById('eventForm').style.display = 'none';
  const detail = document.getElementById('eventDetail');
  detail.style.display = '';

  // メンバータグ
  const membersEl = document.getElementById('detailMembers');
  membersEl.innerHTML = '';
  membersOf(ev).forEach(m => {
    const tag = document.createElement('span');
    tag.className = 'day-event-member-tag';
    tag.style.background = colorOf(m);
    tag.textContent = m;
    membersEl.appendChild(tag);
  });

  // タイトル
  document.getElementById('detailTitle').textContent = ev.title;

  // 日付
  let dateText = formatDateJP(ev.date);
  if (ev.endDate && ev.endDate !== ev.date) dateText += ' 〜 ' + formatDateJP(ev.endDate);
  document.getElementById('detailDate').textContent = '📅 ' + dateText;

  // 時刻
  const timeEl = document.getElementById('detailTime');
  if (ev.startTime) {
    timeEl.style.display = '';
    timeEl.textContent = '🕐 ' + formatTime(ev.startTime) + (ev.endTime ? ' 〜 ' + formatTime(ev.endTime) : '');
  } else {
    timeEl.style.display = 'none';
  }

  // メモ
  const noteEl = document.getElementById('detailNote');
  if (ev.note) {
    noteEl.style.display = '';
    noteEl.textContent = '📝 ' + ev.note;
  } else {
    noteEl.style.display = 'none';
  }

  // 写真（複数枚対応・後方互換あり）
  const urls = getImageUrls(ev);
  const imgWrap = document.getElementById('detailImagesWrap');
  const imgGrid = document.getElementById('detailImgsGrid');
  imgGrid.innerHTML = '';
  if (urls.length) {
    imgWrap.style.display = '';
    urls.forEach(url => {
      const img = document.createElement('img');
      img.src = url;
      img.className = 'detail-img';
      img.alt = '添付写真';
      img.addEventListener('click', function() { this.classList.toggle('zoomed'); });
      imgGrid.appendChild(img);
    });
  } else {
    imgWrap.style.display = 'none';
  }

  // 編集ボタン
  document.getElementById('detailEditBtn').onclick = () => openEdit(ev);
  showModal();
}

function openAdd(dateStr) {
  editingId = null;
  resetImageUI();
  document.getElementById('eventDetail').style.display = 'none';
  document.getElementById('eventForm').style.display = '';
  document.getElementById('modalTitle').textContent = '予定を追加';
  document.getElementById('eventId').value = '';
  document.getElementById('eventTitle').value = '';
  document.getElementById('eventDate').value = dateStr || selectedDate;
  document.getElementById('eventEndDate').value = '';
  document.getElementById('eventStartTime').value = '';
  document.getElementById('eventEndTime').value = '';
  document.getElementById('eventNote').value = '';
  document.getElementById('deleteEventBtn').style.display = 'none';
  renderMemberOptions(currentUser);
  showModal();
}

function openEdit(ev) {
  editingId = ev.id;
  // 画像状態をリセットしてから既存URLをセット
  resetImageUI();
  getImageUrls(ev).forEach(url => {
    imageSlots.push({ type: 'saved', url });
  });
  renderImageGrid();
  document.getElementById('eventDetail').style.display = 'none';
  document.getElementById('eventForm').style.display = '';
  document.getElementById('modalTitle').textContent = '予定を編集';
  document.getElementById('eventId').value = ev.id;
  document.getElementById('eventTitle').value = ev.title;
  document.getElementById('eventDate').value = ev.date;
  document.getElementById('eventEndDate').value = ev.endDate || '';
  document.getElementById('eventStartTime').value = ev.startTime || '';
  document.getElementById('eventEndTime').value = ev.endTime || '';
  document.getElementById('eventNote').value = ev.note || '';
  document.getElementById('deleteEventBtn').style.display = 'inline-flex';
  renderMemberOptions(membersOf(ev));
  showModal();
}

function showModal() {
  const ov = document.getElementById('modalOverlay');
  ov.style.display = 'flex';
  requestAnimationFrame(() => document.getElementById('eventTitle').focus());
}

function closeModal() {
  document.getElementById('modalOverlay').style.display = 'none';
  document.getElementById('eventDetail').style.display = 'none';
  document.getElementById('eventForm').style.display = '';
  resetImageUI();
}

/* ===========================
   Form submit
   =========================== */
document.getElementById('eventForm').addEventListener('submit', async e => {
  e.preventDefault();
  const data = {
    title:     document.getElementById('eventTitle').value.trim(),
    date:      document.getElementById('eventDate').value,
    endDate:   document.getElementById('eventEndDate').value || null,
    startTime: document.getElementById('eventStartTime').value || null,
    endTime:   document.getElementById('eventEndTime').value || null,
    member:    selectedMembers.length === 1 ? selectedMembers[0] : selectedMembers,
    note:      document.getElementById('eventNote').value.trim() || null,
    addedBy:   currentUser,
  };
  if (editingId) data.id = editingId;

  const saveBtn = document.getElementById('saveBtn');
  saveBtn.disabled = true;
  try {
    // 未アップロードの画像をアップロード
    const pendingSlots = imageSlots.filter(s => s.type === 'pending');
    if (pendingSlots.length) {
      saveBtn.textContent = `写真をアップロード中... (0/${pendingSlots.length})`;
      for (let i = 0; i < pendingSlots.length; i++) {
        saveBtn.textContent = `写真をアップロード中... (${i+1}/${pendingSlots.length})`;
        const url = await uploadImageFile(pendingSlots[i].file);
        pendingSlots[i].type = 'saved';
        pendingSlots[i].url  = url;
      }
    }
    const urls = imageSlots.filter(s => s.type === 'saved').map(s => s.url);
    data.imageUrls = urls.length ? JSON.stringify(urls) : null;
    data.imageUrl  = urls[0] || null; // 後方互換
    saveBtn.textContent = '保存中...';
    const saved = await saveEvent(data);
    if (editingId) {
      const i = events.findIndex(ev => ev.id === editingId);
      if (i >= 0) events[i] = saved; else events.push(saved);
    } else {
      if (!events.find(ev => ev.id === saved.id)) events.push(saved);
    }
    renderAll();
    closeModal();
  } catch (err) {
    alert(err.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = '保存する';
  }
});

document.getElementById('deleteEventBtn').addEventListener('click', async () => {
  if (!editingId || !confirm('この予定を削除しますか？')) return;
  try {
    await deleteEvent(editingId);
    events = events.filter(ev => ev.id !== editingId);
    renderAll();
    closeModal();
  } catch (err) { alert(err.message); }
});

/* ===========================
   Navigation listeners
   =========================== */
document.getElementById('prevMonth').addEventListener('click', () => {
  if (viewMode === 'week') {
    currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() - 7);
  } else {
    currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth()-1, 1);
  }
  renderAll();
});
document.getElementById('nextMonth').addEventListener('click', () => {
  if (viewMode === 'week') {
    currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() + 7);
  } else {
    currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth()+1, 1);
  }
  renderAll();
});
document.getElementById('viewMonthBtn').addEventListener('click', () => {
  viewMode = 'month';
  document.getElementById('viewMonthBtn').classList.add('active');
  document.getElementById('viewWeekBtn').classList.remove('active');
  renderAll();
});
document.getElementById('viewWeekBtn').addEventListener('click', () => {
  viewMode = 'week';
  document.getElementById('viewWeekBtn').classList.add('active');
  document.getElementById('viewMonthBtn').classList.remove('active');
  renderAll();
});
document.getElementById('todayBtn').addEventListener('click', () => {
  currentDate  = new Date();
  selectedDate = toDateStr(currentDate);
  updateDateDisplay();
  renderAll();
});
document.getElementById('addEventBtn').addEventListener('click', () => openAdd());
document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('cancelBtn').addEventListener('click', closeModal);
document.getElementById('detailCloseBtn').addEventListener('click', closeModal);

// 画像URLを取得（後方互換: imageUrls → imageUrl の順で参照）
function getImageUrls(ev) {
  if (ev.imageUrls) {
    try { return JSON.parse(ev.imageUrls); } catch(e) {}
  }
  if (ev.imageUrl) return [ev.imageUrl];
  return [];
}

// 画像選択
document.getElementById('imageUploadBtn').addEventListener('click', () => {
  document.getElementById('eventImage').click();
});
document.getElementById('eventImage').addEventListener('change', e => {
  const files = Array.from(e.target.files);
  const remaining = MAX_IMAGES - imageSlots.length;
  if (!files.length || remaining <= 0) return;
  files.slice(0, remaining).forEach(file => {
    const reader = new FileReader();
    reader.onload = ev => {
      imageSlots.push({ type: 'pending', file, previewSrc: ev.target.result });
      renderImageGrid();
    };
    reader.readAsDataURL(file);
  });
  document.getElementById('eventImage').value = '';
});
document.getElementById('modalOverlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

// 画面全体のスワイプで月移動
let _swipeX = 0, _swipeY = 0;
document.addEventListener('touchstart', e => {
  _swipeX = e.touches[0].clientX;
  _swipeY = e.touches[0].clientY;
}, { passive: true });
document.addEventListener('touchend', e => {
  // モーダルが開いているときは無視
  if (document.getElementById('modalOverlay').style.display !== 'none') return;
  const dx = e.changedTouches[0].clientX - _swipeX;
  const dy = e.changedTouches[0].clientY - _swipeY;
  // 横スワイプ（縦より横が大きく40px以上）
  if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
    if (viewMode === 'week') {
      const days = dx < 0 ? 7 : -7;
      currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() + days);
    } else {
      currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + (dx < 0 ? 1 : -1), 1);
    }
    renderAll();
  }
}, { passive: true });
document.getElementById('currentUser').addEventListener('change', e => {
  currentUser = e.target.value;
});

/* ===========================
   Push Notifications
   =========================== */
function updateBellBtn() {
  const btn = document.getElementById('bellBtn');
  if (!btn) return;
  if (!('Notification' in window)) { btn.style.display = 'none'; return; }
  const perm = Notification.permission;
  btn.classList.remove('enabled', 'denied');
  if (perm === 'granted') {
    btn.classList.add('enabled');
    btn.title = '通知は有効です';
  } else if (perm === 'denied') {
    btn.classList.add('denied');
    btn.title = '通知がブロックされています（設定から許可してください）';
  } else {
    btn.title = 'タップして通知を有効にする';
  }
}

async function setupPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  if (Notification.permission === 'denied') {
    alert('通知がブロックされています。\niPhoneの場合：設定 → Safari → 通知 → このサイトを許可してください。');
    return;
  }
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    const perm = await Notification.requestPermission();
    updateBellBtn();
    if (perm !== 'granted') return;

    // 既に購読済みか確認
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      // VAPID公開鍵を取得
      const cfg = await fetch(`${BASE_URL}/api/config`).then(r => r.json());
      if (!cfg.vapidPublicKey) return;
      const key = urlBase64ToUint8Array(cfg.vapidPublicKey);
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key
      });
    }
    // サーバーに購読情報を送信
    const subJson = sub.toJSON();
    await fetch(`${BASE_URL}/api/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: subJson.endpoint,
        p256dh:   subJson.keys.p256dh,
        auth:     subJson.keys.auth,
        userName: currentUser
      })
    });
  } catch(e) {
    console.log('Push setup error:', e);
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

/* ===========================
   自分の名前を選ぶ（初回起動時）
   =========================== */
function askMyName() {
  return new Promise(resolve => {
    const saved = localStorage.getItem('myName');
    if (saved) { resolve(saved); return; }

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;';

    const box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:20px;padding:28px 24px;width:300px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.18);';
    box.innerHTML = `
      <div style="font-size:32px;margin-bottom:8px">👤</div>
      <div style="font-size:17px;font-weight:700;margin-bottom:18px">あなたは誰ですか？</div>
      <div id="nameChoices" style="display:flex;flex-direction:column;gap:10px;"></div>
    `;
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const choices = document.getElementById('nameChoices');
    MEMBERS.filter(m => m.id !== '家族全員').forEach(m => {
      const btn = document.createElement('button');
      btn.textContent = m.name;
      btn.style.cssText = `padding:12px;border-radius:12px;border:none;background:${m.color};color:#fff;font-size:15px;font-weight:700;cursor:pointer;`;
      btn.addEventListener('click', () => {
        localStorage.setItem('myName', m.id);
        document.body.removeChild(overlay);
        resolve(m.id);
      });
      choices.appendChild(btn);
    });
  });
}

/* ===========================
   Init
   =========================== */
async function init() {
  currentUser = await askMyName();
  renderUserSelect();
  renderLegend();
  renderFilters();
  updateDateDisplay();
  setStatus(false);
  await fetchEvents();
  connectSSE();
  updateBellBtn();
  // ベルボタンをタップしたときだけ通知許可を求める（iOS対応）
  const bellBtn = document.getElementById('bellBtn');
  if (bellBtn) {
    bellBtn.addEventListener('click', () => {
      if (Notification.permission === 'granted') {
        // 既に許可済みなら再購読だけ
        setupPush();
      } else {
        setupPush();
      }
    });
  }
}

init();
