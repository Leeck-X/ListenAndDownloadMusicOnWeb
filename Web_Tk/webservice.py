"""Web 服务层：把音源 / 下载 / 登录 / 配置等能力封装为与界面无关的方法。

上游是本地 HTTP 服务器（webserver.py），前端通过 JSON 调用；本模块不依赖
tkinter，可脱离服务器直接用于测试。设计要点：

- 日志：分级环形缓冲，前端按 seq 增量拉取；
- 下载：一次提交生成一个任务，多线程并发下载，任务间串行（避免会话竞争）；
- 登录：网易云扫码 / QQ 扫码 / Cookie 导入，成功后写回 config.json。
"""
from __future__ import annotations

import base64
import csv
import io
import os
import re
import threading
import time
from collections import deque
from concurrent.futures import ThreadPoolExecutor

from cfgstore import (CONFIG_PATH, DEFAULT_CONFIG, SERVICE_KEYS, export_config,
                      import_config, load_config, normalize_config, public_config,
                      save_config)
from downloader import Control, DownloadCancelled, Downloader, ProgressHub, fmt_speed
from encrypt import WEApiKeys
from finisher import FINISH_ACTION_LABELS, run_finish_action
from models import (ENCODE_TYPES, LEVELS_BY_SOURCE, Song, encode_for_level,
                    human_size)
from providers import (SOURCE_LABELS, SOURCES, apply_weapi_keys, get_provider,
                       refresh_instances)

# 文件组织方式 / 取消清理策略的中文标签（设置页选项）
FOLDER_STRUCTURE_LABELS = {
    'none': '不分文件夹',
    'artist': '按歌手分文件夹',
    'album': '按专辑分文件夹',
    'artist_album': '按歌手 / 专辑分两级',
}
CANCEL_CLEANUP_LABELS = {'ask': '每次询问', 'delete': '总是删除文件', 'keep': '总是保留文件'}

LOG_LEVEL_ORDER = {'debug': 10, 'info': 20, 'warn': 30, 'error': 40}

# 单曲链接：网易云 /song?id=xxx，QQ /songDetail/<songmid>
_RE_NETEASE_SONG = re.compile(r'song\?id=(\d+)')
_RE_QQ_SONG = re.compile(r'/songDetail/([0-9A-Za-z]+)')


class ServiceError(Exception):
    """可预期的业务错误，消息直接展示给用户。"""


def song_key(song: Song) -> str:
    """跨音源的唯一标识：qq 用 mid，网易云用 id。"""
    return f'{song.source}:{song.mid or song.id}'


def song_to_dict(song: Song, level: str) -> dict:
    return {
        'key': song_key(song),
        'id': song.id,
        'name': song.name,
        'artists': song.artists,
        'album': song.album,
        'cover': song.cover_url,
        'duration': song.duration,
        'duration_str': song.duration_str,
        'fee': song.fee,
        'source': song.source,
        'mid': song.mid,
        'media_mid': song.media_mid,
        'sizes': song.sizes or {},
        'size': song.size_hint(level),
    }


def song_from_dict(data: dict) -> Song:
    """前端回传的歌曲结构 -> Song，用于下载 / 取址 / 歌词。"""
    def as_int(value):
        try:
            return int(value)
        except (TypeError, ValueError):
            return 0

    return Song(
        id=as_int(data.get('id')),
        name=data.get('name') or '',
        artists=data.get('artists') or '',
        album=data.get('album') or '',
        cover_url=data.get('cover') or '',
        duration=as_int(data.get('duration')),
        fee=as_int(data.get('fee')),
        sizes=data.get('sizes') or {},
        source=data.get('source') or 'netease',
        mid=data.get('mid') or '',
        media_mid=data.get('media_mid') or '',
    )


class LogBuffer:
    """分级日志环形缓冲：保留最近 N 条，前端按 seq 增量拉取。"""

    def __init__(self, limit: int = 800):
        self._lock = threading.Lock()
        self._items = deque(maxlen=limit)
        self._seq = 0

    def add(self, level: str, message: str) -> dict:
        with self._lock:
            self._seq += 1
            item = {'seq': self._seq, 'time': time.time(), 'level': level,
                    'message': message}
            self._items.append(item)
        return item

    def since(self, seq: int, level: str = 'info') -> list:
        threshold = LOG_LEVEL_ORDER.get(level, 20)
        with self._lock:
            return [item for item in self._items
                    if item['seq'] > seq
                    and LOG_LEVEL_ORDER.get(item['level'], 20) >= threshold]

    def clear(self) -> None:
        with self._lock:
            self._items.clear()


