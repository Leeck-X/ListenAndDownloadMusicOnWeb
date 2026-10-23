/* Server 版前端：登录、检索、勾选下载、任务进度、文件交付。 */
'use strict';

const $ = (id) => document.getElementById(id);

const state = {
  user: null,
  meta: null,
  prefs: null,
  mode: 'search',
  source: 'netease',
  songs: [],
  selected: new Set(),
  keyword: '',
  offset: 0,
  hasMore: false,
  loading: false,
  title: '',
  tasks: [],
  files: [],
  pollTimer: null,
  finishedTaskIds: new Set(),
  authMode: 'login',
  drawerTab: 'tasks',
};

/* ---------------- 基础工具 ---------------- */
function escapeHtml(text) {
  return String(text == null ? '' : text).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

let toastTimer = null;
function toast(message, isError) {
  const node = $('toast');
  node.textContent = message;
  node.classList.toggle('error', !!isError);
  node.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.add('hidden'), 3200);
}

function fmtBytes(size) {
  const value = Number(size) || 0;
  if (value <= 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  let index = 0;
  let v = value;
  while (v >= 1024 && index < units.length - 1) { v /= 1024; index += 1; }
  return index === 0 ? `${Math.round(v)} B` : `${v.toFixed(1)} ${units[index]}`;
}

function fmtSpeed(bps) {
  if (!bps) return '';
  return `${fmtBytes(bps)}/s`;
}

function fmtETA(seconds) {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} 秒`;
  if (s < 3600) return `${Math.round(s / 60)} 分钟`;
  if (s < 86400) return `${Math.round(s / 3600)} 小时`;
  return `${Math.round(s / 86400)} 天`;
}

async function api(path, payload, method) {
  const options = { method: method || (payload === undefined ? 'GET' : 'POST'), credentials: 'same-origin' };
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
    showAuth();
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

/* ---------------- 登录 / 注册 ---------------- */
function showAuth() {
  state.user = null;
  stopPolling();
  $('app').classList.add('hidden');
  $('auth').classList.remove('hidden');
}

function showApp() {
  $('auth').classList.add('hidden');
  $('app').classList.remove('hidden');
}

function switchAuthTab(mode) {
  state.authMode = mode;
  document.querySelectorAll('#auth .tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.tab === mode);
  });
  $('auth-confirm-wrap').classList.toggle('hidden', mode !== 'register');
  $('auth-submit').textContent = mode === 'register' ? '注册并登录' : '登录';
  $('auth-pass').autocomplete = mode === 'register' ? 'new-password' : 'current-password';
  $('auth-error').textContent = '';
}

document.querySelectorAll('#auth .tab').forEach((tab) => {
  tab.addEventListener('click', () => switchAuthTab(tab.dataset.tab));
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

/* ---------------- 初始化 ---------------- */
async function bootstrap() {
  try {
    const data = await api('/api/auth/me');
    state.user = data.user;
    await enterApp();
  } catch (err) {
    showAuth();
  }
}

async function enterApp() {
  showApp();
  try {
    await loadMeta();
  } catch (err) {
    toast(err.message, true);
    showAuth();
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
  $('user-name').textContent = meta.user || '';
  renderSources();
  renderLevels();
  syncPrefsControls();
  updateQuota(meta.quota);
}

function updateQuota(quota) {
  if (!quota || !state.meta) return;
  state.meta.quota = quota;
}

/* ---------------- 音源 / 音质 ---------------- */
function renderSources() {
  const box = $('source-seg');
  box.innerHTML = '';
  (state.meta.sources || []).forEach((item) => {
    const button = document.createElement('button');
    button.className = 'seg-btn' + (item.value === state.source ? ' active' : '');
    button.textContent = item.label;
    button.addEventListener('click', () => switchSource(item.value));
    box.appendChild(button);
  });
}

function renderLevels() {
  const select = $('level-select');
  const levels = (state.meta.levels || {})[state.source] || [];
  select.innerHTML = '';
  levels.forEach((item) => {
    const option = document.createElement('option');
    option.value = item.value;
    option.textContent = item.label;
    select.appendChild(option);
  });
  const wanted = state.prefs.level;
  select.value = levels.some((item) => item.value === wanted)
    ? wanted : (levels[0] ? levels[0].value : '');
}

async function switchSource(source) {
  if (source === state.source) return;
  state.source = source;
  state.prefs.source = source;
  renderSources();
  renderLevels();
  await savePrefs({ source });
  if (state.mode === 'search' && state.keyword) {
    doSearch(true);
  } else if (state.mode !== 'search') {
    setStatus('切换音源后请重新查询');
  }
}

$('level-select').addEventListener('change', () => {
  const level = $('level-select').value;
  state.prefs.level = level;
  savePrefs({ level });
});

async function savePrefs(patch) {
  try {
    const data = await api('/api/prefs', patch);
    state.prefs = data.prefs;
    if (patch.source) {
      state.source = data.prefs.source;
      renderSources();
      renderLevels();
    }
    if (patch.level) {
      $('level-select').value = data.prefs.level;
      $('pref-level').value = data.prefs.level;
    }
  } catch (err) {
    toast(err.message, true);
  }
}

/* ---------------- 模式与检索 ---------------- */
document.querySelectorAll('#mode-seg .seg-btn').forEach((button) => {
  button.addEventListener('click', () => switchMode(button.dataset.mode));
});

function switchMode(mode) {
  state.mode = mode;
  document.querySelectorAll('#mode-seg .seg-btn').forEach((button) => {
    button.classList.toggle('active', button.dataset.mode === mode);
  });
  const input = $('search-input');
  if (mode === 'search') {
    input.placeholder = '输入歌名 / 歌手';
  } else if (mode === 'playlist') {
    input.placeholder = '粘贴歌单链接 / 歌单 ID / 单曲链接';
  } else {
    input.placeholder = '在「我喜欢的音乐」中筛选';
    loadLiked();
  }
}

$('btn-search').addEventListener('click', () => doSearch(true));
$('search-input').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') doSearch(true);
});

let filterTimer = null;
$('search-input').addEventListener('input', () => {
  if (state.mode === 'search') return;
  clearTimeout(filterTimer);
  filterTimer = setTimeout(renderSongs, 200);
});

async function doSearch(reset) {
  const text = $('search-input').value.trim();
  if (state.mode === 'search') {
    if (!text) { toast('请输入搜索关键词', true); return; }
    await searchRemote(text, reset ? 0 : state.offset);
  } else if (state.mode === 'playlist') {
    if (!text) { toast('请输入歌单链接或 ID', true); return; }
    await loadPlaylist(text);
  } else {
    if (state.songs.length) renderSongs();
    else await loadLiked();
  }
}

function setLoading(loading) {
  state.loading = loading;
  $('btn-search').disabled = loading;
  $('btn-search').textContent = loading ? '查询中' : '查询';
}

async function searchRemote(keyword, offset) {
  setLoading(true);
  setStatus('查询中…');
  try {
    const data = await api('/api/search', {
      keyword, limit: 50, offset, source: state.source,
    });
    if (offset === 0) {
      state.songs = data.songs || [];
      state.title = `搜索：${keyword}`;
      state.selected.clear();
    } else {
      state.songs = state.songs.concat(data.songs || []);
    }
    state.keyword = keyword;
    state.offset = data.offset;
    state.hasMore = (data.songs || []).length >= 50;
    renderSongs();
    setStatus(`已加载 ${state.songs.length} 首${state.hasMore ? '，滚动到底继续加载' : ''}`);
  } catch (err) {
    setStatus('');
    toast(err.message, true);
  } finally {
    setLoading(false);
  }
}

async function loadPlaylist(text) {
  setLoading(true);
  setStatus('获取歌单中…');
  try {
    const data = await api('/api/playlist', { text, source: state.source });
    state.songs = data.songs || [];
    state.title = data.title || '歌单';
    state.selected.clear();
    state.keyword = text;
    state.hasMore = false;
    renderSongs();
    setStatus(`已加载 ${state.songs.length} 首`);
  } catch (err) {
    setStatus('');
    toast(err.message, true);
  } finally {
    setLoading(false);
  }
}

async function loadLiked() {
  setLoading(true);
  setStatus('获取我喜欢的音乐…');
  try {
    const data = await api('/api/liked', { source: state.source });
    state.songs = data.songs || [];
    state.title = data.title || '我喜欢的音乐';
    state.selected.clear();
    state.hasMore = false;
    renderSongs();
    setStatus(state.songs.length ? `已加载 ${state.songs.length} 首` : '未找到喜欢的歌曲');
  } catch (err) {
    setStatus('');
    toast(err.message, true);
  } finally {
    setLoading(false);
  }
}

function setStatus(text) {
  $('list-status').textContent = text;
}

/* ---------------- 列表渲染 ---------------- */
function visibleSongs() {
  const filter = $('search-input').value.trim().toLowerCase();
  if (state.mode === 'search' || !filter) return state.songs;
  return state.songs.filter((song) => (
    `${song.name} ${song.artists}`.toLowerCase().includes(filter)
  ));
}

function renderSongs() {
  const body = $('song-body');
  const songs = visibleSongs();
  const positions = new Map(state.songs.map((song, index) => [song.key, index + 1]));
  $('list-title').textContent = state.title || '搜索结果';
  body.innerHTML = '';

  const fragment = document.createDocumentFragment();
  songs.forEach((song) => {
    const row = document.createElement('tr');
    const checked = state.selected.has(song.key);
    row.className = checked ? 'selected' : '';
    row.dataset.key = song.key;
    row.innerHTML = `
      <td class="col-check"><input type="checkbox" ${checked ? 'checked' : ''}></td>
      <td class="col-index">${positions.get(song.key) || ''}</td>
      <td class="col-name" title="${escapeHtml(song.name)}">
        <div class="song-name">${escapeHtml(song.name)}</div>
      </td>
      <td class="col-artist" title="${escapeHtml(song.artists)}">${escapeHtml(song.artists)}</td>
      <td class="col-album" title="${escapeHtml(song.album)}">${escapeHtml(song.album)}</td>
      <td class="col-dur">${escapeHtml(song.duration_str || '')}</td>
      <td class="col-size">${escapeHtml(song.size || '-')}</td>`;
    row.addEventListener('click', (event) => {
      if (event.target.tagName === 'INPUT') return;
      toggleSong(song.key);
    });
    row.querySelector('input').addEventListener('change', () => toggleSong(song.key));
    fragment.appendChild(row);
  });
  body.appendChild(fragment);

  $('empty').classList.toggle('hidden', songs.length > 0);
  updateSelectionUI();
}

function toggleSong(key) {
  if (state.selected.has(key)) state.selected.delete(key);
  else state.selected.add(key);
  const row = document.querySelector(`#song-body tr[data-key="${key}"]`);
  if (row) {
    const checked = state.selected.has(key);
    row.classList.toggle('selected', checked);
    row.querySelector('input').checked = checked;
  }
  updateSelectionUI();
}

