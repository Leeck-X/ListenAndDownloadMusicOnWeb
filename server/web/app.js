/* Server 版前端：沿用桌面版视觉与交互（顶栏图标、查询栏、一体式歌曲列表、任务窗口），
   仅保留 Server 版所需能力：登录、检索、勾选下载、任务进度、文件取回。 */
'use strict';

const $ = (id) => document.getElementById(id);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

const STATUS_CN = {
  queued: '排队中', running: '下载中', paused: '已暂停', done: '已完成',
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
  music: '<path d="M9.5 17.5V6.2l9-1.7v11.3"/><circle cx="6.8" cy="17.8" r="2.7"/><circle cx="15.8" cy="16" r="2.7"/>',
  repeat: '<path d="M5 8.5h11.5"/><path d="M14.5 6l3 2.5-3 2.5"/><path d="M19 15.5H7.5"/><path d="M9.5 13l-3 2.5 3 2.5"/>',
  one: '<path d="M5 8.5h11.5"/><path d="M14.5 6l3 2.5-3 2.5"/><path d="M19 15.5H7.5"/><path d="M9.5 13l-3 2.5 3 2.5"/><path d="M12 12.4v3.2"/>',
  shuffle: '<path d="M4 7h3.2l7.6 10H19"/><path d="M16.5 4.2L19 7l-2.5 2.8"/><path d="M4 17h3.2l2.6-3.4"/><path d="M13 8.6l1.8-1.6H19"/><path d="M16.5 14.2L19 17l-2.5 2.8"/>',
  volume: '<path d="M4.5 9.2h3l4-3v11.6l-4-3h-3Z"/><path d="M15 9.4a4 4 0 0 1 0 5.2"/>',
  mute: '<path d="M4.5 9.2h3l4-3v11.6l-4-3h-3Z"/><path d="M15 9.6l4.4 4.8M19.4 9.6L15 14.4"/>',
  prev: '<path d="M7 5.5v13M18.5 6.6v10.8L10 12z"/>',
  next: '<path d="M17 5.5v13M5.5 6.6v10.8L14 12z"/>',
  play: '<path d="M8 5.2v13.6L19 12z"/>',
  pause: '<path d="M8 5.4h3v13.2H8zM13 5.4h3v13.2h-3z"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6"/>',
};
const FILLED_ICONS = new Set(['play', 'pause', 'prev', 'next']);
const ICON_IDS = {
  'btn-download': 'download', 'btn-tasks': 'tasks',
  'btn-files': 'folder', 'btn-settings': 'gear', 'btn-source': 'user',
  'pl-prev': 'prev', 'pl-next': 'next', 'pl-list': 'list',
  'pw-prev': 'prev', 'pw-next': 'next',
};
const SCOPE_ICONS = { search: 'search', link: 'list', liked: 'heart' };

function icon(name, size) {
  const body = SVG_PATHS[name] || '';
  const paint = FILLED_ICONS.has(name)
    ? 'fill="currentColor" stroke="none"'
    : 'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';
  return `<svg viewBox="0 0 24 24" width="${size || 18}" height="${size || 18}" ${paint}
    aria-hidden="true">${body}</svg>`;
}

/* ==================== 音源 logo ==================== */
const SOURCE_BRAND = {
  netease: { color: '#e60026', label: '网易云音乐' },
  qq: { color: '#31c27c', label: 'QQ 音乐' },
};

/* 音源 logo：圆角方块 + 品牌色 + 白色音符，用于音源切换按钮与未登录时的头像 / 封面 */
function sourceLogo(source, size) {
  const brand = SOURCE_BRAND[source] || SOURCE_BRAND.netease;
  const px = size || 20;
  return `<svg viewBox="0 0 24 24" width="${px}" height="${px}" aria-hidden="true">
    <rect width="24" height="24" rx="6" fill="${brand.color}"/>
    <path d="M14.6 5.4v8.2a2.7 2.7 0 1 1-1.6-2.47V7.7l-4 1v5.6a2.7 2.7 0 1 1-1.6-2.47V6.8z"
      fill="#fff"/></svg>`;
}

function sourceLogoUri(source) {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(sourceLogo(source, 96));
}

const state = {
  user: null, meta: null, prefs: null, authEnabled: true, authMode: 'login',
  scope: 'search', source: 'netease', view: 'download', account: null,
  songs: [], title: '', selected: new Set(), keyword: '',
  offset: 0, hasMore: false, loading: false,
  queue: [], playIndex: -1, playing: false, playMode: 'order',
  lyric: [], lyricKey: '',
  tasks: [], files: [], filesSelected: new Set(), expanded: new Set(),
  pollTimer: null, finishedIds: new Set(),
  queueOpen: false, pwOpen: false, pwTab: 'lyric', settingsTab: 'music',
  logSeq: 0, logLevel: 'info', dismissedTask: null, logTimer: null,
  lastStatus: {},
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

function labelOf(options, value) {
  const hit = (options || []).find((item) => item.value === value);
  return hit ? hit.label : value;
}

function fillSelect(sel, options, value) {
  if (!sel) return;
  sel.innerHTML = (options || []).map((opt) => (
    `<option value="${esc(opt.value)}">${esc(opt.label)}</option>`)).join('');
  if (value !== undefined) sel.value = value;
}

/* 编码随音质档位推导：无损及以上 FLAC，其余 MP3（与后端一致） */
function encodeOf(source, level) {
  return ['lossless', 'hires'].includes(level) ? 'flac' : 'mp3';
}

/* 通用弹窗：与原版一致的标题 / 内容 / 底部按钮结构 */
function modal(title, bodyHtml, footButtons) {
  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.innerHTML = `<div class="modal"><h3>${esc(title)}</h3>
    <div class="modal-body">${bodyHtml}</div><div class="modal-foot"></div></div>`;
  const foot = mask.querySelector('.modal-foot');
  (footButtons || []).forEach((btn) => {
    const node = document.createElement('button');
    node.textContent = btn.label;
    if (btn.primary) node.className = 'primary';
    node.addEventListener('click', () => btn.onClick(close, mask));
    foot.appendChild(node);
  });
  function close() { mask.remove(); }
  mask.addEventListener('click', (event) => { if (event.target === mask) close(); });
  $('modal-root').appendChild(mask);
  return { mask, close, body: mask.querySelector('.modal-body') };
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
    const btn = $(id);
    if (!btn) return;
    const slot = btn.querySelector('.icon-slot');
    if (slot) slot.innerHTML = icon(name, 18);
    else btn.innerHTML = icon(name, btn.classList.contains('play') ? 22 : 18);
  });
  $$('#scope-group .scope-btn').forEach((btn) => {
    const slot = btn.querySelector('.icon-slot');
    if (slot && SCOPE_ICONS[btn.dataset.scope]) slot.innerHTML = icon(SCOPE_ICONS[btn.dataset.scope], 17);
  });
  [['tasks-close', 16], ['files-close', 16], ['pw-close', 16], ['island-close', 16]].forEach(([id, size]) => {
    if ($(id)) $(id).innerHTML = icon('close', size);
  });
  paintModeButton();
  paintPlayButton();
  paintModeButtonPlay();
  paintMuteButton();
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
  $('account-text').textContent = state.user ? state.user.username : (state.authEnabled ? '访客' : '');
  $('btn-login').hidden = !!state.user;
  $('btn-logout').hidden = !state.user;
  updateCloudNote();
  if (!state.authEnabled && state.scope === 'liked') setScope('search');
}

/* 音源凭据的存放位置：登录后归到账号，未登录则落在访客空间 */
function updateCloudNote() {
  const node = $('account-cloud-note');
  if (!node) return;
  node.textContent = state.user
    ? `音源登录凭据会保存到你的账号（${state.user.username}）下。`
    : '当前以访客身份使用：音源登录凭据保存在访客空间，换浏览器或清理 Cookie 后可能失效；登录账号后可保存到你的账号下。';
}

/* 音源账号：顶栏头像、未播放时的默认封面都取自这里（与桌面版一致） */
function avatarUrl() {
  return (state.account && state.account.avatar) || '';
}

function sourceLabel(source) {
  const hit = ((state.meta && state.meta.sources) || []).find((item) => item.value === source);
  return hit ? hit.label : (source === 'qq' ? 'QQ 音乐' : '网易云音乐');
}