class DownloadTask:
    """一次下载请求对应的任务：多首歌曲并发下载，进度聚合上报。"""

    def __init__(self, tid: int, songs: list, level: str, encode_type: str,
                 options: dict, cfg: dict, service: 'WebService'):
        self.id = tid
        self.songs = songs
        self.level = level
        self.encode_type = encode_type
        self.options = options or {}
        self.cfg = cfg
        self.service = service
        self.control = Control()
        self.status = 'pending'    # pending|running|paused|cancelling|cancelled|done|failed
        self.overall = 0.0
        self.speed = 0.0
        self.created = time.time()
        self.started = 0.0
        self.finished = 0.0
        self.cleanup = 'keep'      # 取消后是否删除已下载文件
        self.downloader = None
        self._lock = threading.Lock()
        self.items = [{
            'index': index,
            'key': song_key(song),
            'name': song.name,
            'artists': song.artists,
            'album': song.album,
            'source': song.source,
            'duration_str': song.duration_str,
            'status': 'pending',   # pending|running|done|failed|cancelled
            'ratio': 0.0,
            'error': '',
            'path': '',
        } for index, song in enumerate(songs)]

    # ---- 状态 ----
    def _set_status(self, status: str) -> None:
        with self._lock:
            self.status = status

    @property
    def paused(self) -> bool:
        return self.status == 'paused'

    def _set_item(self, index: int, **fields) -> None:
        with self._lock:
            self.items[index].update(fields)

    def _on_overall(self, overall: float, speed: float) -> None:
        with self._lock:
            self.overall = overall
            self.speed = speed

    def to_dict(self) -> dict:
        with self._lock:
            items = [dict(item) for item in self.items]
            status = self.status
            overall = self.overall
            speed = self.speed
        counts = {'done': 0, 'failed': 0, 'cancelled': 0, 'pending': 0, 'running': 0}
        for item in items:
            counts[item['status']] = counts.get(item['status'], 0) + 1
        return {
            'id': self.id,
            'status': status,
            'level': self.level,
            'encode_type': self.encode_type,
            'options': self.options,
            'overall': round(overall, 4),
            'speed': fmt_speed(speed),
            'created': self.created,
            'started': self.started,
            'finished': self.finished,
            'total': len(items),
            'counts': counts,
            'items': items,
        }

    # ---- 执行 ----
    def run(self) -> None:
        """在服务层的工作线程中执行；阻塞直到本任务全部结束（含暂停等待）。"""
        if self.control.cancelled:      # 排队时已被取消，直接收尾
            self.finished = time.time()
            self._set_status('cancelled')
            return
        self._set_status('running')
        self.started = time.time()
        service = self.service
        source = self.songs[0].source if self.songs else self.cfg.get('source', 'netease')
        api = service.api(source)
        workers = max(1, min(8, int(self.cfg.get('workers', 3))))
        downloader = Downloader(
            api, self.cfg,
            on_log=lambda text: service.log('info', f'[任务{self.id}] {text.strip()}'),
            control=self.control,
        )
        self.downloader = downloader
        total = len(self.songs)
        hub = ProgressHub(total, self._on_overall)

        def on_progress(index):
            def inner(ratio, done, _total):
                self._set_item(index, ratio=min(ratio, 1.0) if ratio < 1 else 1.0,
                               status='running')
                hub.update(index, ratio, done)
            return inner

        def worker(index: int) -> None:
            song = self.songs[index]
            cancelled = False
            try:
                path = downloader.download(
                    song, level=self.level, encode_type=self.encode_type,
                    options=self.options, index=index + 1, on_progress=on_progress(index))
                self._set_item(index, status='done', ratio=1.0, path=path, error='')
            except DownloadCancelled:
                cancelled = True
                self._set_item(index, status='cancelled', ratio=0.0)
            except Exception as exc:  # noqa: BLE001 - 单曲失败不中断其他歌曲
                self._set_item(index, status='failed', error=str(exc))
                service.log('warn', f'[任务{self.id}] 失败：{song.name} - {exc}')
            finally:
                # 取消的歌曲不计入完成度，避免进度条假性走到 100%
                if not cancelled:
                    hub.finish(index)

        # 已完成（重试场景）的歌曲直接记满，pending 的才提交执行
        pending = []
        for item in self.items:
            if item['status'] == 'done':
                hub.finish(item['index'])
            elif item['status'] in ('pending', 'running'):
                self._set_item(item['index'], status='pending')
                pending.append(item['index'])

        with ThreadPoolExecutor(max_workers=workers, thread_name_prefix='webdl') as pool:
            list(pool.map(worker, pending))

        hub.final()
        downloader.close()
        self.downloader = None
        self.finished = time.time()
        if self.control.cancelled:
            if self.cleanup == 'delete':
                removed = downloader.cleanup()
                service.log('warn', f'[任务{self.id}] 已取消，删除 {removed} 个文件')
            # 收尾清理：残留的 running 统一记为已取消，整体进度归零
            for item in self.items:
                if item['status'] in ('pending', 'running'):
                    self._set_item(item['index'], status='cancelled', ratio=0.0)
            self._on_overall(0.0, 0.0)
            self._set_status('cancelled')
            service.log('warn', f'[任务{self.id}] 已取消')
            return
        failed = sum(1 for item in self.items if item['status'] == 'failed')
        self._set_status('failed' if failed else 'done')
        summary = f'[任务{self.id}] 结束：成功 {len(self.items) - failed}/{len(self.items)}'
        service.log('warn' if failed else 'info', summary + (f'，失败 {failed}' if failed else ''))