function updateSelectionUI() {
  const visible = visibleSongs();
  const selectedCount = state.selected.size;
  $('selected-count').textContent = `已选 ${selectedCount} 首`;
  const allChecked = visible.length > 0 && visible.every((song) => state.selected.has(song.key));
  $('check-all').checked = allChecked;
  $('check-all').indeterminate = !allChecked && visible.some((song) => state.selected.has(song.key));
}

$('check-all').addEventListener('change', () => {
  const visible = visibleSongs();
  const allChecked = visible.every((song) => state.selected.has(song.key));
  visible.forEach((song) => {
    if (allChecked) state.selected.delete(song.key);
    else state.selected.add(song.key);
  });
  renderSongs();
});

/* ---------------- 滚动加载 ---------------- */
$('table-wrap').addEventListener('scroll', (event) => {
  const node = event.target;
  if (state.mode !== 'search' || state.loading || !state.hasMore) return;
  if (node.scrollTop + node.clientHeight >= node.scrollHeight - 160) {
    searchRemote(state.keyword, state.offset);
  }
});

/* ---------------- 下载 ---------------- */
$('btn-download').addEventListener('click', async () => {
  const songs = state.songs.filter((song) => state.selected.has(song.key));
  if (!songs.length) {
    toast('请先勾选要下载的歌曲', true);
    return;
  }
  const level = $('level-select').value;
  const button = $('btn-download');
  button.disabled = true;
  try {
    await api('/api/download', {
      songs, level, title: state.title || `${songs.length} 首歌曲`,
      source: state.source,
    });
    toast(`已提交任务：${songs.length} 首`);
    openDrawer('tasks');
    refreshTasks(true);
  } catch (err) {
    toast(err.message, true);
  } finally {
    button.disabled = false;
  }
});

