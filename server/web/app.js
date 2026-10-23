/* Server 版前端：沿用桌面版视觉与交互（顶栏图标、查询栏、一体式歌曲列表、任务窗口），
   仅保留 Server 版所需能力：登录、检索、勾选下载、任务进度、文件取回。 */
'use strict';

const $ = (id) => document.getElementById(id);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

const STATUS_CN = {
  queued: '排队中', running: '下载中', done: '已完成',
  partial: '部分失败', failed: '失败', cancelled: '已取消',
};
const ITEM_CN = { pending: '待下载', running: '下载中', done: '完成', failed: '失败', cancelled: '已取消' };

const SVG_PATHS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="M20.5 20.5 16.4 16.4"/>',
  list: '<path d="M4 6h11M4 12h11M4 18h7"/><circle cx="17" cy="17" r="2.2"/><path d="M19.2 17V8.6"/>',
  heart: '<path d="M12 20.5S4.8 15.8 4.8 10.6A4.2 4.2 0 0 1 12 6.6a4.2 4.2 0 0 1 7.2 4c0 5.2-7.2 9.9-7.2 9.9Z"/>',
  tasks: '<path d="M4 7l1.6 1.6L8.6 5.6"/><path d="M11.5 7H20"/><path d="M4 13l1.6 1.6 3-3"/><path d="M11.5 13H20"/><path d="M4 19h6"/>',
  folder: '<path d="M4 7a1 1 0 0 1 1-1h4l2 2h7.5a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 3v2.6M12 18.4V21M3 12h2.6M18.4 12H21M5.6 5.6l1.9 1.9M16.5 16.5l1.9 1.9M18.4 5.6l-1.9 1.9M7.5 16.5l-1.9 1.9"/>',
  download: '<path d="M12 4v11"/><path d="M8 11.5l4 4 4-4"/><path d="M5 19.5h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
};
const ICON_IDS = {
  'btn-download': 'download', 'btn-tasks': 'tasks',
  'btn-files': 'folder', 'btn-settings': 'gear',
};
const SCOPE_ICONS = { search: 'search', link: 'list', liked: 'heart' };

function icon(name, size) {
  const body = SVG_PATHS[name] || '';
  return `<svg viewBox="0 0 24 24" width="${size || 18}" height="${size || 18}" fill="none"
    stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true">${body}</svg>`;
}

const state = {
  user: null, meta: null, prefs: null, authEnabled: true, authMode: 'login',
  scope: 'search', source: 'netease',
  songs: [], title: '', selected: new Set(), keyword: '',
  offset: 0, hasMore: false, loading: false,
  tasks: [], files: [], expanded: new Set(),
  pollTimer: null, finishedIds: new Set(),
};

/* ==================== 基础工具 ==================== */
function esc(text) {
  return String(text == null ? '' : text).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function toast(message, type) {
  const node = document.createElement('div');
  node.className = 'toast ' + (type || '');
  node.textContent = message;
  $('toast-root').appendChild(node);
  setTimeout(() => node.remove(), 4200);
}

function fmtBytes(size) {
  const value = Number(size) || 0;
  if (value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let index = 0;
  let v = value;
  while (v >= 1024 && index < units.length - 1) { v /= 1024; index += 1; }
  return index === 0 ? `${Math.round(v)} B` : `${v.toFixed(1)} ${units[index]}`;
}

function fmtSpeed(bps) {
  return bps ? `${fmtBytes(bps)}/s` : '';
}

function fmtETA(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  if (s < 60) return `${s} 秒`;
  if (s < 3600) return `${Math.round(s / 60)} 分钟`;
  if (s < 86400) return `${Math.round(s / 3600)} 小时`;
  return `${Math.round(s / 86400)} 天`;
}

async function api(path, payload, method) {
  const options = {
    method: method || (payload === undefined ? 'GET' : 'POST'),
    credentials: 'same-origin',
  };
  if (payload !== undefined && options.method !== 'GET') {
    options.headers = { 'Content-Type': 'application/json' };
    options.body = JSON.stringify(payload);
  }
  let res;
  try {
    res = await fetch(path, options);
  } catch (err) {
    throw new Error('网络异常，请稍后重试');
  }
  if (res.status === 401) {
    if (state.authEnabled) showAuth();
    throw new Error('登录已过期，请重新登录');
  }
  let data;
  try {
    data = await res.json();
  } catch (err) {
    throw new Error(`服务响应异常（${res.status}）`);
  }
  if (!data.ok) throw new Error(data.error || '请求失败');
  return data.data;
}

/* ==================== 图标注入 ==================== */
function paintIcons() {
  Object.entries(ICON_IDS).forEach(([id, name]) => {
    const slot = $(id) && $(id).querySelector('.icon-slot');
    if (slot) slot.innerHTML = icon(name, 18);
  });
  $$('#scope-group .scope-btn').forEach((btn) => {
    const slot = btn.querySelector('.icon-slot');
    if (slot && SCOPE_ICONS[btn.dataset.scope]) slot.innerHTML = icon(SCOPE_ICONS[btn.dataset.scope], 17);
  });
  [['tasks-close', 16], ['files-close', 16]].forEach(([id, size]) => {
    if ($(id)) $(id).innerHTML = icon('close', size);
  });
}

/* ==================== 登录 / 注册 ==================== */
function showAuth() {
  $('auth-mask').hidden = false;
}

function hideAuth() {
  $('auth-mask').hidden = true;
}

function setAuthTab(mode) {
  state.authMode = mode;
  $$('#auth-tabs button').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === mode));
  $('auth-confirm-wrap').hidden = mode !== 'register';
  $('auth-submit').textContent = mode === 'register' ? '注册并登录' : '登录';
  $('auth-pass').autocomplete = mode === 'register' ? 'new-password' : 'current-password';
  $('auth-error').textContent = '';
}

