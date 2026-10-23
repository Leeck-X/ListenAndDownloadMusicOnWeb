"""本地 HTTP 服务器：JSON API + 静态前端托管。

只为「本机使用」设计：默认只监听 127.0.0.1，不做鉴权；请求由线程池并发处理
（前端轮询任务 / 日志时不会被长耗时搜索阻塞）。
"""
from __future__ import annotations

import json
import mimetypes
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

from webservice import ServiceError, WebService

WEB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'web')


# ---------------- 路由处理（返回可直接序列化的数据） ----------------
def _task_id(payload: dict) -> int:
    try:
        return int(payload.get('id'))
    except (TypeError, ValueError):
        raise ServiceError('缺少任务 ID')


def _h_meta(service, _payload):
    return service.meta()


def _h_config_get(service, _payload):
    return service.config()


def _h_config_update(service, payload):
    return service.update_config(payload)


def _h_config_export(service, _payload):
    return service.export_config()


def _h_config_import(service, payload):
    return service.import_config(payload)


def _h_account(service, payload):
    return service.account(payload.get('source'))


def _h_logout(service, payload):
    return service.logout(payload.get('source'))


def _h_login_cookie(service, payload):
    return service.login_cookie(payload.get('source') or service.cfg.get('source'),
                               payload.get('cookie') or '')


def _h_qr_start(service, payload):
    return service.qr_start(payload.get('source'), payload.get('type') or 'qq')


def _h_qr_poll(service, payload):
    return service.qr_poll(payload.get('source'), payload.get('identifier') or '')


def _h_search(service, payload):
    return service.search(payload.get('keyword'), payload.get('limit') or 50,
                          payload.get('offset') or 0)


def _h_playlist(service, payload):
    return service.playlist(payload.get('text') or payload.get('id') or '')


def _h_song(service, payload):
    return service.song_detail(payload.get('value') or payload.get('id') or '')


def _h_probe(service, payload):
    return service.probe(payload)


def _h_lyric(service, payload):
    return service.lyric(payload)


def _h_play(service, payload):
    return service.play(payload)


def _h_my_playlists(service, payload):
    return service.my_playlists(payload.get('source'))


def _h_liked(service, payload):
    return service.liked(payload.get('source'))


def _h_liked_keys(service, payload):
    return service.liked_keys(payload.get('source'))


def _h_download(service, payload):
    return service.download(payload)


def _h_tasks(service, _payload):
    return service.tasks()


def _h_task_action(service, payload):
    return service.task_action(_task_id(payload), payload.get('action'),
                               payload.get('cleanup'))


def _h_logs(service, payload):
    try:
        seq = int(payload.get('seq') or 0)
    except (TypeError, ValueError):
        seq = 0
    return {'items': service.logs_since(seq, payload.get('level'))}


def _h_logs_clear(service, _payload):
    service.clear_logs()
    return {'cleared': True}


def _h_open_dir(service, _payload):
    return {'path': service.open_dir()}


def _h_export(service, payload):
    return service.export_songs(payload.get('format'), payload.get('songs'))


# (方法, 路径) -> 处理函数
ROUTES = {
    ('GET', '/api/meta'): _h_meta,
    ('GET', '/api/config'): _h_config_get,
    ('GET', '/api/config/export'): _h_config_export,
    ('GET', '/api/account'): _h_account,
    ('GET', '/api/my_playlists'): _h_my_playlists,
    ('GET', '/api/liked'): _h_liked,
    ('GET', '/api/liked_keys'): _h_liked_keys,
    ('GET', '/api/tasks'): _h_tasks,
    ('GET', '/api/logs'): _h_logs,
    ('POST', '/api/config'): _h_config_update,
    ('POST', '/api/config/import'): _h_config_import,
    ('POST', '/api/search'): _h_search,
    ('POST', '/api/playlist'): _h_playlist,
    ('POST', '/api/song'): _h_song,
    ('POST', '/api/probe'): _h_probe,
    ('POST', '/api/lyric'): _h_lyric,
    ('POST', '/api/play'): _h_play,
    ('POST', '/api/download'): _h_download,
    ('POST', '/api/task/action'): _h_task_action,
    ('POST', '/api/login/cookie'): _h_login_cookie,
    ('POST', '/api/login/qr/start'): _h_qr_start,
    ('POST', '/api/login/qr/poll'): _h_qr_poll,
    ('POST', '/api/logout'): _h_logout,
    ('POST', '/api/logs/clear'): _h_logs_clear,
    ('POST', '/api/open_dir'): _h_open_dir,
    ('POST', '/api/export'): _h_export,
}