/* ---------------- 任务轮询 ---------------- */
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
    await refreshTasks(false);
  } catch (err) {
    /* 轮询失败静默重试 */
  }
  if (!state.user) return;
  const running = state.tasks.some((task) => task.status === 'queued' || task.status === 'running');
  state.pollTimer = setTimeout(pollTick, running ? 1200 : 4000);
}

async function refreshTasks(force) {
  const data = await api('/api/tasks');
  state.tasks = data.items || [];
  let finishedNow = false;
  state.tasks.forEach((task) => {
    const finished = !['queued', 'running'].includes(task.status);
    if (finished && !state.finishedTaskIds.has(task.id)) {
      state.finishedTaskIds.add(task.id);
      finishedNow = true;
    }
  });
  renderTasks();
  renderGlobalProgress();
  if (finishedNow || force) {
    loadFiles();
  }
}

function taskPill(status) {
  const labels = {
    queued: '排队中', running: '下载中', done: '已完成',
    partial: '部分失败', failed: '失败', cancelled: '已取消',
  };
  return `<span class="pill ${status}">${labels[status] || status}</span>`;
}

function renderTasks() {
  const box = $('drawer-tasks');
  const wasNearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
  if (!state.tasks.length) {
    box.innerHTML = '<p class="muted">暂无下载任务</p>';
    return;
  }
  box.innerHTML = state.tasks.map((task) => {
    const running = task.status === 'queued' || task.status === 'running';
    const percent = Math.round((task.progress || 0) * 100);
    const meta = [
      `${task.done}/${task.total}`,
      task.failed ? `失败 ${task.failed}` : '',
      running && task.speed ? fmtSpeed(task.speed) : '',
    ].filter(Boolean).join(' · ');
    return `
      <div class="task-card" data-task="${task.id}">
        <div class="task-head">
          <span class="task-title" title="${escapeHtml(task.title)}">${escapeHtml(task.title)}</span>
          ${taskPill(task.status)}
        </div>
        <div class="bar"><i style="width:${percent}%"></i></div>
        <div class="task-meta">
          <span>${meta || '等待开始'}</span>
          <span>${percent}%</span>
        </div>
        ${task.error ? `<div class="task-meta"><span style="color:#ff8f8f">${escapeHtml(task.error)}</span></div>` : ''}
        <div class="task-actions">
          ${running ? `<button class="ghost small" data-action="cancel">取消</button>` : ''}
          ${running ? '' : '<button class="danger small" data-action="delete">删除</button>'}
        </div>
      </div>`;
  }).join('');

  box.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      const card = button.closest('[data-task]');
      const taskId = card.dataset.task;
      const action = button.dataset.action;
      try {
        if (action === 'cancel') {
          await api(`/api/tasks/${taskId}/cancel`, {});
          toast('已请求取消任务');
        } else {
          await api(`/api/tasks/${taskId}`, {}, 'DELETE');
          toast('任务及文件已删除');
        }
        await refreshTasks(true);
      } catch (err) {
        toast(err.message, true);
      }
    });
  });
  if (wasNearBottom) box.scrollTop = box.scrollHeight;
}

