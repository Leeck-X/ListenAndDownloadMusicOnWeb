'use strict';

/* ==================== 基础工具 ==================== */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const STATUS_CN = {
  pending: '等待中', running: '下载中', paused: '已暂停', cancelling: '取消中',
  cancelled: '已取消', done: '已完成', failed: '有失败',
};
const ITEM_CN = { pending: '待下载', running: '下载中', done: '完成', failed: '失败', cancelled: '已取消' };

const SVG_PATHS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="M20.5 20.5 16.4 16.4"/>',
  list: '<path d="M4 6h11M4 12h11M4 18h7"/><circle cx="17" cy="17" r="2.2"/><path d="M19.2 17V8.6"/>',
  heart: '<path d="M12 20.5S4.8 15.8 4.8 10.6A4.2 4.2 0 0 1 12 6.6a4.2 4.2 0 0 1 7.2 4c0 5.2-7.2 9.9-7.2 9.9Z"/>',
  tasks: '<path d="M4 7l1.6 1.6L8.6 5.6"/><path d="M11.5 7H20"/><path d="M4 13l1.6 1.6 3-3"/><path d="M11.5 13H20"/><path d="M4 19h6"/>',
  logs: '<path d="M6.5 3h7l4.5 4.5V20a1 1 0 0 1-1 1H6.5A1 1 0 0 1 5.5 20V4a1 1 0 0 1 1-1Z"/><path d="M13.5 3v5H18"/><path d="M9 13h6M9 17h4"/>',
  folder: '<path d="M4 7a1 1 0 0 1 1-1h4l2 2h7.5a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 3v2.6M12 18.4V21M3 12h2.6M18.4 12H21M5.6 5.6l1.9 1.9M16.5 16.5l1.9 1.9M18.4 5.6l-1.9 1.9M7.5 16.5l-1.9 1.9"/>',
  music: '<path d="M9.5 17.5V6.2l9-1.7v11.3"/><circle cx="6.8" cy="17.8" r="2.7"/><circle cx="15.8" cy="16" r="2.7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  download: '<path d="M12 4v11"/><path d="M8 11.5l4 4 4-4"/><path d="M5 19.5h14"/>',
  export: '<path d="M12 16V5"/><path d="M8 8.5l4-4 4 4"/><path d="M5 19.5h14"/>',
  repeat: '<path d="M5 8.5h11.5"/><path d="M14.5 6l3 2.5-3 2.5"/><path d="M19 15.5H7.5"/><path d="M9.5 13l-3 2.5 3 2.5"/>',
  one: '<path d="M5 8.5h11.5"/><path d="M14.5 6l3 2.5-3 2.5"/><path d="M19 15.5H7.5"/><path d="M9.5 13l-3 2.5 3 2.5"/><path d="M12 12.4v3.2"/>',
  shuffle: '<path d="M4 7h3.2l7.6 10H19"/><path d="M16.5 4.2L19 7l-2.5 2.8"/><path d="M4 17h3.2l2.6-3.4"/><path d="M13 8.6l1.8-1.6H19"/><path d="M16.5 14.2L19 17l-2.5 2.8"/>',
  volume: '<path d="M4.5 9.2h3l4-3v11.6l-4-3h-3Z"/><path d="M15 9.4a4 4 0 0 1 0 5.2"/>',
  mute: '<path d="M4.5 9.2h3l4-3v11.6l-4-3h-3Z"/><path d="M15 9.6l4.4 4.8M19.4 9.6L15 14.4"/>',
  prev: '<path d="M7 5.5v13M18.5 6.6v10.8L10 12z"/>',
  next: '<path d="M17 5.5v13M5.5 6.6v10.8L14 12z"/>',
  play: '<path d="M8 5.2v13.6L19 12z"/>',
  pause: '<path d="M8 5.4h3v13.2H8zM13 5.4h3v13.2h-3z"/>',
};
const FILLED_ICONS = new Set(['play', 'pause', 'prev', 'next']);
const ICON_IDS = {
  'btn-download': 'download', 'btn-export': 'export', 'btn-tasks': 'tasks',
  'btn-open-dir': 'folder', 'btn-settings': 'gear',
  'pl-prev': 'prev', 'pl-next': 'next',
  'pl-list': 'list', 'pw-prev': 'prev', 'pw-next': 'next',
};

function icon(name, size = 18) {
  const body = SVG_PATHS[name] || '';
  const paint = FILLED_ICONS.has(name)
    ? 'fill="currentColor" stroke="none"'
    : 'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" ${paint} aria-hidden="true">${body}</svg>`;
}

/* ==================== 全局状态 ==================== */
const S = {
  meta: null, cfg: null, account: null,
  scope: 'search',                     // 查询模式：search（关键词）| link（歌单 / 单曲链接、ID）
  view: 'download',
  keyword: '', offset: 0, hasMore: false, loading: false, lastText: '',
  songs: [], picked: new Set(), liked: new Set(),
  queue: [],                           // 播放列表：只能由用户显式添加
  tasks: [], queueOpen: false,
  logSeq: 0, logLevel: 'info', settingsTab: 'music',
  expandedTasks: new Set(),
  pwOpen: false, pwTab: 'lyric',
  qrTimer: null, pollTimer: null,
  play: { index: -1, mode: 'order', playing: false, muted: false, volume: 100,
          lyric: [], lyricKey: '', lastVolume: 100 },
  dismissedTask: null,                 // 已手动清空的下载进度（任务 id）
};

/* ==================== 接口与提示 ==================== */
async function api(path, payload, method = 'POST') {
  let url = path;
  if (method === 'GET' && payload) url += '?' + new URLSearchParams(payload).toString();
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'POST' ? JSON.stringify(payload || {}) : undefined,
  });
  let json;
  try { json = await res.json(); } catch (err) { throw new Error('响应不是合法 JSON'); }
  if (!json.ok) throw new Error(json.error || '请求失败');
  return json.data;
}

