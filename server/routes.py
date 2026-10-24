"""HTTP 路由与静态资源。

* 会话：HttpOnly + SameSite=Lax Cookie，库里只存令牌摘要；
* POST 只接受 application/json（配合 SameSite 抵御跨站表单提交）；
* 文件交付走流式响应，Content-Disposition 带 UTF-8 文件名。
"""
from __future__ import annotations

import json
import mimetypes
import os
import re
import sys
import time
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, quote, unquote, urlparse

from accounts import AccountError
from service import ServiceError

WEB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'web')
COOKIE_NAME = 'md_session'
TASK_RE = re.compile(r'^/api/tasks/([0-9a-f]{8,32})(?:/(cancel))?$')
FILE_RE = re.compile(r'^/api/files/([0-9a-f]{8,32})(?:/download)?$')


class Ctx:
    """一次请求的上下文：服务实例、当前用户、令牌与来源 IP。"""

    def __init__(self, service, user, token: str, ip: str):
        self.service = service
        self.user = user
        self.user_id = int(user['id'])
        self.token = token
        self.ip = ip


# ---------------- 处理函数 ----------------
def h_meta(ctx, _payload):
    return ctx.service.meta(ctx.user_id)


def h_prefs_get(ctx, _payload):
    return {'prefs': ctx.service.prefs(ctx.user_id)}


def h_prefs_set(ctx, payload):
    return {'prefs': ctx.service.update_prefs(ctx.user_id, payload or {})}


def h_account(ctx, payload):
    return ctx.service.account_state(ctx.user_id, payload.get('source'))


def h_login_cookie(ctx, payload):
    return ctx.service.login_cookie(ctx.user_id, payload.get('source'),
                                    payload.get('cookie') or '')


def h_logout_source(ctx, payload):
    return ctx.service.logout_source(ctx.user_id, payload.get('source'))


def h_qr_start(ctx, payload):
    return ctx.service.qr_start(ctx.user_id, payload.get('source'),
                                payload.get('type') or 'qq')


def h_qr_poll(ctx, payload):
    return ctx.service.qr_poll(ctx.user_id, payload.get('source'),
                               payload.get('identifier') or '')


def h_play(ctx, payload):
    return ctx.service.play(ctx.user_id, payload or {})


def h_lyric(ctx, payload):
    return ctx.service.lyric(ctx.user_id, payload or {})


def h_search(ctx, payload):
    return ctx.service.search(ctx.user_id, payload.get('keyword'),
                              payload.get('limit') or 50, payload.get('offset') or 0,
                              payload.get('source'))


def h_playlist(ctx, payload):
    return ctx.service.playlist(ctx.user_id, payload.get('text') or '',
                                payload.get('source'))


def h_my_playlists(ctx, payload):
    return {'items': ctx.service.my_playlists(ctx.user_id, payload.get('source'))}


def h_liked(ctx, payload):
    return ctx.service.liked(ctx.user_id, payload.get('source'))


def h_download(ctx, payload):
    return ctx.service.create_task(ctx.user_id, payload or {})


def h_tasks(ctx, _payload):
    return {'items': ctx.service.tasks(ctx.user_id)}


def h_files(ctx, _payload):
    return {'items': ctx.service.files(ctx.user_id),
            'usage': ctx.service.store.user_usage(ctx.user_id)}


def h_delete_file(ctx, payload):
    return ctx.service.delete_file(ctx.user_id, payload.get('id') or '')


ROUTES = {
    ('GET', '/api/meta'): h_meta,
    ('GET', '/api/prefs'): h_prefs_get,
    ('GET', '/api/tasks'): h_tasks,
    ('GET', '/api/files'): h_files,
    ('POST', '/api/prefs'): h_prefs_set,
    ('POST', '/api/account'): h_account,
    ('POST', '/api/account/login'): h_login_cookie,
    ('POST', '/api/account/logout'): h_logout_source,
    ('POST', '/api/login/qr/start'): h_qr_start,
    ('POST', '/api/login/qr/poll'): h_qr_poll,
    ('POST', '/api/play'): h_play,
    ('POST', '/api/lyric'): h_lyric,
    ('POST', '/api/search'): h_search,
    ('POST', '/api/playlist'): h_playlist,
    ('POST', '/api/my_playlists'): h_my_playlists,
    ('POST', '/api/liked'): h_liked,
    ('POST', '/api/download'): h_download,
}

PUBLIC_ROUTES = {'/api/health'}


def _content_disposition(filename: str) -> str:
    fallback = ''.join(ch if 32 <= ord(ch) < 127 and ch not in '"\\' else '_'
                       for ch in filename)
    return f"attachment; filename=\"{fallback}\"; filename*=UTF-8''{quote(filename)}"