function renderGlobalProgress() {
  const active = state.tasks.find((task) => task.status === 'running')
    || state.tasks.find((task) => task.status === 'queued');
  const bar = $('global-progress').querySelector('i');
  if (!active) {
    bar.style.width = '0';
    $('global-text').textContent = '';
    return;
  }
  bar.style.width = `${Math.round((active.progress || 0) * 100)}%`;
  const speed = active.speed ? ` · ${fmtSpeed(active.speed)}` : '';
  $('global-text').textContent = `${active.title} · ${active.done}/${active.total}${speed}`;
}

/* ---------------- 文件 ---------------- */
async function loadFiles() {
  try {
    const data = await api('/api/files');
    state.files = data.items || [];
    $('file-count').textContent = state.files.length;
    renderFiles();
    if (state.meta && state.meta.quota) {
      updateQuota({ used: data.usage, limit: state.meta.quota.limit,
        used_str: fmtBytes(data.usage), limit_str: state.meta.quota.limit_str });
    }
  } catch (err) {
    /* 未登录时静默 */
  }
}

function renderFiles() {
  const box = $('drawer-files');
  const quota = state.meta && state.meta.quota;
  const quotaLine = quota
    ? `<p class="muted small">已用 ${escapeHtml(quota.used_str || fmtBytes(quota.used))} / ${escapeHtml(quota.limit_str || '不限')} · 文件保留 ${state.meta.retention_hours} 小时</p>`
    : '';
  if (!state.files.length) {
    box.innerHTML = `${quotaLine}<p class="muted">还没有下载完成的文件</p>`;
    return;
  }
  box.innerHTML = quotaLine + state.files.map((file) => `
    <div class="file-card" data-file="${file.id}">
      <div class="file-main">
        <div class="file-name" title="${escapeHtml(file.filename)}">${escapeHtml(file.name)}</div>
        <div class="file-meta">${escapeHtml(file.artists)} · ${escapeHtml(file.size_str)} · ${fmtETA(file.expires_in)}后过期</div>
      </div>
      <a href="/api/files/${file.id}/download">下载</a>
      <button class="danger small" data-delete="${file.id}">删除</button>
    </div>`).join('');

  box.querySelectorAll('[data-delete]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!confirm('删除该文件？')) return;
      try {
        await api(`/api/files/${button.dataset.delete}`, {}, 'DELETE');
        await loadFiles();
        toast('文件已删除');
      } catch (err) {
        toast(err.message, true);
      }
    });
  });
}