function esc(text) {
  return String(text ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function toast(message, type = '') {
  const node = document.createElement('div');
  node.className = 'toast ' + type;
  node.textContent = message;
  $('#toast-root').appendChild(node);
  setTimeout(() => node.remove(), 4200);
}

function labelOf(options, value) {
  const hit = (options || []).find(o => o.value === value);
  return hit ? hit.label : value;
}

function levelsOf(source) { return (S.meta?.levels_by_source || {})[source] || []; }

function levelInfo(source, level) {
  return levelsOf(source).find(o => o.value === level) || { label: level, encode: 'mp3' };
}

function encodeOf(source, level) { return levelInfo(source, level).encode || 'mp3'; }

/* 列表上方信息条左侧的提示：查询中 / 已加载 N 首 / 当前音源音质 */
function setQueryMeta(text) {
  const node = $('#list-status');
  if (!node) return;
  if (text !== undefined) { node.textContent = text; return; }
  const sourceLabel = labelOf(S.meta?.sources, S.cfg?.source);
  const info = levelInfo(S.cfg?.source, S.cfg?.level);
  node.textContent = `${sourceLabel} · ${info.label} · ${encodeOf(S.cfg?.source, S.cfg?.level).toUpperCase()}`;
}

/* ==================== 弹层与菜单 ==================== */
function modal(title, bodyHtml, footButtons = []) {
  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.innerHTML = `<div class="modal"><h3>${esc(title)}</h3><div class="modal-body">${bodyHtml}</div>
    <div class="modal-foot"></div></div>`;
  const foot = $('.modal-foot', mask);
  (footButtons || []).forEach(btn => {
    const node = document.createElement('button');
    node.textContent = btn.label;
    if (btn.primary) node.className = 'primary';
    node.addEventListener('click', () => btn.onClick(close, mask));
    foot.appendChild(node);
  });
  function close() { mask.remove(); }
  mask.addEventListener('click', ev => { if (ev.target === mask) close(); });
  $('#modal-root').appendChild(mask);
  return { mask, close, body: $('.modal-body', mask) };
}

function fillSelect(sel, options, value) {
  sel.innerHTML = options.map(opt =>
    `<option value="${esc(opt.value)}">${esc(opt.label)}</option>`).join('');
  if (value !== undefined) sel.value = value;
}

let activeMenu = null;

function hideMenu() {
  if (activeMenu) { activeMenu.remove(); activeMenu = null; }
}

function showMenu(items, opts = {}) {
  hideMenu();
  const box = document.createElement('div');
  box.className = 'menu';
  if (opts.anchor) box.dataset.anchor = opts.anchor;
  items.forEach(item => {
    if (item.separator) {
      const line = document.createElement('div');
      line.className = 'menu-sep';
      box.appendChild(line);
      return;
    }
    const node = document.createElement('button');
    node.className = 'menu-item';
    node.textContent = item.label;
    if (item.disabled) node.disabled = true;
    node.addEventListener('click', () => { hideMenu(); if (item.onClick) item.onClick(); });
    box.appendChild(node);
  });
  $('#menu-root').appendChild(box);

  const width = box.offsetWidth, height = box.offsetHeight;
  let left = opts.x ?? 0;
  let top = opts.y ?? 0;
  if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
  if (top + height > window.innerHeight - 8) top = Math.max(8, top - height - 4);
  box.style.left = left + 'px';
  box.style.top = top + 'px';
  activeMenu = box;
}

function bindMenuGuards() {
  document.addEventListener('click', ev => {
    if (ev.target.closest('.menu') || ev.target.closest('[data-menu]')) return;
    hideMenu();
  });
  document.addEventListener('contextmenu', ev => {
    if (!ev.target.closest('.song-list')) hideMenu();
  }, true);
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape') { hideMenu(); closeQueue(); } });
  document.addEventListener('scroll', hideMenu, true);
  window.addEventListener('resize', hideMenu);
}

/* ==================== 列表列定义与列宽拖拽 ==================== */
/* 默认宽度按「歌名 / 歌手 / 专辑长一些，时长 / 大小短一些」分配；
   缩小极限为默认宽度的一半，放大不设限（仅留一个上限防止拖出屏幕）。 */
const COLS = [
  { key: 'pick', label: '', width: 42 },
  { key: 'idx', label: '#', width: 56 },        // 宽度按当前列表最大序号自动计算
  { key: 'name', label: '歌名', width: 360 },
  { key: 'artists', label: '歌手', width: 180 },
  { key: 'album', label: '专辑', width: 180 },
  { key: 'dur', label: '时长', width: 78 },
  { key: 'size', label: '大小≈', width: 86 },
];
const FIXED_COLS = new Set(['pick', 'idx']);    // 不参与手动拖拽
const MIN_RATIO = 0.5;                          // 缩小极限 = 默认宽度的一半
const MAX_WIDTH = 2000;                         // 放大不设限（保留上限防止拖出屏幕）

function colMin(col) { return Math.round(col.width * MIN_RATIO); }

const COL_STORE = 'nmd.colWidths';
const colW = loadColWidths();

function loadColWidths() {
  const out = {};
  COLS.forEach(col => { out[col.key] = col.width; });
  try {
    const saved = JSON.parse(localStorage.getItem(COL_STORE) || '{}');
    COLS.forEach(col => {
      if (FIXED_COLS.has(col.key)) return;
      const width = Number(saved[col.key]);
      if (width) out[col.key] = Math.max(colMin(col), Math.min(MAX_WIDTH, width));
    });
  } catch (err) { /* 无本地存储时用默认列宽 */ }
  return out;
}

function saveColWidths() {
  const out = {};
  COLS.forEach(col => { if (!FIXED_COLS.has(col.key)) out[col.key] = colW[col.key]; });
  try { localStorage.setItem(COL_STORE, JSON.stringify(out)); } catch (err) { /* 忽略 */ }
}

/* 序号列：宽度按当前列表最大序号的位数固定，避免数字被省略号截断 */
function idxWidthFor(count) {
  const digits = String(Math.max(1, count)).length;
  return Math.max(46, 22 + digits * 9);
}

function tableMinWidth() { return COLS.reduce((sum, col) => sum + colW[col.key], 0); }

function resizeColumn(table, key, width) {
  colW[key] = width;
  const col = table.querySelector(`col[data-col="${key}"]`);
  if (col) col.style.width = width + 'px';
  table.style.minWidth = tableMinWidth() + 'px';
}

function bindColumnResize(container) {
  container.addEventListener('mousedown', ev => {
    const handle = ev.target.closest('.resizer');
    if (!handle) return;
    ev.preventDefault();
    ev.stopPropagation();
    const conf = COLS.find(col => col.key === handle.dataset.col);
    const table = container.querySelector('table');
    if (!conf || !table || FIXED_COLS.has(conf.key)) return;
    const startX = ev.clientX, startWidth = colW[conf.key];
    document.body.classList.add('col-resizing');
    const onMove = move => {
      const width = Math.max(colMin(conf),
        Math.min(MAX_WIDTH, startWidth + (move.clientX - startX)));
      resizeColumn(table, conf.key, width);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.classList.remove('col-resizing');
      saveColWidths();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  container.addEventListener('dblclick', ev => {
    const handle = ev.target.closest('.resizer');
    if (!handle) return;
    ev.stopPropagation();
    const conf = COLS.find(col => col.key === handle.dataset.col);
    const table = container.querySelector('table');
    if (conf && table) { resizeColumn(table, conf.key, conf.width); saveColWidths(); }
  });
}

/* ==================== 一体式歌曲列表 ==================== */
function songRows(songs) {
  if (!songs.length) return '';
  const currentKey = currentSong()?.key;
  const rows = songs.map((song, index) => {
    const picked = S.picked.has(song.key) ? 'checked' : '';
    const liked = S.liked.has(song.key);
    const playing = song.key === currentKey;
    const cover = song.cover
      ? `<img class="cover" src="${esc(song.cover)}" loading="lazy" alt=""
           onerror="this.style.visibility='hidden'">`
      : '<span class="cover"></span>';
    return `<tr data-key="${esc(song.key)}" class="${playing ? 'playing' : ''}">
      <td class="pick"><input type="checkbox" data-pick ${picked}
        title="${picked ? '取消选择' : '选中该曲'}"></td>
      <td class="idx${liked ? ' liked' : ''}"${liked ? ' title="已喜欢的歌曲"' : ''}>${index + 1}</td>
      <td class="name" title="${esc(song.name)}"><div class="name-cell">${cover}
        <span class="name-txt">${esc(song.name)}</span>
        ${playing ? '<span class="playing-tag">播放中</span>' : ''}</div></td>
      <td title="${esc(song.artists)}">${esc(song.artists)}</td>
      <td title="${esc(song.album)}">${esc(song.album)}</td>
      <td class="num">${esc(song.duration_str)}</td>
      <td class="num" title="约 ${esc(song.size)}">${esc(song.size)}</td>
    </tr>`;
  }).join('');

  // 序号列宽度随当前列表最大序号固定，其余列用持久化的宽度
  colW.idx = idxWidthFor(songs.length);

  const cols = COLS.map(col =>
    `<col data-col="${col.key}" style="width:${colW[col.key]}px">`).join('');
  const heads = COLS.map(col => {
    if (col.key === 'pick') return '<th class="pick"></th>';
    const cls = (col.key === 'dur' || col.key === 'size') ? ' class="num"' : '';
    if (FIXED_COLS.has(col.key)) {
      return `<th${cls} data-col="${col.key}">${esc(col.label)}</th>`;
    }
    return `<th${cls} data-col="${col.key}">${esc(col.label)}
      <span class="resizer" data-col="${col.key}"
        title="拖动调整列宽（最小为默认一半，可任意拖长），双击恢复默认"></span></th>`;
  }).join('');

  return `<table class="song-table" style="min-width:${tableMinWidth()}px">
    <colgroup>${cols}</colgroup>
    <thead><tr>${heads}</tr></thead><tbody>${rows}</tbody></table>`;
}

/* 列表来源变化后统一刷新所有依赖列表的控件状态 */
function syncListControls() {
  const has = S.songs.length > 0;
  $('#btn-download').disabled = !has;   // 无列表时顶栏下载 / 导出不可用
  $('#btn-export').disabled = !has;
  renderSongBar();
}

function renderSongs() {
  const container = $('#song-list');
  container.classList.toggle('empty', !S.songs.length);
  container.innerHTML = S.songs.length ? songRows(S.songs) : emptyText();
  syncListControls();
}

function emptyText() {
  return S.scope === 'link'
    ? '粘贴歌单链接 / 歌单 ID / 单曲链接后回车加载'
    : '暂无内容，试试搜索或粘贴歌单链接';
}

function findSong(key) { return S.songs.find(song => song.key === key); }

/* 列表上方的信息条：左侧状态提示，右侧勾选统计与「全部播放」 */
function renderSongBar() {
  const has = S.songs.length > 0;
  $('#list-count').textContent = has ? `共 ${S.songs.length} 首` : '';
  $('#btn-play-all').hidden = !has;
  $('#btn-pick-all').hidden = !has;
  $('#list-pick').hidden = !has;
  const sep = $('#song-bar .sep');
  if (sep) sep.hidden = !has;
  updateBarHint();
}

/* 全选 / 清空勾选：范围始终是当前列表，任何模式下都可用 */
function togglePickAll() {
  const all = S.songs.length > 0 && S.songs.every(song => S.picked.has(song.key));
  if (all) S.picked.clear();
  else S.songs.forEach(song => S.picked.add(song.key));
  renderSongs();
  markPlayingRow();
}

function updateBarHint() {
  const hint = $('#list-pick');
  if (!hint) return;
  const picked = S.songs.filter(song => S.picked.has(song.key)).length;
  hint.textContent = picked ? `已选 ${picked} 首` : '';
  hint.hidden = !picked;
  const btn = $('#btn-pick-all');
  if (btn) btn.textContent = S.songs.length && picked === S.songs.length ? '清空勾选' : '全选';
  const sep = $('#song-bar .sep');
  if (sep) sep.hidden = !picked || !hint.textContent;
}

function togglePick(song) {
  if (S.picked.has(song.key)) S.picked.delete(song.key); else S.picked.add(song.key);
  renderSongs();
  markPlayingRow();
}

function markPlayingRow() {
  const key = currentSong()?.key;
  $$('#song-list tr[data-key]').forEach(tr => tr.classList.toggle('playing', tr.dataset.key === key));
}

function openDropdown(btn) {
  const picked = S.songs.filter(song => S.picked.has(song.key));
  const rect = btn.getBoundingClientRect();
  const anchor = { x: rect.left, y: rect.bottom + 4, anchor: btn.id };
  if (btn.dataset.menu === 'download') {
    showMenu([
      { label: `下载选中（${picked.length} 首）`, disabled: !picked.length,
        onClick: () => openDownloadDialog(picked) },
      { label: `下载全部（${S.songs.length} 首）`, onClick: () => openDownloadDialog(S.songs) },
    ], anchor);
    return;
  }
  const scope = picked.length ? picked : S.songs;
  const scopeLabel = picked.length ? `已选 ${picked.length} 首` : `全部 ${S.songs.length} 首`;
  showMenu([
    { label: `导出 CSV 表格 · ${scopeLabel}`, onClick: () => exportSongs(scope, 'csv') },
    { label: `导出 M3U 播放列表 · ${scopeLabel}`, onClick: () => exportSongs(scope, 'm3u') },
    { label: `导出 TXT 歌名清单 · ${scopeLabel}`, onClick: () => exportSongs(scope, 'txt') },
  ], anchor);
}

/* 顶栏下拉按钮：再次点击同一个按钮则收起 */
function toggleDropdown(btn) {
  if (activeMenu && activeMenu.dataset.anchor === btn.id) { hideMenu(); return; }
  openDropdown(btn);
}

async function copyText(text, label) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    const area = document.createElement('textarea');
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
  toast(`已复制${label}`, 'ok');
}

async function exportSongs(songs, format) {
  if (!songs.length) return;
  try {
    const data = await api('/api/export', { format, songs });
    const blob = new Blob([data.content], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = data.filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
    toast(`已导出 ${data.filename}`, 'ok');
  } catch (err) { toast(err.message, 'error'); }
}

/* ==================== 列表事件 ==================== */
function bindListArea() {
  const container = $('#song-list');

  container.addEventListener('dblclick', ev => {
    if (ev.target.closest('.pick') || ev.target.closest('.resizer')) return;
    const row = ev.target.closest('tr[data-key]');
    const song = row && findSong(row.dataset.key);
    if (song) playFromList(song.key);
  });

  container.addEventListener('contextmenu', ev => {
    const row = ev.target.closest('tr[data-key]');
    if (!row) return;
    ev.preventDefault();
    const song = findSong(row.dataset.key);
    if (!song) return;
    const picked = S.songs.filter(s => S.picked.has(s.key));
    const selected = S.picked.has(song.key);
    const playing = currentSong()?.key === song.key;
    showMenu([
      { label: playing ? '暂停' : '播放此曲', onClick: () => (playing ? togglePlay() : playFromList(song.key)) },
      { label: '下一首播放', onClick: () => addNextPlay(song) },
      { label: '添加到播放列表', onClick: () => appendToQueue(song) },
      { separator: true },
      { label: '查看详情', onClick: () => openDetail(song) },
      { label: '下载此曲', onClick: () => openDownloadDialog([song]) },
      { separator: true },
      { label: selected ? '取消选中' : '选中此曲', onClick: () => togglePick(song) },
      { label: `下载已选（${picked.length} 首）`, disabled: !picked.length,
        onClick: () => openDownloadDialog(picked) },
      { separator: true },
      { label: '复制歌名', onClick: () => copyText(song.name, '歌名') },
      { label: '复制「歌手 - 歌名」',
        onClick: () => copyText(`${song.artists} - ${song.name}`, '歌曲信息') },
      { label: '复制专辑名', onClick: () => copyText(song.album, '专辑名') },
    ], { x: ev.clientX, y: ev.clientY });
  });

  container.addEventListener('change', ev => {
    const box = ev.target;
    if (!box.matches('[data-pick]')) return;
    const song = findSong(box.closest('tr').dataset.key);
    if (!song) return;
    box.checked ? S.picked.add(song.key) : S.picked.delete(song.key);
    updateBarHint();
  });

  bindColumnResize(container);
  $('#btn-play-all').addEventListener('click', playAll);
  $('#btn-pick-all').addEventListener('click', togglePickAll);

  /* 滚动到底自动预加载下一页（仅关键词搜索） */
  $('#song-area').addEventListener('scroll', ev => {
    const el = ev.target;
    if (S.loading || !S.hasMore || !S.keyword) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 240) {
      S.loading = true;
      runQuery(true).finally(() => { S.loading = false; });
    }
  });

  bindMenuGuards();
}

/* ==================== 顶栏 / 模式切换 / 图标 ==================== */
function paintIcons() {
  $$('.icon-btn').forEach(btn => {
    const name = btn.dataset.icon || ICON_IDS[btn.id];
    if (!name) return;
    const slot = btn.querySelector('.icon-slot');
    if (slot) slot.innerHTML = icon(name);
    else btn.innerHTML = icon(name, btn.classList.contains('play') ? 22 : 18);
  });
}

function buildTopbar() {
  $('#btn-mode').addEventListener('click', () => setView(S.view === 'download' ? 'play' : 'download'));
  $('#btn-login').addEventListener('click', openLoginDialog);
  $('#btn-logout').addEventListener('click', async () => {
    try {
      await api('/api/logout', { source: S.cfg.source });
      toast('已退出登录', 'ok');
      await refreshAccount();
      S.liked.clear();
      renderSongs();
      markPlayingRow();
    } catch (err) { toast(err.message, 'error'); }
  });
  $('#btn-download').addEventListener('click', ev => { ev.stopPropagation(); toggleDropdown($('#btn-download')); });
  $('#btn-export').addEventListener('click', ev => { ev.stopPropagation(); toggleDropdown($('#btn-export')); });
  $('#btn-tasks').addEventListener('click', toggleTasks);
  $('#btn-open-dir').addEventListener('click', openDir);
  $('#btn-settings').addEventListener('click', openSettings);
  paintModeButton();
}

function setView(view) {
  S.view = view;
  $('#download-view').hidden = view !== 'download';
  $('#play-view').hidden = view !== 'play';
  paintModeButton();
  if (view === 'play') closePlayerWindow();
}

/* 高亮按钮上显示「当前模式」，点击切换到另一种模式 */
function paintModeButton() {
  const btn = $('#btn-mode');
  const download = S.view === 'download';
  btn.innerHTML = icon(download ? 'download' : 'music', 16)
    + `<span>${download ? '下载模式' : '播放器模式'}</span>`;
  btn.title = download ? '切换到播放器模式' : '切换到下载模式';
}

async function refreshAccount() {
  try {
    const data = await api('/api/account', { source: S.cfg.source }, 'GET');
    S.account = data;
    const text = $('#account-text'), login = $('#btn-login'), logout = $('#btn-logout');
    if (data.logged_in) {
      text.textContent = `${data.nickname}${data.vipType ? ' · VIP' : ''}`;
      text.classList.remove('muted');
      login.hidden = true; logout.hidden = false;
    } else {
      text.textContent = '未登录';
      text.classList.add('muted');
      login.hidden = false; logout.hidden = true;
    }
    // 未播放时用头像当默认封面；登录状态变化后同步刷新
    nowPlayingInfo(currentSong());
  } catch (err) { /* 账号校验失败不阻塞界面 */ }
}

/* ==================== 查询栏（共用输入 + 自动识别） ==================== */
function buildScopes() {
  const icons = { search: 'search', link: 'list' };
  $$('#scope-group .scope-btn[data-scope]').forEach(btn => {
    btn.querySelector('.icon-slot').innerHTML = icon(icons[btn.dataset.scope] || 'search');
    btn.addEventListener('click', () => setScope(btn.dataset.scope));
  });
  // 爱心并入左侧拨码开关组：点击加载「我喜欢的音乐」
  $('#btn-liked .icon-slot').innerHTML = icon('heart');
  $('#btn-liked').addEventListener('click', () => loadLiked());
  $('#btn-query').addEventListener('click', () => runQuery(false));
  $('#query-input').addEventListener('keydown', ev => { if (ev.key === 'Enter') runQuery(false); });
  $('#btn-my-playlists').addEventListener('click', openMyPlaylists);
}

/* 爱心高亮：仅在当前展示的是「我喜欢的音乐」时点亮 */
function setLikedActive(on) {
  $('#btn-liked').classList.toggle('on', !!on);
  if (!on) return;
  // 进入「我喜欢的音乐」时清掉搜索 / 歌单链接的选中状态，避免两个模式同时高亮
  $$('#scope-group .scope-btn[data-scope]').forEach(btn => btn.classList.remove('active'));
  S.scope = 'search';
  setScopePlaceholder('search');
}

/* 只更新高亮与按钮文字（不触发重新查询） */
function paintScope(scope) {
  S.scope = scope;
  $$('#scope-group .scope-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.scope === scope));
  $('#btn-query').textContent = scope === 'link' ? '加载' : '搜索';
}

function setScopePlaceholder(scope) {
  $('#query-input').placeholder = scope === 'link'
    ? '粘贴歌单链接 / 歌单 ID / 单曲链接，回车加载'
    : '搜索歌曲 / 歌手 / 专辑，或粘贴歌单链接、歌单 ID，回车搜索';
}

/* 人为点击模式按钮：切换后按新模式重新查询 */
function setScope(scope) {
  // 切回搜索 / 歌单模式即退出「我喜欢的音乐」状态（即使输入框为空也要清掉高亮）
  setLikedActive(false);
  paintScope(scope);
  setScopePlaceholder(scope);
  if ($('#query-input').value.trim()) runQuery(false, true);
}

function looksLikePlaylist(text) {
  if (/^https?:\/\//i.test(text)) return true;
  if (/[?&#]id=\d+/.test(text)) return true;
  return /^\d{5,}$/.test(text);
}

async function runQuery(append = false, forced = false) {
  const text = $('#query-input').value.trim();
  if (!text) { if (append) return; return toast('请输入搜索关键词、歌单链接或 ID', 'error'); }
  let asPlaylist;
  if (forced) {
    asPlaylist = S.scope === 'link';
  } else {
    asPlaylist = looksLikePlaylist(text);   // 提交时自动识别并调整高亮
    paintScope(asPlaylist ? 'link' : 'search');
  }
  if (append && (asPlaylist || !S.keyword)) return;
  if (!append) { S.picked.clear(); setLikedActive(false); }   // 新列表覆盖旧结果时，同步清空勾选状态

  setQueryMeta(append ? '正在加载更多…' : '查询中…');
  try {
    if (asPlaylist) {
      const data = await api('/api/playlist', { text });
      S.songs = data.songs;
      S.keyword = ''; S.offset = 0; S.hasMore = false;
      S.lastText = text;
      if (!forced) setScopePlaceholder('link');
      setQueryMeta(`${data.title} · ${data.songs.length} 首`);
    } else {
      if (!forced) setScopePlaceholder('search');
      const keyword = append ? S.keyword : text;
      S.keyword = keyword;
      S.lastText = text;
      const data = await api('/api/search', {
        keyword, limit: 50, offset: append ? S.offset : 0,
      });
      S.songs = append ? S.songs.concat(data.songs) : data.songs;
      S.offset = data.offset;
      S.hasMore = data.songs.length >= 50;
      setQueryMeta(`「${keyword}」已加载 ${S.songs.length} 首${S.hasMore ? '，滚动到底继续加载' : ''}`);
    }
    renderSongs();
    markPlayingRow();
  } catch (err) {
    toast(err.message, 'error');
    setQueryMeta();
  }
}

/* 音源 / 音质变化后：保留关键词，自动重新拉取并覆盖旧结果 */
async function replayQuery() {
  if (!S.lastText) { renderSongBar(); return; }
  $('#query-input').value = S.lastText;
  S.offset = 0;
  await runQuery(false);
}

/* ==================== 我喜欢 / 我的歌单 ==================== */
async function loadLiked() {
  setQueryMeta('加载我喜欢的音乐…');
  try {
    const data = await api('/api/liked', { source: S.cfg.source }, 'GET');
    S.songs = data.songs;
    S.picked.clear();
    S.keyword = ''; S.offset = 0; S.hasMore = false; S.lastText = '';
    setQueryMeta(`${data.title} · ${data.songs.length} 首`);
    setLikedActive(true);
    renderSongs();
    markPlayingRow();
  } catch (err) { toast(err.message, 'error'); setQueryMeta(); }
}

async function openMyPlaylists() {
  try {
    const rows = await api('/api/my_playlists', { source: S.cfg.source }, 'GET');
    if (!rows.length) return toast('当前账号没有歌单', 'error');
    const html = `<div class="picker-list">${rows.map(row => `
      <button data-id="${esc(row.id)}">
        ${row.cover ? `<img src="${esc(row.cover)}" onerror="this.style.visibility='hidden'">` : ''}
        <span>${esc(row.title)}</span>
        <span class="meta">${row.kind === 'created' ? '我创建的' : '我收藏的'} · ${row.count} 首</span>
      </button>`).join('')}</div>`;
    const m = modal(`我的歌单（${rows.length}）`, html);
    m.body.addEventListener('click', async ev => {
      const btn = ev.target.closest('button[data-id]');
      if (!btn) return;
      m.close();
      setQueryMeta('加载歌单…');
      try {
        const data = await api('/api/playlist', { text: String(btn.dataset.id) });
        S.songs = data.songs;
        S.picked.clear();
        S.keyword = ''; S.offset = 0; S.hasMore = false; S.lastText = '';
        setQueryMeta(`${data.title} · ${data.songs.length} 首`);
        setLikedActive(false);
        paintScope('link');            // 歌单属于链接 / ID 模式，拨码开关落到中间
        setScopePlaceholder('link');
        renderSongs();
        markPlayingRow();
      } catch (err) { toast(err.message, 'error'); setQueryMeta(); }
    });
  } catch (err) { toast(err.message, 'error'); }
}

async function loadLikedKeys() {
  try {
    S.liked = new Set(await api('/api/liked_keys', { source: S.cfg.source }, 'GET'));
    renderSongs();
    markPlayingRow();
  } catch (err) { /* 未登录时忽略 */ }
}

/* ==================== 左缘悬浮岛：播放列表 ==================== */
const PANEL_STORE = 'nmd.panelPos';

function openQueue() {
  const el = $('#island-queue');
  if (!el) return;
  S.queueOpen = true;
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add('open'));
  renderQueue();
}

function closeQueue() {
  const el = $('#island-queue');
  if (!el) return;
  S.queueOpen = false;
  el.classList.remove('open');
  setTimeout(() => { if (!S.queueOpen) el.hidden = true; }, 220);
}

function toggleQueue() { S.queueOpen ? closeQueue() : openQueue(); }

/* 面板位置记忆（左侧岛 / 播放器窗口 / 下载任务窗口共用） */
function applyPanelPos(el, key) {
  try {
    const pos = JSON.parse(localStorage.getItem(PANEL_STORE) || '{}')[key];
    if (!pos) return;
    el.style.left = pos.x + 'px';
    el.style.top = pos.y + 'px';
    el.style.right = 'auto';
    el.style.bottom = 'auto';
  } catch (err) { /* 使用默认位置 */ }
}

function savePanelPos(el, key) {
  try {
    const all = JSON.parse(localStorage.getItem(PANEL_STORE) || '{}');
    all[key] = { x: el.offsetLeft, y: el.offsetTop };
    localStorage.setItem(PANEL_STORE, JSON.stringify(all));
  } catch (err) { /* 忽略 */ }
}

/* 按住标题栏拖动面板 */
function bindPanelDrag(el, key) {
  const head = el.querySelector('[data-drag]');
  if (!head) return;
  head.addEventListener('mousedown', ev => {
    if (ev.target.closest('.icon-btn')) return;
    const rect = el.getBoundingClientRect();
    const sx = ev.clientX, sy = ev.clientY;
    let moved = false;
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    el.style.left = rect.left + 'px';
    el.style.top = rect.top + 'px';
    document.body.classList.add('island-drag');
    const onMove = mv => {
      if (Math.abs(mv.clientX - sx) > 3 || Math.abs(mv.clientY - sy) > 3) moved = true;
      el.style.left = Math.max(4, Math.min(innerWidth - 90, rect.left + mv.clientX - sx)) + 'px';
      el.style.top = Math.max(4, Math.min(innerHeight - 46, rect.top + mv.clientY - sy)) + 'px';
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.classList.remove('island-drag');
      if (moved) savePanelPos(el, key);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    ev.preventDefault();
  });
}

function bindIslands() {
  const island = $('#island-queue');
  applyPanelPos(island, 'queue');
  bindPanelDrag(island, 'queue');
  island.querySelector('.island-close').addEventListener('click', closeQueue);
  // 鼠标贴近左边缘唤出
  $('#hot-left').addEventListener('mouseenter', openQueue);
  // 点击岛外区域自动隐藏
  document.addEventListener('mousedown', ev => {
    if (!S.queueOpen) return;
    if (ev.target.closest('#island-queue, .edge-hot, #menu-root')) return;
    closeQueue();
  });

  bindQueueList($('#queue-list'));
  bindQueueList($('#pw-queue'));

  const tasksWin = $('#tasks-window');
  applyPanelPos(tasksWin, 'tasks');
  bindPanelDrag(tasksWin, 'tasks');
  $('#tasks-close').addEventListener('click', closeTasks);
}

/* ==================== 播放列表：只能由用户显式添加 ==================== */
function queueIndexOf(key) { return S.queue.findIndex(song => song.key === key); }

/* 在指定位置插入，插入点在当前曲之前时同步后移播放索引 */
function insertQueue(song, at) {
  S.queue.splice(at, 0, song);
  if (S.play.index >= at) S.play.index += 1;
  renderQueue();
  return at;
}

function appendToQueue(song) {
  const existing = queueIndexOf(song.key);
  if (existing >= 0) { toast('已在播放列表中', ''); return existing; }
  const at = insertQueue(song, S.queue.length);
  toast(`已添加到播放列表：${song.name}`, 'ok');
  return at;
}

/* 下一首播放：已存在则先摘出，再插到当前曲之后 */
function addNextPlay(song) {
  const existing = queueIndexOf(song.key);
  if (existing >= 0) {
    S.queue.splice(existing, 1);
    if (existing < S.play.index) S.play.index -= 1;
  }
  const at = S.play.index >= 0 ? S.play.index + 1 : S.queue.length;
  insertQueue(song, at);
  toast(`已加入下一首播放：${song.name}`, 'ok');
}

/* 双击听歌：把该曲加入播放列表后立即播放 */
async function playFromList(key) {
  const song = S.songs.find(s => s.key === key);
  if (!song) return;
  const existing = queueIndexOf(song.key);
  const index = existing >= 0 ? existing : insertQueue(song, S.queue.length);
  await playIndex(index);
}

/* 全部播放：把当前列表整批追加进播放列表，并播放第一首新加入的曲目 */
async function playAll() {
  if (!S.songs.length) return;
  let firstNew = -1;
  S.songs.forEach(song => {
    if (queueIndexOf(song.key) < 0) {
      if (firstNew < 0) firstNew = S.queue.length;
      S.queue.push(song);
    }
  });
  renderQueue();
  const target = firstNew >= 0 ? firstNew : queueIndexOf(S.songs[0].key);
  await playIndex(target);
}

function bindQueueList(box) {
  if (!box) return;
  box.addEventListener('click', ev => {
    const del = ev.target.closest('.q-del');
    if (del) { removeFromQueue(Number(del.closest('.queue-item').dataset.i)); return; }
    const item = ev.target.closest('.queue-item[data-i]');
    if (item) playIndex(Number(item.dataset.i));
  });
  box.addEventListener('contextmenu', ev => {
    const item = ev.target.closest('.queue-item[data-i]');
    if (!item) return;
    ev.preventDefault();
    const index = Number(item.dataset.i);
    showMenu([
      { label: '播放这首', onClick: () => playIndex(index) },
      { label: '下一首播放', onClick: () => addNextPlay(S.queue[index]) },
      { separator: true },
      { label: '从播放列表移除', onClick: () => removeFromQueue(index) },
      { label: '清空播放列表', onClick: () => clearQueue() },
    ], { x: ev.clientX, y: ev.clientY });
  });
}

function removeFromQueue(index) {
  if (index < 0 || index >= S.queue.length) return;
  const wasPlaying = index === S.play.index;
  S.queue.splice(index, 1);
  if (!S.queue.length) { clearQueue(); return; }
  if (index < S.play.index) S.play.index -= 1;
  else if (wasPlaying) S.play.index = Math.min(index, S.queue.length - 1);
  renderQueue();
  if (wasPlaying) playIndex(S.play.index);
  else updatePlayerWindow();
}

function clearQueue() {
  S.queue = [];
  S.play.index = -1;
  S.play.playing = false;
  audio.pause();
  audio.removeAttribute('src');
  resetLyric();
  renderQueue();
  updatePlayerWindow();
}

/* 播放列表渲染：左缘岛与播放器窗口内的列表共用同一份数据 */
function renderQueue() {
  const html = S.queue.length ? S.queue.map((song, index) => `
    <div class="queue-item${index === S.play.index ? ' playing' : ''}" data-i="${index}">
      <span class="q-idx">${index + 1}</span>
      <span class="q-name" title="${esc(song.name)}">${esc(song.name)}</span>
      <span class="q-artist" title="${esc(song.artists)}">${esc(song.artists)}</span>
      <span class="q-dur">${esc(song.duration_str)}</span>
      <button class="q-del" title="从播放列表移除">×</button>
    </div>`).join('') : '';

  ['#queue-list', '#pw-queue'].forEach(sel => {
    const box = $(sel);
    if (!box) return;
    if (!html) { box.classList.add('empty'); box.textContent = '播放列表为空'; return; }
    box.classList.remove('empty');
    box.innerHTML = html;
  });
  const count = $('#queue-count');
  if (count) count.textContent = S.queue.length ? `${S.queue.length} 首` : '';
}

/* ==================== 下载任务 ==================== */
function taskSignature(tasks) {
  return tasks.map(t => `${t.id}:${t.status}:${t.overall.toFixed(2)}:${t.counts.done}:${t.counts.failed}`).join('|');
}
let lastTaskSig = '';

function renderTasks(force = false) {
  const sig = taskSignature(S.tasks);
  if (!force && sig === lastTaskSig) return;
  lastTaskSig = sig;
  const count = $('#tasks-count');
  if (count) count.textContent = S.tasks.length ? `${S.tasks.length} 个任务` : '';
  const box = $('#task-list');
  if (!S.tasks.length) {
    box.classList.add('empty'); box.innerHTML = '暂无下载任务'; return;
  }
  box.classList.remove('empty');
  box.innerHTML = S.tasks.map(task => {
    const counts = task.counts;
    const pct = Math.round(task.overall * 100);
    const expanded = S.expandedTasks.has(task.id);
    const ctl = [];
    if (task.status === 'running') ctl.push('<button class="tiny" data-act="pause">暂停</button>');
    if (task.status === 'paused') ctl.push('<button class="tiny" data-act="resume">继续</button>');
    if (['running', 'paused', 'pending'].includes(task.status)) {
      ctl.push('<button class="tiny" data-act="cancel">取消</button>');
    }
    if (task.status === 'failed' || task.status === 'cancelled' || counts.failed) ctl.push('<button class="tiny" data-act="retry">重试</button>');
    if (!['running', 'paused', 'pending', 'cancelling'].includes(task.status)) {
      ctl.push('<button class="tiny" data-act="clear">移除</button>');
    }
    ctl.push(`<button class="tiny" data-act="toggle">${expanded ? '收起' : '展开'}</button>`);
    const items = expanded ? `<div class="task-items">${task.items.map(item => `
      <div class="task-item">
        <span class="st s-${item.status}">${ITEM_CN[item.status] || item.status}</span>
        <span>${item.index + 1}. ${esc(item.name)} - ${esc(item.artists)}</span>
        <span class="spacer"></span>
        <span>${item.status === 'running' ? Math.round(item.ratio * 100) + '%' : ''}</span>
        <span class="s-failed">${esc(item.error)}</span>
      </div>`).join('')}</div>` : '';
    return `<div class="task" data-id="${task.id}">
      <div class="task-head">
        <span class="task-title">任务 #${task.id}</span>
        <span class="task-meta">${STATUS_CN[task.status] || task.status} · ${counts.done}/${task.total} 完成`
        + `${counts.failed ? ' · ' + counts.failed + ' 失败' : ''} · ${task.level}/${task.encode_type}`
        + `${task.speed ? ' · ' + esc(task.speed) : ''}</span>
        <div class="task-ctl">${ctl.join('')}</div>
      </div>
      <div class="task-bar"><i style="width:${pct}%"></i></div>${items}
    </div>`;
  }).join('');
}

/* 下载任务窗口：可拖动、可拉伸，列表可滚动 */
function openTasks() {
  $('#tasks-window').hidden = false;
  renderTasks(true);
}

function closeTasks() { $('#tasks-window').hidden = true; }

function toggleTasks() {
  if ($('#tasks-window').hidden) openTasks(); else closeTasks();
}

function bindTasks() {
  $('#task-list').addEventListener('click', async ev => {
    const btn = ev.target.closest('button[data-act]');
    if (!btn) return;
    const card = btn.closest('.task');
    const id = Number(card.dataset.id);
    const act = btn.dataset.act;
    if (act === 'toggle') {
      S.expandedTasks.has(id) ? S.expandedTasks.delete(id) : S.expandedTasks.add(id);
      renderTasks(true);
      return;
    }
    try {
      if (act === 'cancel') {
        let cleanup = S.cfg.cancel_cleanup || 'keep';
        if (cleanup === 'ask') {
          cleanup = window.confirm('取消下载后，是否删除本次已下载 / 未完成的文件？') ? 'delete' : 'keep';
        }
        await api('/api/task/action', { id, action: 'cancel', cleanup });
      } else {
        await api('/api/task/action', { id, action: act });
      }
      await pollTasks();
      renderTasks(true);
    } catch (err) { toast(err.message, 'error'); }
  });
}

async function openDir() {
  try { await api('/api/open_dir', {}); } catch (err) { toast(err.message, 'error'); }
}

async function pollTasks() {
  try {
    S.tasks = await api('/api/tasks', null, 'GET');
  } catch (err) { return; }
  notifyTaskEnds();
  updateGlobalProgress();
  const active = S.tasks.filter(t => ['running', 'paused', 'pending'].includes(t.status)).length;
  const dot = $('#btn-tasks .dot');
  if (dot) dot.hidden = !active;
  if (!$('#tasks-window').hidden) renderTasks();
}

let lastTaskStatus = {};

function notifyTaskEnds() {
  S.tasks.forEach(task => {
    const prev = lastTaskStatus[task.id];
    if (prev && prev !== task.status) {
      if (task.status === 'done') {
        if (S.cfg?.notify_on_finish) toast(`任务 #${task.id} 下载完成`, 'ok');
        // 完成动作（打开目录 / 关机 / 发信）由后端执行，浏览器关闭也能生效
      } else if (task.status === 'failed' && S.cfg?.notify_on_finish) {
        toast(`任务 #${task.id} 有 ${task.counts.failed} 首失败`, 'error');
      }
    }
    lastTaskStatus[task.id] = task.status;
  });
}

function activeProgressTask() {
  return S.tasks.find(t => ['running', 'paused', 'pending', 'cancelling'].includes(t.status))
    || S.tasks.find(t => t.status === 'done' || t.status === 'failed');
}

function updateGlobalProgress() {
  const active = activeProgressTask();
  if (!active || S.dismissedTask === active.id) { paintGlobalProgress(0, null); return; }
  S.dismissedTask = null;
  paintGlobalProgress(active.overall || 0, active);
}

/* 进度条填色比例不变；歌词变长时只是把进度条整体右移（遮住左段），并非进度回退 */
function paintGlobalProgress(ratio, task) {
  $('#global-bar').style.width = Math.max(0, Math.min(1, ratio || 0)) * 100 + '%';
  const pct = $('#global-pct');
  pct.textContent = task ? `| ${(ratio * 100).toFixed(1)}%` : '—';
  pct.title = task ? '点击清空进度' : '';
}

/* 下载任务完成后点击数字清空进度条 */
function clearGlobalProgress() {
  const task = activeProgressTask();
  if (!task || ['running', 'pending', 'paused', 'cancelling'].includes(task.status)) return;
  S.dismissedTask = task.id;
  paintGlobalProgress(0, null);
}

/* ==================== 日志 ==================== */
async function pollLogs() {
  // 仅当设置窗口停留在「日志」页时才轮询
  if (S.settingsTab !== 'logs' || !document.querySelector('#modal-root .modal-lg')) return;
  try {
    const data = await api('/api/logs', { seq: S.logSeq, level: S.logLevel }, 'GET');
    if (!data.items.length) return;
    const box = $('#log-list');
    box.classList.remove('empty');
    const wrap = box.closest('.log-wrap') || box.parentElement;
    const near = wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight < 40;
    data.items.forEach(item => {
      S.logSeq = Math.max(S.logSeq, item.seq);
      const time = new Date(item.time * 1000).toLocaleTimeString('zh-CN', { hour12: false });
      const line = document.createElement('div');
      line.className = 'log-line';
      line.innerHTML = `<span class="t">${time}</span>`
        + `<span class="lv lv-${item.level}">${item.level.toUpperCase()}</span>`
        + `<span>${esc(item.message)}</span>`;
      box.appendChild(line);
    });
    if (near) wrap.scrollTop = wrap.scrollHeight;
  } catch (err) { /* 轮询失败忽略 */ }
}

/* ==================== 下载选项 ==================== */
function openDownloadDialog(songs) {
  if (!songs.length) return toast('请先选择歌曲', 'error');
  const opt = S.cfg || {};
  const source = songs[0]?.source || S.cfg.source;
  const levelOptions = levelsOf(source);
  const html = `
    <p class="muted">共 ${songs.length} 首，将按下方选项加入下载队列</p>
    <label class="field">音质<select id="dl-level"></select></label>
    <label class="field">编码格式<input id="dl-encode" type="text" readonly></label>
    <label class="field">完成后<select id="dl-finish"></select></label>
    <div class="checks">
      <label><input id="dl-lyric" type="checkbox">保存 .lrc 歌词</label>
      <label><input id="dl-tag" type="checkbox">写入标签</label>
      <label><input id="dl-cover" type="checkbox">嵌入封面</label>
      <label><input id="dl-embed-lyric" type="checkbox">歌词写入标签</label>
      <label><input id="dl-skip" type="checkbox">跳过已存在</label>
    </div>`;
  const m = modal('下载选项', html, [
    { label: '开始下载', primary: true, onClick: close => submitDownload(close, songs) },
    { label: '取消', onClick: close => close() },
  ]);
  const levelSel = m.body.querySelector('#dl-level');
  const encInput = m.body.querySelector('#dl-encode');
  fillSelect(levelSel, levelOptions, opt.level || S.cfg.level);
  const syncEncode = () => { encInput.value = encodeOf(source, levelSel.value).toUpperCase(); };
  levelSel.addEventListener('change', syncEncode);
  syncEncode();
  m.body.querySelector('#dl-lyric').checked = !!opt.save_lyric;
  m.body.querySelector('#dl-tag').checked = !!opt.embed_tag;
  m.body.querySelector('#dl-cover').checked = !!opt.embed_cover;
  m.body.querySelector('#dl-embed-lyric').checked = !!opt.embed_lyric;
  m.body.querySelector('#dl-skip').checked = !!opt.skip_existing;
  // 默认沿用设置里的完成动作，本次可单独改选（不写回全局配置）
  fillSelect(m.body.querySelector('#dl-finish'), S.meta.finish_actions,
    S.cfg.finish_action);
}

async function submitDownload(close, songs) {
  const root = $('#modal-root').lastElementChild;
  const options = {
    save_lyric: $('#dl-lyric', root).checked,
    embed_tag: $('#dl-tag', root).checked,
    embed_cover: $('#dl-cover', root).checked,
    embed_lyric: $('#dl-embed-lyric', root).checked,
    skip_existing: $('#dl-skip', root).checked,
    finish_action: $('#dl-finish', root).value,
  };
  try {
    const task = await api('/api/download', {
      songs, level: $('#dl-level', root).value, options,
    });
    close();
    toast(`任务 #${task.id} 已创建（${songs.length} 首）`, 'ok');
    openTasks();
  } catch (err) { toast(err.message, 'error'); }
}

/* ==================== 歌曲详情 ==================== */
async function openDetail(song) {
  const html = `
    <div class="detail-top">
      ${song.cover ? `<img class="detail-cover" src="${esc(song.cover)}">` : '<span class="detail-cover"></span>'}
      <div class="detail-info">
        <h3>${esc(song.name)}</h3>
        <p class="muted">${esc(song.artists)} · ${esc(song.album)}</p>
        <p class="muted">时长 ${esc(song.duration_str)} · 音源 ${esc(labelOf(S.meta.sources, song.source))} · 大小≈ ${esc(song.size)}</p>
      </div>
    </div>
    <div class="tabs-mini" data-tabs>
      <button class="active" data-t="probe">可用音质</button>
      <button data-t="lyric">歌词</button>
      <button data-t="trans">翻译</button>
    </div>
    <div data-panel="probe" class="muted">探测中…</div>
    <div data-panel="lyric" class="lyric-box" hidden></div>
    <div data-panel="trans" class="lyric-box" hidden></div>`;
  const m = modal('歌曲详情', html, [
    { label: '播放', primary: true, onClick: close => { close(); playFromList(song.key); } },
    { label: '下载', onClick: close => { close(); openDownloadDialog([song]); } },
    { label: '关闭', onClick: close => close() },
  ]);
  m.body.querySelector('[data-tabs]').addEventListener('click', ev => {
    const btn = ev.target.closest('button[data-t]');
    if (!btn) return;
    $$('[data-tabs] button', m.body).forEach(b => b.classList.toggle('active', b === btn));
    ['probe', 'lyric', 'trans'].forEach(name => {
      m.body.querySelector(`[data-panel="${name}"]`).hidden = name !== btn.dataset.t;
    });
  });
  try {
    const rows = await api('/api/probe', { song });
    m.body.querySelector('[data-panel="probe"]').innerHTML = rows.map(row =>
      `<div>${esc(row.label)}：${row.ok ? '可用（' + esc(row.detail) + '）' : '不可用'}</div>`).join('');
  } catch (err) {
    m.body.querySelector('[data-panel="probe"]').textContent = '探测失败：' + err.message;
  }
  try {
    const data = await api('/api/lyric', { song });
    m.body.querySelector('[data-panel="lyric"]').textContent = data.lyric || '（无歌词）';
    m.body.querySelector('[data-panel="trans"]').textContent = data.trans || '（无翻译）';
  } catch (err) {
    m.body.querySelector('[data-panel="lyric"]').textContent = '歌词获取失败：' + err.message;
  }
}

/* ==================== 设置（音乐 / 用户 / 系统 / 日志） ==================== */
function openSettings(tab = 'music') {
  const html = `
    <div class="tabs-mini" data-stabs>
      <button class="active" data-s="music">音乐</button>
      <button data-s="user">用户</button>
      <button data-s="system">系统</button>
      <button data-s="logs">日志</button>
    </div>
    <div data-spanel="music">
      <label class="field">音源<select id="cfg-source"></select></label>
      <label class="field">默认音质<select id="cfg-level"></select></label>
      <label class="field">编码格式<input id="cfg-encode" type="text" readonly></label>
      <p class="muted small">编码随音质自动决定：低档位 MP3，无损及以上 FLAC，无需手动选择。</p>
      <label class="field">命名模板<input id="cfg-template" type="text" placeholder="{artist} - {name}"></label>
      <label class="field">文件组织<select id="cfg-folder"></select></label>
      <div class="checks">
        <label><input id="cfg-lyric" type="checkbox">保存歌词文件</label>
        <label><input id="cfg-tag" type="checkbox">写入标签</label>
        <label><input id="cfg-cover" type="checkbox">嵌入封面</label>
        <label><input id="cfg-embed-lyric" type="checkbox">歌词写入标签</label>
        <label><input id="cfg-skip" type="checkbox">跳过已存在</label>
        <label><input id="cfg-task-folder" type="checkbox">按任务分文件夹</label>
      </div>
      <p class="muted small">「按任务分文件夹」会在下载目录下为每次任务新建「任务 日期-时间」子文件夹，与上方文件组织叠加，不影响原有歌手 / 专辑分层。</p>
      <h4 class="sub">下载完成后</h4>
      <label class="field">完成后动作<select id="cfg-finish"></select></label>
      <div class="checks">
        <label><input id="cfg-notify" type="checkbox">完成后弹出通知</label>
      </div>
      <p class="muted small">「消息」为 Windows 通知气泡，「弹窗」为带「打开目录 / 好的」按钮的窗口；开始下载时还能按任务临时改选。</p>
      <h4 class="sub">底部状态栏</h4>
      <div class="checks">
        <label><input id="cfg-status-lyric" type="checkbox">播放时在状态栏显示歌词</label>
      </div>
      <label class="field">歌词最大宽度（占窗口 %，10~60）<input id="cfg-status-lyric-max" type="number" min="10" max="60" step="5"></label>
      <p class="muted small">歌词变长会把下方进度条向右顶，变短后弹性回弹；超过最大宽度时像传送带一样跟随当前歌词滚动，唱到的字约在视野 70% 处。</p>
    </div>
    <div data-spanel="user" hidden>
      <label class="field">当前账号<b id="cfg-account" class="acct">—</b></label>
      <div class="row">
        <button id="cfg-login" class="ghost tiny">登录 / 切换账号</button>
        <button id="cfg-logout" class="ghost tiny">退出登录</button>
      </div>
      <label class="field">取消下载后<select id="cfg-cancel"></select></label>
      <div class="checks">
        <label><input id="cfg-anon" type="checkbox">匿名 token</label>
      </div>
      <p class="muted small">账号按音源分别保存；Cookie 导入在登录窗口中提供。下载完成后的动作在「音乐」分类中设置。</p>
    </div>
    <div data-spanel="system" hidden>
      <h4 class="sub">网易云音乐 · 密钥</h4>
      <label class="field small">key1<input id="cfg-key1" type="text"></label>
      <label class="field small">iv<input id="cfg-iv" type="text"></label>
      <label class="field small">pub_key<input id="cfg-pub" type="text"></label>
      <label class="field small">modulus<textarea id="cfg-modulus" rows="2"></textarea></label>
      <h4 class="sub">QQ 音乐 · 密钥 / 凭证</h4>
      <label class="field">凭证状态<b id="cfg-qq-state" class="acct">—</b></label>
      <label class="field small">凭证 JSON<textarea id="cfg-qq-credential" rows="3"
        placeholder="粘贴 credential JSON；留空表示不修改"></textarea></label>
      <div class="row">
        <button id="cfg-qq-clear" class="ghost tiny">清空 QQ 凭证</button>
      </div>
      <p class="muted small">QQ 凭证一般由扫码登录自动写入，也可在此粘贴导入；两端密钥互不影响。</p>
      <h4 class="sub">服务</h4>
      <label class="field">监听地址<input id="cfg-host" type="text" readonly title="仅本机使用，固定为 127.0.0.1"></label>
      <p class="muted small">固定为 127.0.0.1，仅本机可访问，不支持修改。</p>
      <label class="field">监听端口<input id="cfg-port" type="number" min="0" max="65535"></label>
      <label class="field">日志级别<select id="cfg-log-level"></select></label>
      <label class="field">下载并发数（1~8）<input id="cfg-workers" type="number" min="1" max="8"></label>
      <label class="field">失败重试次数<input id="cfg-retry" type="number" min="0" max="10"></label>
      <p class="muted small" id="cfg-path"></p>
    </div>
    <div data-spanel="logs" hidden>
      <div class="list-head">
        <label class="muted small">级别
          <select id="log-level">
            <option value="debug">debug</option>
            <option value="info" selected>info</option>
            <option value="warn">warn</option>
            <option value="error">error</option>
          </select>
        </label>
        <span class="spacer"></span>
        <button id="btn-clear-log" class="ghost tiny">清空日志</button>
      </div>
      <div class="log-wrap"><div id="log-list" class="log-list empty">暂无日志</div></div>
    </div>
    <input id="import-file" type="file" accept="application/json" hidden>`;

  const m = modal('设置', html, [
    { label: '保存', primary: true, onClick: () => saveSettings(m.body) },
    { label: '导出配置', onClick: () => exportConfig() },
    { label: '导入配置', onClick: () => m.body.querySelector('#import-file').click() },
    { label: '关闭', onClick: close => close() },
  ]);
  // 固定尺寸 + 内容独立滚动：切换分类时窗口大小不再变化
  $('.modal', m.mask).classList.add('modal-lg');

  const showTab = name => {
    S.settingsTab = name;
    $$('[data-stabs] button', m.body).forEach(b => b.classList.toggle('active', b.dataset.s === name));
    $$('[data-spanel]', m.body).forEach(panel => { panel.hidden = panel.dataset.spanel !== name; });
    if (name === 'logs') pollLogs();   // 只有停在日志页才轮询
  };
  m.body.querySelector('[data-stabs]').addEventListener('click', ev => {
    const btn = ev.target.closest('button[data-s]');
    if (btn) showTab(btn.dataset.s);
  });

  const sourceSel = m.body.querySelector('#cfg-source');
  const levelSel = m.body.querySelector('#cfg-level');
  const encInput = m.body.querySelector('#cfg-encode');
  const syncEncode = () => {
    encInput.value = encodeOf(sourceSel.value, levelSel.value).toUpperCase();
  };
  const syncLevels = () => {
    fillSelect(levelSel, levelsOf(sourceSel.value), S.cfg.level);
    if (!levelsOf(sourceSel.value).some(o => o.value === levelSel.value)) {
      levelSel.value = levelsOf(sourceSel.value)[0]?.value || 'exhigh';
    }
    syncEncode();
  };

  fillSelect(sourceSel, S.meta.sources, S.cfg.source);
  fillSelect(m.body.querySelector('#cfg-folder'), S.meta.folder_structures, S.cfg.folder_structure);
  fillSelect(m.body.querySelector('#cfg-cancel'), S.meta.cancel_cleanups, S.cfg.cancel_cleanup);
  fillSelect(m.body.querySelector('#cfg-finish'), S.meta.finish_actions, S.cfg.finish_action);
  fillSelect(m.body.querySelector('#cfg-log-level'),
    ['debug', 'info', 'warn', 'error'].map(v => ({ value: v, label: v })), S.cfg.log_level);
  syncLevels();
  sourceSel.addEventListener('change', syncLevels);
  levelSel.addEventListener('change', syncEncode);

  const cfg = S.cfg;
  m.body.querySelector('#cfg-template').value = cfg.name_template || '';
  m.body.querySelector('#cfg-host').value = cfg.host || '127.0.0.1';
  m.body.querySelector('#cfg-port').value = cfg.port ?? 8756;
  m.body.querySelector('#cfg-workers').value = cfg.workers ?? 3;
  m.body.querySelector('#cfg-retry').value = cfg.retry ?? 3;
  m.body.querySelector('#cfg-lyric').checked = !!cfg.save_lyric;
  m.body.querySelector('#cfg-tag').checked = !!cfg.embed_tag;
  m.body.querySelector('#cfg-cover').checked = !!cfg.embed_cover;
  m.body.querySelector('#cfg-embed-lyric').checked = !!cfg.embed_lyric;
  m.body.querySelector('#cfg-skip').checked = !!cfg.skip_existing;
  m.body.querySelector('#cfg-task-folder').checked = !!cfg.task_folder;
  m.body.querySelector('#cfg-notify').checked = !!cfg.notify_on_finish;
  m.body.querySelector('#cfg-status-lyric').checked = cfg.status_lyric !== false;
  m.body.querySelector('#cfg-status-lyric-max').value = cfg.status_lyric_max ?? 60;
  m.body.querySelector('#cfg-anon').checked = !!cfg.use_anonimous;
  const keys = cfg.weapi_keys || {};
  m.body.querySelector('#cfg-key1').value = keys.key1 || '';
  m.body.querySelector('#cfg-iv').value = keys.iv || '';
  m.body.querySelector('#cfg-pub').value = keys.pub_key || '';
  m.body.querySelector('#cfg-modulus').value = keys.modulus || '';
  m.body.querySelector('#cfg-path').textContent = '配置文件：' + (S.meta.config_path || '');
  m.body.querySelector('#cfg-account').textContent = S.account?.logged_in
    ? `${S.account.nickname}${S.account.vipType ? ' · VIP' : ''}`
    : '未登录';
  m.body.querySelector('#cfg-login').addEventListener('click', () => { m.close(); openLoginDialog(); });
  m.body.querySelector('#cfg-logout').addEventListener('click', async () => {
    try {
      await api('/api/logout', { source: S.cfg.source });
      toast('已退出登录', 'ok');
      await refreshAccount();
      S.liked.clear();
      renderSongs();
    } catch (err) { toast(err.message, 'error'); }
  });
  m.body.querySelector('#cfg-qq-state').textContent = S.cfg.has_qq_credential
    ? '已配置（可粘贴新凭证覆盖）' : '未配置';
  m.body.querySelector('#cfg-qq-clear').addEventListener('click', async () => {
    try {
      S.cfg = await api('/api/config', { qq_credential: {} });
      m.body.querySelector('#cfg-qq-state').textContent = '未配置';
      toast('已清空 QQ 凭证', 'ok');
    } catch (err) { toast(err.message, 'error'); }
  });

  // 日志页控件
  const levelSel2 = m.body.querySelector('#log-level');
  levelSel2.value = S.logLevel;
  levelSel2.addEventListener('change', ev => { S.logLevel = ev.target.value; });
  m.body.querySelector('#btn-clear-log').addEventListener('click', async () => {
    try {
      await api('/api/logs/clear', {});
      S.logSeq = 0;
      const list = m.body.querySelector('#log-list');
      list.innerHTML = '暂无日志';
      list.classList.add('empty');
    } catch (err) { toast(err.message, 'error'); }
  });

  m.body.querySelector('#import-file').addEventListener('change', ev => {
    m.close();
    importConfig(ev);
  });
  showTab(tab);
}

async function saveSettings(root) {
  const payload = {
    source: root.querySelector('#cfg-source').value,
    level: root.querySelector('#cfg-level').value,
    name_template: root.querySelector('#cfg-template').value.trim() || '{artist} - {name}',
    folder_structure: root.querySelector('#cfg-folder').value,
    cancel_cleanup: root.querySelector('#cfg-cancel').value,
    log_level: root.querySelector('#cfg-log-level').value,
    port: Number(root.querySelector('#cfg-port').value || 8756),
    workers: Number(root.querySelector('#cfg-workers').value || 3),
    retry: Number(root.querySelector('#cfg-retry').value || 3),
    save_lyric: root.querySelector('#cfg-lyric').checked,
    embed_tag: root.querySelector('#cfg-tag').checked,
    embed_cover: root.querySelector('#cfg-cover').checked,
    embed_lyric: root.querySelector('#cfg-embed-lyric').checked,
    skip_existing: root.querySelector('#cfg-skip').checked,
    task_folder: root.querySelector('#cfg-task-folder').checked,
    notify_on_finish: root.querySelector('#cfg-notify').checked,
    status_lyric: root.querySelector('#cfg-status-lyric').checked,
    status_lyric_max: Number(root.querySelector('#cfg-status-lyric-max').value || 60),
    use_anonimous: root.querySelector('#cfg-anon').checked,
    finish_action: root.querySelector('#cfg-finish').value,
    weapi_keys: {
      key1: root.querySelector('#cfg-key1').value.trim(),
      iv: root.querySelector('#cfg-iv').value.trim(),
      pub_key: root.querySelector('#cfg-pub').value.trim(),
      modulus: root.querySelector('#cfg-modulus').value.trim(),
    },
  };
  // QQ 凭证：留空表示不修改现有凭证
  const qqText = root.querySelector('#cfg-qq-credential').value.trim();
  if (qqText) {
    try { payload.qq_credential = JSON.parse(qqText); }
    catch (err) { return toast('QQ 凭证不是合法 JSON', 'error'); }
  }
  const prevSource = S.cfg.source, prevLevel = S.cfg.level;
  try {
    S.cfg = await api('/api/config', payload);
    S.logLevel = S.cfg.log_level;
    const logLevelSel = document.querySelector('#log-level');
    if (logLevelSel) logLevelSel.value = S.logLevel;
    toast('设置已保存', 'ok');
    setQueryMeta();
    updateStatusLyric();
    if (S.cfg.source !== prevSource || S.cfg.level !== prevLevel) {
      /* 音源 / 音质变化：保留关键词，自动重新拉取并覆盖旧结果 */
      await refreshAccount();
      await loadLikedKeys();
      await replayQuery();
    }
  } catch (err) { toast(err.message, 'error'); }
}

async function exportConfig() {
  try {
    const data = await api('/api/config/export', null, 'GET');
    const blob = new Blob([data.content], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = data.filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
    toast('配置已导出（含敏感信息，请妥善保管）', 'ok');
  } catch (err) { toast(err.message, 'error'); }
}

async function importConfig(ev) {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  try {
    const text = await file.text();
    S.cfg = await api('/api/config/import', { data: JSON.parse(text) });
    S.logLevel = S.cfg.log_level || 'info';
    $('#log-level').value = S.logLevel;
    await refreshAccount();
    await loadLikedKeys();
    if (S.lastText) await replayQuery();
    setQueryMeta();
    toast('配置已导入并生效', 'ok');
  } catch (err) { toast('导入失败：' + err.message, 'error'); }
}

/* ==================== 登录 ==================== */
function openLoginDialog() {
  const html = `
    <label class="field">音源<select id="lg-source">
      ${S.meta.sources.map(s => `<option value="${esc(s.value)}">${esc(s.label)}</option>`).join('')}
    </select></label>
    <label class="field" id="lg-type-wrap">QQ 登录方式<select id="lg-type">
      <option value="qq">QQ</option><option value="wx">微信</option><option value="mobile">手机</option>
    </select></label>
    <div class="row"><button id="lg-start" class="primary">获取二维码</button>
      <button id="lg-cookie-toggle" class="ghost tiny">改用 Cookie 导入</button></div>
    <div class="qr-box" id="lg-qr" hidden><img id="lg-qr-img" alt="二维码">
      <span class="muted" id="lg-hint">等待扫码…</span>
      <a class="muted small" id="lg-url" target="_blank" hidden></a></div>
    <div id="lg-cookie" hidden style="margin-top:10px">
      <textarea id="lg-cookie-text" rows="4" style="width:100%"
        placeholder="粘贴浏览器 Cookie（网易云：MUSIC_U=…；QQ：uin=…; qm_keyst=…）"></textarea>
      <button id="lg-cookie-apply" class="primary" style="margin-top:8px">导入并登录</button>
    </div>`;
  const m = modal('登录', html, [{ label: '关闭', onClick: close => { stopLoginPoll(); close(); } }]);
  m.body.querySelector('#lg-source').value = S.cfg.source;
  const typeWrap = m.body.querySelector('#lg-type-wrap');
  const syncType = () => { typeWrap.hidden = m.body.querySelector('#lg-source').value !== 'qq'; };
  syncType();
  m.body.querySelector('#lg-source').addEventListener('change', syncType);

  m.body.querySelector('#lg-start').addEventListener('click', async () => {
    stopLoginPoll();
    const source = m.body.querySelector('#lg-source').value;
    const type = m.body.querySelector('#lg-type').value;
    try {
      const data = await api('/api/login/qr/start', { source, type });
      const qr = m.body.querySelector('#lg-qr');
      qr.hidden = false;
      m.body.querySelector('#lg-hint').textContent = '等待扫码…';
      m.body.querySelector('#lg-url').hidden = true;
      if (data.kind === 'image') {
        m.body.querySelector('#lg-qr-img').src = data.image;
      } else {
        await showUrlQr(m.body.querySelector('#lg-qr-img'), data.url, m.body.querySelector('#lg-url'));
      }
      startLoginPoll(source, data.identifier, m);
    } catch (err) { toast(err.message, 'error'); }
  });

  m.body.querySelector('#lg-cookie-toggle').addEventListener('click', () => {
    const box = m.body.querySelector('#lg-cookie');
    box.hidden = !box.hidden;
  });
  m.body.querySelector('#lg-cookie-apply').addEventListener('click', async () => {
    const source = m.body.querySelector('#lg-source').value;
    const cookie = m.body.querySelector('#lg-cookie-text').value.trim();
    if (!cookie) return toast('请粘贴 Cookie', 'error');
    try {
      await api('/api/login/cookie', { source, cookie });
      toast('登录成功', 'ok');
      m.close();
      await refreshAccount();
      await loadLikedKeys();
    } catch (err) { toast(err.message, 'error'); }
  });
  m.mask.addEventListener('click', ev => { if (ev.target === m.mask) stopLoginPoll(); });
}

async function showUrlQr(img, url, linkNode) {
  linkNode.href = url; linkNode.textContent = url; linkNode.hidden = false;
  try {
    await loadScript('https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js');
    img.src = await window.QRCode.toDataURL(url, { width: 200, margin: 1 });
  } catch (err) { img.style.display = 'none'; }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.QRCode) return resolve();
    const node = document.createElement('script');
    node.src = src;
    node.onload = resolve;
    node.onerror = () => reject(new Error('二维码库加载失败'));
    document.head.appendChild(node);
  });
}

function startLoginPoll(source, identifier, m) {
  stopLoginPoll();
  S.qrTimer = setInterval(async () => {
    try {
      const data = await api('/api/login/qr/poll', { source, identifier });
      const hint = m.body.querySelector('#lg-hint');
      if (hint) hint.textContent = data.message || '等待扫码…';
      if (data.event === 'done') {
        stopLoginPoll();
        toast('登录成功', 'ok');
        m.close();
        await refreshAccount();
        await loadLikedKeys();
      } else if (data.event === 'timeout' || data.event === 'refuse') {
        stopLoginPoll();
      }
    } catch (err) { stopLoginPoll(); }
  }, 2000);
}

function stopLoginPoll() {
  if (S.qrTimer) { clearInterval(S.qrTimer); S.qrTimer = null; }
}

/* ==================== 播放器 ==================== */
const audio = $('#audio');
const LYRIC_BOXES = ['#pl-lyric', '#pw-lyric'];

function currentSong() {
  return S.play.index >= 0 ? S.queue[S.play.index] : null;
}

/* 同步播放器模式与播放器窗口的歌曲信息 */
function nowPlayingInfo(song) {
  $('#pl-name').textContent = song ? song.name : '未在播放';
  $('#pl-artist').textContent = song ? `${song.artists} · ${song.album}` : '双击列表中的歌曲即可播放';
  const pwName = $('#pw-name .mq') || $('#pw-name');
  pwName.textContent = song ? song.name : '未在播放';
  $('#pw-artist').textContent = song ? `${song.artists} · ${song.album}` : '';
  setCover('#pl-cover', song);
  setCover('#pw-cover', song);
  applyMarquee($('#pw-name'));
  paintCoverButton(song);
  renderPwInfo();
}

/* 查询栏右侧的封面按钮：有当前曲目时显示，点击打开播放器窗口 */
function paintCoverButton(song) {
  const btn = $('#btn-cover');
  const img = $('#btn-cover-img');
  if (!btn || !img) return;
  const src = (song && song.cover) || avatarUrl();
  if (src) { img.src = src; btn.hidden = false; }
  else { img.removeAttribute('src'); btn.hidden = true; }
}

/* 过长标题用传送带（跑马灯）方式滚动，既不换行也不撑破容器 */
function applyMarquee(box) {
  if (!box) return;
  const inner = $('.mq', box);
  if (!inner) return;
  inner.style.animation = 'none';
  requestAnimationFrame(() => {
    const over = inner.scrollWidth - box.clientWidth;
    if (over <= 2) return;
    const seconds = Math.max(6, Math.round(over / 18));
    inner.style.setProperty('--mq-shift', `-${over}px`);
    inner.style.animation = `marquee ${seconds}s linear infinite`;
  });
}

function avatarUrl() {
  return (S.account && S.account.avatar) || '';
}

function setCover(sel, song) {
  const node = $(sel);
  if (!node) return;
  const src = (song && song.cover) || avatarUrl();
  if (src) { node.src = src; node.style.visibility = 'visible'; }
  else { node.removeAttribute('src'); node.style.visibility = 'hidden'; }
}

async function playIndex(index) {
  if (!S.queue.length) return toast('播放列表为空', 'error');
  if (index < 0) index = S.queue.length - 1;
  if (index >= S.queue.length) index = 0;
  S.play.index = index;
  const song = S.queue[index];
  S.play.lyricKey = '';
  S.play.lyric = [];
  resetLyric();
  nowPlayingInfo(song);
  setPlayHint('正在取址…');
  markPlayingRow();
  updatePlayerWindow();
  renderQueue();
  try {
    const data = await api('/api/play', { song, level: S.cfg.level });
    audio.src = data.url;
    await audio.play().catch(() => { throw new Error('浏览器阻止了自动播放，请点播放键'); });
    S.play.playing = true;
    paintPlayButton();
    setPlayHint(`${(data.type || data.encode).toUpperCase()} · ${labelOf(levelsOf(song.source), data.level)}`);
    loadLyric(song);
  } catch (err) {
    S.play.playing = false;
    paintPlayButton();
    setPlayHint('');
    toast('播放失败：' + err.message, 'error');
  }
}

function setPlayHint(text) { $('#pl-hint').textContent = text; }

function togglePlay() {
  if (!audio.src) return toast('还没有选择歌曲', 'error');
  if (audio.paused) audio.play().catch(() => {}); else audio.pause();
}

function paintPlayButton() {
  const playing = S.play.playing && !audio.paused;
  const svg = icon(playing ? 'pause' : 'play', 22);
  $('#pl-toggle').innerHTML = svg;
  $('#pl-toggle').title = playing ? '暂停' : '播放';
  $('#pw-toggle').innerHTML = svg;
  $('#pw-toggle').title = playing ? '暂停' : '播放';
}

function stepSong(delta) {
  if (!S.queue.length) return;
  if (S.play.mode === 'shuffle') return playIndex(Math.floor(Math.random() * S.queue.length));
  playIndex(S.play.index + delta);
}

function cycleMode() {
  S.play.mode = { order: 'shuffle', shuffle: 'single', single: 'order' }[S.play.mode] || 'order';
  paintModeButtonPlay();
}

function paintModeButtonPlay() {
  const modes = {
    order: { icon: 'repeat', label: '顺序播放' },
    single: { icon: 'one', label: '单曲循环' },
    shuffle: { icon: 'shuffle', label: '随机播放' },
  };
  const mode = modes[S.play.mode] || modes.order;
  $('#pl-mode').innerHTML = icon(mode.icon, 16) + `<span>${mode.label}</span>`;
  $('#pl-mode').title = `播放模式：${mode.label}（点击切换）`;
  $('#pw-mode').innerHTML = icon(mode.icon, 16) + `<span>${mode.label}</span>`;
  $('#pw-mode').title = `播放模式：${mode.label}（点击切换）`;
}

function setVolume(value) {
  S.play.volume = value;
  audio.volume = value / 100;
  S.play.muted = value === 0;
  ['#pl-volume', '#pw-volume'].forEach(sel => {
    const node = $(sel);
    if (node && Number(node.value) !== value) node.value = String(value);
  });
  paintMuteButton();
  try { localStorage.setItem('nmd.volume', String(value)); } catch (err) { /* 忽略 */ }
}

function paintMuteButton() {
  const svg = icon(S.play.muted || audio.muted ? 'mute' : 'volume', 16);
  $('#pl-mute').innerHTML = svg;
  $('#pw-mute').innerHTML = svg;
}

function fmtTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '00:00';
  const total = Math.floor(seconds);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function parseLrc(text) {
  const lines = [];
  const re = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
  (text || '').split('\n').forEach(raw => {
    const times = [];
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(raw))) {
      times.push(Number(m[1]) * 60 + Number(m[2]) + (m[3] ? Number(m[3]) / Math.pow(10, m[3].length) : 0));
    }
    const content = raw.replace(re, '').trim();
    if (!content || !times.length) return;
    times.forEach(t => lines.push({ t, text: content }));
  });
  lines.sort((a, b) => a.t - b.t);
  return lines;
}

let lastLyricIndex = -1;

function resetLyric(text = '（暂无歌词）') {
  lastLyricIndex = -1;
  LYRIC_BOXES.forEach(sel => {
    const box = $(sel);
    box.classList.add('is-empty');
    box.textContent = text;
  });
  updateStatusLyric(0);
}

async function loadLyric(song) {
  if (S.play.lyricKey === song.key) return;
  S.play.lyricKey = song.key;
  try {
    const data = await api('/api/lyric', { song });
    const lines = parseLrc(data.lyric);
    S.play.lyric = lines;
    if (!lines.length) { resetLyric(data.lyric ? '（纯文本歌词）' : '（无歌词）'); return; }
    const html = lines.map(line => `<div class="lyric-line">${esc(line.text)}</div>`).join('');
    LYRIC_BOXES.forEach(sel => {
      const box = $(sel);
      box.classList.remove('is-empty');
      box.innerHTML = html;
    });
    lastLyricIndex = -1;
    syncLyric(audio.currentTime, true);
    updateStatusLyric(audio.currentTime);
  } catch (err) {
    S.play.lyric = [];
    resetLyric('歌词获取失败');
  }
}

function syncLyric(time, force = false) {
  if (!S.play.lyric.length) return;
  let index = -1;
  for (let i = 0; i < S.play.lyric.length; i++) {
    if (S.play.lyric[i].t <= time + 0.2) index = i; else break;
  }
  if (index === lastLyricIndex && !force) return;
  lastLyricIndex = index;
  LYRIC_BOXES.forEach(sel => {
    const box = $(sel);
    const nodes = $$('.lyric-line', box);
    nodes.forEach((node, i) => node.classList.toggle('on', i === index));
    const node = nodes[index];
    if (!node) return;
    // 用视口坐标换算，避免 offsetParent 不同导致定位偏移
    const top = node.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    box.scrollTop = Math.max(0, top - box.clientHeight / 2 + node.offsetHeight / 2);
  });
}

/* ==================== 状态栏歌词：随长度顶开进度条 ==================== */
let statusLyricKey = '';

function statusLyricMaxPx() {
  const percent = Math.max(10, Math.min(60, Number(S.cfg?.status_lyric_max) || 60));
  return window.innerWidth * percent / 100;
}

function updateStatusLyric(time = audio.currentTime) {
  const box = $('#status-lyric');
  const inner = $('#status-lyric-inner');
  if (!box || !inner) return;
  const song = currentSong();
  const lines = S.play.lyric || [];
  let index = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].t <= time + 0.2) index = i; else break;
  }
  const line = index >= 0 ? lines[index] : null;
  const text = line ? String(line.text || '').trim() : '';
  if (!S.cfg?.status_lyric || !song || !text) {
    box.hidden = true;
    box.classList.remove('on');
    box.style.width = '0px';
    inner.textContent = '';
    inner.style.transform = 'translateX(0)';
    statusLyricKey = '';
    return;
  }
  box.hidden = false;
  box.classList.add('on');
  if (statusLyricKey !== `${song.key}#${index}`) {
    statusLyricKey = `${song.key}#${index}`;
    inner.textContent = text;
    inner.style.transform = 'translateX(0)';
  }
  const natural = inner.scrollWidth;
  const view = Math.min(natural, statusLyricMaxPx());
  box.style.width = `${view}px`;
  if (view >= natural) { inner.style.transform = 'translateX(0)'; return; }
  // 当前唱到的字约在视野 70% 处：未到 70% 不滚动，超出后滚动，滚到末尾即停
  const start = line.t;
  const end = index + 1 < lines.length ? lines[index + 1].t : start + 4;
  const ratio = Math.max(0, Math.min(1, (time - start) / Math.max(0.5, end - start)));
  const charX = ratio * natural;
  const offset = Math.max(0, Math.min(natural - view, charX - view * 0.7));
  inner.style.transform = `translateX(${-offset}px)`;
}

/* 播放器窗口：下载模式下独立悬浮，右侧切换 歌词 / 播放列表 / 歌曲信息 */
function openPlayerWindow(tab) {
  const win = $('#player-window');
  if (!win) return;
  win.hidden = false;
  S.pwOpen = true;
  if (tab) setPwTab(tab);
  updatePlayerWindow();
}

function closePlayerWindow() {
  const win = $('#player-window');
  if (!win) return;
  S.pwOpen = false;
  win.hidden = true;
}

function togglePlayerWindow() {
  if (S.pwOpen) closePlayerWindow(); else openPlayerWindow();
}

function setPwTab(tab) {
  S.pwTab = tab;
  $$('.pw-tabs button').forEach(btn => btn.classList.toggle('active', btn.dataset.pwTab === tab));
  $$('#player-window .pw-panel').forEach(panel =>
    (panel.hidden = panel.dataset.pwPanel !== tab));
  if (tab === 'queue') renderQueue();
  if (tab === 'info') renderPwInfo();
}

/* 歌曲信息面板 */
function renderPwInfo() {
  const box = $('#pw-info');
  if (!box) return;
  const song = currentSong();
  if (!song) { box.innerHTML = '<p class="muted small">未在播放</p>'; return; }
  const rows = [
    ['歌名', song.name],
    ['歌手', song.artists],
    ['专辑', song.album],
    ['时长', song.duration_str],
    ['大小≈', song.size],
    ['音源', labelOf(S.meta?.sources, song.source)],
    ['编码', encodeOf(song.source, S.cfg?.level)],
  ];
  box.innerHTML = rows.map(([label, value]) =>
    `<div class="info-row"><span>${esc(label)}</span><b>${esc(value || '—')}</b></div>`).join('');
}

function updatePlayerWindow() {
  paintCoverButton(currentSong());
  if (!S.pwOpen) return;
  nowPlayingInfo(currentSong());
  paintPlayButton();
  paintModeButtonPlay();
}

function bindPlayerWindow() {
  const win = $('#player-window');
  applyPanelPos(win, 'player');
  bindPanelDrag(win, 'player');
  $('#pw-close').addEventListener('click', closePlayerWindow);
  $('#btn-cover').addEventListener('click', () => openPlayerWindow('lyric'));
  $('.pw-tabs').addEventListener('click', ev => {
    const btn = ev.target.closest('button[data-pw-tab]');
    if (btn) setPwTab(btn.dataset.pwTab);
  });
  $('#pw-prev').addEventListener('click', () => stepSong(-1));
  $('#pw-next').addEventListener('click', () => stepSong(1));
  $('#pw-toggle').addEventListener('click', togglePlay);
  $('#pw-mode').addEventListener('click', cycleMode);
  $('#pw-mute').addEventListener('click', () => {
    audio.muted = !audio.muted;
    S.play.muted = audio.muted;
    paintMuteButton();
  });
  $('#pw-volume').addEventListener('input', ev => {
    audio.muted = false;
    setVolume(Number(ev.target.value));
  });
  $('#pw-seek').addEventListener('input', ev => {
    if (audio.duration) audio.currentTime = (Number(ev.target.value) / 1000) * audio.duration;
  });
  setPwTab('lyric');
}

function bindPlayer() {
  paintIcons();
  paintPlayButton();
  paintModeButtonPlay();
  paintMuteButton();

  $('#pl-toggle').addEventListener('click', togglePlay);
  $('#pl-prev').addEventListener('click', () => stepSong(-1));
  $('#pl-next').addEventListener('click', () => stepSong(1));
  $('#pl-mode').addEventListener('click', cycleMode);
  $('#pl-list').addEventListener('click', toggleQueue);
  $('#pl-mute').addEventListener('click', () => {
    audio.muted = !audio.muted;
    S.play.muted = audio.muted;
    paintMuteButton();
  });

  const volume = $('#pl-volume');
  const pwVolume = $('#pw-volume');
  let saved = 100;
  try { saved = Number(localStorage.getItem('nmd.volume') || 100); } catch (err) { /* 忽略 */ }
  volume.value = saved;
  pwVolume.value = saved;
  setVolume(saved);
  volume.addEventListener('input', ev => {
    audio.muted = false;
    setVolume(Number(ev.target.value));
  });

  const seek = $('#pl-seek');
  const pwSeek = $('#pw-seek');
  seek.addEventListener('input', ev => {
    if (audio.duration) audio.currentTime = (Number(ev.target.value) / 1000) * audio.duration;
  });

  audio.addEventListener('play', () => { S.play.playing = true; paintPlayButton(); });
  audio.addEventListener('pause', () => { S.play.playing = false; paintPlayButton(); });
  audio.addEventListener('timeupdate', () => {
    const current = audio.currentTime || 0;
    const duration = audio.duration || 0;
    const pos = duration ? String(Math.round((current / duration) * 1000)) : '0';
    $('#pl-cur').textContent = fmtTime(current);
    $('#pw-cur').textContent = fmtTime(current);
    seek.value = pos;
    pwSeek.value = pos;
    syncLyric(current);
    updateStatusLyric(current);
  });
  audio.addEventListener('loadedmetadata', () => {
    const text = fmtTime(audio.duration);
    $('#pl-dur').textContent = text;
    $('#pw-dur').textContent = text;
  });
  audio.addEventListener('ended', () => {
    if (S.play.mode === 'single') { audio.currentTime = 0; audio.play().catch(() => {}); return; }
    stepSong(1);
  });
  audio.addEventListener('error', () => {
    if (!audio.src) return;
    setPlayHint('播放出错，可尝试降低音质后重试');
    S.play.playing = false;
    paintPlayButton();
  });

  document.addEventListener('keydown', ev => {
    if (ev.code !== 'Space' || !audio.src) return;
    if (ev.target.closest('input, textarea, select')) return;
    ev.preventDefault();
    togglePlay();
  });

  $('#global-pct').addEventListener('click', clearGlobalProgress);
  window.addEventListener('resize', () => updateStatusLyric());
  updateGlobalProgress();
  paintGlobalProgress(0, null);
}

/* ==================== 启动 ==================== */
async function boot() {
  buildTopbar();
  buildScopes();
  bindListArea();
  bindPlayerWindow();
  bindTasks();
  bindIslands();
  bindPlayer();

  try {
    S.meta = await api('/api/meta', null, 'GET');
    S.cfg = await api('/api/config', null, 'GET');
  } catch (err) {
    toast('初始化失败：' + err.message, 'error');
    return;
  }
  S.logLevel = S.cfg.log_level || 'info';
  const logLevelSel = $('#log-level');
  if (logLevelSel) logLevelSel.value = S.logLevel;

  setView('download');
  paintScope('search');
  setScopePlaceholder('search');
  setQueryMeta();
  renderQueue();

  await refreshAccount();
  await loadLikedKeys();
  await pollTasks();

  S.pollTimer = setInterval(async () => {
    await pollTasks();
    pollLogs();
  }, 1000);
}

document.addEventListener('DOMContentLoaded', boot);