function applyAuthUI() {
  document.body.classList.toggle('auth-off', !state.authEnabled);
  $('account-text').textContent = state.user ? state.user.username : '';
  $('btn-login').hidden = !!state.user;
  $('btn-logout').hidden = !state.user;
  if (!state.authEnabled && state.scope === 'liked') setScope('search');
}

async function bootstrap() {
  paintIcons();
  bind();
  try {
    const data = await api('/api/auth/me');
    state.user = data.user;
    state.authEnabled = data.auth_enabled !== false;
    applyAuthUI();
    await enterApp();
  } catch (err) {
    if (state.authEnabled) showAuth();
    else toast(err.message, 'error');
  }
}

async function enterApp() {
  hideAuth();
  try {
    await loadMeta();
  } catch (err) {
    toast(err.message, 'error');
    if (state.authEnabled) showAuth();
    return;
  }
  startPolling();
  loadFiles();
}

async function loadMeta() {
  const meta = await api('/api/meta');
  state.meta = meta;
  state.prefs = meta.prefs;
  state.source = meta.prefs.source;
  state.authEnabled = meta.auth_enabled !== false;
  if (state.user && meta.user) state.user = { id: state.user.id, username: meta.user };
  applyAuthUI();
  syncPrefs();
  renderQuota();
  updateListStatus();
}

/* ==================== 偏好 / 音源 / 音质 ==================== */
function levelsOf(source) {
  return ((state.meta && state.meta.levels) || {})[source] || [];
}

function levelLabel(level) {
  const hit = levelsOf(state.source).find((item) => item.value === level);
  return hit ? hit.label : level;
}

function syncPrefs() {
  const prefs = state.prefs || {};
  const sourceSelect = $('pref-source');
  sourceSelect.innerHTML = '';
  (state.meta.sources || []).forEach((item) => {
    sourceSelect.appendChild(new Option(item.label, item.value));
  });
  sourceSelect.value = state.source;

  const levelSelect = $('pref-level');
  const levels = levelsOf(state.source);
  levelSelect.innerHTML = '';
  levels.forEach((item) => levelSelect.appendChild(new Option(item.label, item.value)));
  const wanted = prefs.level;
  levelSelect.value = levels.some((item) => item.value === wanted)
    ? wanted : (levels[0] ? levels[0].value : '');

  $('pref-lyric').checked = !!prefs.save_lyric;
  $('pref-tag').checked = !!prefs.embed_tag;
  $('pref-cover').checked = !!prefs.embed_cover;
  $('pref-embed-lyric').checked = !!prefs.embed_lyric;
}

async function savePrefs(patch) {
  try {
    const data = await api('/api/prefs', patch);
    state.prefs = data.prefs;
    state.source = data.prefs.source;
    syncPrefs();
    updateListStatus();
    return data.prefs;
  } catch (err) {
    toast(err.message, 'error');
    throw err;
  }
}

function updateListStatus(text) {
  const node = $('list-status');
  if (text !== undefined) { node.textContent = text; return; }
  if (!state.meta) return;
  const hit = (state.meta.sources || []).find((item) => item.value === state.source);
  const label = hit ? hit.label : state.source;
  node.textContent = `${label} · ${levelLabel(state.prefs ? state.prefs.level : '')}`;
}

