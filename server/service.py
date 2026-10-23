"""Server 版业务层：账号、检索、下载任务、文件交付。

与本地版的区别：
* 每个操作都绑定 user_id，音源实例按用户隔离；
* 任务在内存中跟踪（进程重启即失效），成品文件落库并设置过期时间；
* 下载完成后不做关机 / 提示音 / 打开目录等桌面动作，只提供浏览器下载。
"""
from __future__ import annotations

import os
import re
import secrets
import shutil
import threading
import time
from collections import deque
from concurrent.futures import ThreadPoolExecutor

from accounts import (AccountError, LoginLimiter, hash_password, new_session_token,
                      token_digest, validate_password, validate_username,
                      verify_password)
from context import ContextPool
from downloader import Control, DownloadCancelled, Downloader, ProgressHub
from models import LEVELS_BY_SOURCE, Song, encode_for_level, human_size

SOURCES = [('netease', '网易云音乐'), ('qq', 'QQ 音乐')]
SOURCE_LABELS = dict(SOURCES)
GUEST_ID = 0
GUEST_USER = {'id': GUEST_ID, 'username': '访客', 'disabled': 0}

DEFAULT_PREFS = {
    'source': 'netease',
    'level': 'exhigh',
    'save_lyric': True,
    'embed_tag': True,
    'embed_cover': True,
    'embed_lyric': True,
}

_RE_NETEASE_SONG = re.compile(r'song\?id=(\d+)')
_RE_QQ_SONG = re.compile(r'/songDetail/([0-9A-Za-z]+)')
MAX_TASKS_KEPT = 40


class ServiceError(Exception):
    """可预期的业务错误，消息直接展示给用户。"""


def song_key(song: Song) -> str:
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
    def as_int(value):
        try:
            return int(value)
        except (TypeError, ValueError):
            return 0

    source = 'qq' if data.get('source') == 'qq' else 'netease'
    return Song(
        id=as_int(data.get('id')),
        name=data.get('name') or '',
        artists=data.get('artists') or '',
        album=data.get('album') or '',
        cover_url=data.get('cover') or '',
        duration=as_int(data.get('duration')),
        fee=as_int(data.get('fee')),
        sizes=data.get('sizes') if isinstance(data.get('sizes'), dict) else {},
        source=source,
        mid=data.get('mid') or '',
        media_mid=data.get('media_mid') or '',
    )


def parse_playlist_id(text: str, source: str) -> str:
    """从歌单链接提取 ID；注意域名里的 163 等数字不能误当作 ID。"""
    match = re.search(r'[?&#]id=(\d+)', text)
    if not match and source == 'qq':
        match = re.search(r'/playlist/(\d+)', text)
    if match:
        return match.group(1)
    if re.fullmatch(r'\d{1,20}', text.strip()):
        return text.strip()
    return ''


def parse_song_link(text: str):
    match = _RE_NETEASE_SONG.search(text)
    if match:
        return 'netease', match.group(1)
    match = _RE_QQ_SONG.search(text)
    if match:
        return 'qq', match.group(1)
    return None


class DownloadTask:
    """一次下载任务：多首歌、进度聚合、可取消。"""

    def __init__(self, task_id: str, user_id: int, songs: list, level: str,
                 encode_type: str, options: dict, title: str, task_dir: str):
        self.id = task_id
        self.user_id = user_id
        self.songs = songs
        self.level = level
        self.encode_type = encode_type
        self.options = options
        self.title = title
        self.task_dir = task_dir
        self.source = songs[0].source if songs else 'netease'
        self.status = 'queued'
        self.error = ''
        self.created = time.time()
        self.finished = 0.0
        self.overall = 0.0
        self.speed = 0.0
        self.control = Control()
        self.files = []
        self.logs = deque(maxlen=200)
        self.quota_hit = False
        self._lock = threading.Lock()
        self.items = [{'index': i, 'name': song.name, 'artists': song.artists,
                       'status': 'pending', 'ratio': 0.0, 'error': ''}
                      for i, song in enumerate(songs)]

    def set_item(self, index: int, **kwargs) -> None:
        with self._lock:
            self.items[index].update(kwargs)

    def set_progress(self, overall: float, speed: float) -> None:
        with self._lock:
            self.overall = min(max(overall, 0.0), 1.0)
            self.speed = speed

    def log(self, text: str) -> None:
        text = (text or '').strip()
        if not text:
            return
        with self._lock:
            self.logs.append(text)

    def snapshot(self) -> dict:
        with self._lock:
            done = sum(1 for item in self.items if item['status'] == 'done')
            failed = sum(1 for item in self.items if item['status'] == 'failed')
            return {
                'id': self.id,
                'title': self.title,
                'status': self.status,
                'source': self.source,
                'level': self.level,
                'created': int(self.created),
                'finished': int(self.finished or 0),
                'total': len(self.items),
                'done': done,
                'failed': failed,
                'progress': round(self.overall, 4),
                'speed': int(self.speed),
                'error': self.error,
                'items': [dict(item) for item in self.items],
                'logs': list(self.logs),
            }