/* ---------------- 抽屉 ---------------- */
function openDrawer(tab) {
  $('drawer').classList.remove('hidden');
  switchDrawerTab(tab || state.drawerTab);
}

function switchDrawerTab(tab) {
  state.drawerTab = tab;
  document.querySelectorAll('#drawer .tab').forEach((button) => {
    button.classList.toggle('active', button.dataset.drawer === tab);
  });
  $('drawer-tasks').classList.toggle('hidden', tab !== 'tasks');
  $('drawer-files').classList.toggle('hidden', tab !== 'files');
  if (tab === 'files') loadFiles();
  else refreshTasks(false).catch(() => {});
}

document.querySelectorAll('#drawer .tab').forEach((button) => {
  button.addEventListener('click', () => switchDrawerTab(button.dataset.drawer));
});
$('drawer-close').addEventListener('click', () => $('drawer').classList.add('hidden'));
$('btn-files').addEventListener('click', () => openDrawer('files'));

/* ---------------- 设置 ---------------- */
function syncPrefsControls() {
  const prefs = state.prefs || {};
  const sourceSelect = $('pref-source');
  sourceSelect.innerHTML = '';
  (state.meta.sources || []).forEach((item) => {
    const option = document.createElement('option');
    option.value = item.value;
    option.textContent = item.label;
    sourceSelect.appendChild(option);
  });
  sourceSelect.value = prefs.source;

  const levelSelect = $('pref-level');
  levelSelect.innerHTML = '';
  ((state.meta.levels || {})[prefs.source] || []).forEach((item) => {
    const option = document.createElement('option');
    option.value = item.value;
    option.textContent = item.label;
    levelSelect.appendChild(option);
  });
  levelSelect.value = prefs.level;

  $('pref-lyric').checked = !!prefs.save_lyric;
  $('pref-tag').checked = !!prefs.embed_tag;
  $('pref-cover').checked = !!prefs.embed_cover;
  $('pref-embed-lyric').checked = !!prefs.embed_lyric;
}

$('pref-source').addEventListener('change', () => {
  const source = $('pref-source').value;
  state.prefs.source = source;
  state.source = source;
  renderSources();
  renderLevels();
  syncPrefsControls();
  savePrefs({ source });
});

$('pref-level').addEventListener('change', () => {
  const level = $('pref-level').value;
  state.prefs.level = level;
  $('level-select').value = level;
  savePrefs({ level });
});

[['pref-lyric', 'save_lyric'], ['pref-tag', 'embed_tag'],
 ['pref-cover', 'embed_cover'], ['pref-embed-lyric', 'embed_lyric']]
  .forEach(([id, key]) => {
    $(id).addEventListener('change', () => {
      state.prefs[key] = $(id).checked;
      savePrefs({ [key]: $(id).checked });
    });
  });

$('btn-settings').addEventListener('click', openSettings);
$('settings-close').addEventListener('click', () => $('settings-mask').classList.add('hidden'));
$('settings-mask').addEventListener('click', (event) => {
  if (event.target === $('settings-mask')) $('settings-mask').classList.add('hidden');
});

async function openSettings() {
  $('settings-mask').classList.remove('hidden');
  syncPrefsControls();
  refreshAccountStates();
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
      node.textContent = '未知';
    }
  }
}

document.querySelectorAll('[data-login]').forEach((button) => {
  button.addEventListener('click', async () => {
    const source = button.dataset.login;
    const cookie = $(`cookie-${source}`).value.trim();
    if (!cookie) { toast('请先粘贴 Cookie', true); return; }
    button.disabled = true;
    try {
      const data = await api('/api/account/login', { source, cookie });
      $(`cookie-${source}`).value = '';
      toast(data.logged_in ? '登录成功' : '已保存凭据');
      refreshAccountStates();
    } catch (err) {
      toast(err.message, true);
    } finally {
      button.disabled = false;
    }
  });
});

document.querySelectorAll('[data-logout]').forEach((button) => {
  button.addEventListener('click', async () => {
    const source = button.dataset.logout;
    try {
      await api('/api/account/logout', { source });
      toast('已退出该音源');
      refreshAccountStates();
    } catch (err) {
      toast(err.message, true);
    }
  });
});

$('btn-logout').addEventListener('click', async () => {
  try {
    await api('/api/auth/logout', {});
  } catch (err) {
    /* 忽略 */
  }
  showAuth();
});

/* ---------------- 启动 ---------------- */
bootstrap();