class WebService:
    """本地 web 服务的能力层；线程安全，供 HTTP 处理器直接调用。"""

    def __init__(self, cfg: dict = None, log_level: str = None):
        self.cfg = cfg or load_config()
        self.logs = LogBuffer()
        self._sinks = []            # 额外日志消费端（如控制台）
        self._lock = threading.Lock()
        self._tasks = {}            # id -> DownloadTask
        self._order = []            # 任务 id，倒序（新任务在前）
        self._queue = deque()       # 待执行任务
        self._next_id = 0
        self._pump_thread = None
        self.default_log_level = log_level or self.cfg.get('log_level', 'info')
        self._sync_encode()

    def _sync_encode(self) -> None:
        """编码格式由音质档位推导（低档 MP3 / 无损及以上 FLAC），不再由用户选择。"""
        self.cfg['encode_type'] = encode_for_level(self.cfg.get('source', 'netease'),
                                                   self.cfg.get('level', 'exhigh'))

    # ---------------- 日志 ----------------
    def add_sink(self, sink) -> None:
        self._sinks.append(sink)

    def log(self, level: str, message: str) -> None:
        item = self.logs.add(level, message)
        for sink in self._sinks:
            try:
                sink(item)
            except Exception:  # noqa: BLE001 - 日志消费端异常不影响主流程
                pass

    def logs_since(self, seq: int, level: str = None) -> list:
        return self.logs.since(seq, level or self.default_log_level)

    def clear_logs(self) -> None:
        self.logs.clear()

    # ---------------- 配置 ----------------
    def meta(self) -> dict:
        return {
            'sources': [{'value': value, 'label': label} for value, label in SOURCES],
            'levels_by_source': {
                key: [{'value': v, 'label': l, 'encode': encode_for_level(key, v)}
                      for v, l in rows]
                for key, rows in LEVELS_BY_SOURCE.items()},
            'encode_types': [{'value': value, 'label': label} for value, label in ENCODE_TYPES],
            'folder_structures': [{'value': k, 'label': v}
                                  for k, v in FOLDER_STRUCTURE_LABELS.items()],
            'cancel_cleanups': [{'value': k, 'label': v}
                                for k, v in CANCEL_CLEANUP_LABELS.items()],
            'finish_actions': [{'value': k, 'label': v}
                               for k, v in FINISH_ACTION_LABELS.items()],
            'service_keys': list(SERVICE_KEYS),
            'default_config': public_config(dict(DEFAULT_CONFIG)),
            'config_path': CONFIG_PATH,
        }

    def config(self) -> dict:
        return public_config(self.cfg)

    def update_config(self, payload: dict) -> dict:
        """局部更新配置：只写已知键，改完立即归一化并落盘。"""
        if not isinstance(payload, dict):
            raise ServiceError('配置内容格式错误')
        weapi = payload.get('weapi_keys')
        if weapi is not None:
            error = WEApiKeys.from_config(weapi).validate()
            if error:
                raise ServiceError(f'weapi 密钥无效：{error}')
        for key, value in payload.items():
            if key in DEFAULT_CONFIG:
                self.cfg[key] = value
        normalize_config(self.cfg)
        self._sync_encode()
        save_config(self.cfg)
        apply_weapi_keys(self.cfg)
        self.default_log_level = self.cfg.get('log_level', self.default_log_level)
        self.log('info', '配置已更新并保存')
        return self.config()

    def export_config(self) -> dict:
        return {'filename': 'config.json', 'content': export_config(self.cfg)}

    def import_config(self, payload) -> dict:
        data = payload.get('data') if isinstance(payload, dict) else payload
        try:
            self.cfg = import_config(self.cfg, data)
        except ValueError as exc:
            raise ServiceError(str(exc))
        self._sync_encode()
        save_config(self.cfg)
        refresh_instances(self.cfg)
        self.default_log_level = self.cfg.get('log_level', self.default_log_level)
        self.log('info', '配置已导入并生效')
        return self.config()

    # ---------------- 音源 ----------------
    def api(self, source: str = None):
        source = source or self.cfg.get('source', 'netease')
        if source not in SOURCE_LABELS:
            raise ServiceError(f'未知音源：{source}')
        return get_provider(source, self.cfg)

    def bootstrap(self) -> None:
        """启动后的自检：按需匿名注册，输出运行信息（放后台线程，勿阻塞启动）。"""
        self.log('info', f'服务就绪 · 音源 {SOURCE_LABELS.get(self.cfg.get("source"), "")} · '
                         f'下载目录 {self.cfg.get("download_dir")}')
        if self.cfg.get('use_anonimous') and not self.cfg.get('cookie'):
            api = self.api('netease')
            if not api.session.cookies.get('deviceId'):
                try:
                    api.register_anonimous()
                    self.log('debug', '匿名 token 获取成功')
                except Exception as exc:  # noqa: BLE001 - 匿名失败不影响使用
                    self.log('debug', f'匿名 token 获取失败（不影响使用）：{exc}')

    def account(self, source: str = None) -> dict:
        api = self.api(source)
        profile = api.account()
        if not profile:
            return {'logged_in': False, 'nickname': '', 'userId': 0, 'vipType': 0,
                    'avatar': ''}
        return {
            'logged_in': True,
            'nickname': profile.get('nickname') or '未命名',
            'userId': profile.get('userId') or 0,
            'vipType': profile.get('vipType') or 0,
            'avatar': profile.get('avatarUrl') or '',
        }

    def logout(self, source: str = None) -> dict:
        source = source or self.cfg.get('source', 'netease')
        api = self.api(source)
        if source == 'qq':
            api.set_credential(None)
            self.cfg['qq_credential'] = {}
        else:
            api.set_cookie('')
            self.cfg['cookie'] = ''
        save_config(self.cfg)
        self.log('info', f'已退出 {SOURCE_LABELS.get(source)} 账号')
        return self.account(source)

    # ---- 扫码登录 ----
    def qr_start(self, source: str = None, login_type: str = 'qq') -> dict:
        source = source or self.cfg.get('source', 'netease')
        api = self.api(source)
        if source == 'qq':
            png, identifier = api.qr_login_start(login_type)
            return {'kind': 'image', 'identifier': identifier,
                    'image': 'data:image/png;base64,' + base64.b64encode(png).decode('ascii')}
        unikey = api.qrcode_unikey()
        if not unikey:
            raise ServiceError('获取二维码失败')
        return {'kind': 'url', 'identifier': unikey,
                'url': f'https://music.163.com/login?codekey={unikey}'}

    def qr_poll(self, source: str = None, identifier: str = '') -> dict:
        source = source or self.cfg.get('source', 'netease')
        api = self.api(source)
        if source == 'qq':
            event, note = api.qr_login_poll()
            result = {'event': event, 'message': note}
            if event == 'done':
                self.cfg['qq_credential'] = api.credential_dict()
                save_config(self.cfg)
                self.log('info', 'QQ 音乐登录成功')
                result['account'] = self.account('qq')
            return result
        result = api.qrcode_check(identifier)
        code = result.get('code')
        state = {800: 'timeout', 801: 'waiting', 802: 'confirm', 803: 'done'}.get(code, 'other')
        message = {800: '二维码已过期，请重新获取', 801: '等待扫码',
                   802: '已扫码，请在手机上确认', 803: '登录成功'}.get(code, '')
        payload = {'event': state, 'message': message}
        if state == 'done':
            self.cfg['cookie'] = result.get('cookie') or api.cookie_str()
            save_config(self.cfg)
            self.log('info', '网易云登录成功')
            payload['account'] = self.account('netease')
        return payload

    def login_cookie(self, source: str, cookie: str) -> dict:
        api = self.api(source)
        try:
            if source == 'qq':
                api.set_cookie(cookie)
                self.cfg['qq_credential'] = api.credential_dict()
            else:
                api.set_cookie(cookie)
                self.cfg['cookie'] = api.cookie_str()
        except Exception as exc:  # noqa: BLE001 - 交由前端提示
            raise ServiceError(f'登录失败：{exc}')
        save_config(self.cfg)
        self.log('info', f'{SOURCE_LABELS.get(source)} Cookie 登录成功')
        return self.account(source)

    # ---- 曲库 ----
    def search(self, keyword: str, limit: int = 50, offset: int = 0) -> dict:
        keyword = (keyword or '').strip()
        if not keyword:
            raise ServiceError('请输入搜索关键词')
        api = self.api()
        songs = api.search(keyword, limit=int(limit or 50), offset=int(offset or 0))
        level = self.cfg.get('level', 'exhigh')
        return {'songs': [song_to_dict(song, level) for song in songs],
                'offset': int(offset or 0) + len(songs)}

    def playlist(self, text: str) -> dict:
        """解析歌单链接 / 单曲链接 / 歌单 ID，返回歌曲列表。"""
        text = (text or '').strip()
        if not text:
            raise ServiceError('请输入歌单 / 单曲链接或歌单 ID')
        api = self.api()
        level = self.cfg.get('level', 'exhigh')
        match = _parse_song_link(text)
        if match:
            source, value = match
            if source != self.cfg.get('source', 'netease'):
                raise ServiceError(f'该链接属于 {SOURCE_LABELS.get(source)}，请先切换音源')
            songs = api.song_by_id(value)
            return {'title': '单曲', 'songs': [song_to_dict(s, level) for s in songs]}
        playlist_id = _parse_playlist_id(text, self.cfg.get('source', 'netease'))
        if not playlist_id:
            raise ServiceError('未能从链接中解析出歌单 ID')
        title, songs = api.playlist_songs(playlist_id)
        return {'title': title or f'歌单 {playlist_id}',
                'songs': [song_to_dict(s, level) for s in songs]}

    def song_detail(self, value: str) -> dict:
        api = self.api()
        songs = api.song_by_id(value)
        if not songs:
            raise ServiceError('未找到该歌曲')
        return song_to_dict(songs[0], self.cfg.get('level', 'exhigh'))

    def my_playlists(self, source: str = None) -> list:
        return self.api(source).user_playlists()

    def liked(self, source: str = None) -> dict:
        title, songs = self.api(source).liked_songs()
        level = self.cfg.get('level', 'exhigh')
        return {'title': title, 'songs': [song_to_dict(s, level) for s in songs]}

    def liked_keys(self, source: str = None) -> list:
        source = source or self.cfg.get('source', 'netease')
        try:
            keys = self.api(source).liked_keys()
        except Exception as exc:  # noqa: BLE001 - 未登录等场景返回空集合
            self.log('debug', f'获取喜欢列表失败：{exc}')
            return []
        return [f'{k[0]}:{k[1]}' for k in keys]

    def lyric(self, payload: dict) -> dict:
        song = song_from_dict(payload.get('song') or payload)
        api = self.api(song.source)
        data = api.lyric(song)
        return {'lyric': data.get('lyric') or '', 'trans': data.get('trans') or ''}

    def play(self, payload: dict) -> dict:
        """取播放地址（网页播放器用），编码随音质档位自动决定。"""
        song = song_from_dict(payload.get('song') or payload)
        level = payload.get('level') or self.cfg.get('level', 'exhigh')
        encode = encode_for_level(song.source, level)
        info = self.api(song.source).song_url(song, level, encode)
        return {'url': info.get('url'), 'type': (info.get('type') or '').lower(),
                'size': info.get('size') or 0, 'level': level, 'encode': encode}

    def probe(self, payload: dict) -> list:
        """逐档探测某首歌的可用音质，返回每档是否可用及文件信息。"""
        song = song_from_dict(payload.get('song') or {})
        api = self.api(song.source)
        encode_type = self.cfg.get('encode_type', 'mp3')
        rows = []
        for value, label in LEVELS_BY_SOURCE.get(song.source, LEVELS_BY_SOURCE['netease']):
            try:
                info = api.song_url(song, value, encode_type)
                detail = f"{ (info.get('type') or '').upper() } {human_size(info.get('size'))}"
                rows.append({'value': value, 'label': label, 'ok': True, 'detail': detail})
            except Exception:  # noqa: BLE001 - 探测失败视为不可用
                rows.append({'value': value, 'label': label, 'ok': False, 'detail': ''})
        return rows

    # ---------------- 下载 ----------------
    def download(self, payload: dict) -> dict:
        items = [item for item in (payload.get('songs') or []) if isinstance(item, dict)]
        songs = [song_from_dict(item) for item in items]
        if not songs:
            raise ServiceError('请先选择要下载的歌曲')
        level = payload.get('level') or self.cfg.get('level', 'exhigh')
        encode_type = encode_for_level(songs[0].source, level)
        options = payload.get('options') or {}
        with self._lock:
            self._next_id += 1
            task = DownloadTask(self._next_id, songs, level, encode_type,
                                options, dict(self.cfg), self)
            self._tasks[task.id] = task
            self._order.insert(0, task.id)
            self._queue.append(task)
        self.log('info', f'新建下载任务 #{task.id}：{len(songs)} 首（{level} / {encode_type}）')
        self._pump()
        return task.to_dict()

    def tasks(self) -> list:
        with self._lock:
            return [self._tasks[tid].to_dict() for tid in self._order
                    if tid in self._tasks]

    def task(self, task_id: int) -> dict:
        with self._lock:
            task = self._tasks.get(int(task_id))
        if task is None:
            raise ServiceError('任务不存在')
        return task.to_dict()

    def task_action(self, task_id: int, action: str, cleanup: str = None) -> dict:
        with self._lock:
            task = self._tasks.get(int(task_id))
        if task is None:
            raise ServiceError('任务不存在')
        if action == 'pause':
            task.control.pause()
            task._set_status('paused')
            self.log('info', f'任务 #{task.id} 已暂停')
        elif action == 'resume':
            task.control.resume()
            task._set_status('running')
            self.log('info', f'任务 #{task.id} 已继续')
        elif action == 'cancel':
            if cleanup in ('delete', 'keep'):
                task.cleanup = cleanup
            else:
                task.cleanup = self.cfg.get('cancel_cleanup', 'ask')
                if task.cleanup == 'ask':
                    task.cleanup = 'keep'
            task.control.cancel()
            if task.status == 'pending':
                # 尚未开始：从队列移除并立即收尾，避免长时间停留在「取消中」
                with self._lock:
                    try:
                        self._queue.remove(task)
                    except ValueError:
                        pass          # 已被工作线程取走，run() 会自行立即收尾
                for item in task.items:
                    if item['status'] in ('pending', 'running'):
                        task._set_item(item['index'], status='cancelled', ratio=0.0)
                task._on_overall(0.0, 0.0)
                task.finished = time.time()
                task._set_status('cancelled')
                self.log('warn', f'任务 #{task.id} 已取消')
            else:
                task._set_status('cancelling')
                self.log('warn', f'任务 #{task.id} 已请求取消')
        elif action == 'retry':
            failed = [item for item in task.items
                      if item['status'] in ('failed', 'cancelled')]
            if not failed:
                raise ServiceError('没有失败项可重试')
            for item in failed:
                task._set_item(item['index'], status='pending', error='', ratio=0.0)
            task._on_overall(0.0, 0.0)
            task.started = task.finished = 0.0
            task.control = Control()
            task._set_status('pending')
            with self._lock:
                self._queue.append(task)
            self.log('info', f'任务 #{task.id} 重试 {len(failed)} 首')
            self._pump()
        elif action == 'clear':
            if task.status in ('running', 'paused', 'cancelling', 'pending'):
                raise ServiceError('任务仍在进行，无法移除')
            with self._lock:
                self._tasks.pop(task.id, None)
                if task.id in self._order:
                    self._order.remove(task.id)
            return {'removed': task.id}
        else:
            raise ServiceError(f'未知操作：{action}')
        return task.to_dict()

    def _pump(self) -> None:
        """确保有一个后台线程按 FIFO 顺序执行队列中的任务（任务间串行）。"""
        with self._lock:
            if self._pump_thread is not None and self._pump_thread.is_alive():
                return
            if not self._queue:
                return
            self._pump_thread = threading.Thread(target=self._worker_loop,
                                                 name='web-task-pump', daemon=True)
            self._pump_thread.start()

    def _worker_loop(self) -> None:
        while True:
            with self._lock:
                task = self._queue.popleft() if self._queue else None
            if task is None:
                break
            try:
                task.run()
                if task.status == 'done':
                    self._run_finish_action(task)
            except Exception as exc:  # noqa: BLE001 - 任务级异常不应终止工作线程
                task._set_status('failed')
                self.log('error', f'任务 #{task.id} 异常终止：{exc}')
        with self._lock:
            self._pump_thread = None

    def _run_finish_action(self, task) -> None:
        """下载完成后按设置执行：无 / 消息 / 弹窗 / 打开目录 / 关机。

        任务级选项（下载时下拉框）优先于全局设置。
        """
        # 配置文件可能被其他程序改过：动作执行前从 config.json 取最新值
        fresh = load_config()
        self.cfg['finish_action'] = fresh.get('finish_action')
        action = (task.options or {}).get('finish_action') or self.cfg.get('finish_action')
        info = task.to_dict()
        counts = info['counts']
        summary = (f'任务 #{task.id} 下载完成：成功 {counts.get("done", 0)}/{info["total"]}'
                   f'，失败 {counts.get("failed", 0)}。\n'
                   f'下载目录：{self.cfg.get("download_dir")}')
        try:
            result = run_finish_action(self.cfg, summary, action)
        except Exception as exc:  # noqa: BLE001 - 完成动作失败不影响下载结果
            self.log('error', f'[任务{task.id}] 完成动作失败：{exc}')
            return
        if result:
            self.log('info', f'[任务{task.id}] {result}')

    def open_dir(self) -> str:
        path = self.cfg.get('download_dir', '')
        if not path:
            raise ServiceError('未设置下载目录')
        os.makedirs(path, exist_ok=True)
        try:
            os.startfile(path)  # noqa: S606 - Windows 专用
        except AttributeError:  # noqa: BLE001 - 非 Windows 环境
            raise ServiceError('当前系统不支持自动打开目录')
        return path

    # ---------------- 导出 ----------------
    def export_songs(self, fmt: str, songs: list) -> dict:
        """把歌曲列表导出为 CSV / M3U / TXT 文本，交由前端保存。"""
        rows = [song_from_dict(item) for item in (songs or []) if isinstance(item, dict)]
        if not rows:
            raise ServiceError('没有可导出的歌曲')
        fmt = (fmt or 'txt').lower()
        if fmt == 'csv':
            buffer = io.StringIO()
            writer = csv.writer(buffer)
            writer.writerow(['序号', '歌名', '歌手', '专辑', '时长', '音质', '大小≈', '音源'])
            for index, song in enumerate(rows, 1):
                writer.writerow([index, song.name, song.artists, song.album,
                                 song.duration_str, self.cfg.get('level'),
                                 song.size_hint(self.cfg.get('level')), song.source])
            content = buffer.getvalue()
        elif fmt == 'm3u':
            lines = ['#EXTM3U']
            for song in rows:
                lines.append(f'#EXTINF:{song.duration // 1000},{song.artists} - {song.name}')
                lines.append(song.filename(self.cfg.get('name_template')))
            content = '\n'.join(lines) + '\n'
        else:
            content = '\n'.join(f'{song.artists} - {song.name}（{song.album}）'
                                for song in rows) + '\n'
        return {'filename': f'playlist.{fmt}', 'content': content}


def _parse_playlist_id(text: str, source: str) -> str:
    """从歌单链接提取 ID：优先 id= 参数，QQ 兼容 /playlist/xxx，末位取最长数字串。"""
    match = re.search(r'[?&#]id=(\d+)', text)
    if not match and source == 'qq':
        match = re.search(r'/playlist/(\d+)', text)
    if match:
        return match.group(1)
    nums = re.findall(r'\d+', text)
    return max(nums, key=len) if nums else ''


def _parse_song_link(text: str):
    """识别单曲链接，返回 (音源, ID/MID)；非单曲链接返回 None。"""
    match = _RE_NETEASE_SONG.search(text)
    if match:
        return 'netease', match.group(1)
    match = _RE_QQ_SONG.search(text)
    if match:
        return 'qq', match.group(1)
    return None