function renderQuota() {
  const quota = state.meta && state.meta.quota;
  if (!quota) return;
  const text = `已用 ${quota.used_str || fmtBytes(quota.used)} / ${quota.limit_str || '不限'}`
    + ` · 文件保留 ${state.meta.retention_hours} 小时`;
  $('quota-note').textContent = text;
  $('file-quota').textContent = text;
}

/* ==================== 查询栏 ==================== */
function setScope(scope) {
  state.scope = scope;
  $$('#scope-group .scope-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.scope === scope);
    if (btn.dataset.scope === 'liked') btn.classList.toggle('on', scope === 'liked');
  });
  const input = $('query-input');
  if (scope === 'search') {
    input.placeholder = '搜索歌曲 / 歌手 / 专辑，或粘贴歌单链接、歌单 ID';
  } else if (scope === 'link') {
    input.placeholder = '粘贴歌单链接 / 歌单 ID / 单曲链接';
  } else {
    input.placeholder = '在「我喜欢的音乐」中筛选';
    if (state.songs.length && state.title === '我喜欢的音乐') renderSongs();
    else loadLiked();
  }
}

function looksLikeLink(text) {
  return /^https?:\/\//i.test(text) || /^\d{3,}$/.test(text);
}

async function doQuery() {
  const text = $('query-input').value.trim();
  if (state.scope === 'liked') { renderSongs(); return; }
  if (!text) { toast('请输入搜索关键词或歌单链接', 'error'); return; }
  if (state.scope === 'link' || looksLikeLink(text)) await loadPlaylist(text);
  else await searchRemote(text, 0);
}

function setBusy(busy) {
  state.loading = busy;
  $('btn-query').disabled = busy;
}

async function searchRemote(keyword, offset) {
  if (state.loading) return;
  setBusy(true);
  updateListStatus(offset ? '加载中…' : '查询中…');
  try {
    const data = await api('/api/search', {
      keyword, limit: 50, offset, source: state.source,
    });
    const songs = data.songs || [];
    if (offset === 0) {
      state.songs = songs;
      state.selected.clear();
      state.title = `搜索：${keyword}`;
    } else {
      state.songs = state.songs.concat(songs);
    }
    state.keyword = keyword;
    state.offset = data.offset;
    state.hasMore = songs.length >= 50;
    renderSongs();
    updateListStatus(`已加载 ${state.songs.length} 首${state.hasMore ? '，滚动到底继续加载' : ''}`);
  } catch (err) {
    updateListStatus();
    toast(err.message, 'error');
  } finally {
    setBusy(false);
  }
}

async function loadPlaylist(text) {
  if (state.loading) return;
  setBusy(true);
  updateListStatus('获取歌单中…');
  try {
    const data = await api('/api/playlist', { text, source: state.source });
    state.songs = data.songs || [];
    state.selected.clear();
    state.title = data.title || '歌单';
    state.keyword = '';
    state.hasMore = false;
    renderSongs();
    updateListStatus(`已加载 ${state.songs.length} 首`);
  } catch (err) {
    updateListStatus();
    toast(err.message, 'error');
  } finally {
    setBusy(false);
  }
}

async function loadLiked() {
  if (state.loading) return;
  setBusy(true);
  updateListStatus('获取我喜欢的音乐…');
  try {
    const data = await api('/api/liked', { source: state.source });
    state.songs = data.songs || [];
    state.selected.clear();
    state.title = data.title || '我喜欢的音乐';
    state.keyword = '';
    state.hasMore = false;
    renderSongs();
    updateListStatus(state.songs.length ? `已加载 ${state.songs.length} 首` : '未找到喜欢的歌曲');
  } catch (err) {
    updateListStatus();
    toast(err.message, 'error');
  } finally {
    setBusy(false);
  }
}

/* ==================== 一体式歌曲列表 ==================== */
const COLS = [
  ['pick', ''], ['idx', '#'], ['name', '歌曲'], ['artist', '歌手'],
  ['album', '专辑'], ['dur', '时长'], ['size', '大小'],
];
const COL_WIDTHS = { pick: 40, idx: 46, name: 320, artist: 170, album: 190, dur: 78, size: 88 };

function visibleSongs() {
  if (state.scope === 'search') return state.songs;
  const filter = $('query-input').value.trim().toLowerCase();
  if (!filter) return state.songs;
  return state.songs.filter((song) => (
    `${song.name} ${song.artists} ${song.album}`.toLowerCase().includes(filter)
  ));
}