function paintSourceAvatar() {
  const btn = $('btn-source');
  if (!btn) return;
  const account = state.account || {};
  const label = sourceLabel(state.source);
  if (account.logged_in && account.avatar) {
    btn.innerHTML = `<img class="src-avatar" src="${esc(account.avatar)}" alt="">`;
    btn.title = `${label} · ${account.nickname || '已登录'}`;
  } else {
    /* 未登录时用音源 logo 占位，避免头像位置出现空白 */
    btn.innerHTML = sourceLogo(state.source, 22);
    btn.title = account.logged_in
      ? `${label} · ${account.nickname || '已登录'}` : '音源登录（扫码）';
  }
}

async function refreshAccount() {
  try {
    const data = await api('/api/account', { source: state.source });
    state.account = data;
    paintSourceAvatar();
    syncPlayerTexts();
  } catch (err) { /* 账号校验失败不阻塞界面 */ }
}

async function bootstrap() {
  paintIcons();
  initVolume();
  bind();
  bindMenuGuards();
  bindIslands();
  /* 页面重新可见或网络恢复时立即重新拉取任务，避免退避期间长时间不刷新 */
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.appReady) startPolling();
  });
  window.addEventListener('online', () => {
    if (state.appReady) startPolling();
  });
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
  state.appReady = true;
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
  refreshAccount();
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
  $('pref-template').value = prefs.name_template || '{artist} - {name}';
  fillSelect($('pref-folder'), (state.meta && state.meta.folder_structures) || [],
    prefs.folder_structure || 'none');
  $('pref-skip').checked = !!prefs.skip_existing;
  $('pref-task-folder').checked = !!prefs.task_folder;
  $('pref-workers').value = prefs.workers || 3;
  $('pref-retry').value = prefs.retry == null ? 3 : prefs.retry;
  fillSelect($('pref-finish'), (state.meta && state.meta.finish_actions) || [],
    prefs.finish_action || 'none');
  $('pref-status-lyric').checked = prefs.status_lyric !== false;
  $('pref-status-lyric-max').value = prefs.status_lyric_max || 60;
  state.logLevel = prefs.log_level || 'info';
  if ($('log-level')) $('log-level').value = state.logLevel;

  const retention = $('pref-retention');
  retention.innerHTML = '';
  (state.meta.retention_choices || [1, 6, 12, 24, 48, 72, 168, 720]).forEach((hours) => {
    retention.appendChild(new Option(retentionLabel(hours), String(hours)));
  });
  retention.value = String(prefs.retention_hours || 72);
  $('pref-delete-after').checked = !!prefs.delete_after_export;
  updateStatusLyric(audio.currentTime || 0);
  paintSourceSwitch();
}

/* 查询栏方形音源按钮：显示当前音源 logo，点击循环切换并保存偏好 */
function paintSourceSwitch() {
  const btn = $('btn-src');
  if (!btn || !state.meta) return;
  btn.innerHTML = sourceLogo(state.source, 22);
  btn.title = `当前音源：${sourceLabel(state.source)}，点击切换`;
}

async function switchSource() {
  const sources = (state.meta.sources || []).map((item) => item.value);
  if (sources.length < 2) { toast('当前仅有一个可用音源', 'error'); return; }
  const index = Math.max(0, sources.indexOf(state.source));
  const next = sources[(index + 1) % sources.length];
  try {
    await savePrefs({ source: next });
    paintSourceSwitch();
    toast(`已切换音源：${sourceLabel(next)}`, 'ok');
    if (state.keyword && state.scope === 'search') searchRemote(state.keyword, 0);
  } catch (err) { /* savePrefs 已提示错误 */ }
}

function retentionLabel(hours) {
  return hours >= 24 ? `${hours / 24} 天` : `${hours} 小时`;
}

