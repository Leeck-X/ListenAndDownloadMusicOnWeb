"""账号安全：密码散列、会话令牌、登录失败限流。

* 密码：PBKDF2-HMAC-SHA256（20 万轮），不解密、不可逆；
* 会话：随机令牌只发给客户端，库里只存 SHA-256 摘要；
* 限流：按「IP + 用户名」统计失败次数，超限后冷却，避免被撞库。
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import re
import secrets
import threading
import time

ITERATIONS = 200_000
USERNAME_RE = re.compile(r'^[A-Za-z0-9_.-]{3,32}$')
MIN_PASSWORD = 8
MAX_PASSWORD = 128


class AccountError(Exception):
    """可直接展示给用户的账号错误。"""


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, ITERATIONS)
    return 'pbkdf2_sha256${}${}${}'.format(
        ITERATIONS,
        base64.b64encode(salt).decode('ascii'),
        base64.b64encode(digest).decode('ascii'))


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, rounds, salt_b64, digest_b64 = (stored or '').split('$', 3)
        if algo != 'pbkdf2_sha256':
            return False
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(digest_b64)
        actual = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, int(rounds))
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(expected, actual)


def new_session_token() -> str:
    return secrets.token_urlsafe(32)


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode('utf-8')).hexdigest()


def validate_username(username: str) -> str:
    username = (username or '').strip()
    if not USERNAME_RE.match(username):
        raise AccountError('用户名需为 3~32 位字母、数字、下划线、点或短横线')
    return username


def validate_password(password: str) -> str:
    password = password or ''
    if len(password) < MIN_PASSWORD:
        raise AccountError(f'密码至少 {MIN_PASSWORD} 位')
    if len(password) > MAX_PASSWORD:
        raise AccountError('密码过长')
    return password


class LoginLimiter:
    """内存级失败限流：窗口内失败达到上限后，冷却期内直接拒绝。"""

    WINDOW = 600        # 统计窗口（秒）
    COOLDOWN = 600      # 冷却时长（秒）
    MAX_FAILS = 5       # 窗口内允许的失败次数

    def __init__(self):
        self._lock = threading.Lock()
        self._fails = {}       # key -> [失败时间戳]
        self._blocked = {}     # key -> 解除时间戳

    def _key(self, ip: str, username: str) -> str:
        return f'{(ip or "-").lower()}|{(username or "").lower()}'

    def check(self, ip: str, username: str) -> None:
        key = self._key(ip, username)
        now = time.time()
        with self._lock:
            until = self._blocked.get(key, 0)
            if until > now:
                raise AccountError(f'尝试次数过多，请 {int(until - now) + 1} 秒后再试')

    def fail(self, ip: str, username: str) -> None:
        key = self._key(ip, username)
        now = time.time()
        with self._lock:
            stamps = [t for t in self._fails.get(key, []) if now - t < self.WINDOW]
            stamps.append(now)
            self._fails[key] = stamps
            if len(stamps) >= self.MAX_FAILS:
                self._blocked[key] = now + self.COOLDOWN
                self._fails[key] = []

    def clear(self, ip: str, username: str) -> None:
        key = self._key(ip, username)
        with self._lock:
            self._fails.pop(key, None)
            self._blocked.pop(key, None)

    def purge(self) -> None:
        """清理过期记录，避免长期运行时字典无限增长。"""
        now = time.time()
        with self._lock:
            for key, until in list(self._blocked.items()):
                if until <= now:
                    self._blocked.pop(key, None)
            for key, stamps in list(self._fails.items()):
                kept = [t for t in stamps if now - t < self.WINDOW]
                if kept:
                    self._fails[key] = kept
                else:
                    self._fails.pop(key, None)