function songRows(songs) {
  const cols = COLS.map(([key]) => (
    `<col data-col="${key}" style="width:${COL_WIDTHS[key]}px">`
  )).join('');
  const heads = COLS.map(([key, label]) => {
    if (key === 'pick') return '<th class="pick"></th>';
    const cls = (key === 'dur' || key === 'size') ? ' class="num"' : '';
    return `<th${cls}>${esc(label)}</th>`;
  }).join('');
  const rows = songs.map((song, index) => {
    const picked = state.selected.has(song.key) ? ' checked' : '';
    const cover = song.cover
      ? `<img class="cover" src="${esc(song.cover)}" loading="lazy" alt=""
           onerror="this.style.visibility='hidden'">`
      : '<span class="cover"></span>';
    return `<tr data-key="${esc(song.key)}">
      <td class="pick"><input type="checkbox" data-pick${picked}></td>
      <td class="idx">${index + 1}</td>
      <td class="name" title="${esc(song.name)}"><div class="name-cell">${cover}
        <span class="name-txt">${esc(song.name)}</span></div></td>
      <td title="${esc(song.artists)}">${esc(song.artists)}</td>
      <td title="${esc(song.album)}">${esc(song.album)}</td>
      <td class="num">${esc(song.duration_str || '')}</td>
      <td class="num" title="约 ${esc(song.size || '')}">${esc(song.size || '-')}</td>
    </tr>`;
  }).join('');
  return `<table class="song-table" style="min-width:940px">
    <colgroup>${cols}</colgroup>
    <thead><tr>${heads}</tr></thead><tbody>${rows}</tbody></table>`;
}

function emptyText() {
  if (state.scope === 'link') return '粘贴歌单链接 / 歌单 ID / 单曲链接后回车加载';
  if (state.scope === 'liked') return '登录账号后可查看「我喜欢的音乐」';
  return '暂无内容，试试搜索或粘贴歌单链接';
}

function renderSongs() {
  const container = $('song-list');
  const songs = visibleSongs();
  if (!songs.length) {
    container.classList.add('empty');
    container.innerHTML = state.songs.length ? '没有匹配的歌曲' : emptyText();
  } else {
    container.classList.remove('empty');
    container.innerHTML = songRows(songs);
  }
  syncListBar();
}

function syncListBar() {
  const songs = visibleSongs();
  const has = songs.length > 0;
  const picked = songs.filter((song) => state.selected.has(song.key)).length;
  $('list-count').textContent = has ? `共 ${songs.length} 首` : '';
  $('btn-pick-all').hidden = !has;
  $('btn-download-sel').hidden = !has;
  $('list-pick').textContent = picked ? `已选 ${picked} 首` : '';
  $('list-pick').hidden = !picked;
  $('btn-pick-all').textContent = has && picked === songs.length ? '清空勾选' : '全选';
  $('btn-download-sel').disabled = !picked;
  const sep = $('#song-bar .sep');
  if (sep) sep.hidden = !picked;
}

function togglePick(key) {
  if (state.selected.has(key)) state.selected.delete(key);
  else state.selected.add(key);
  $$('#song-list tr[data-key]').forEach((tr) => {
    if (tr.dataset.key !== key) return;
    const checked = state.selected.has(key);
    tr.classList.toggle('selected', checked);
    const input = tr.querySelector('input[data-pick]');
    if (input) input.checked = checked;
  });
  syncListBar();
}

function togglePickAll() {
  const songs = visibleSongs();
  const all = songs.length > 0 && songs.every((song) => state.selected.has(song.key));
  songs.forEach((song) => {
    if (all) state.selected.delete(song.key);
    else state.selected.add(song.key);
  });
  renderSongs();
}

/* ==================== 下载 ==================== */
async function submitDownload(level) {
  const songs = visibleSongs().filter((song) => state.selected.has(song.key));
  if (!songs.length) { toast('请先勾选要下载的歌曲', 'error'); return; }
  const prefs = state.prefs || {};
  const button = $('btn-download-sel');
  button.disabled = true;
  try {
    await api('/api/download', {
      songs,
      level: level || prefs.level,
      title: state.title || `${songs.length} 首歌曲`,
      source: state.source,
      save_lyric: !!prefs.save_lyric,
      embed_tag: !!prefs.embed_tag,
      embed_cover: !!prefs.embed_cover,
      embed_lyric: !!prefs.embed_lyric,
    });
    toast(`已提交任务：${songs.length} 首`, 'ok');
    openTasks();
    await refreshTasks(true);
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    button.disabled = false;
  }
}

/* 顶栏下载图标：音源 / 音质 / 下载当前勾选 */
let menuNode = null;

function closeMenu() {
  if (menuNode) { menuNode.remove(); menuNode = null; }
}

