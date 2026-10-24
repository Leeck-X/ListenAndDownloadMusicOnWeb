"""SQLite 存储：账号、会话、用户偏好、可下载文件。

单连接 + 互斥锁（请求量不大，避免多连接竞争与 busy 重试）；
开启 WAL 让读写并发更平滑。
"""
from __future__ import annotations

import os
import sqlite3
import threading
import time

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at    INTEGER NOT NULL,
    disabled      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    ip         TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS prefs (
    user_id       INTEGER PRIMARY KEY,
    cookie        TEXT NOT NULL DEFAULT '',
    qq_credential TEXT NOT NULL DEFAULT '{}',
    prefs         TEXT NOT NULL DEFAULT '{}',
    updated_at    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS files (
    id         TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    task_id    TEXT NOT NULL,
    song_name  TEXT NOT NULL DEFAULT '',
    artists    TEXT NOT NULL DEFAULT '',
    path       TEXT NOT NULL,
    filename   TEXT NOT NULL,
    size       INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_files_user ON files(user_id);
CREATE INDEX IF NOT EXISTS idx_files_task ON files(task_id);
CREATE INDEX IF NOT EXISTS idx_files_expire ON files(expires_at);
"""


class Store:
    def __init__(self, data_dir: str):
        self.path = os.path.join(data_dir, 'app.db')
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(self.path, check_same_thread=False, timeout=30)
        self._conn.row_factory = sqlite3.Row
        with self._lock:
            self._conn.execute('PRAGMA journal_mode=WAL')
            self._conn.execute('PRAGMA synchronous=NORMAL')
            self._conn.executescript(SCHEMA)
            self._conn.commit()

    # ---------------- 通用 ----------------
    def _one(self, sql: str, args=()):
        with self._lock:
            return self._conn.execute(sql, args).fetchone()

    def _all(self, sql: str, args=()):
        with self._lock:
            return self._conn.execute(sql, args).fetchall()

    def _write(self, sql: str, args=()):
        with self._lock:
            cur = self._conn.execute(sql, args)
            self._conn.commit()
            return cur

    # ---------------- 用户与会话 ----------------
    def create_user(self, username: str, password_hash: str) -> int:
        cur = self._write(
            'INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)',
            (username, password_hash, int(time.time())))
        return int(cur.lastrowid)

    def find_user(self, username: str):
        row = self._one('SELECT * FROM users WHERE username = ?', (username,))
        return dict(row) if row else None

    def get_user(self, user_id: int):
        row = self._one('SELECT * FROM users WHERE id = ?', (user_id,))
        return dict(row) if row else None

    def create_session(self, token_hash: str, user_id: int, expires_at: int, ip: str) -> None:
        self._write(
            'INSERT INTO sessions (token_hash, user_id, created_at, expires_at, ip) '
            'VALUES (?, ?, ?, ?, ?)',
            (token_hash, user_id, int(time.time()), expires_at, ip))

    def find_session(self, token_hash: str):
        row = self._one('SELECT * FROM sessions WHERE token_hash = ?', (token_hash,))
        return dict(row) if row else None

    def delete_session(self, token_hash: str) -> None:
        self._write('DELETE FROM sessions WHERE token_hash = ?', (token_hash,))

    def purge_sessions(self, now: int = None) -> int:
        now = now or int(time.time())
        cur = self._write('DELETE FROM sessions WHERE expires_at < ?', (now,))
        return cur.rowcount or 0

    # ---------------- 用户偏好 ----------------
    def get_prefs(self, user_id: int) -> dict:
        row = self._one('SELECT * FROM prefs WHERE user_id = ?', (user_id,))
        if not row:
            return {'cookie': '', 'qq_credential': {}, 'prefs': {}}
        import json
        try:
            qq = json.loads(row['qq_credential'] or '{}')
        except ValueError:
            qq = {}
        try:
            prefs = json.loads(row['prefs'] or '{}')
        except ValueError:
            prefs = {}
        return {'cookie': row['cookie'] or '', 'qq_credential': qq,
                'prefs': prefs if isinstance(prefs, dict) else {}}

    def save_prefs(self, user_id: int, cookie: str = None, qq_credential: dict = None,
                   prefs: dict = None) -> None:
        import json
        current = self.get_prefs(user_id)
        cookie = current['cookie'] if cookie is None else cookie
        qq = current['qq_credential'] if qq_credential is None else qq_credential
        data = current['prefs'] if prefs is None else prefs
        self._write(
            'INSERT INTO prefs (user_id, cookie, qq_credential, prefs, updated_at) '
            'VALUES (?, ?, ?, ?, ?) '
            'ON CONFLICT(user_id) DO UPDATE SET cookie=excluded.cookie, '
            'qq_credential=excluded.qq_credential, prefs=excluded.prefs, '
            'updated_at=excluded.updated_at',
            (user_id, cookie, json.dumps(qq, ensure_ascii=False),
             json.dumps(data, ensure_ascii=False), int(time.time())))

    # ---------------- 文件 ----------------
    def add_file(self, file_id: str, user_id: int, task_id: str, song_name: str,
                 artists: str, path: str, filename: str, size: int,
                 expires_at: int) -> None:
        self._write(
            'INSERT OR REPLACE INTO files (id, user_id, task_id, song_name, artists, path, '
            'filename, size, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            (file_id, user_id, task_id, song_name, artists, path, filename, size,
             int(time.time()), expires_at))

    def list_files(self, user_id: int) -> list:
        rows = self._all(
            'SELECT * FROM files WHERE user_id = ? ORDER BY created_at DESC', (user_id,))
        return [dict(row) for row in rows]

    def get_file(self, file_id: str):
        row = self._one('SELECT * FROM files WHERE id = ?', (file_id,))
        return dict(row) if row else None

    def delete_file_row(self, file_id: str) -> None:
        self._write('DELETE FROM files WHERE id = ?', (file_id,))

    def update_file_expiry(self, user_id: int, seconds: int) -> None:
        """按新的保留时长重算该用户全部文件（以创建时间为基准）。"""
        self._write('UPDATE files SET expires_at = created_at + ? WHERE user_id = ?',
                    (int(seconds), user_id))

    def task_files(self, task_id: str) -> list:
        rows = self._all('SELECT * FROM files WHERE task_id = ?', (task_id,))
        return [dict(row) for row in rows]

    def user_usage(self, user_id: int) -> int:
        row = self._one('SELECT COALESCE(SUM(size), 0) AS total FROM files WHERE user_id = ?',
                        (user_id,))
        return int(row['total'] or 0) if row else 0

    def expired_files(self, now: int = None) -> list:
        now = now or int(time.time())
        rows = self._all('SELECT * FROM files WHERE expires_at < ?', (now,))
        return [dict(row) for row in rows]