class ServerService:
    def __init__(self, cfg: dict, store):
        self.cfg = cfg
        self.store = store
        self.enable_users = bool(cfg.get('enable_users', True))
        self.contexts = ContextPool(store, cfg)
        self.limiter = LoginLimiter()
        self._lock = threading.RLock()   # _trim_tasks 在持锁上下文内被调用，需可重入
        self._tasks = {}                                  # task_id -> DownloadTask
        self._pool = ThreadPoolExecutor(
            max_workers=max(2, int(cfg.get('download_workers') or 3) * 2),
            thread_name_prefix='srv-dl')
        self._quota = int(cfg.get('quota_mb') or 0) * 1024 * 1024
        self._retention = int(cfg.get('retention_hours') or 72) * 3600
        self._stop = threading.Event()
        self._cleaner = threading.Thread(target=self._cleanup_loop, name='srv-cleaner',
                                         daemon=True)
        self._cleaner.start()

    def log(self, level: str, message: str) -> None:
        print(f'[{time.strftime("%H:%M:%S")}] [{level}] {message}', flush=True)

    # ---------------- 账号 ----------------
    def guest_user(self) -> dict:
        """未启用账号系统时的公共身份，任务与文件统一挂在 user_id=0 下。"""
        return dict(GUEST_USER)

    def register(self, username: str, password: str, ip: str) -> dict:
        if not self.enable_users:
            raise AccountError('本服务未启用账号系统')
        username = validate_username(username)
        password = validate_password(password)
        if self.store.find_user(username):
            raise AccountError('该用户名已被占用')
        user_id = self.store.create_user(username, hash_password(password))
        self.log('info', f'新用户注册：{username}（{ip}）')
        return self._issue_session(user_id, ip)

    def login(self, username: str, password: str, ip: str) -> dict:
        if not self.enable_users:
            raise AccountError('本服务未启用账号系统')
        username = (username or '').strip()
        self.limiter.check(ip, username)
        user = self.store.find_user(username)
        if not user or not verify_password(password or '', user['password_hash']):
            self.limiter.fail(ip, username)
            raise AccountError('用户名或密码错误')
        if user.get('disabled'):
            raise AccountError('该账号已被停用')
        self.limiter.clear(ip, username)
        self.log('info', f'用户登录：{username}（{ip}）')
        return self._issue_session(int(user['id']), ip)

    def _issue_session(self, user_id: int, ip: str) -> dict:
        token = new_session_token()
        expires_at = int(time.time()) + int(self.cfg.get('session_hours') or 168) * 3600
        self.store.create_session(token_digest(token), user_id, expires_at, ip)
        user = self.store.get_user(user_id)
        return {'token': token, 'expires_at': expires_at,
                'user': {'id': user_id, 'username': user['username']}}

    def user_by_token(self, token: str):
        if not token:
            return None
        session = self.store.find_session(token_digest(token))
        if not session:
            return None
        if session['expires_at'] < int(time.time()):
            self.store.delete_session(session['token_hash'])
            return None
        user = self.store.get_user(int(session['user_id']))
        if not user or user.get('disabled'):
            return None
        return user

    def logout(self, token: str) -> None:
        if token:
            self.store.delete_session(token_digest(token))

    # ---------------- 用户偏好 ----------------
    def prefs(self, user_id: int) -> dict:
        data = dict(DEFAULT_PREFS)
        data.update(self.store.get_prefs(user_id).get('prefs') or {})
        if data.get('source') not in dict(SOURCES):
            data['source'] = 'netease'
        levels = [value for value, _ in LEVELS_BY_SOURCE.get(data['source'], [])]
        if data.get('level') not in levels:
            data['level'] = 'exhigh' if 'exhigh' in levels else levels[0]
        return data

    def update_prefs(self, user_id: int, payload: dict) -> dict:
        current = self.prefs(user_id)
        for key in DEFAULT_PREFS:
            if key in payload:
                current[key] = payload[key]
        current = self.prefs_payload(current)
        self.store.save_prefs(user_id, prefs=current)
        self.contexts.reload(user_id, prefs=current)
        return current

    def prefs_payload(self, data: dict) -> dict:
        source = data.get('source') if data.get('source') in dict(SOURCES) else 'netease'
        levels = [value for value, _ in LEVELS_BY_SOURCE.get(source, [])]
        level = data.get('level') if data.get('level') in levels else levels[0]
        return {
            'source': source,
            'level': level,
            'save_lyric': bool(data.get('save_lyric', True)),
            'embed_tag': bool(data.get('embed_tag', True)),
            'embed_cover': bool(data.get('embed_cover', True)),
            'embed_lyric': bool(data.get('embed_lyric', True)),
        }

    def account_state(self, user_id: int, source: str) -> dict:
        ctx = self.contexts.get(user_id)
        return ctx.account_state(source if source in dict(SOURCES) else 'netease')

    def login_cookie(self, user_id: int, source: str, cookie: str) -> dict:
        cookie = (cookie or '').strip()
        if not cookie:
            raise ServiceError('请粘贴 Cookie 或登录凭证')
        if len(cookie) > 200_000:
            raise ServiceError('凭据内容过长')
        ctx = self.contexts.get(user_id)
        api = ctx.provider(source)
        try:
            if source == 'qq':
                api.set_cookie(cookie)
                credential = api.credential_dict()
                self.store.save_prefs(user_id, qq_credential=credential)
                ctx.update(qq_credential=credential)
            else:
                api.set_cookie(cookie)
                self.store.save_prefs(user_id, cookie=cookie)
                ctx.update(cookie=cookie)
        except Exception as exc:  # noqa: BLE001 - 校验失败交由前端提示
            raise ServiceError(f'登录失败：{exc}')
        self.log('info', f'用户 {user_id} 完成 {SOURCE_LABELS.get(source)} 登录')
        return self.account_state(user_id, source)

    def logout_source(self, user_id: int, source: str) -> dict:
        source = 'qq' if source == 'qq' else 'netease'
        ctx = self.contexts.get(user_id)
        api = ctx.provider(source)
        if source == 'qq':
            api.set_credential(None)
            self.store.save_prefs(user_id, qq_credential={})
            ctx.update(qq_credential={})
        else:
            api.set_cookie('')
            self.store.save_prefs(user_id, cookie='')
            ctx.update(cookie='')
        return {'logged_in': False, 'nickname': ''}

    # ---------------- 曲库 ----------------
    def meta(self, user_id: int) -> dict:
        usage = self.store.user_usage(user_id)
        quota = self._quota
        username = '访客' if not self.enable_users else \
            (self.store.get_user(user_id) or {}).get('username', '')
        return {
            'user': username,
            'auth_enabled': self.enable_users,
            'sources': [{'value': value, 'label': label} for value, label in SOURCES],
            'levels': {value: [{'value': v, 'label': lab} for v, lab in levels]
                       for value, levels in LEVELS_BY_SOURCE.items()},
            'prefs': self.prefs(user_id),
            'quota': {'used': usage, 'limit': quota,
                      'used_str': human_size(usage) if usage else '0 B',
                      'limit_str': human_size(quota) if quota else '不限'},
            'retention_hours': int(self.cfg.get('retention_hours') or 72),
            'max_tasks': int(self.cfg.get('max_tasks_per_user') or 2),
        }

    def search(self, user_id: int, keyword: str, limit: int, offset: int,
               source: str = None) -> dict:
        keyword = (keyword or '').strip()
        if not keyword:
            raise ServiceError('请输入搜索关键词')
        source = source or self.prefs(user_id)['source']
        limit = max(1, min(100, int(limit or 50)))
        offset = max(0, min(10000, int(offset or 0)))
        api = self.contexts.get(user_id).provider(source)
        try:
            songs = api.search(keyword, limit=limit, offset=offset)
        except Exception as exc:  # noqa: BLE001 - 外部接口异常统一提示
            raise ServiceError(f'搜索失败：{exc}')
        level = self.prefs(user_id)['level']
        return {'songs': [song_to_dict(song, level) for song in songs],
                'offset': offset + len(songs)}

    def playlist(self, user_id: int, text: str, source: str = None) -> dict:
        text = (text or '').strip()
        if not text:
            raise ServiceError('请输入歌单 / 单曲链接或歌单 ID')
        source = source or self.prefs(user_id)['source']
        api = self.contexts.get(user_id).provider(source)
        level = self.prefs(user_id)['level']
        match = parse_song_link(text)
        if match:
            link_source, value = match
            if link_source != source:
                raise ServiceError(f'该链接属于 {SOURCE_LABELS.get(link_source)}，请先切换音源')
            try:
                songs = api.song_by_id(value)
            except Exception as exc:  # noqa: BLE001
                raise ServiceError(f'获取单曲失败：{exc}')
            if not songs:
                raise ServiceError('未找到该歌曲')
            return {'title': '单曲', 'songs': [song_to_dict(song, level) for song in songs]}
        playlist_id = parse_playlist_id(text, source)
        if not playlist_id:
            raise ServiceError('未能从链接中解析出歌单 ID')
        try:
            title, songs = api.playlist_songs(playlist_id)
        except Exception as exc:  # noqa: BLE001
            raise ServiceError(f'获取歌单失败：{exc}')
        return {'title': title or f'歌单 {playlist_id}',
                'songs': [song_to_dict(song, level) for song in songs]}

    def my_playlists(self, user_id: int, source: str = None) -> list:
        source = source or self.prefs(user_id)['source']
        api = self.contexts.get(user_id).provider(source)
        try:
            return api.user_playlists()
        except Exception as exc:  # noqa: BLE001
            raise ServiceError(f'获取我的歌单失败：{exc}')

    def liked(self, user_id: int, source: str = None) -> dict:
        source = source or self.prefs(user_id)['source']
        api = self.contexts.get(user_id).provider(source)
        level = self.prefs(user_id)['level']
        try:
            title, songs = api.liked_songs()
        except Exception as exc:  # noqa: BLE001
            raise ServiceError(f'获取我喜欢的音乐失败：{exc}')
        return {'title': title, 'songs': [song_to_dict(song, level) for song in songs]}

    # ---------------- 下载任务 ----------------
    def create_task(self, user_id: int, payload: dict) -> dict:
        items = [item for item in (payload.get('songs') or []) if isinstance(item, dict)]
        if not items:
            raise ServiceError('请先选择要下载的歌曲')
        if len(items) > 300:
            raise ServiceError('单次任务最多 300 首')
        if self._quota and self.store.user_usage(user_id) >= self._quota:
            raise ServiceError('存储空间已满，请先删除已下载文件')
        with self._lock:
            running = sum(1 for task in self._tasks.values()
                          if task.user_id == user_id
                          and task.status in ('queued', 'running'))
        if running >= int(self.cfg.get('max_tasks_per_user') or 2):
            raise ServiceError('同时运行的任务数已达上限，请等待当前任务完成')

        songs = [song_from_dict(item) for item in items]
        source = songs[0].source
        prefs = self.prefs(user_id)
        level = payload.get('level') if payload.get('level') else prefs['level']
        levels = [value for value, _ in LEVELS_BY_SOURCE.get(source, [])]
        if level not in levels:
            raise ServiceError('不支持该音质')
        options = {
            'save_lyric': bool(payload.get('save_lyric', prefs['save_lyric'])),
            'embed_tag': bool(payload.get('embed_tag', prefs['embed_tag'])),
            'embed_cover': bool(payload.get('embed_cover', prefs['embed_cover'])),
            'embed_lyric': bool(payload.get('embed_lyric', prefs['embed_lyric'])),
        }
        task_id = secrets.token_hex(8)
        task_dir = os.path.join(self._user_dir(user_id), task_id)
        os.makedirs(task_dir, exist_ok=True)
        title = (payload.get('title') or '').strip() or f'{len(songs)} 首歌曲'
        task = DownloadTask(task_id, user_id, songs, level,
                            encode_for_level(source, level), options, title[:80], task_dir)
        with self._lock:
            self._tasks[task_id] = task
            self._trim_tasks(user_id)
        self._pool.submit(self._run_task, task)
        self.log('info', f'用户 {user_id} 创建任务 {task_id}（{len(songs)} 首）')
        return task.snapshot()

    def _trim_tasks(self, user_id: int) -> None:
        """每个用户只保留最近的一批已结束任务，避免内存无限增长。"""
        with self._lock:
            mine = [task for task in self._tasks.values() if task.user_id == user_id]
            finished = sorted((task for task in mine if task.status not in ('queued', 'running')),
                              key=lambda task: task.finished or task.created)
            for task in finished[:-MAX_TASKS_KEPT]:
                self._tasks.pop(task.id, None)

    def _user_dir(self, user_id: int) -> str:
        return os.path.join(self.cfg['data_dir'], 'files', str(user_id))

    def _run_task(self, task: DownloadTask) -> None:
        task.status = 'running'
        ctx = self.contexts.get(task.user_id)
        api = ctx.provider(task.source)
        cfg = {
            'download_dir': task.task_dir,
            'name_template': '{artist} - {name}',
            'folder_structure': 'none',
            'task_folder': False,
            'level': task.level,
            'encode_type': task.encode_type,
            'save_lyric': task.options['save_lyric'],
            'embed_tag': task.options['embed_tag'],
            'embed_cover': task.options['embed_cover'],
            'embed_lyric': task.options['embed_lyric'],
            'skip_existing': False,
            'retry': 3,
        }
        downloader = Downloader(api, cfg,
                                on_log=lambda text: task.log(text),
                                control=task.control)
        hub = ProgressHub(len(task.songs), lambda overall, speed: task.set_progress(overall, speed))

        def worker(index: int) -> None:
            song = task.songs[index]
            task.set_item(index, status='running')
            if task.control.cancelled:
                task.set_item(index, status='cancelled')
                hub.finish(index)
                return
            if self._quota and self.store.user_usage(task.user_id) >= self._quota:
                task.quota_hit = True
                task.set_item(index, status='failed', error='存储空间已满')
                hub.finish(index)
                return
            try:
                path = downloader.download(
                    song, level=task.level, encode_type=task.encode_type,
                    options=task.options, index=index + 1,
                    on_progress=lambda ratio, done, total: hub.update(index, ratio, done))
                file_id = self._register_file(task, path, song)
                task.files.append(file_id)
                task.set_item(index, status='done', ratio=1.0)
            except DownloadCancelled:
                task.set_item(index, status='cancelled', ratio=0.0)
            except Exception as exc:  # noqa: BLE001 - 单曲失败不影响其他歌曲
                task.set_item(index, status='failed', error=str(exc))
                task.log(f'{song.name} 下载失败：{exc}')
            finally:
                hub.finish(index)

        try:
            with ThreadPoolExecutor(
                    max_workers=max(1, int(self.cfg.get('download_workers') or 3)),
                    thread_name_prefix='srv-song') as pool:
                list(pool.map(worker, range(len(task.songs))))
        finally:
            downloader.close()
            hub.final()

        if task.control.cancelled:
            task.status = 'cancelled'
            task.set_progress(0.0, 0.0)
            self._purge_task_files(task.id)
            self.log('warn', f'任务 {task.id} 已取消')
        else:
            failed = sum(1 for item in task.items if item['status'] == 'failed')
            if failed == 0:
                task.status = 'done'
            elif failed == len(task.items):
                task.status = 'failed'
                task.error = '全部歌曲下载失败'
            else:
                task.status = 'partial'
                task.error = f'{failed} 首下载失败'
            if task.quota_hit:
                task.error = '存储空间已满，部分歌曲未下载'
            self.log('info', f'任务 {task.id} 结束：成功 {len(task.items) - failed}/{len(task.items)}')
        task.finished = time.time()

    def _register_file(self, task: DownloadTask, path: str, song: Song) -> str:
        file_id = secrets.token_hex(8)
        size = os.path.getsize(path) if os.path.exists(path) else 0
        expires_at = int(time.time()) + self._retention
        self.store.add_file(file_id, task.user_id, task.id, song.name, song.artists,
                            path, os.path.basename(path), size, expires_at)
        return file_id

    def tasks(self, user_id: int) -> list:
        with self._lock:
            mine = [task for task in self._tasks.values() if task.user_id == user_id]
        mine.sort(key=lambda task: task.created, reverse=True)
        return [task.snapshot() for task in mine]

    def task_action(self, user_id: int, task_id: str, action: str) -> dict:
        with self._lock:
            task = self._tasks.get(task_id)
        if not task or task.user_id != user_id:
            raise ServiceError('任务不存在')
        if action == 'cancel':
            task.control.cancel()
            return task.snapshot()
        if action == 'delete':
            task.control.cancel()
            self._purge_task_files(task_id)
            with self._lock:
                self._tasks.pop(task_id, None)
            return {'deleted': True}
        raise ServiceError('未知操作')

    def _purge_task_files(self, task_id: str) -> None:
        for row in self.store.task_files(task_id):
            self._remove_file(row)
            self.store.delete_file_row(row['id'])
        with self._lock:
            task = self._tasks.get(task_id)
        if task:
            try:
                shutil.rmtree(task.task_dir, ignore_errors=True)
            except Exception:  # noqa: BLE001
                pass

    # ---------------- 成品文件 ----------------
    def files(self, user_id: int) -> list:
        result = []
        for row in self.store.list_files(user_id):
            if not os.path.isfile(row['path']):
                continue
            result.append({
                'id': row['id'],
                'task_id': row['task_id'],
                'name': row['song_name'],
                'artists': row['artists'],
                'filename': row['filename'],
                'size': row['size'],
                'size_str': human_size(row['size']),
                'created': row['created_at'],
                'expires': row['expires_at'],
                'expires_in': max(0, row['expires_at'] - int(time.time())),
            })
        return result

    def file_for_download(self, user_id: int, file_id: str) -> dict:
        row = self.store.get_file(file_id)
        if not row or int(row['user_id']) != user_id:
            raise ServiceError('文件不存在或无权访问')
        path = os.path.realpath(row['path'])
        base = os.path.realpath(self._user_dir(user_id))
        if not path.startswith(base + os.sep) or not os.path.isfile(path):
            raise ServiceError('文件已过期或已被删除')
        row['path'] = path
        return row

    def delete_file(self, user_id: int, file_id: str) -> dict:
        row = self.store.get_file(file_id)
        if not row or int(row['user_id']) != user_id:
            raise ServiceError('文件不存在或无权访问')
        self._remove_file(row)
        self.store.delete_file_row(file_id)
        return {'deleted': True}

    @staticmethod
    def _remove_file(row: dict) -> None:
        try:
            if row.get('path') and os.path.isfile(row['path']):
                os.remove(row['path'])
        except OSError:
            pass

    # ---------------- 后台清理 ----------------
    def _cleanup_loop(self) -> None:
        while not self._stop.wait(300):
            try:
                self.cleanup_once()
            except Exception as exc:  # noqa: BLE001 - 清理失败不影响主服务
                self.log('warn', f'过期清理失败：{exc}')

    def cleanup_once(self) -> int:
        now = int(time.time())
        removed = 0
        for row in self.store.expired_files(now):
            self._remove_file(row)
            self.store.delete_file_row(row['id'])
            removed += 1
        expired_sessions = self.store.purge_sessions(now)
        self.limiter.purge()
        if removed:
            self.log('info', f'清理过期文件 {removed} 个')
        return removed + expired_sessions

    def shutdown(self) -> None:
        self._stop.set()
        for task in list(self._tasks.values()):
            task.control.cancel()
        self._pool.shutdown(wait=False)