function openDownloadMenu(button) {
  closeMenu();
  const songs = visibleSongs().filter((song) => state.selected.has(song.key));
  const prefs = state.prefs || {};
  const sources = (state.meta.sources || []).map((item) => (
    `<button class="menu-item${item.value === state.source ? ' on' : ''}"
      data-act="source" data-value="${esc(item.value)}">${esc(item.label)}</button>`
  )).join('');
  const levels = levelsOf(state.source).map((item) => (
    `<button class="menu-item${item.value === prefs.level ? ' on' : ''}"
      data-act="level" data-value="${esc(item.value)}">${esc(item.label)}</button>`
  )).join('');
  const menu = document.createElement('div');
  menu.className = 'menu';
  menu.innerHTML = `<div class="menu-label">音源</div>${sources}
    <div class="menu-sep"></div><div class="menu-label">音质</div>${levels}
    <div class="menu-sep"></div>
    <button class="menu-item" data-act="go"${songs.length ? '' : ' disabled'}>
      下载选中${songs.length ? ` (${songs.length} 首)` : '（未勾选）'}</button>`;
  document.body.appendChild(menu);
  const rect = button.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 6}px`;
  menu.style.left = `${Math.max(8, Math.min(rect.right - menu.offsetWidth,
    window.innerWidth - menu.offsetWidth - 8))}px`;
  menuNode = menu;

  menu.addEventListener('click', async (event) => {
    const item = event.target.closest('.menu-item');
    if (!item || item.disabled) return;
    const act = item.dataset.act;
    closeMenu();
    if (act === 'source') {
      if (item.dataset.value === state.source) return;
      await savePrefs({ source: item.dataset.value });
      if (state.keyword && state.scope === 'search') searchRemote(state.keyword, 0);
    } else if (act === 'level') {
      await savePrefs({ level: item.dataset.value });
      toast(`音质已切换：${item.textContent.trim()}`, 'ok');
    } else if (act === 'go') {
      submitDownload(prefs.level);
    }
  });
}

/* ==================== 任务轮询 ==================== */
function startPolling() {
  stopPolling();
  state.pollTimer = setTimeout(pollTick, 1200);
}

function stopPolling() {
  if (state.pollTimer) clearTimeout(state.pollTimer);
  state.pollTimer = null;
}

async function pollTick() {
  state.pollTimer = null;
  try {
    await refreshTasks();
  } catch (err) {
    /* 轮询失败静默重试 */
  }
  const running = state.tasks.some((task) => task.status === 'queued' || task.status === 'running');
  state.pollTimer = setTimeout(pollTick, running ? 1200 : 4000);
}

async function refreshTasks(force) {
  const data = await api('/api/tasks');
  state.tasks = data.items || [];
  let finishedNow = false;
  state.tasks.forEach((task) => {
    const finished = !['queued', 'running'].includes(task.status);
    if (finished && !state.finishedIds.has(task.id)) {
      state.finishedIds.add(task.id);
      finishedNow = true;
    }
  });
  renderTasks(force);
  renderGlobalProgress();
  const dot = $('btn-tasks').querySelector('.dot');
  if (dot) dot.hidden = !state.tasks.some((task) => ['queued', 'running'].includes(task.status));
  if (finishedNow) loadFiles();
}

let lastTaskSig = '';

function taskSignature(tasks) {
  return tasks.map((task) => (
    `${task.id}:${task.status}:${task.progress}:${task.done}:${task.failed}`
  )).join('|') + `|${Array.from(state.expanded).join(',')}`;
}

function renderTasks(force) {
  const signature = taskSignature(state.tasks);
  if (!force && signature === lastTaskSig) return;
  lastTaskSig = signature;
  const box = $('task-list');
  $('tasks-count').textContent = state.tasks.length ? `${state.tasks.length} 个任务` : '';
  if (!state.tasks.length) {
    box.className = 'task-list empty';
    box.textContent = '暂无下载任务';
    return;
  }
  box.className = 'task-list';
  box.innerHTML = state.tasks.map(taskCard).join('');
}

function taskCard(task) {
  const pct = Math.round((task.progress || 0) * 100);
  const running = ['queued', 'running'].includes(task.status);
  const expanded = state.expanded.has(task.id);
  const ctl = [];
  if (running) ctl.push('<button class="tiny" data-act="cancel">取消</button>');
  else ctl.push('<button class="tiny" data-act="delete">删除</button>');
  ctl.push(`<button class="tiny" data-act="toggle">${expanded ? '收起' : '展开'}</button>`);
  const meta = [
    STATUS_CN[task.status] || task.status,
    `${task.done}/${task.total} 完成`,
    task.failed ? `${task.failed} 失败` : '',
    running && task.speed ? fmtSpeed(task.speed) : '',
  ].filter(Boolean).join(' · ');
  const items = expanded ? `<div class="task-items">${(task.items || []).map((item) => `
      <div class="task-item">
        <span class="st s-${item.status}">${ITEM_CN[item.status] || item.status}</span>
        <span>${item.index + 1}. ${esc(item.name)}${item.artists ? ' - ' + esc(item.artists) : ''}</span>
        <span class="spacer"></span>
        <span>${item.status === 'running' ? Math.round((item.ratio || 0) * 100) + '%' : ''}</span>
        ${item.error ? `<span class="s-failed">${esc(item.error)}</span>` : ''}
      </div>`).join('')}</div>` : '';
  return `<div class="task" data-id="${task.id}">
    <div class="task-head">
      <span class="task-title" title="${esc(task.title)}">${esc(task.title)}</span>
      <span class="task-meta">${meta}</span>
      <div class="task-ctl">${ctl.join('')}</div>
    </div>
    <div class="task-bar"><i style="width:${pct}%"></i></div>
    ${task.error ? `<div class="task-item s-failed">${esc(task.error)}</div>` : ''}
    ${items}
  </div>`;
}

function renderGlobalProgress() {
  const active = state.tasks.find((task) => task.status === 'running')
    || state.tasks.find((task) => task.status === 'queued');
  const bar = $('global-bar');
  const pctNode = $('global-pct');
  if (!active) {
    bar.style.width = '0';
    pctNode.textContent = '—';
    pctNode.title = '当前任务进度';
    return;
  }
  const pct = Math.round((active.progress || 0) * 100);
  bar.style.width = `${pct}%`;
  pctNode.textContent = `${pct}%`;
  pctNode.title = `${active.title} · ${active.done}/${active.total}`
    + (active.speed ? ` · ${fmtSpeed(active.speed)}` : '');
}

/* ==================== 我的文件 ==================== */
async function loadFiles() {
  try {
    const data = await api('/api/files');
    state.files = data.items || [];
    const badge = $('file-count');
    badge.textContent = state.files.length;
    badge.hidden = !state.files.length;
    if (state.meta && state.meta.quota) {
      state.meta.quota.used = data.usage || 0;
      state.meta.quota.used_str = fmtBytes(data.usage);
    }
    renderQuota();
    renderFiles();
  } catch (err) {
    /* 未登录时静默 */
  }
}

function renderFiles() {
  const box = $('file-list');
  if (!state.files.length) {
    box.className = 'task-list empty';
    box.textContent = '还没有下载完成的文件';
    return;
  }
  box.className = 'task-list';
  box.innerHTML = state.files.map((file) => `
    <div class="file-row" data-file="${file.id}">
      <div class="file-main">
        <div class="file-name" title="${esc(file.filename)}">${esc(file.name)}${file.artists ? ' - ' + esc(file.artists) : ''}</div>
        <div class="file-meta">${esc(file.size_str)} · ${fmtETA(file.expires_in)}后过期</div>
      </div>
      <a class="btn-link" href="/api/files/${file.id}/download">下载</a>
      <button class="tiny" data-del="${file.id}">删除</button>
    </div>`).join('');
}

/* ==================== 窗口 ==================== */
function openTasks() {
  $('tasks-window').hidden = false;
  renderTasks(true);
}

function toggleTasks() {
  if ($('tasks-window').hidden) openTasks();
  else $('tasks-window').hidden = true;
}

function openFiles() {
  $('files-window').hidden = false;
  loadFiles();
}

function bindDrag(head) {
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let baseLeft = 0;
  let baseTop = 0;
  let win = null;
  head.addEventListener('mousedown', (event) => {
    if (event.target.closest('button')) return;
    win = head.closest('.pwin');
    const rect = win.getBoundingClientRect();
    baseLeft = rect.left;
    baseTop = rect.top;
    startX = event.clientX;
    startY = event.clientY;
    win.style.left = `${rect.left}px`;
    win.style.top = `${rect.top}px`;
    win.style.right = 'auto';
    win.style.bottom = 'auto';
    dragging = true;
    event.preventDefault();
  });
  window.addEventListener('mousemove', (event) => {
    if (!dragging || !win) return;
    const left = Math.max(0, Math.min(window.innerWidth - 100, baseLeft + event.clientX - startX));
    const top = Math.max(0, Math.min(window.innerHeight - 50, baseTop + event.clientY - startY));
    win.style.left = `${left}px`;
    win.style.top = `${top}px`;
  });
  window.addEventListener('mouseup', () => { dragging = false; });
}

/* ==================== 设置 ==================== */
function openSettings() {
  $('settings-mask').hidden = false;
  syncPrefs();
  renderQuota();
  setSettingsPanel('music');
  if (state.authEnabled) refreshAccountStates();
}

function setSettingsPanel(name) {
  $$('#settings-tabs button').forEach((btn) => btn.classList.toggle('active', btn.dataset.spanel === name));
  $$('#settings-mask .modal-body [data-spanel]').forEach((panel) => {
    panel.hidden = panel.dataset.spanel !== name;
  });
}

async function refreshAccountStates() {
  for (const source of ['netease', 'qq']) {
    const node = $(`state-${source}`);
    node.textContent = '检查中…';
    node.classList.remove('on');
    try {
      const data = await api('/api/account', { source });
      node.textContent = data.logged_in ? `已登录：${data.nickname || '用户'}` : '未登录';
      node.classList.toggle('on', !!data.logged_in);
    } catch (err) {
      node.textContent = '未登录';
    }
  }
}

async function loginSource(source, button) {
  const cookie = $(`cookie-${source}`).value.trim();
  if (!cookie) { toast('请先粘贴 Cookie', 'error'); return; }
  button.disabled = true;
  try {
    const data = await api('/api/account/login', { source, cookie });
    $(`cookie-${source}`).value = '';
    toast(data.logged_in ? '登录成功' : '已保存凭据', 'ok');
    refreshAccountStates();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    button.disabled = false;
  }
}

/* ==================== 我的歌单 ==================== */
async function openMyPlaylists() {
  try {
    const data = await api('/api/my_playlists', { source: state.source });
    const items = data.items || [];
    const list = items.length ? items.map((item) => `
      <button data-id="${esc(item.id)}">
        ${item.cover ? `<img src="${esc(item.cover)}" alt="">` : '<span class="cover"></span>'}
        <span>${esc(item.title)}</span>
        <span class="meta">${item.count || 0} 首</span>
      </button>`).join('') : '<p class="muted small" style="padding:10px">没有找到歌单，请先在设置里登录账号</p>';
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML = `<div class="modal" style="min-width:min(520px,92vw)">
      <h3>我的歌单</h3>
      <div class="picker-list">${list}</div>
      <div class="modal-foot"><button class="ghost" data-close>关闭</button></div>
    </div>`;
    document.body.appendChild(mask);
    mask.addEventListener('click', (event) => {
      if (event.target === mask || event.target.closest('[data-close]')) { mask.remove(); return; }
      const item = event.target.closest('button[data-id]');
      if (!item) return;
      mask.remove();
      setScope('link');
      $('query-input').value = item.dataset.id;
      loadPlaylist(item.dataset.id);
    });
  } catch (err) {
    toast(err.message, 'error');
  }
}

/* ==================== 事件绑定 ==================== */
function bind() {
  /* 登录 */
  $$('#auth-tabs button').forEach((btn) => {
    btn.addEventListener('click', () => setAuthTab(btn.dataset.tab));
  });
  $('auth-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const username = $('auth-user').value.trim();
    const password = $('auth-pass').value;
    const errorNode = $('auth-error');
    errorNode.textContent = '';
    if (state.authMode === 'register' && password !== $('auth-confirm').value) {
      errorNode.textContent = '两次输入的密码不一致';
      return;
    }
    const button = $('auth-submit');
    button.disabled = true;
    try {
      const path = state.authMode === 'register' ? '/api/auth/register' : '/api/auth/login';
      const data = await api(path, { username, password });
      state.user = data.user;
      $('auth-pass').value = '';
      $('auth-confirm').value = '';
      await enterApp();
    } catch (err) {
      errorNode.textContent = err.message;
    } finally {
      button.disabled = false;
    }
  });
  $('btn-login').addEventListener('click', () => { setAuthTab('login'); showAuth(); });
  $('btn-logout').addEventListener('click', async () => {
    try { await api('/api/auth/logout', {}); } catch (err) { /* 忽略 */ }
    stopPolling();
    state.user = null;
    $('account-text').textContent = '';
    $('btn-login').hidden = false;
    $('btn-logout').hidden = true;
    showAuth();
  });

  /* 查询栏 */
  $$('#scope-group .scope-btn').forEach((btn) => {
    btn.addEventListener('click', () => setScope(btn.dataset.scope));
  });
  $('btn-query').addEventListener('click', doQuery);
  $('query-input').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') doQuery();
  });
  let filterTimer = null;
  $('query-input').addEventListener('input', () => {
    if (state.scope === 'search') return;
    clearTimeout(filterTimer);
    filterTimer = setTimeout(renderSongs, 180);
  });
  $('btn-my-playlists').addEventListener('click', openMyPlaylists);

  /* 列表 */
  $('song-list').addEventListener('click', (event) => {
    const row = event.target.closest('tr[data-key]');
    if (!row || event.target.tagName === 'INPUT') return;
    togglePick(row.dataset.key);
  });
  $('song-list').addEventListener('change', (event) => {
    if (!event.target.matches('input[data-pick]')) return;
    const row = event.target.closest('tr[data-key]');
    if (row) togglePick(row.dataset.key);
  });
  $('btn-pick-all').addEventListener('click', togglePickAll);
  $('btn-download-sel').addEventListener('click', () => submitDownload());

  /* 滚动加载 */
  $('song-area').addEventListener('scroll', (event) => {
    const node = event.target;
    if (state.scope !== 'search' || state.loading || !state.hasMore) return;
    if (node.scrollTop + node.clientHeight >= node.scrollHeight - 200) {
      searchRemote(state.keyword, state.offset);
    }
  });

  /* 顶栏 */
  $('btn-download').addEventListener('click', (event) => {
    event.stopPropagation();
    if (menuNode) { closeMenu(); return; }
    openDownloadMenu(event.currentTarget);
  });
  $('btn-tasks').addEventListener('click', toggleTasks);
  $('btn-files').addEventListener('click', openFiles);
  $('btn-settings').addEventListener('click', openSettings);
  document.addEventListener('click', () => closeMenu());

  /* 任务窗口 */
  $('tasks-close').addEventListener('click', () => { $('tasks-window').hidden = true; });
  $('task-list').addEventListener('click', async (event) => {
    const btn = event.target.closest('button[data-act]');
    if (!btn) return;
    const card = btn.closest('.task');
    const id = card.dataset.id;
    const act = btn.dataset.act;
    if (act === 'toggle') {
      if (state.expanded.has(id)) state.expanded.delete(id);
      else state.expanded.add(id);
      renderTasks(true);
      return;
    }
    btn.disabled = true;
    try {
      if (act === 'cancel') {
        await api(`/api/tasks/${id}/cancel`, {});
        toast('已请求取消任务', 'ok');
      } else if (act === 'delete') {
        await api(`/api/tasks/${id}`, {}, 'DELETE');
        toast('任务及文件已删除', 'ok');
        await loadFiles();
      }
      await refreshTasks(true);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  /* 文件窗口 */
  $('files-close').addEventListener('click', () => { $('files-window').hidden = true; });
  $('file-list').addEventListener('click', async (event) => {
    const btn = event.target.closest('button[data-del]');
    if (!btn) return;
    if (!confirm('删除该文件？')) return;
    btn.disabled = true;
    try {
      await api(`/api/files/${btn.dataset.del}`, {}, 'DELETE');
      toast('文件已删除', 'ok');
      await loadFiles();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  /* 设置 */
  $('settings-close').addEventListener('click', () => { $('settings-mask').hidden = true; });
  $('settings-mask').addEventListener('click', (event) => {
    if (event.target === $('settings-mask')) $('settings-mask').hidden = true;
  });
  $$('#settings-tabs button').forEach((btn) => {
    btn.addEventListener('click', () => setSettingsPanel(btn.dataset.spanel));
  });

  $('pref-source').addEventListener('change', async () => {
    const source = $('pref-source').value;
    await savePrefs({ source });
    if (state.keyword && state.scope === 'search') searchRemote(state.keyword, 0);
  });
  $('pref-level').addEventListener('change', () => savePrefs({ level: $('pref-level').value }));
  [['pref-lyric', 'save_lyric'], ['pref-tag', 'embed_tag'],
   ['pref-cover', 'embed_cover'], ['pref-embed-lyric', 'embed_lyric']]
    .forEach(([id, key]) => {
      $(id).addEventListener('change', () => savePrefs({ [key]: $(id).checked }));
    });

  $$('[data-login]').forEach((btn) => {
    btn.addEventListener('click', () => loginSource(btn.dataset.login, btn));
  });
  $$('[data-logout]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const source = btn.dataset.logout;
      try {
        await api('/api/account/logout', { source });
        toast('已退出该音源', 'ok');
        refreshAccountStates();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });

  /* 窗口拖动 */
  $$('.pwin-head[data-drag]').forEach(bindDrag);

  /* 快捷键 */
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    closeMenu();
    if (!$('tasks-window').hidden) $('tasks-window').hidden = true;
    else if (!$('files-window').hidden) $('files-window').hidden = true;
    else if (!$('settings-mask').hidden) $('settings-mask').hidden = true;
  });
}

bootstrap();
