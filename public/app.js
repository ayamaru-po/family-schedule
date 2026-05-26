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
let pendingImageFile = null;   // 選択済みだが未アップロードのファイル
let currentImageUrl  = null;   // 保存済みまたは新規アップロードのURL

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
/* ===========================
   Image helpers
   =========================== */
function compressImage(file, maxWidth, quality) {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.width, h = img.height;
      if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob => resolve(blob), 'image/jpeg', quality);
    };
    img.src = url;
  });
}

async function uploadImageFile(file) {
  const compressed = await compressImage(file, 1200, 0.8);
  const fd = new FormData();
  fd.append('file', compressed, 'photo.jpg');
  const resp = await fetch(`${BASE_URL}/api/upload`, { method: 'POST', body: fd });
  if (!resp.ok) throw new Error('画像のアップロードに失敗しました');
  const data = await resp.json();
  return data.url;
}

function showImagePreview(src) {
  document.getElementById('imageUploadArea').style.display = 'none';
  const wrap = document.getElementById('imagePreviewWrap');
  wrap.style.display = '';
  document.getElementById('imagePreviewEl').src = src;
}

function resetImageUI() {
  pendingImageFile = null;
  currentImageUrl  = null;
  document.getElementById('imageUploadArea').style.display = '';
  document.getElementById('imagePreviewWrap').style.display = 'none';
  document.getElementById('imagePreviewEl').src = '';
  document.getElementById('eventImage').value = '';
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

  // 写真
  const imgWrap = document.getElementById('detailImageWrap');
  if (ev.imageUrl) {
    imgWrap.style.display = '';
    document.getElementById('detailImageEl').src = ev.imageUrl;
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
  if (ev.imageUrl) {
    currentImageUrl = ev.imageUrl;
    showImagePreview(ev.imageUrl);
  }
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
    // 画像が選択されていればまずアップロード
    if (pendingImageFile) {
      saveBtn.textContent = '写真をアップロード中...';
      currentImageUrl = await uploadImageFile(pendingImageFile);
    }
    data.imageUrl = currentImageUrl || null;
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
document.getElementById('detailCloseBtn').addEventListener('click', closeModal);

// 画像選択
document.getElementById('imageUploadBtn').addEventListener('click', () => {
  document.getElementById('eventImage').click();
});
document.getElementById('eventImage').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  pendingImageFile = file;
  currentImageUrl  = null;
  const reader = new FileReader();
  reader.onload = ev => showImagePreview(ev.target.result);
  reader.readAsDataURL(file);
});
document.getElementById('imageRemoveBtn').addEventListener('click', () => {
  resetImageUI();
});

// 詳細の写真タップで拡大
document.getElementById('detailImageEl').addEventListener('click', function() {
  this.classList.toggle('zoomed');
});
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
