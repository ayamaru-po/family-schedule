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

const BASE_URL = `${location.protocol}//${location.hostname}:${location.port || 3000}`;

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
function renderCalendar() {
  const y = currentDate.getFullYear();
  const m = currentDate.getMonth();
  document.getElementById('monthTitle').textContent = `${y}年 ${m+1}月`;

  const grid = document.getElementById('calendarGrid');
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
    const cls = ['day-cell',
      other            ? 'other-month' : '',
      ds === todayStr  ? 'today'       : '',
      ds === selectedDate ? 'selected' : '',
      dow === 0        ? 'sunday'      : '',
      dow === 6        ? 'saturday'    : '',
    ].filter(Boolean).join(' ');

    const cell = document.createElement('div');
    cell.className = cls;
    cell.dataset.date = ds;

    const num = document.createElement('div');
    num.className = 'day-num';
    num.textContent = d.getDate();
    cell.appendChild(num);

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
      chip.addEventListener('click', e => { e.stopPropagation(); openEdit(ev); });
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
    item.addEventListener('click', () => openEdit(ev));
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
    item.addEventListener('click', () => openEdit(ev));
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
        // 最低1人は必ず選択
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
function openAdd(dateStr) {
  editingId = null;
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
  saveBtn.textContent = '保存中...';
  try {
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
  currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth()-1, 1);
  renderAll();
});
document.getElementById('nextMonth').addEventListener('click', () => {
  currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth()+1, 1);
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
document.getElementById('modalOverlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});
document.getElementById('currentUser').addEventListener('change', e => {
  currentUser = e.target.value;
});

/* ===========================
   Init
   =========================== */
async function init() {
  renderUserSelect();
  renderLegend();
  renderFilters();
  updateDateDisplay();
  setStatus(false);
  await fetchEvents();
  connectSSE();
}

init();