class Handler(BaseHTTPRequestHandler):
    server_version = 'MusicDownloaderServer/1.0'
    protocol_version = 'HTTP/1.1'

    # ---- 响应工具 ----
    def _send_bytes(self, status: int, body: bytes, content_type: str,
                    extra_headers: list = None) -> None:
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'same-origin')
        for key, value in (extra_headers or []):
            self.send_header(key, value)
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    def _send_json(self, status: int, data: dict, extra_headers: list = None) -> None:
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self._send_bytes(status, body, 'application/json; charset=utf-8', extra_headers)

    def _ok(self, data) -> None:
        self._send_json(200, {'ok': True, 'data': data})

    def _fail(self, message: str, status: int = 200, extra_headers: list = None) -> None:
        self._send_json(status, {'ok': False, 'error': message}, extra_headers)

    # ---- 请求入口 ----
    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path.startswith('/api/'):
            payload = {key: values[0] for key, values in parse_qs(parsed.query).items()}
            self._dispatch('GET', parsed.path, payload)
        else:
            self._serve_static(parsed.path)

    def do_HEAD(self) -> None:
        self.do_GET()

    def do_DELETE(self) -> None:
        parsed = urlparse(self.path)
        # 读完并丢弃请求体：否则残留字节会被当成下一个请求的起始行
        try:
            length = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            length = 0
        if length:
            self.rfile.read(min(length, 64 * 1024))
        self._dispatch('DELETE', parsed.path, {})

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        app = self.server.app
        max_body = int(app.cfg.get('max_body_mb') or 1) * 1024 * 1024
        try:
            length = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            self._fail('请求头非法', 400)
            return
        if length > max_body:
            self._fail('请求体过大', 413)
            return
        raw = self.rfile.read(length) if length else b''
        ctype = (self.headers.get('Content-Type') or '').split(';')[0].strip().lower()
        if ctype != 'application/json' and parsed.path.startswith('/api/'):
            self._fail('请求必须为 application/json', 415)
            return
        try:
            payload = json.loads(raw.decode('utf-8')) if raw else {}
        except (ValueError, UnicodeDecodeError):
            self._fail('请求体不是合法 JSON', 400)
            return
        self._dispatch('POST', parsed.path, payload if isinstance(payload, dict) else {})

    # ---- 鉴权 ----
    def _token(self) -> str:
        raw = self.headers.get('Cookie') or ''
        if not raw:
            return ''
        cookie = SimpleCookie()
        try:
            cookie.load(raw)
        except Exception:  # noqa: BLE001 - 非法 Cookie 视为未登录
            return ''
        morsel = cookie.get(COOKIE_NAME)
        return morsel.value if morsel else ''

    def _ip(self) -> str:
        app = self.server.app
        if app.cfg.get('behind_proxy'):
            forwarded = (self.headers.get('X-Forwarded-For') or '').split(',')[0].strip()
            if forwarded:
                return forwarded
        return self.client_address[0] if self.client_address else ''

    def _session_cookie(self, token: str, clear: bool = False) -> list:
        cfg = self.server.app.cfg
        parts = [f'{COOKIE_NAME}={token}', 'Path=/', 'HttpOnly', 'SameSite=Lax']
        if clear:
            parts.append('Max-Age=0')
        else:
            max_age = int(cfg.get('session_hours') or 168) * 3600
            parts.append(f'Max-Age={max_age}')
        if cfg.get('secure_cookie'):
            parts.append('Secure')
        return [('Set-Cookie', '; '.join(parts))]

    # ---- 分发 ----
    def _dispatch(self, method: str, path: str, payload: dict) -> None:
        app = self.server.app
        service = app.service
        path = path.rstrip('/') or '/'

        if path in PUBLIC_ROUTES:
            self._ok({'status': 'ok', 'time': int(time.time())})
            return

        try:
            if path == '/api/auth/register' and method == 'POST':
                result = service.register(payload.get('username'), payload.get('password'),
                                          self._ip())
                self._send_json(200, {'ok': True, 'data': {'user': result['user']}},
                                self._session_cookie(result['token']))
                return
            if path == '/api/auth/login' and method == 'POST':
                result = service.login(payload.get('username'), payload.get('password'),
                                       self._ip())
                self._send_json(200, {'ok': True, 'data': {'user': result['user']}},
                                self._session_cookie(result['token']))
                return
            if path == '/api/auth/logout' and method == 'POST':
                service.logout(self._token())
                self._send_json(200, {'ok': True, 'data': {'logged_out': True}},
                                self._session_cookie('', clear=True))
                return

            handler = ROUTES.get((method, path))
            task_match = TASK_RE.match(path)
            file_match = FILE_RE.match(path)
            if path == '/api/auth/me' and method == 'GET':
                if not service.enable_users:
                    guest = service.guest_user()
                    self._ok({'user': {'id': guest['id'], 'username': guest['username']},
                              'auth_enabled': False})
                    return
                user = service.user_by_token(self._token())
                if user:
                    self._ok({'user': {'id': user['id'], 'username': user['username']},
                              'auth_enabled': True})
                else:
                    # 未登录不拦截：以访客身份继续使用，登录入口保留在顶栏
                    self._ok({'user': None, 'guest': True, 'auth_enabled': True})
                return
            if (handler is None and not task_match and not file_match
                    and path != '/api/files/archive'):
                self._fail(f'未知接口：{path}', 404)
                return

            # 账号系统可选：有会话则用该用户，否则落到访客空间
            user = service.user_by_token(self._token()) or service.guest_user()

            ctx = Ctx(service, user, self._token(), self._ip())

            if task_match:
                task_id, cancel = task_match.group(1), task_match.group(2)
                if method == 'POST' and cancel:
                    self._ok(service.task_action(ctx.user_id, task_id, 'cancel'))
                elif method == 'DELETE':
                    self._ok(service.task_action(ctx.user_id, task_id, 'delete'))
                else:
                    self._fail('未知接口', 404)
                return

            if path == '/api/files/archive' and method == 'GET':
                ids = [part for part in str(payload.get('ids') or '').split(',') if part]
                result = service.export_files(ctx.user_id, ids)
                if result['kind'] == 'single':
                    ok = self._send_file(result['row'])
                else:
                    ok = self._send_file({'path': result['path'],
                                          'filename': result['filename']})
                service.after_export(ctx.user_id, result, ok)
                return

            if file_match:
                file_id = file_match.group(1)
                if method == 'GET' and path.endswith('/download'):
                    row = service.file_for_download(ctx.user_id, file_id)
                    ok = self._send_file(row)
                    if ok and service.delete_after_export(ctx.user_id):
                        service.delete_file(ctx.user_id, file_id)
                elif method == 'DELETE':
                    self._ok(service.delete_file(ctx.user_id, file_id))
                else:
                    self._fail('未知接口', 404)
                return

            self._ok(handler(ctx, payload))
        except (ServiceError, AccountError) as exc:
            self._fail(str(exc))
        except Exception as exc:  # noqa: BLE001 - 兜底，避免堆栈泄漏给前端
            service.log('error', f'{path} 处理失败：{exc}')
            self._fail(f'服务异常：{exc}', 500)

    # ---- 静态资源 ----
    def _serve_static(self, path: str) -> None:
        rel = unquote(path).lstrip('/').split('?')[0] or 'index.html'
        full = os.path.normpath(os.path.join(WEB_DIR, rel))
        if not full.startswith(WEB_DIR) or not os.path.isfile(full):
            full = os.path.join(WEB_DIR, 'index.html')
        if not os.path.isfile(full):
            self._send_bytes(404, b'web/ not found', 'text/plain; charset=utf-8')
            return
        ctype = mimetypes.guess_type(full)[0] or 'application/octet-stream'
        if ctype.startswith('text/') or ctype in ('application/javascript', 'application/json'):
            ctype += '; charset=utf-8'
        try:
            with open(full, 'rb') as handle:
                body = handle.read()
        except OSError as exc:  # noqa: BLE001
            self._send_bytes(500, str(exc).encode('utf-8'), 'text/plain; charset=utf-8')
            return
        self._send_bytes(200, body, ctype)

    def _send_file(self, row: dict) -> bool:
        path = row['path']
        try:
            size = os.path.getsize(path)
            handle = open(path, 'rb')
        except OSError as exc:  # noqa: BLE001
            self._fail(f'文件读取失败：{exc}')
            return False
        ctype = mimetypes.guess_type(path)[0] or 'application/octet-stream'
        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(size))
        self.send_header('Content-Disposition', _content_disposition(row['filename']))
        self.send_header('Cache-Control', 'private, max-age=0')
        self.end_headers()
        try:
            with handle:
                while True:
                    chunk = handle.read(128 * 1024)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
        except (BrokenPipeError, ConnectionResetError):
            return False   # 客户端中途取消下载属正常
        return True

    def log_message(self, fmt, *args):
        try:
            app = getattr(self.server, 'app', None)
            if app is not None:
                app.service.log('debug', f'{self.address_string()} {fmt % args}')
        except Exception:  # noqa: BLE001
            pass


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 128

    def handle_error(self, request, client_address):
        error = sys.exc_info()[1]
        if isinstance(error, (ConnectionResetError, ConnectionAbortedError,
                              BrokenPipeError, TimeoutError)):
            return
        super().handle_error(request, client_address)


def make_server(cfg: dict, service):
    host = cfg.get('host') or '0.0.0.0'
    port = int(cfg.get('port') or 0)
    httpd = Server((host, port), Handler)
    httpd.app = type('App', (), {'cfg': cfg, 'service': service})()
    return httpd, f'http://{host}:{httpd.server_address[1]}'