class ApiHandler(BaseHTTPRequestHandler):
    server_version = 'MusicDownloaderWeb/1.0.3'
    protocol_version = 'HTTP/1.1'

    # ---- 响应工具 ----
    def _send_bytes(self, status: int, body: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    def _send_json(self, status: int, data: dict) -> None:
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self._send_bytes(status, body, 'application/json; charset=utf-8')

    # ---- 请求入口 ----
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith('/api/'):
            payload = {key: values[0] for key, values in parse_qs(parsed.query).items()}
            self._dispatch('GET', parsed.path, payload)
        else:
            self._serve_static(parsed.path)

    def do_POST(self):
        parsed = urlparse(self.path)
        length = int(self.headers.get('Content-Length') or 0)
        raw = self.rfile.read(length) if length else b''
        try:
            payload = json.loads(raw.decode('utf-8')) if raw else {}
        except (ValueError, UnicodeDecodeError):
            self._send_json(400, {'ok': False, 'error': '请求体不是合法 JSON'})
            return
        if not parsed.path.startswith('/api/'):
            self._send_json(404, {'ok': False, 'error': 'Not Found'})
            return
        self._dispatch('POST', parsed.path, payload if isinstance(payload, dict) else {})

    def do_HEAD(self):
        self.do_GET()

    def _dispatch(self, method: str, path: str, payload: dict) -> None:
        handler = ROUTES.get((method, path))
        if handler is None:
            self._send_json(404, {'ok': False, 'error': f'未知接口：{path}'})
            return
        try:
            data = handler(self.server.service, payload)
        except ServiceError as exc:
            self._send_json(200, {'ok': False, 'error': str(exc)})
        except Exception as exc:  # noqa: BLE001 - 兜底，避免把堆栈抛给前端
            self.server.service.log('error', f'{path} 处理失败：{exc}')
            self._send_json(200, {'ok': False, 'error': f'服务异常：{exc}'})
        else:
            self._send_json(200, {'ok': True, 'data': data})

    # ---- 静态文件 ----
    def _serve_static(self, path: str) -> None:
        rel = unquote(path).lstrip('/').split('?')[0] or 'index.html'
        full = os.path.normpath(os.path.join(WEB_DIR, rel))
        if not full.startswith(WEB_DIR) or not os.path.isfile(full):
            full = os.path.join(WEB_DIR, 'index.html')   # 前端为单页，未知路径回落首页
        if not os.path.isfile(full):
            self._send_bytes(404, b'web/ not found', 'text/plain; charset=utf-8')
            return
        ctype = mimetypes.guess_type(full)[0] or 'application/octet-stream'
        if ctype.startswith('text/') or ctype in ('application/javascript',
                                                  'application/json'):
            ctype += '; charset=utf-8'
        try:
            with open(full, 'rb') as handle:
                body = handle.read()
        except OSError as exc:  # noqa: BLE001
            self._send_bytes(500, str(exc).encode('utf-8'), 'text/plain; charset=utf-8')
            return
        self._send_bytes(200, body, ctype)

    def log_message(self, fmt, *args):
        """把访问日志降级进服务日志（debug），避免刷屏控制台。"""
        try:
            self.server.service.log('debug', f'{self.address_string()} {fmt % args}')
        except Exception:  # noqa: BLE001
            pass


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def handle_error(self, request, client_address):
        """客户端中途断开（刷新页面 / 探测连接）属正常现象，不打印堆栈以免刷屏。"""
        error = sys.exc_info()[1]
        if isinstance(error, (ConnectionResetError, ConnectionAbortedError,
                              BrokenPipeError, TimeoutError)):
            return
        super().handle_error(request, client_address)


def serve(service: WebService, cfg: dict) -> tuple:
    """按配置启动服务器，返回 (server, 访问地址)。端口为 0 时自动挑选空闲端口。"""
    host = cfg.get('host') or '127.0.0.1'
    port = int(cfg.get('port') or 0)
    httpd = Server((host, port), ApiHandler)
    httpd.service = service
    return httpd, f'http://{host}:{httpd.server_address[1]}'
