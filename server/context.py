"""每用户独立的音源上下文。

本地版是「一个进程一个用户」，Provider 用模块级缓存即可；Server 版必须按用户隔离
登录态，因此每个用户各自持有 NetEaseAPI / QQMusicAPI 实例。实例按需创建、
改动 cookie 时就地刷新（不重建，避免丢匿名 token），长时间不用的上下文会被淘汰。
"""
from __future__ import annotations

import threading
import time
from collections import OrderedDict

from api import NetEaseAPI
from qq_api import QQMusicAPI

MAX_CONTEXTS = 128          # 最多缓存的用户上下文数量
IDLE_EVICT_SECONDS = 3600   # 空闲超过该时长可被优先淘汰


class UserContext:
    def __init__(self, user_id: int, prefs: dict, server_cfg: dict):
        self.user_id = user_id
        self._server_cfg = server_cfg
        self._lock = threading.Lock()
        self._providers = {}
        self.cookie = prefs.get('cookie') or ''
        self.qq_credential = prefs.get('qq_credential') or {}
        self.prefs = prefs.get('prefs') or {}
        self.last_used = time.time()

    # ---------------- 音源实例 ----------------
    def provider(self, source: str):
        source = 'qq' if source == 'qq' else 'netease'
        with self._lock:
            self.last_used = time.time()
            api = self._providers.get(source)
            if api is None:
                if source == 'qq':
                    api = QQMusicAPI(self.qq_credential)
                else:
                    api = NetEaseAPI(self.cookie, self._server_cfg.get('weapi_keys'))
                self._providers[source] = api
            return api

    def update(self, cookie: str = None, qq_credential: dict = None, prefs: dict = None):
        """同步最新的用户配置到已缓存实例（登录 / 退出 / 改偏好后调用）。"""
        with self._lock:
            if cookie is not None:
                self.cookie = cookie
                api = self._providers.get('netease')
                if api is not None:
                    api.set_cookie(cookie)
                else:
                    self._providers['netease'] = NetEaseAPI(
                        cookie, self._server_cfg.get('weapi_keys'))
            if qq_credential is not None:
                self.qq_credential = qq_credential
                api = self._providers.get('qq')
                if api is not None:
                    api.set_credential(qq_credential)
                else:
                    self._providers['qq'] = QQMusicAPI(qq_credential)
            if prefs is not None:
                self.prefs = prefs

    def account_state(self, source: str) -> dict:
        """返回音源登录态，供「设置」页展示；失败不影响主流程。"""
        api = self.provider(source)
        try:
            info = api.account()
        except Exception as exc:  # noqa: BLE001 - 网络异常按未登录处理
            return {'logged_in': False, 'nickname': '', 'error': str(exc)}
        if not info:
            return {'logged_in': False, 'nickname': ''}
        return {'logged_in': True, 'nickname': info.get('nickname') or '',
                'userId': info.get('userId') or ''}

    def close(self) -> None:
        with self._lock:
            for api in self._providers.values():
                session = getattr(api, 'session', None)
                if session is not None:
                    try:
                        session.close()
                    except Exception:  # noqa: BLE001 - 关闭失败可忽略
                        pass
            self._providers.clear()


class ContextPool:
    """按用户缓存 UserContext，超出上限时淘汰最久未使用的实例。"""

    def __init__(self, store, server_cfg: dict):
        self._store = store
        self._cfg = server_cfg
        self._lock = threading.Lock()
        self._contexts = OrderedDict()      # user_id -> UserContext

    def get(self, user_id: int) -> UserContext:
        with self._lock:
            ctx = self._contexts.get(user_id)
            if ctx is not None:
                self._contexts.move_to_end(user_id)
                ctx.last_used = time.time()
                return ctx
        prefs = self._store.get_prefs(user_id)
        ctx = UserContext(user_id, prefs, self._cfg)
        with self._lock:
            self._contexts[user_id] = ctx
            self._contexts.move_to_end(user_id)
            while len(self._contexts) > MAX_CONTEXTS:
                _, old = self._contexts.popitem(last=False)
                if time.time() - old.last_used > IDLE_EVICT_SECONDS:
                    old.close()
        return ctx

    def reload(self, user_id: int, cookie: str = None, qq_credential: dict = None,
               prefs: dict = None) -> UserContext:
        """配置变更后刷新上下文（该用户不在缓存中时直接创建）。"""
        ctx = self.get(user_id)
        ctx.update(cookie=cookie, qq_credential=qq_credential, prefs=prefs)
        return ctx
