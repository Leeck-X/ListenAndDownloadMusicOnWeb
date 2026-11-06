/* ============================================================
 * Server 版前端数据层：浏览器内应答 /api/*，用于无后端托管时的界面预览。
 * 账号、任务与文件仅保存在当前页面变量中，刷新即重置。
 * ============================================================ */
(function () {
  const nativeFetch = window.fetch ? window.fetch.bind(window) : null;
  const PREFS_KEY = 'nmd.server.prefs';
  const now = () => Math.floor(Date.now() / 1000);

  const DEFAULT_PREFS = {
    source: 'netease', level: 'exhigh', save_lyric: true, embed_tag: true,
    embed_cover: true, embed_lyric: true, retention_hours: 72,
    delete_after_export: false, name_template: '{artist} - {name}',
    folder_structure: 'none', task_folder: false, skip_existing: false,
    workers: 3, retry: 3, finish_action: 'none', status_lyric: true,
    status_lyric_max: 60, log_level: 'info',
  };

  let prefs = Object.assign({}, DEFAULT_PREFS);
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null');
    if (saved && typeof saved === 'object') prefs = Object.assign(prefs, saved);
  } catch (err) { /* 忽略损坏的本地数据 */ }

  const savePrefs = () => {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (err) { /* 忽略 */ }
  };

  const LEVELS = {
    netease: [['standard', '标准 128k'], ['higher', '较高 192k'],
      ['exhigh', '极高 320k'], ['lossless', '无损 FLAC'], ['hires', 'Hi-Res 24bit']],
    qq: [['standard', '标准 128k'], ['exhigh', 'HQ 320k'],
      ['lossless', 'SQ 无损 FLAC'], ['hires', 'Hi-Res 母带']],
  };
  const levelsOf = (source) => (LEVELS[source] || LEVELS.netease)
    .map(([value, label]) => ({ value, label }));

  /* ---------- 封面（内联 SVG，无需外网） ---------- */
  const PALETTES = [['#7c5cff', '#35d0ff'], ['#ff7a59', '#ffc46b'],
    ['#38d39f', '#7c5cff'], ['#4facfe', '#00f2fe'], ['#f78ca0', '#f9748f']];

  function coverFor(index) {
    const [from, to] = PALETTES[index % PALETTES.length];
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120">'
      + `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">`
      + `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>`
      + '</linearGradient></defs>'
      + '<rect width="120" height="120" fill="url(#g)"/>'
      + '<text x="60" y="78" font-size="46" text-anchor="middle" fill="rgba(255,255,255,.92)">♪</text>'
      + '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  const CATALOG = [
    ['晚风告白', '林间乐队', '夏夜散步'], ['星河入梦', '陈以晴', '夜空集'],
    ['城市霓虹', '午夜巴士', '城市光影'], ['山海之间', '远行者', '行囊'],
    ['旧时光', '木吉他小组', '回响'], ['雨落窗前', '苏木', '四季'],
    ['无声对白', '白昼乐队', '静默'], ['南方的雪', '雁南飞', '旅人日记'],
    ['光年之外的你', '行星计划', '深空'], ['黎明之前', '夜航船', '破晓'],
    ['纸上月光', '纸飞机', '手写信'], ['风继续吹', '海风合唱团', '海岸线'],
  ];

  const SIZES = {
    standard: '4.1 MB', higher: '6.3 MB', exhigh: '10.5 MB',
    lossless: '24.6 MB', hires: '38.2 MB',
  };

  function songAt(index, override) {
    const [name, artists, album] = CATALOG[index % CATALOG.length];
    const duration = 200 + ((index * 17) % 120);
    return Object.assign({
      key: `track:${index}`,
      id: 1000 + index,
      name,
      artists,
      album,
      cover: coverFor(index),
      duration: duration * 1000,
      duration_str: `${String(Math.floor(duration / 60)).padStart(2, '0')}:${String(duration % 60).padStart(2, '0')}`,
      fee: 0,
      source: prefs.source,
      mid: `m${index}`,
      media_mid: `m${index}`,
      sizes: { standard: 4100000, higher: 6300000, exhigh: 10500000, lossless: 24600000, hires: 38200000 },
      size: SIZES[prefs.level] || SIZES.exhigh,
    }, override || {});
  }

  function trackList(count) {
    return Array.from({ length: count }, (_item, index) => songAt(index));
  }

  /* ---------- 搜索结果生成：关键词参与歌名 / 歌手 / 专辑 ---------- */
  const SEARCH_ARTISTS = ['林间乐队', '陈以晴', '午夜巴士', '远行者', '木吉他小组', '苏木',
    '白昼乐队', '雁南飞', '行星计划', '夜航船', '纸飞机', '海风合唱团'];
  const SEARCH_ALBUMS = ['夏夜散步', '夜空集', '城市光影', '行囊', '回响', '四季',
    '静默', '旅人日记', '深空', '破晓', '手写信', '海岸线'];
  const TITLE_HEAD = ['晚风', '星河', '城市', '山海', '旧时', '雨落', '无声', '南方', '光年', '黎明', '纸上', '风'];
  const TITLE_TAIL = ['告白', '入梦', '霓虹', '之间', '回响', '窗前', '对白', '之雪', '之外', '之前', '月光', '之诗'];
  const TITLE_SUFFIX = ['外传', '进行曲', '之歌', '随笔', '狂想曲', '练习曲', '片段', '小夜曲', '叙事', '回响', '序曲', '独白'];
  const SEARCH_MAX = 144;

  function searchSong(index, keyword) {
    const base = songAt(index);
    const name = TITLE_HEAD[Math.floor(index / 12) % TITLE_HEAD.length]
      + TITLE_TAIL[index % TITLE_TAIL.length];
    const artists = SEARCH_ARTISTS[Math.floor(index / 12) % SEARCH_ARTISTS.length];
    const album = SEARCH_ALBUMS[index % SEARCH_ALBUMS.length];
    if (!keyword) return Object.assign(base, { name, artists, album });
    const mode = index % 3;
    if (mode === 1) {
      return Object.assign(base, {
        name: `${keyword}${TITLE_SUFFIX[index % TITLE_SUFFIX.length]}`,
        artists,
        album: `${keyword} 作品集`,
      });
    }
    if (mode === 2) {
      return Object.assign(base, { name, artists, album: `${keyword}合集` });
    }
    return Object.assign(base, { name, artists: keyword, album });
  }

  /* ---------- 账号（仅存在页面变量中） ---------- */
  const accounts = { netease: null, qq: null };
  const qrPolls = {};

  function signedIn(source) {
    const account = accounts[source] || accounts.netease || {};
    return {
      logged_in: true,
      nickname: account.nickname || '音乐用户',
      avatar: account.avatar || coverFor(3),
    };
  }

  /* ---------- 任务与文件 ---------- */
  const tasks = [];
  let fileSeq = 3;
  const files = [
    { id: 'f1', task_id: 'seed', name: '晚风告白', artists: '林间乐队', filename: '林间乐队 - 晚风告白.flac', size: 25800000, size_str: '24.6 MB', created: now() - 5400, expires: now() + 200000, expires_in: 200000 },
    { id: 'f2', task_id: 'seed', name: '星河入梦', artists: '陈以晴', filename: '陈以晴 - 星河入梦.mp3', size: 10500000, size_str: '10.0 MB', created: now() - 3600, expires: now() + 220000, expires_in: 220000 },
    { id: 'f3', task_id: 'seed', name: '城市霓虹', artists: '午夜巴士', filename: '午夜巴士 - 城市霓虹.mp3', size: 9800000, size_str: '9.3 MB', created: now() - 1800, expires: now() + 240000, expires_in: 240000 },
  ];

  let logsClearedAt = -1;
  const LOG_SEED = [
    ['info', '音源实例已就绪：网易云音乐'],
    ['info', '列表加载完成：30 首'],
    ['info', '下载任务已加入队列'],
  ];

  function logsFor(seq) {
    const base = logsClearedAt >= 0 ? [] : LOG_SEED;
    return base.map((row, index) => ({
      seq: index + 1, time: now() - (base.length - index) * 30,
      level: row[0], message: row[1],
    })).filter((item) => item.seq > seq);
  }

  function tickTasks() {
    const stamp = now();
    tasks.forEach((task) => {
      if (task.status !== 'running') return;
      let pending = 0;
      task.items.forEach((item) => {
        if (item.status === 'done' || item.status === 'failed') return;
        item.status = 'running';
        item.ratio = Math.min(0.98, (item.ratio || 0) + 0.16);
        if (item.ratio >= 0.98) item.status = 'done';
        if (item.status !== 'done') pending += 1;
      });
      const done = task.items.filter((item) => item.status === 'done').length;
      task.done = done;
      task.progress = task.items.length ? done / task.items.length : 0;
      task.speed = task.status === 'running' ? 1250 : 0;
      if (!pending) {
        task.status = 'done';
        task.finished = stamp;
        task.progress = 1;
        task.speed = 0;
        files.unshift({
          id: `f${fileSeq += 1}`, task_id: task.id,
          name: task.items[0] ? task.items[0].name : task.title,
          artists: task.items[0] ? task.items[0].artists : '',
          filename: `${task.title}.mp3`, size: 10500000, size_str: '10.0 MB',
          created: stamp, expires: stamp + 259200, expires_in: 259200,
        });
      }
    });
  }

  function newTask(payload) {
    const songs = payload.songs || [];
    const level = payload.level || prefs.level;
    const task = {
      id: `t${now()}${Math.floor(Math.random() * 1000)}`,
      title: payload.title || '下载任务',
      status: 'queued', source: songs[0] ? songs[0].source : prefs.source,
      level, created: now(), finished: 0, total: songs.length,
      done: 0, failed: 0, progress: 0, speed: 0, error: '',
      finish_action: payload.finish_action || 'none',
      items: songs.map((song, index) => ({
        index, name: song.name || '', artists: song.artists || '',
        status: 'pending', ratio: 0, error: '',
      })),
    };
    tasks.unshift(task);
    setTimeout(() => { if (task.status === 'queued') task.status = 'running'; }, 1200);
    return task;
  }

  /* ---------- 导出与下载 ---------- */
  const silentWav = () => {
    const rate = 8000;
    const samples = rate;
    const buffer = new ArrayBuffer(44 + samples);
    const view = new DataView(buffer);
    const ascii = (offset, text) => {
      for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
    };
    ascii(0, 'RIFF');
    view.setUint32(4, 36 + samples, true);
    ascii(8, 'WAVEfmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate, true);
    view.setUint16(32, 1, true);
    view.setUint16(34, 8, true);
    ascii(36, 'data');
    view.setUint32(40, samples, true);
    for (let i = 0; i < samples; i += 1) view.setUint8(44 + i, 128);
    return buffer;
  };

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    setTimeout(() => { URL.revokeObjectURL(url); anchor.remove(); }, 1500);
  }

  function downloadTrack(file) {
    const base = (file.filename || 'track.mp3').replace(/\.(mp3|flac|m4a)$/i, '');
    downloadBlob(new Blob([silentWav()], { type: 'audio/wav' }), `${base}.wav`);
  }

  function crc32(bytes) {
    let table = crc32.table;
    if (!table) {
      table = new Uint32Array(256);
      for (let i = 0; i < 256; i += 1) {
        let code = i;
        for (let k = 0; k < 8; k += 1) code = code & 1 ? 0xEDB88320 ^ (code >>> 1) : code >>> 1;
        table[i] = code >>> 0;
      }
      crc32.table = table;
    }
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i += 1) {
      crc = table[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  // 未压缩 ZIP，条目内容为浏览器内生成的文件
  function zipBlob(entries) {
    const parts = [];
    const central = [];
    const encoder = new TextEncoder();
    let offset = 0;
    entries.forEach((entry) => {
      const nameBytes = encoder.encode(entry.name);
      const content = new Uint8Array(entry.data || new ArrayBuffer(0));
      const crc = crc32(content);
      const local = new Uint8Array(30 + nameBytes.length + content.length);
      const view = new DataView(local.buffer);
      view.setUint32(0, 0x04034b50, true);
      view.setUint16(4, 20, true);
      view.setUint32(14, crc, true);
      view.setUint32(18, content.length, true);
      view.setUint32(22, content.length, true);
      view.setUint16(26, nameBytes.length, true);
      local.set(nameBytes, 30);
      local.set(content, 30 + nameBytes.length);
      parts.push(local);
      const dir = new Uint8Array(46 + nameBytes.length);
      const dview = new DataView(dir.buffer);
      dview.setUint32(0, 0x02014b50, true);
      dview.setUint16(4, 20, true);
      dview.setUint16(6, 20, true);
      dview.setUint32(16, crc, true);
      dview.setUint32(20, content.length, true);
      dview.setUint32(24, content.length, true);
      dview.setUint16(28, nameBytes.length, true);
      dview.setUint32(42, offset, true);
      dir.set(nameBytes, 46);
      central.push(dir);
      offset += local.length;
    });
    const dirStart = offset;
    let dirSize = 0;
    central.forEach((dir) => { parts.push(dir); dirSize += dir.length; });
    const end = new Uint8Array(22);
    const eview = new DataView(end.buffer);
    eview.setUint32(0, 0x06054b50, true);
    eview.setUint16(8, entries.length, true);
    eview.setUint16(10, entries.length, true);
    eview.setUint32(12, dirSize, true);
    eview.setUint32(16, dirStart, true);
    parts.push(end);
    return new Blob(parts, { type: 'application/zip' });
  }

  /* ---------- 路由 ---------- */
  function ok(data) {
    return new Response(JSON.stringify({ ok: true, data }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }

  function fail(message) {
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }

  const meta = () => ({
    user: '访客', auth_enabled: false,
    sources: [{ value: 'netease', label: '网易云音乐' }, { value: 'qq', label: 'QQ 音乐' }],
    levels: { netease: levelsOf('netease'), qq: levelsOf('qq') },
    folder_structures: [
      { value: 'none', label: '不分文件夹' }, { value: 'artist', label: '按歌手分文件夹' },
      { value: 'album', label: '按专辑分文件夹' }, { value: 'artist_album', label: '按歌手 / 专辑分两级' },
    ],
    finish_actions: [{ value: 'none', label: '无' }, { value: 'message', label: '浏览器通知' }],
    log_levels: ['debug', 'info', 'warn', 'error'],
    prefs: Object.assign({}, prefs),
    quota: { used: 46100000, limit: 0, used_str: '44.0 MB', limit_str: '不限' },
    retention_hours: prefs.retention_hours,
    retention_choices: [1, 6, 12, 24, 48, 72, 168, 720],
    max_tasks: 2,
  });

  const playUrl = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';

  const lyricText = [
    '[00:00.00]晚风告白',
    '[00:03.20]风穿过安静的街',
    '[00:07.10]把没说出口的话带走',
    '[00:11.00]路灯把影子拉得很长',
    '[00:15.40]我在原地等一个回答',
    '[00:19.60]星星落在你的肩上',
    '[00:23.80]晚风替我说了喜欢',
    '[00:28.00]这一刻就很好',
  ].join('\n');

  function qrImage() {
    let cells = '';
    for (let row = 0; row < 21; row += 1) {
      for (let col = 0; col < 21; col += 1) {
        if (((row * 7 + col * 11 + row * col) % 5) < 2) {
          cells += `<rect x="${10 + col * 7}" y="${10 + row * 7}" width="7" height="7" fill="#111"/>`;
        }
      }
    }
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180">'
      + '<rect width="180" height="180" fill="#fff"/>' + cells + '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  async function handle(url, init) {
    const method = ((init && init.method) || 'GET').toUpperCase();
    let body = {};
    if (init && init.body) {
      try { body = JSON.parse(init.body); } catch (err) { body = {}; }
    }
    const parsed = new URL(url, window.location.origin);
    const path = parsed.pathname;
    const query = parsed.searchParams;

    if (path === '/api/auth/me') return ok({ user: { id: 0, username: '访客' }, auth_enabled: false });
    if (path === '/api/meta') return ok(meta());
    if (path === '/api/prefs' && method === 'GET') return ok({ prefs: Object.assign({}, prefs) });
    if (path === '/api/prefs' && method === 'POST') {
      prefs = Object.assign({}, prefs, body);
      savePrefs();
      return ok({ prefs: Object.assign({}, prefs) });
    }

    if (path === '/api/account') {
      const source = body.source === 'qq' ? 'qq' : 'netease';
      return ok(accounts[source] ? signedIn(source) : { logged_in: false, nickname: '', avatar: '' });
    }
    if (path === '/api/account/login') {
      const source = body.source === 'qq' ? 'qq' : 'netease';
      const cookie = (body.cookie || '').trim();
      if (!cookie) return fail('请粘贴 Cookie 或登录凭证');
      accounts[source] = { nickname: '音乐用户', avatar: coverFor(source === 'qq' ? 1 : 3) };
      return ok(signedIn(source));
    }
    if (path === '/api/account/logout') {
      const source = body.source === 'qq' ? 'qq' : 'netease';
      accounts[source] = null;
      return ok({ logged_in: false, nickname: '', avatar: '' });
    }
    if (path === '/api/login/qr/start') {
      return ok({ identifier: `qr${now()}`, image: qrImage() });
    }
    if (path === '/api/login/qr/poll') {
      const source = body.source === 'qq' ? 'qq' : 'netease';
      const key = String(body.identifier || 'qr');
      qrPolls[key] = (qrPolls[key] || 0) + 1;
      if (qrPolls[key] >= 3) {
        accounts[source] = { nickname: '音乐用户', avatar: coverFor(source === 'qq' ? 1 : 3) };
        return ok({ event: 'done', message: '登录成功' });
      }
      return ok({ event: 'waiting', message: '等待扫码…' });
    }

    if (path === '/api/tasks' && method === 'GET') { tickTasks(); return ok({ items: tasks }); }
    if (path === '/api/task/action') {
      const task = tasks.find((item) => item.id === body.id);
      if (!task) return fail('任务不存在');
      if (body.action === 'pause' && task.status === 'running') task.status = 'paused';
      else if (body.action === 'resume' && task.status === 'paused') task.status = 'running';
      else if (body.action === 'cancel') {
        task.status = 'cancelled';
        task.items.forEach((item) => { if (item.status !== 'done') item.status = 'cancelled'; });
      } else if (body.action === 'retry') {
        task.status = 'running';
        task.progress = 0;
        task.items.forEach((item) => { item.status = 'pending'; item.ratio = 0; item.error = ''; });
      } else if (body.action === 'delete') {
        const index = tasks.indexOf(task);
        if (index >= 0) tasks.splice(index, 1);
      }
      return ok(task);
    }

    if (path === '/api/files' && method === 'GET') {
      return ok({ items: files, usage: files.reduce((sum, file) => sum + file.size, 0) });
    }
    if (path === '/api/files/archive') {
      const picked = (query.get('ids') || '').split(',').filter(Boolean);
      const names = files.filter((file) => picked.includes(file.id)).map((file) => file.filename);
      downloadBlob(zipBlob(names.map((name) => ({ name, data: silentWav() }))), 'files.zip');
      return ok({ started: true });
    }
    if (/^\/api\/files\/[^/]+$/.test(path) && method === 'DELETE') {
      const id = path.split('/').pop();
      const index = files.findIndex((file) => file.id === id);
      if (index >= 0) files.splice(index, 1);
      return ok({ deleted: true });
    }

    if (path === '/api/logs' && method === 'GET') {
      const seq = Number(query.get('seq') || 0);
      return ok({ items: logsFor(seq) });
    }
    if (path === '/api/logs/clear') { logsClearedAt = now(); return ok({ cleared: true }); }

    if (path === '/api/search') {
      const keyword = (body.keyword || '').trim();
      if (!keyword) return fail('请输入搜索关键词');
      const offset = Math.max(0, Number(body.offset) || 0);
      const limit = Math.min(100, Math.max(1, Number(body.limit) || 50));
      const songs = [];
      for (let i = offset; i < offset + limit && i < SEARCH_MAX; i += 1) {
        songs.push(searchSong(i, keyword));
      }
      return ok({ songs, offset: offset + songs.length });
    }
    if (path === '/api/playlist') {
      const text = (body.text || '').trim();
      return ok({ title: text ? `歌单 ${text}` : '歌单', songs: trackList(18) });
    }
    if (path === '/api/my_playlists') {
      const source = body.source === 'qq' ? 'qq' : 'netease';
      if (!accounts[source]) return fail('请先登录音源后查看我的歌单');
      return ok({ items: [
        { id: '100', title: '我喜欢的音乐', cover: coverFor(0), count: 12 },
        { id: '101', title: '深夜循环', cover: coverFor(2), count: 24 },
        { id: '102', title: '通勤歌单', cover: coverFor(3), count: 18 },
        { id: '103', title: '收藏歌单', cover: coverFor(4), count: 8 },
      ] });
    }
    if (path === '/api/liked') {
      const source = body.source === 'qq' ? 'qq' : 'netease';
      if (!accounts[source]) return fail('请先登录音源后查看我喜欢的音乐');
      return ok({ title: '我喜欢的音乐', songs: trackList(12) });
    }

    if (path === '/api/song') {
      const value = String(body.value || body.id || '0');
      const index = Math.abs(value.length + Number(value.replace(/\D/g, '') || 0)) % CATALOG.length;
      return ok(songAt(index));
    }
    if (path === '/api/probe') {
      return ok(levelsOf(prefs.source).map((row) => ({
        value: row.value, label: row.label, ok: true,
        detail: `${row.value === 'lossless' || row.value === 'hires' ? 'FLAC' : 'MP3'} ${SIZES[row.value] || ''}`.trim(),
      })));
    }
    if (path === '/api/play') {
      return ok({ url: playUrl, type: 'mp3', size: 10500000, level: body.level || prefs.level, encode: 'mp3' });
    }
    if (path === '/api/lyric') return ok({ lyric: lyricText, trans: '' });
    if (path === '/api/download') {
      const songs = body.songs || [];
      if (!songs.length) return fail('请先选择歌曲');
      const entries = songs.map((song, index) => ({
        name: `${song.artists ? song.artists + ' - ' : ''}${song.name || ('track ' + (index + 1))}.wav`,
        data: silentWav(),
      }));
      if (entries.length === 1) {
        downloadBlob(new Blob([entries[0].data], { type: 'audio/wav' }), entries[0].name);
      } else {
        downloadBlob(zipBlob(entries), 'download.zip');
      }
      return ok({ id: `t${now()}`, status: 'done', total: songs.length, done: songs.length, failed: 0, progress: 1, items: [] });
    }

    return fail(`未实现该接口：${path}`);
  }

  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (/^\/api\//.test(url)) {
      return handle(url, init || {});
    }
    return nativeFetch ? nativeFetch(input, init) : Promise.reject(new Error('fetch unavailable'));
  };

  /* 文件下载与打包改为浏览器内生成，避免落到 404 */
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href^="/api/files/"]');
    if (!link) return;
    event.preventDefault();
    event.stopPropagation();
    const id = link.getAttribute('href').split('/')[2];
    const file = files.find((item) => item.id === id);
    if (file) downloadTrack(file);
  }, true);

  document.addEventListener('click', (event) => {
    const btn = document.getElementById('btn-export');
    if (!btn || !btn.contains(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    downloadBlob(zipBlob(files.map((file) => ({ name: file.filename, data: silentWav() }))), 'files.zip');
  }, true);
})();