async function savePrefs(patch) {
  try {
    const data = await api('/api/prefs', patch);
    state.prefs = data.prefs;
    state.source = data.prefs.source;
    syncPrefs();
    updateListStatus();
    if (patch && patch.source) refreshAccount();
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
  { key: 'pick', label: '', width: 40 },
  { key: 'idx', label: '#', width: 46 },
  { key: 'name', label: '歌曲', width: 320 },
  { key: 'artist', label: '歌手', width: 170 },
  { key: 'album', label: '专辑', width: 190 },
  { key: 'dur', label: '时长', width: 78 },
  { key: 'size', label: '大小', width: 88 },
];
const FIXED_COLS = new Set(['pick', 'idx']);
const MIN_RATIO = 0.5;
const MAX_WIDTH = 2000;
const COL_STORE = 'nmd.colWidths';
const colW = loadColWidths();

function colMin(col) { return Math.round(col.width * MIN_RATIO); }

function loadColWidths() {
  const out = {};
  COLS.forEach((col) => { out[col.key] = col.width; });
  try {
    const saved = JSON.parse(localStorage.getItem(COL_STORE) || '{}');
    COLS.forEach((col) => {
      if (FIXED_COLS.has(col.key)) return;
      const width = Number(saved[col.key]);
      if (width) out[col.key] = Math.max(colMin(col), Math.min(MAX_WIDTH, width));
    });
  } catch (err) { /* 无本地存储时用默认列宽 */ }
  return out;
}

function saveColWidths() {
  const out = {};
  COLS.forEach((col) => { if (!FIXED_COLS.has(col.key)) out[col.key] = colW[col.key]; });
  try { localStorage.setItem(COL_STORE, JSON.stringify(out)); } catch (err) { /* 忽略 */ }
}

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

/* 列宽拖拽：最小为默认一半，可任意拉长；双击恢复默认 */
function bindColumnResize(container) {
  container.addEventListener('mousedown', (event) => {
    const handle = event.target.closest('.resizer');
    if (!handle) return;
    event.preventDefault();
    event.stopPropagation();
    const conf = COLS.find((col) => col.key === handle.dataset.col);
    const table = container.querySelector('table');
    if (!conf || !table || FIXED_COLS.has(conf.key)) return;
    const startX = event.clientX;
    const startWidth = colW[conf.key];
    document.body.classList.add('col-resizing');
    const onMove = (move) => {
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

  container.addEventListener('dblclick', (event) => {
    const handle = event.target.closest('.resizer');
    if (!handle) return;
    event.stopPropagation();
    const conf = COLS.find((col) => col.key === handle.dataset.col);
    const table = container.querySelector('table');
    if (conf && table) { resizeColumn(table, conf.key, conf.width); saveColWidths(); }
  });
}

function visibleSongs() {
  if (state.scope === 'search') return state.songs;
  const filter = $('query-input').value.trim().toLowerCase();
  if (!filter) return state.songs;
  return state.songs.filter((song) => (
    `${song.name} ${song.artists} ${song.album}`.toLowerCase().includes(filter)
  ));
}

function findSong(key) {
  return visibleSongs().find((song) => song.key === key)
    || state.songs.find((song) => song.key === key);
}

function songRows(songs) {
  colW.idx = idxWidthFor(songs.length);
  const cols = COLS.map((col) => (
    `<col data-col="${col.key}" style="width:${colW[col.key]}px">`
  )).join('');
  const heads = COLS.map((col) => {
    if (col.key === 'pick') return '<th class="pick"></th>';
    const cls = (col.key === 'dur' || col.key === 'size') ? ' class="num"' : '';
    if (FIXED_COLS.has(col.key)) {
      return `<th${cls} data-col="${col.key}">${esc(col.label)}</th>`;
    }
    return `<th${cls} data-col="${col.key}">${esc(col.label)}
      <span class="resizer" data-col="${col.key}" title="拖动调整列宽，双击恢复默认"></span></th>`;
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
  return `<table class="song-table" style="min-width:${tableMinWidth()}px">
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
  markPlayingRow();
  syncListBar();
}

function syncListBar() {
  const songs = visibleSongs();
  const has = songs.length > 0;
  const picked = songs.filter((song) => state.selected.has(song.key)).length;
  $('list-count').textContent = has ? `共 ${songs.length} 首` : '';
  $('btn-pick-all').hidden = !has;
  $('btn-play-all').hidden = !has;
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

/* ==================== 下载选项（与原版一致） ==================== */
function openDownloadDialog(songs) {
  if (!songs || !songs.length) { toast('请先选择歌曲', 'error'); return; }
  const prefs = state.prefs || {};
  const source = songs[0].source || state.source;
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
    { label: '开始下载', primary: true, onClick: (close) => submitDownload(close, songs) },
    { label: '取消', onClick: (close) => close() },
  ]);
  const levelSel = m.body.querySelector('#dl-level');
  const encInput = m.body.querySelector('#dl-encode');
  const levels = levelsOf(source);
  fillSelect(levelSel, levels, prefs.level);
  if (!levels.some((item) => item.value === levelSel.value)) {
    levelSel.value = levels[0] ? levels[0].value : 'exhigh';
  }
  const syncEncode = () => { encInput.value = encodeOf(source, levelSel.value).toUpperCase(); };
  levelSel.addEventListener('change', syncEncode);
  syncEncode();
  m.body.querySelector('#dl-lyric').checked = !!prefs.save_lyric;
  m.body.querySelector('#dl-tag').checked = !!prefs.embed_tag;
  m.body.querySelector('#dl-cover').checked = !!prefs.embed_cover;
  m.body.querySelector('#dl-embed-lyric').checked = !!prefs.embed_lyric;
  m.body.querySelector('#dl-skip').checked = !!prefs.skip_existing;
  fillSelect(m.body.querySelector('#dl-finish'),
    (state.meta && state.meta.finish_actions) || [{ value: 'none', label: '无' }],
    prefs.finish_action);
}

async function submitDownload(close, songs) {
  const root = $('modal-root').lastElementChild;
  if (!root) return;
  const options = {
    save_lyric: root.querySelector('#dl-lyric').checked,
    embed_tag: root.querySelector('#dl-tag').checked,
    embed_cover: root.querySelector('#dl-cover').checked,
    embed_lyric: root.querySelector('#dl-embed-lyric').checked,
    skip_existing: root.querySelector('#dl-skip').checked,
    finish_action: root.querySelector('#dl-finish').value,
  };
  try {
    await api('/api/download', {
      songs,
      level: root.querySelector('#dl-level').value,
      title: state.title || `${songs.length} 首歌曲`,
      source: songs[0].source || state.source,
      ...options,
    });
    if (typeof close === 'function') close();
    toast(`任务已创建：${songs.length} 首`, 'ok');
    openTasks();
    await refreshTasks(true);
  } catch (err) {
    toast(err.message, 'error');
  }
}

/* 顶栏下载图标：音源 / 音质 / 下载当前勾选 */
let menuNode = null;

function closeMenu() {
  if (menuNode) { menuNode.remove(); menuNode = null; }
}

function openDownloadMenu(button) {
  closeMenu();
  const allSongs = visibleSongs();
  const songs = allSongs.filter((song) => state.selected.has(song.key));
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
      下载选中${songs.length ? ` (${songs.length} 首)` : '（未勾选）'}</button>
    <button class="menu-item" data-act="go-all"${allSongs.length ? '' : ' disabled'}>
      下载全部${allSongs.length ? ` (${allSongs.length} 首)` : '（列表为空）'}</button>`;
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
      openDownloadDialog(songs);
    } else if (act === 'go-all') {
      openDownloadDialog(allSongs);
    }
  });
}

/* ==================== 通用右键菜单（与桌面版一致） ==================== */
let activeMenu = null;

function hideMenu() {
  if (activeMenu) { activeMenu.remove(); activeMenu = null; }
}

function showMenu(items, opts) {
  closeMenu();
  hideMenu();
  const box = document.createElement('div');
  box.className = 'menu';
  items.forEach((item) => {
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
  $('menu-root').appendChild(box);

  const options = opts || {};
  const width = box.offsetWidth;
  const height = box.offsetHeight;
  let left = options.x || 0;
  let top = options.y || 0;
  if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
  if (top + height > window.innerHeight - 8) top = Math.max(8, top - height - 4);
  box.style.left = left + 'px';
  box.style.top = top + 'px';
  activeMenu = box;
}

function bindMenuGuards() {
  document.addEventListener('click', (event) => {
    if (event.target.closest('.menu') || event.target.closest('[data-menu]')) return;
    hideMenu();
  });
  document.addEventListener('contextmenu', (event) => {
    if (!event.target.closest('.song-list')) hideMenu();
  }, true);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { hideMenu(); closeMenu(); }
  });
  document.addEventListener('scroll', hideMenu, true);
  window.addEventListener('resize', hideMenu);
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

/* ==================== 歌曲详情（可用音质 / 歌词 / 翻译） ==================== */
async function openDetail(song) {
  const html = `
    <div class="detail-top">
      ${song.cover ? `<img class="detail-cover" src="${esc(song.cover)}">` : '<span class="detail-cover"></span>'}
      <div class="detail-info">
        <h3>${esc(song.name)}</h3>
        <p class="muted">${esc(song.artists)} · ${esc(song.album)}</p>
        <p class="muted">时长 ${esc(song.duration_str)} · 音源 ${esc(labelOf((state.meta || {}).sources, song.source))} · 大小≈ ${esc(song.size)}</p>
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
    { label: '播放', primary: true, onClick: (close) => { close(); playFromList(song.key); } },
    { label: '下载', onClick: (close) => { close(); openDownloadDialog([song]); } },
    { label: '关闭', onClick: (close) => close() },
  ]);
  m.body.querySelector('[data-tabs]').addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-t]');
    if (!btn) return;
    $$('[data-tabs] button', m.body).forEach((node) => node.classList.toggle('active', node === btn));
    ['probe', 'lyric', 'trans'].forEach((name) => {
      m.body.querySelector(`[data-panel="${name}"]`).hidden = name !== btn.dataset.t;
    });
  });
  try {
    const rows = await api('/api/probe', { song });
    m.body.querySelector('[data-panel="probe"]').innerHTML = rows.map((row) => (
      `<div>${esc(row.label)}：${row.ok ? '可用（' + esc(row.detail) + '）' : '不可用'}</div>`
    )).join('');
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

/* ==================== 左缘悬浮岛：播放列表 ==================== */
const PANEL_STORE = 'nmd.panelPos';

function openQueue() {
  const el = $('island-queue');
  if (!el) return;
  state.queueOpen = true;
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add('open'));
  renderQueue();
}

function closeQueue() {
  const el = $('island-queue');
  if (!el) return;
  state.queueOpen = false;
  el.classList.remove('open');
  setTimeout(() => { if (!state.queueOpen) el.hidden = true; }, 220);
}

function toggleQueue() { state.queueOpen ? closeQueue() : openQueue(); }

/* 面板位置记忆（左侧岛 / 播放器窗口 / 下载任务窗口共用） */
function applyPanelPos(el, key) {
  if (!el) return;
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
  const head = el && el.querySelector('[data-drag]');
  if (!head) return;
  head.addEventListener('mousedown', (event) => {
    if (event.target.closest('.icon-btn')) return;
    const rect = el.getBoundingClientRect();
    const sx = event.clientX;
    const sy = event.clientY;
    let moved = false;
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    el.style.left = rect.left + 'px';
    el.style.top = rect.top + 'px';
    document.body.classList.add('island-drag');
    const onMove = (mv) => {
      if (Math.abs(mv.clientX - sx) > 3 || Math.abs(mv.clientY - sy) > 3) moved = true;
      el.style.left = Math.max(4, Math.min(window.innerWidth - 90, rect.left + mv.clientX - sx)) + 'px';
      el.style.top = Math.max(4, Math.min(window.innerHeight - 46, rect.top + mv.clientY - sy)) + 'px';
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.classList.remove('island-drag');
      if (moved) savePanelPos(el, key);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    event.preventDefault();
  });
}

function bindIslands() {
  const island = $('island-queue');
  if (!island) return;
  applyPanelPos(island, 'queue');
  bindPanelDrag(island, 'queue');
  island.querySelector('.island-close').addEventListener('click', closeQueue);
  $('hot-left').addEventListener('mouseenter', openQueue);
  document.addEventListener('mousedown', (event) => {
    if (!state.queueOpen) return;
    if (event.target.closest('#island-queue, .edge-hot, #menu-root')) return;
    closeQueue();
  });
  bindQueueList($('queue-list'));
  bindQueueList($('pw-queue'));
}

/* ==================== 播放列表：只能由用户显式添加 ==================== */
function queueIndexOf(key) { return state.queue.findIndex((song) => song.key === key); }

/* 在指定位置插入，插入点在当前曲之前时同步后移播放索引 */
function insertQueue(song, at) {
  state.queue.splice(at, 0, song);
  if (state.playIndex >= at) state.playIndex += 1;
  renderQueue();
  return at;
}

function appendToQueue(song) {
  const existing = queueIndexOf(song.key);
  if (existing >= 0) { toast('已在播放列表中', ''); return existing; }
  const at = insertQueue(song, state.queue.length);
  toast(`已添加到播放列表：${song.name}`, 'ok');
  return at;
}

/* 下一首播放：已存在则先摘出，再插到当前曲之后 */
function addNextPlay(song) {
  const existing = queueIndexOf(song.key);
  if (existing >= 0) {
    state.queue.splice(existing, 1);
    if (existing < state.playIndex) state.playIndex -= 1;
  }
  const at = state.playIndex >= 0 ? state.playIndex + 1 : state.queue.length;
  insertQueue(song, at);
  toast(`已加入下一首播放：${song.name}`, 'ok');
}

function bindQueueList(box) {
  if (!box) return;
  box.addEventListener('click', (event) => {
    const del = event.target.closest('.q-del');
    if (del) { removeFromQueue(Number(del.closest('.queue-item').dataset.i)); return; }
    const item = event.target.closest('.queue-item[data-i]');
    if (item) playIndex(Number(item.dataset.i));
  });
  box.addEventListener('contextmenu', (event) => {
    const item = event.target.closest('.queue-item[data-i]');
    if (!item) return;
    event.preventDefault();
    const index = Number(item.dataset.i);
    showMenu([
      { label: '播放这首', onClick: () => playIndex(index) },
      { label: '下一首播放', onClick: () => addNextPlay(state.queue[index]) },
      { separator: true },
      { label: '从播放列表移除', onClick: () => removeFromQueue(index) },
      { label: '清空播放列表', onClick: () => clearQueue() },
    ], { x: event.clientX, y: event.clientY });
  });
}

function removeFromQueue(index) {
  if (index < 0 || index >= state.queue.length) return;
  const wasPlaying = index === state.playIndex;
  state.queue.splice(index, 1);
  if (!state.queue.length) { clearQueue(); return; }
  if (index < state.playIndex) state.playIndex -= 1;
  else if (wasPlaying) state.playIndex = Math.min(index, state.queue.length - 1);
  renderQueue();
  if (wasPlaying) playIndex(state.playIndex);
  else syncPlayerTexts();
}

function clearQueue() {
  state.queue = [];
  state.playIndex = -1;
  state.playing = false;
  state.lyric = [];
  state.lyricKey = '';
  audio.pause();
  audio.removeAttribute('src');
  resetLyric();
  renderQueue();
  renderPwInfo();
  syncPlayerTexts();
  syncProgress();
}

/* 播放列表渲染：左缘岛与播放器窗口内的列表共用同一份数据 */
function renderQueue() {
  const html = state.queue.length ? state.queue.map((song, index) => `
    <div class="queue-item${index === state.playIndex ? ' playing' : ''}" data-i="${index}">
      <span class="q-idx">${index + 1}</span>
      <span class="q-name" title="${esc(song.name)}">${esc(song.name)}</span>
      <span class="q-artist" title="${esc(song.artists)}">${esc(song.artists)}</span>
      <span class="q-dur">${esc(song.duration_str)}</span>
      <button class="q-del" title="从播放列表移除">×</button>
    </div>`).join('') : '';

  ['queue-list', 'pw-queue'].forEach((id) => {
    const box = $(id);
    if (!box) return;
    if (!html) { box.classList.add('empty'); box.textContent = '播放列表为空'; return; }
    box.classList.remove('empty');
    box.innerHTML = html;
  });
  const count = $('queue-count');
  if (count) count.textContent = state.queue.length ? `${state.queue.length} 首` : '';
}

/* 歌曲行右键菜单：播放 / 下载 / 勾选 / 复制（对齐桌面版） */
function openSongMenu(song, x, y) {
  const picked = visibleSongs().filter((item) => state.selected.has(item.key));
  const selected = state.selected.has(song.key);
  const playing = currentSong() && currentSong().key === song.key;
  showMenu([
    { label: playing ? '暂停' : '播放此曲',
      onClick: () => (playing ? togglePlay() : playFromList(song.key)) },
    { label: '下一首播放', onClick: () => addNextPlay(song) },
    { label: '添加到播放列表', onClick: () => appendToQueue(song) },
    { separator: true },
    { label: '查看详情', onClick: () => openDetail(song) },
    { label: '下载此曲', onClick: () => openDownloadDialog([song]) },
    { separator: true },
    { label: selected ? '取消选中' : '选中此曲', onClick: () => togglePick(song.key) },
    { label: `下载已选（${picked.length} 首）`, disabled: !picked.length,
      onClick: () => openDownloadDialog(picked) },
    { separator: true },
    { label: '复制歌名', onClick: () => copyText(song.name, '歌名') },
    { label: '复制「歌手 - 歌名」',
      onClick: () => copyText(`${song.artists} - ${song.name}`, '歌曲信息') },
    { label: '复制专辑名', onClick: () => copyText(song.album, '专辑名') },
  ], { x, y });
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
  let failed = false;
  try {
    await refreshTasks();
    state.pollFailures = 0;
  } catch (err) {
    /* 服务短暂不可用（如后端重启）时静默退避，恢复后自动回到正常轮询 */
    failed = true;
    state.pollFailures = (state.pollFailures || 0) + 1;
  }
  const running = state.tasks.some((task) => task.status === 'queued' || task.status === 'running');
  let delay = running ? 1200 : 4000;
  if (failed) delay = Math.min(30000, 1500 * Math.pow(2, Math.min(state.pollFailures, 5)));
  else if (document.hidden) delay = 8000;
  state.pollTimer = setTimeout(pollTick, delay);
}

async function refreshTasks(force) {
  const data = await api('/api/tasks');
  state.tasks = data.items || [];
  let finishedNow = false;
  state.tasks.forEach((task) => {
    const finished = !['queued', 'running', 'paused'].includes(task.status);
    if (finished && !state.finishedIds.has(task.id)) {
      state.finishedIds.add(task.id);
      finishedNow = true;
    }
  });
  notifyTaskEnds();
  renderTasks(force);
  renderGlobalProgress();
  const dot = $('btn-tasks').querySelector('.dot');
  const active = state.tasks.some((task) => ['queued', 'running', 'paused'].includes(task.status));
  if (dot) dot.hidden = !active;
  if (finishedNow) loadFiles();
}

/* 任务状态变化时提示；完成动作选「浏览器通知」时额外发系统通知 */
function notifyTaskEnds() {
  state.tasks.forEach((task) => {
    const prev = state.lastStatus[task.id];
    if (!prev || prev === task.status) {
      state.lastStatus[task.id] = task.status;
      return;
    }
    state.lastStatus[task.id] = task.status;
    if (task.status === 'done') {
      toast(`${task.title} 下载完成`, 'ok');
      if (task.finish_action === 'message') notifyDesktop(`下载完成：${task.title}`,
        `${task.total} 首已完成`);
    } else if (task.status === 'partial') {
      toast(`${task.title} 有 ${task.failed} 首失败`, 'error');
    } else if (task.status === 'failed') {
      toast(`${task.title} 下载失败：${task.error || '全部歌曲失败'}`, 'error');
    }
  });
}

/* 浏览器通知：未授权时先请求授权，不可用时退回 toast */
function notifyDesktop(title, body) {
  if (!('Notification' in window)) { toast(body, 'ok'); return; }
  if (Notification.permission === 'granted') {
    try { new Notification(title, { body }); } catch (err) { /* 忽略 */ }
    return;
  }
  if (Notification.permission !== 'denied') Notification.requestPermission();
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
  const running = ['queued', 'running', 'paused'].includes(task.status);
  const expanded = state.expanded.has(task.id);
  const ctl = [];
  if (task.status === 'running') ctl.push('<button class="tiny" data-act="pause">暂停</button>');
  if (task.status === 'paused') ctl.push('<button class="tiny" data-act="resume">继续</button>');
  if (running) ctl.push('<button class="tiny" data-act="cancel">取消</button>');
  if (['done', 'partial', 'failed', 'cancelled'].includes(task.status)
    && (task.failed || task.status === 'cancelled')) {
    ctl.push('<button class="tiny" data-act="retry">重试</button>');
  }
  if (!running) ctl.push('<button class="tiny" data-act="delete">移除</button>');
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

function activeProgressTask() {
  return state.tasks.find((task) => ['queued', 'running', 'paused'].includes(task.status))
    || state.tasks.find((task) => ['done', 'partial', 'failed', 'cancelled'].includes(task.status));
}

function renderGlobalProgress() {
  const active = activeProgressTask();
  if (!active || state.dismissedTask === active.id) { paintGlobalProgress(0, null); return; }
  state.dismissedTask = null;
  paintGlobalProgress(active.progress || 0, active);
}

function paintGlobalProgress(ratio, task) {
  const bar = $('global-bar');
  const pctNode = $('global-pct');
  bar.style.width = `${Math.max(0, Math.min(1, ratio || 0)) * 100}%`;
  if (!task) {
    pctNode.textContent = '—';
    pctNode.title = '';
    return;
  }
  pctNode.textContent = `${((ratio || 0) * 100).toFixed(1)}%`;
  pctNode.title = `${task.title} · ${task.done}/${task.total}`
    + (task.speed ? ` · ${fmtSpeed(task.speed)}` : '') + '（点击清空进度）';
}

/* 下载任务结束后点击状态栏百分比清空进度条 */
function clearGlobalProgress() {
  const task = activeProgressTask();
  if (!task || ['queued', 'running', 'paused'].includes(task.status)) return;
  state.dismissedTask = task.id;
  paintGlobalProgress(0, null);
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
    const alive = new Set(state.files.map((file) => file.id));
    state.filesSelected.forEach((id) => { if (!alive.has(id)) state.filesSelected.delete(id); });
    renderFiles();
  } catch (err) {
    /* 未登录时静默 */
  }
}

function renderFiles() {
  const box = $('file-list');
  if (!state.files.length) {
    state.filesSelected.clear();
    box.className = 'task-list empty';
    box.textContent = '还没有下载完成的文件';
    syncFileBar();
    return;
  }
  box.className = 'task-list';
  box.innerHTML = state.files.map((file) => `
    <div class="file-row" data-file="${file.id}">
      <input type="checkbox" data-pick="${file.id}" ${state.filesSelected.has(file.id) ? 'checked' : ''}>
      <div class="file-main">
        <div class="file-name" title="${esc(file.filename)}">${esc(file.name)}${file.artists ? ' - ' + esc(file.artists) : ''}</div>
        <div class="file-meta">${esc(file.size_str)} · ${fmtETA(file.expires_in)}后过期</div>
      </div>
      <a class="btn-link" href="/api/files/${file.id}/download">下载</a>
      <button class="tiny" data-del="${file.id}">删除</button>
    </div>`).join('');
  syncFileBar();
}

function syncFileBar() {
  const total = state.files.length;
  const picked = state.filesSelected.size;
  $('files-pick-all').checked = total > 0 && picked === total;
  $('files-pick-all').indeterminate = picked > 0 && picked < total;
  $('files-sel-count').textContent = picked ? `已选 ${picked} / ${total} 首` : `共 ${total} 首`;
  $('btn-export').disabled = picked === 0;
  $('btn-export').textContent = picked > 1 ? `导出选中并打包 (${picked})` : '导出选中';
}

function exportSelected() {
  const ids = [...state.filesSelected];
  if (!ids.length) { toast('请先勾选文件', 'error'); return; }
  if (ids.length === 1) {
    // 单个文件直接下发原文件
    window.location.href = `/api/files/${ids[0]}/download`;
  } else {
    window.location.href = `/api/files/archive?ids=${encodeURIComponent(ids.join(','))}`;
  }
  if (state.prefs && state.prefs.delete_after_export) {
    toast('已开始导出，完成后将删除源文件', 'ok');
  }
  setTimeout(loadFiles, 4000);
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

/* ==================== 日志（设置页「日志」分类） ==================== */
function startLogPoll() {
  stopLogPoll();
  pollLogs();
  state.logTimer = setInterval(pollLogs, 1500);
}

function stopLogPoll() {
  if (state.logTimer) { clearInterval(state.logTimer); state.logTimer = null; }
}

async function pollLogs() {
  if (state.settingsTab !== 'logs' || $('settings-mask').hidden) return;
  try {
    const data = await api(`/api/logs?seq=${state.logSeq}&level=${encodeURIComponent(state.logLevel)}`);
    const items = (data && data.items) || [];
    if (!items.length) return;
    const box = $('log-list');
    box.classList.remove('empty');
    const wrap = box.closest('.log-wrap') || box.parentElement;
    const near = wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight < 40;
    items.forEach((item) => {
      state.logSeq = Math.max(state.logSeq, item.seq);
      const time = new Date(item.time * 1000).toLocaleTimeString('zh-CN', { hour12: false });
      const line = document.createElement('div');
      line.className = 'log-line';
      line.innerHTML = `<span class="t">${time}</span>`
        + `<span class="lv lv-${esc(item.level)}">${esc(item.level.toUpperCase())}</span>`
        + `<span>${esc(item.message)}</span>`;
      box.appendChild(line);
    });
    if (near) wrap.scrollTop = wrap.scrollHeight;
  } catch (err) { /* 轮询失败忽略 */ }
}

/* ==================== 设置 ==================== */
function openSettings() {
  $('settings-mask').hidden = false;
  syncPrefs();
  renderQuota();
  updateCloudNote();
  setSettingsPanel('music');
  if (state.authEnabled) refreshAccountStates();
}

function setSettingsPanel(name) {
  state.settingsTab = name;
  $$('#settings-tabs button').forEach((btn) => btn.classList.toggle('active', btn.dataset.spanel === name));
  $$('#settings-mask .modal-body [data-spanel]').forEach((panel) => {
    panel.hidden = panel.dataset.spanel !== name;
  });
  if (name === 'logs') startLogPoll();
  else stopLogPoll();
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
    state.account = data;
    paintSourceAvatar();
    syncPlayerTexts();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    button.disabled = false;
  }
}

/* ==================== 音源登录（顶栏直达） ==================== */
async function openSourceLogin() {
  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.innerHTML = `<div class="modal" style="min-width:min(380px,92vw)">
    <h3>音源登录</h3>
    <p class="field-note">扫码登录后可下载会员音质、查看我的歌单；不登录也能下载免费歌曲。</p>
    <div class="src-row" data-source="netease">
      <span class="src-name">网易云音乐</span>
      <span class="state" data-state>检查中…</span>
      <button class="primary tiny" data-qr>扫码登录</button>
    </div>
    <div class="src-row" data-source="qq">
      <span class="src-name">QQ 音乐</span>
      <span class="state" data-state>检查中…</span>
      <button class="primary tiny" data-qr>扫码登录</button>
    </div>
    <div class="qr-box" id="src-qr" hidden><img id="src-qr-img" alt="二维码">
      <span id="src-qr-hint" class="muted">正在获取二维码…</span></div>
    <p class="field-note" id="src-login-note"></p>
    <div class="modal-foot"><button class="ghost" data-close>关闭</button></div>
  </div>`;
  document.body.appendChild(mask);
  mask.addEventListener('click', (event) => {
    if (event.target === mask || event.target.closest('[data-close]')) {
      stopQrPoll();
      mask.remove();
      return;
    }
    const qrBtn = event.target.closest('[data-qr]');
    if (qrBtn) {
      /* 点击对应音源行即切换并为该音源重新取码 */
      startSourceQr(mask, qrBtn.closest('.src-row').dataset.source);
    }
  });

  const note = mask.querySelector('#src-login-note');
  if (note) {
    note.textContent = state.user
      ? '凭据保存到你的账号，换设备登录后可继续使用。'
      : '当前为访客：凭据保存在访客空间，换浏览器或清理 Cookie 后可能失效。';
  }
  refreshSourceRows(mask);
  /* 打开音源登录窗口即自动获取当前音源二维码，无需再点一次 */
  startSourceQr(mask, state.source);
}

/* 在音源登录窗口内直接展示二维码并轮询登录结果 */
async function startSourceQr(mask, source) {
  stopQrPoll();
  const box = mask.querySelector('#src-qr');
  const img = mask.querySelector('#src-qr-img');
  const hint = mask.querySelector('#src-qr-hint');
  if (!box || !img || !hint) return;
  mask.dataset.qrSource = source;
  box.hidden = false;
  img.hidden = true;
  hint.textContent = '正在获取二维码…';
  $$('.src-row', mask).forEach((row) => {
    row.classList.toggle('on', row.dataset.source === source);
  });
  let data;
  try {
    data = await api('/api/login/qr/start', { source, type: 'qq' });
  } catch (err) {
    hint.textContent = err.message;
    return;
  }
  if (!data.image) {
    hint.textContent = '二维码获取失败，请重试';
    return;
  }
  img.src = data.image;
  img.hidden = false;
  hint.textContent = '请用手机扫码并确认登录';
  qrTimer = setInterval(async () => {
    if (mask.dataset.qrSource !== source) return;
    try {
      const result = await api('/api/login/qr/poll', { source, identifier: data.identifier });
      hint.textContent = result.message || '等待扫码…';
      if (result.event === 'done') {
        stopQrPoll();
        toast('登录成功', 'ok');
        refreshSourceRows(mask);
        refreshAccountStates();
        refreshAccount();
      } else if (result.event === 'timeout' || result.event === 'refuse') {
        stopQrPoll();
      }
    } catch (err) {
      stopQrPoll();
      hint.textContent = err.message;
    }
  }, 2000);
}

async function refreshSourceRows(mask) {
  const rows = $$('.src-row', mask);
  for (const row of rows) {
    const node = row.querySelector('[data-state]');
    const btn = row.querySelector('[data-qr]');
    try {
      const data = await api('/api/account', { source: row.dataset.source });
      node.textContent = data.logged_in ? `已登录：${data.nickname || '用户'}` : '未登录';
      node.classList.toggle('on', !!data.logged_in);
      if (btn) btn.textContent = data.logged_in ? '重新扫码' : '扫码登录';
    } catch (err) {
      node.textContent = '未登录';
    }
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

/* ==================== 播放器 ==================== */
const audio = $('audio');
const LYRIC_BOXES = ['pl-lyric', 'pw-lyric'];
// 播放器有两套界面：播放器模式（pl-*）与下载模式的悬浮窗（pw-*），状态同步刷新
const PLAYER_NAMES = ['pl-name', 'pw-name'];
const PLAYER_ARTISTS = ['pl-artist', 'pw-artist'];
const PLAYER_COVERS = ['pl-cover', 'pw-cover'];
const PLAYER_TOGGLES = ['pl-toggle', 'pw-toggle'];
const PLAYER_MODES = ['pl-mode', 'pw-mode'];
const PLAYER_MUTES = ['pl-mute', 'pw-mute'];
const PLAYER_SEEKS = ['pl-seek', 'pw-seek'];
const PLAYER_CURS = ['pl-cur', 'pw-cur'];
const PLAYER_DURS = ['pl-dur', 'pw-dur'];
const PLAYER_VOLUMES = ['pl-volume', 'pw-volume'];

function eachId(ids, fn) {
  ids.forEach((id) => {
    const node = $(id);
    if (node) fn(node);
  });
}

function currentSong() {
  return state.playIndex >= 0 ? state.queue[state.playIndex] : null;
}

function setView(view) {
  state.view = view;
  $('download-view').hidden = view !== 'download';
  $('play-view').hidden = view !== 'play';
  paintModeButton();
}

/* 播放器窗口：下载模式下独立悬浮，右侧切换 歌词 / 播放列表 / 歌曲信息 */
function openPlayerWindow(tab) {
  const win = $('player-window');
  if (!win) return;
  win.hidden = false;
  state.pwOpen = true;
  if (tab) setPwTab(tab);
  updatePlayerWindow();
  syncProgress();
}

function closePlayerWindow() {
  const win = $('player-window');
  if (!win) return;
  state.pwOpen = false;
  win.hidden = true;
}

function setPwTab(tab) {
  state.pwTab = tab;
  $$('#player-window .pw-tabs button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.pwTab === tab);
  });
  $$('#player-window .pw-panel').forEach((panel) => {
    panel.hidden = panel.dataset.pwPanel !== tab;
  });
  if (tab === 'queue') renderQueue();
  if (tab === 'info') renderPwInfo();
}

/* 歌曲信息面板 */
function renderPwInfo() {
  const box = $('pw-info');
  if (!box) return;
  const song = currentSong();
  if (!song) { box.innerHTML = '<p class="muted small">未在播放</p>'; return; }
  const rows = [
    ['歌名', song.name],
    ['歌手', song.artists],
    ['专辑', song.album],
    ['时长', song.duration_str],
    ['大小≈', song.size],
    ['音源', labelOf((state.meta || {}).sources, song.source)],
    ['编码', encodeOf(song.source, (state.prefs || {}).level).toUpperCase()],
  ];
  box.innerHTML = rows.map(([label, value]) => (
    `<div class="info-row"><span>${esc(label)}</span><b>${esc(value || '—')}</b></div>`
  )).join('');
}

function updatePlayerWindow() {
  paintCoverButton(currentSong());
  if (!state.pwOpen) return;
  syncPlayerTexts();
  paintPlayButton();
  paintModeButtonPlay();
  if (state.pwTab === 'info') renderPwInfo();
}

function paintModeButton() {
  const btn = $('btn-mode');
  if (!btn) return;
  const download = state.view === 'download';
  btn.innerHTML = icon(download ? 'download' : 'music', 16)
    + `<span>${download ? '下载模式' : '播放器模式'}</span>`;
  btn.title = download ? '切换到播放器模式' : '切换到下载模式';
}

function setCover(node, song) {
  if (!node) return;
  const src = (song && song.cover) || avatarUrl()
    || sourceLogoUri((song && song.source) || state.source);
  node.src = src;
  node.style.visibility = 'visible';
}

/* 查询栏右侧的封面按钮：有当前曲目时显示，点击打开播放器窗口 */
function paintCoverButton(song) {
  const btn = $('btn-cover');
  const img = $('btn-cover-img');
  if (!btn || !img) return;
  const src = song
    ? ((song.cover) || avatarUrl() || sourceLogoUri(song.source))
    : '';
  if (src) {
    img.src = src;
    btn.hidden = false;
  } else {
    img.removeAttribute('src');
    btn.hidden = true;
  }
}

function syncPlayerTexts() {
  const song = currentSong();
  eachId(PLAYER_NAMES, (node) => {
    const target = node.querySelector('.mq') || node;
    target.textContent = song ? song.name : '未在播放';
  });
  eachId(PLAYER_ARTISTS, (node) => {
    if (node.id === 'pl-artist') {
      node.textContent = song ? `${song.artists} · ${song.album}` : '双击列表中的歌曲即可播放';
    } else {
      node.textContent = song ? `${song.artists} · ${song.album}` : '';
    }
  });
  eachId(PLAYER_COVERS, (node) => setCover(node, song));
  paintCoverButton(song);
}

function setPlayHint(text) {
  $('pl-hint').textContent = text || '';
}

function syncProgress() {
  const current = audio.currentTime || 0;
  const duration = audio.duration || 0;
  eachId(PLAYER_CURS, (node) => { node.textContent = fmtTime(current); });
  eachId(PLAYER_SEEKS, (node) => {
    node.value = duration ? String(Math.round((current / duration) * 1000)) : '0';
  });
  eachId(PLAYER_DURS, (node) => { node.textContent = fmtTime(duration); });
}

function markPlayingRow() {
  const song = currentSong();
  const key = song ? song.key : '';
  $$('#song-list tr[data-key]').forEach((tr) => {
    tr.classList.toggle('playing', tr.dataset.key === key);
  });
}

function levelLabelOf(source, level) {
  const hit = levelsOf(source).find((item) => item.value === level);
  return hit ? hit.label : level;
}

/* 播放当前列表第 index 首：向服务端换取直链，由浏览器直接播放（不占服务器带宽） */
async function playIndex(index) {
  if (!state.queue.length) { toast('播放列表为空', 'error'); return; }
  if (index < 0) index = state.queue.length - 1;
  if (index >= state.queue.length) index = 0;
  state.playIndex = index;
  const song = state.queue[index];
  state.lyric = [];
  state.lyricKey = '';
  resetLyric();
  syncPlayerTexts();
  setPlayHint('正在取址…');
  markPlayingRow();
  renderQueue();
  updatePlayerWindow();
  if (state.view === 'download') openPlayerWindow();
  try {
    const data = await api('/api/play', { song, level: (state.prefs || {}).level });
    /* 切歌前先停掉旧音源，避免旧请求被中断产生 ERR_ABORTED 控制台报错 */
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    audio.src = data.url;
    await audio.play().catch(() => { throw new Error('浏览器阻止了自动播放，请点播放键'); });
    state.playing = true;
    paintPlayButton();
    const kind = (data.type || data.encode || '').toUpperCase();
    setPlayHint(`${kind} · ${levelLabelOf(song.source, data.level)}`);
    loadLyric(song);
  } catch (err) {
    state.playing = false;
    paintPlayButton();
    setPlayHint('');
    toast('播放失败：' + err.message, 'error');
  }
}

function togglePlay() {
  if (!audio.src) { toast('还没有选择歌曲', 'error'); return; }
  if (audio.paused) audio.play().catch(() => {}); else audio.pause();
}

function paintPlayButton() {
  const playing = state.playing && !audio.paused;
  eachId(PLAYER_TOGGLES, (btn) => {
    btn.innerHTML = icon(playing ? 'pause' : 'play', 22);
    btn.title = playing ? '暂停' : '播放';
  });
}

function stepSong(delta) {
  if (!state.queue.length) return;
  if (state.playMode === 'shuffle') {
    playIndex(Math.floor(Math.random() * state.queue.length));
    return;
  }
  playIndex(state.playIndex + delta);
}

function cycleMode() {
  state.playMode = { order: 'shuffle', shuffle: 'single', single: 'order' }[state.playMode] || 'order';
  paintModeButtonPlay();
}

function paintModeButtonPlay() {
  const modes = {
    order: { icon: 'repeat', label: '顺序播放' },
    single: { icon: 'one', label: '单曲循环' },
    shuffle: { icon: 'shuffle', label: '随机播放' },
  };
  const mode = modes[state.playMode] || modes.order;
  eachId(PLAYER_MODES, (btn) => {
    btn.innerHTML = icon(mode.icon, 16) + `<span>${mode.label}</span>`;
    btn.title = `播放模式：${mode.label}（点击切换）`;
  });
}

function setVolume(value) {
  const volume = Math.max(0, Math.min(100, Number(value) || 0));
  audio.volume = volume / 100;
  eachId(PLAYER_VOLUMES, (slider) => {
    if (Number(slider.value) !== volume) slider.value = String(volume);
  });
  paintMuteButton();
  try { localStorage.setItem('nmd.volume', String(volume)); } catch (err) { /* 忽略 */ }
}

function paintMuteButton() {
  eachId(PLAYER_MUTES, (btn) => {
    btn.innerHTML = icon(audio.volume === 0 ? 'mute' : 'volume', 16);
  });
}

function initVolume() {
  let volume = 100;
  try {
    const saved = localStorage.getItem('nmd.volume');
    if (saved !== null && isFinite(Number(saved))) volume = Number(saved);
  } catch (err) { /* 忽略 */ }
  setVolume(volume);
}

function fmtTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '00:00';
  const total = Math.floor(seconds);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function parseLrc(text) {
  const lines = [];
  const re = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
  (text || '').split('\n').forEach((raw) => {
    const times = [];
    let match;
    re.lastIndex = 0;
    while ((match = re.exec(raw))) {
      times.push(Number(match[1]) * 60 + Number(match[2])
        + (match[3] ? Number(match[3]) / Math.pow(10, match[3].length) : 0));
    }
    const content = raw.replace(re, '').trim();
    if (!content || !times.length) return;
    times.forEach((t) => lines.push({ t, text: content }));
  });
  lines.sort((a, b) => a.t - b.t);
  return lines;
}

let lastLyricIndex = -1;

function resetLyric(text) {
  lastLyricIndex = -1;
  LYRIC_BOXES.forEach((sel) => {
    const box = $(sel);
    if (!box) return;
    box.classList.add('is-empty');
    box.textContent = text || '（暂无歌词）';
  });
  updateStatusLyric(audio.currentTime || 0);
}

async function loadLyric(song) {
  if (state.lyricKey === song.key) return;
  state.lyricKey = song.key;
  try {
    const data = await api('/api/lyric', { song });
    const lines = parseLrc(data.lyric);
    state.lyric = lines;
    if (!lines.length) { resetLyric(data.lyric ? '（纯文本歌词）' : '（无歌词）'); return; }
    const html = lines.map((line) => `<div class="lyric-line">${esc(line.text)}</div>`).join('');
    LYRIC_BOXES.forEach((sel) => {
      const box = $(sel);
      if (!box) return;
      box.classList.remove('is-empty');
      box.innerHTML = html;
    });
    lastLyricIndex = -1;
    syncLyric(audio.currentTime, true);
    updateStatusLyric(audio.currentTime || 0);
  } catch (err) {
    state.lyric = [];
    resetLyric('歌词获取失败');
  }
}

function syncLyric(time, force) {
  if (!state.lyric.length) return;
  let index = -1;
  for (let i = 0; i < state.lyric.length; i += 1) {
    if (state.lyric[i].t <= time + 0.2) index = i; else break;
  }
  if (index === lastLyricIndex && !force) return;
  lastLyricIndex = index;
  LYRIC_BOXES.forEach((sel) => {
    const box = $(sel);
    if (!box) return;
    const nodes = $$('.lyric-line', box);
    nodes.forEach((node, i) => node.classList.toggle('on', i === index));
    const node = nodes[index];
    if (!node) return;
    const top = node.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    box.scrollTop = Math.max(0, top - box.clientHeight / 2 + node.offsetHeight / 2);
  });
}

/* ==================== 状态栏歌词：随长度顶开进度条 ==================== */
let statusLyricKey = '';

function statusLyricMaxPx() {
  const percent = Math.max(10, Math.min(60, Number((state.prefs || {}).status_lyric_max) || 60));
  return window.innerWidth * percent / 100;
}

function updateStatusLyric(time) {
  const box = $('status-lyric');
  const inner = $('status-lyric-inner');
  if (!box || !inner) return;
  const song = currentSong();
  const lines = state.lyric || [];
  let index = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].t <= time + 0.2) index = i; else break;
  }
  const line = index >= 0 ? lines[index] : null;
  const text = line ? String(line.text || '').trim() : '';
  if (!(state.prefs || {}).status_lyric || !song || !text) {
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

/* 双击听歌：把该曲加入播放列表后立即播放（与原版一致） */
async function playFromList(key) {
  const song = findSong(key);
  if (!song) return;
  const existing = queueIndexOf(song.key);
  const index = existing >= 0 ? existing : insertQueue(song, state.queue.length);
  await playIndex(index);
}

/* 全部播放：把当前列表整批追加进播放列表，并播放第一首新加入的曲目 */
async function playAll() {
  const songs = visibleSongs();
  if (!songs.length) { toast('当前列表没有歌曲', 'error'); return; }
  let firstNew = -1;
  songs.forEach((song) => {
    if (queueIndexOf(song.key) < 0) {
      if (firstNew < 0) firstNew = state.queue.length;
      state.queue.push(song);
    }
  });
  renderQueue();
  const target = firstNew >= 0 ? firstNew : queueIndexOf(songs[0].key);
  await playIndex(target);
}

/* ==================== 扫码登录 ==================== */
let qrTimer = null;

function stopQrPoll() {
  if (qrTimer) { clearInterval(qrTimer); qrTimer = null; }
}

async function openQrLogin(source, onDone) {
  stopQrPoll();
  const label = source === 'qq' ? 'QQ 音乐' : '网易云音乐';
  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.innerHTML = `<div class="modal" style="min-width:min(340px,92vw)">
    <h3>${label}扫码登录</h3>
    <div class="qr-box"><img id="qr-img" alt="二维码">
      <span id="qr-hint" class="muted">正在获取二维码…</span></div>
    <div class="modal-foot"><button class="ghost" data-close>关闭</button></div>
  </div>`;
  document.body.appendChild(mask);
  const close = () => { stopQrPoll(); mask.remove(); };
  mask.addEventListener('click', (event) => {
    if (event.target === mask || event.target.closest('[data-close]')) close();
  });

  let data;
  try {
    data = await api('/api/login/qr/start', { source, type: 'qq' });
  } catch (err) {
    close();
    toast(err.message, 'error');
    return;
  }

  const img = mask.querySelector('#qr-img');
  const hint = mask.querySelector('#qr-hint');
  if (data.image) {
    img.src = data.image;
    img.hidden = false;
  } else {
    img.hidden = true;
    hint.textContent = '二维码获取失败，请重试';
    return;
  }
  hint.textContent = '请用手机扫码并确认登录';

  qrTimer = setInterval(async () => {
    try {
      const result = await api('/api/login/qr/poll', { source, identifier: data.identifier });
      hint.textContent = result.message || '等待扫码…';
      if (result.event === 'done') {
        stopQrPoll();
        toast('登录成功', 'ok');
        close();
        refreshAccountStates();
        if (typeof onDone === 'function') onDone();
        refreshAccount();
      } else if (result.event === 'timeout' || result.event === 'refuse') {
        stopQrPoll();
      }
    } catch (err) {
      stopQrPoll();
      hint.textContent = err.message;
    }
  }, 2000);
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
    // 退出后回到访客身份继续使用，不强制重新登录
    location.reload();
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
  $('btn-src').addEventListener('click', switchSource);
  $('btn-cover').addEventListener('click', () => openPlayerWindow('lyric'));

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
  $('btn-download-sel').addEventListener('click', () => {
    openDownloadDialog(visibleSongs().filter((song) => state.selected.has(song.key)));
  });
  $('btn-play-all').addEventListener('click', playAll);
  $('song-list').addEventListener('dblclick', (event) => {
    if (event.target.closest('.pick') || event.target.closest('.resizer')) return;
    const row = event.target.closest('tr[data-key]');
    if (row) playFromList(row.dataset.key);
  });
  $('song-list').addEventListener('contextmenu', (event) => {
    const row = event.target.closest('tr[data-key]');
    if (!row) return;
    event.preventDefault();
    const song = findSong(row.dataset.key);
    if (song) openSongMenu(song, event.clientX, event.clientY);
  });
  bindColumnResize($('song-list'));

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
  $('btn-source').addEventListener('click', openSourceLogin);
  $('btn-mode').addEventListener('click', () => setView(state.view === 'download' ? 'play' : 'download'));
  document.addEventListener('click', () => closeMenu());

  /* 播放器 */
  $('pl-toggle').addEventListener('click', togglePlay);
  $('pl-prev').addEventListener('click', () => stepSong(-1));
  $('pl-next').addEventListener('click', () => stepSong(1));
  $('pl-mode').addEventListener('click', cycleMode);
  $('pl-list').addEventListener('click', toggleQueue);
  $('pl-mute').addEventListener('click', () => setVolume(audio.volume > 0 ? 0 : 60));
  $('pl-volume').addEventListener('input', (event) => setVolume(event.target.value));
  $('pl-seek').addEventListener('input', (event) => {
    if (audio.duration) audio.currentTime = (Number(event.target.value) / 1000) * audio.duration;
  });
  $('pw-close').addEventListener('click', closePlayerWindow);
  $$('#player-window .pw-tabs button').forEach((btn) => {
    btn.addEventListener('click', () => setPwTab(btn.dataset.pwTab));
  });
  $('pw-toggle').addEventListener('click', togglePlay);
  $('pw-prev').addEventListener('click', () => stepSong(-1));
  $('pw-next').addEventListener('click', () => stepSong(1));
  $('pw-mode').addEventListener('click', cycleMode);
  $('pw-mute').addEventListener('click', () => setVolume(audio.volume > 0 ? 0 : 60));
  $('pw-volume').addEventListener('input', (event) => setVolume(event.target.value));
  $('pw-seek').addEventListener('input', (event) => {
    if (audio.duration) audio.currentTime = (Number(event.target.value) / 1000) * audio.duration;
  });
  audio.addEventListener('play', () => { state.playing = true; paintPlayButton(); });
  audio.addEventListener('pause', () => { state.playing = false; paintPlayButton(); });
  audio.addEventListener('timeupdate', () => {
    syncProgress();
    syncLyric(audio.currentTime || 0);
    updateStatusLyric(audio.currentTime || 0);
  });
  audio.addEventListener('loadedmetadata', syncProgress);
  audio.addEventListener('ended', () => {
    if (state.playMode === 'single') {
      audio.currentTime = 0;
      audio.play().catch(() => {});
      return;
    }
    stepSong(1);
  });
  audio.addEventListener('error', () => {
    if (!audio.src) return;
    setPlayHint('播放出错，可尝试降低音质后重试');
    state.playing = false;
    paintPlayButton();
  });

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
        if (!confirm('取消该下载任务？未完成的部分将被清理。')) return;
        await api('/api/task/action', { id, action: 'cancel' });
        toast('已请求取消任务', 'ok');
      } else if (act === 'delete') {
        if (!confirm('移除该任务并删除其尚未导出的文件？')) return;
        await api('/api/task/action', { id, action: 'delete' });
        toast('任务已移除', 'ok');
        await loadFiles();
      } else {
        await api('/api/task/action', { id, action: act });
        toast({ pause: '任务已暂停', resume: '任务已继续', retry: '已重新开始任务' }[act] || '操作完成', 'ok');
      }
      await refreshTasks(true);
      renderTasks(true);
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

  $('files-pick-all').addEventListener('change', (event) => {
    if (event.target.checked) state.files.forEach((file) => state.filesSelected.add(file.id));
    else state.filesSelected.clear();
    renderFiles();
  });
  $('file-list').addEventListener('change', (event) => {
    const pick = event.target.closest('[data-pick]');
    if (!pick) return;
    if (pick.checked) state.filesSelected.add(pick.dataset.pick);
    else state.filesSelected.delete(pick.dataset.pick);
    syncFileBar();
  });
  $('btn-export').addEventListener('click', exportSelected);

  /* 设置 */
  $('settings-close').addEventListener('click', () => {
    $('settings-mask').hidden = true;
    stopLogPoll();
  });
  $('settings-mask').addEventListener('click', (event) => {
    if (event.target === $('settings-mask')) {
      $('settings-mask').hidden = true;
      stopLogPoll();
    }
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
   ['pref-cover', 'embed_cover'], ['pref-embed-lyric', 'embed_lyric'],
   ['pref-skip', 'skip_existing'], ['pref-task-folder', 'task_folder'],
   ['pref-status-lyric', 'status_lyric'],
   ['pref-delete-after', 'delete_after_export']]
    .forEach(([id, key]) => {
      $(id).addEventListener('change', () => savePrefs({ [key]: $(id).checked }));
    });
  $('pref-template').addEventListener('change', () => {
    savePrefs({ name_template: $('pref-template').value.trim() || '{artist} - {name}' });
  });
  $('pref-folder').addEventListener('change', () => {
    savePrefs({ folder_structure: $('pref-folder').value });
  });
  $('pref-workers').addEventListener('change', () => {
    savePrefs({ workers: Number($('pref-workers').value || 3) });
  });
  $('pref-retry').addEventListener('change', () => {
    savePrefs({ retry: Number($('pref-retry').value || 0) });
  });
  $('pref-finish').addEventListener('change', () => {
    savePrefs({ finish_action: $('pref-finish').value });
  });
  $('pref-status-lyric-max').addEventListener('change', () => {
    savePrefs({ status_lyric_max: Number($('pref-status-lyric-max').value || 60) });
  });
  $('pref-retention').addEventListener('change', () => {
    savePrefs({ retention_hours: Number($('pref-retention').value) });
  });

  /* 日志页 */
  $('log-level').addEventListener('change', () => {
    state.logLevel = $('log-level').value;
    savePrefs({ log_level: state.logLevel });
  });
  $('btn-clear-log').addEventListener('click', async () => {
    try {
      await api('/api/logs/clear', {});
      state.logSeq = 0;
      const list = $('log-list');
      list.innerHTML = '暂无日志';
      list.classList.add('empty');
    } catch (err) { toast(err.message, 'error'); }
  });

  $$('[data-login]').forEach((btn) => {
    btn.addEventListener('click', () => loginSource(btn.dataset.login, btn));
  });
  $$('[data-qr]').forEach((btn) => {
    btn.addEventListener('click', () => openQrLogin(btn.dataset.qr));
  });
  $$('[data-logout]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const source = btn.dataset.logout;
      try {
        await api('/api/account/logout', { source });
        toast('已退出该音源', 'ok');
        refreshAccountStates();
        refreshAccount();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });

  /* 窗口拖动与位置记忆 */
  setPwTab(state.pwTab || 'lyric');
  [['tasks-window', 'tasks'], ['files-window', 'files'], ['player-window', 'player']]
    .forEach(([id, key]) => {
      const win = $(id);
      if (!win) return;
      applyPanelPos(win, key);
      bindPanelDrag(win, key);
    });

  /* 状态栏进度：点击清空 */
  $('global-pct').addEventListener('click', clearGlobalProgress);

  /* 快捷键 */
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    closeMenu();
    hideMenu();
    if (state.queueOpen) { closeQueue(); return; }
    if (!$('player-window').hidden) { closePlayerWindow(); return; }
    if (!$('tasks-window').hidden) { $('tasks-window').hidden = true; return; }
    if (!$('files-window').hidden) { $('files-window').hidden = true; return; }
    if (!$('settings-mask').hidden) { $('settings-mask').hidden = true; stopLogPoll(); }
  });
}

bootstrap();
