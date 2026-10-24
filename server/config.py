"""Server 版配置：server_config.json + 环境变量。

与本地版的 config.json 完全分离：本地版是单用户、含个人偏好的配置；
这里只保留「服务器级」参数（监听地址、存储配额、保留时长、公共密钥等）。
用户级信息（cookie、音质偏好）保存在数据库里。
"""
from __future__ import annotations

import json
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE_DIR, 'server_config.json')

DEFAULT_CONFIG = {
    # 监听地址：公网部署用 0.0.0.0，反代后置时可改回 127.0.0.1
    'host': '0.0.0.0',
    'port': 3434,
    # 数据目录：数据库 + 各用户的下载文件
    'data_dir': os.path.join(BASE_DIR, 'server_data'),
    # 会话有效期（小时）
    'session_hours': 168,
    # 是否启用账号系统：关闭后无需登录，所有人共用访客空间
    'enable_users': True,
    # 每用户存储配额（MB）与文件保留时长（小时）
    'quota_mb': 2048,
    'retention_hours': 72,
    # 每用户同时运行的任务数、单任务并发下载数
    'max_tasks_per_user': 2,
    'download_workers': 3,
    # 请求体上限（MB），cookie / 凭证导入够用即可
    'max_body_mb': 1,
    # 部署在 HTTPS 反向代理之后时置 true，会话 Cookie 加 Secure
    'secure_cookie': False,
    # 管理员统一配置的公共密钥（前端不可见、不提供修改接口）
    'weapi_keys': {},
    'qq_credential': {},
}

_ENV_MAP = {
    'MD_SERVER_HOST': ('host', str),
    'MD_SERVER_PORT': ('port', int),
    'MD_SERVER_DATA_DIR': ('data_dir', str),
    'MD_SERVER_ENABLE_USERS': ('enable_users', 'bool'),
    'MD_SERVER_QUOTA_MB': ('quota_mb', int),
    'MD_SERVER_RETENTION_HOURS': ('retention_hours', int),
}


def _as_bool(value, default: bool = True) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        text = value.strip().lower()
        if text in ('1', 'true', 'yes', 'on', '启用'):
            return True
        if text in ('0', 'false', 'no', 'off', '关闭', '禁用'):
            return False
    return default


def _apply_env(cfg: dict) -> None:
    for env_key, (key, cast) in _ENV_MAP.items():
        raw = os.environ.get(env_key)
        if raw is None or raw == '':
            continue
        try:
            cfg[key] = _as_bool(raw) if cast == 'bool' else cast(raw)
        except (TypeError, ValueError):
            pass


def _sanitize(cfg: dict) -> dict:
    try:
        cfg['port'] = int(cfg.get('port') or DEFAULT_CONFIG['port'])
    except (TypeError, ValueError):
        cfg['port'] = DEFAULT_CONFIG['port']
    cfg['port'] = max(0, min(65535, cfg['port']))
    cfg['enable_users'] = _as_bool(cfg.get('enable_users'), True)
    cfg['quota_mb'] = max(0, int(cfg.get('quota_mb') or 0))
    cfg['retention_hours'] = max(1, int(cfg.get('retention_hours') or 72))
    cfg['session_hours'] = max(1, int(cfg.get('session_hours') or 168))
    cfg['max_tasks_per_user'] = max(1, int(cfg.get('max_tasks_per_user') or 2))
    cfg['download_workers'] = max(1, min(8, int(cfg.get('download_workers') or 3)))
    cfg['max_body_mb'] = max(1, min(64, int(cfg.get('max_body_mb') or 1)))
    cfg['data_dir'] = os.path.abspath(cfg.get('data_dir') or DEFAULT_CONFIG['data_dir'])
    if not isinstance(cfg.get('weapi_keys'), dict):
        cfg['weapi_keys'] = {}
    if not isinstance(cfg.get('qq_credential'), dict):
        cfg['qq_credential'] = {}
    return cfg


def load_config() -> dict:
    """读取配置；文件缺失时写出一份默认配置，便于管理员按需修改。"""
    cfg = dict(DEFAULT_CONFIG)
    exists = os.path.isfile(CONFIG_PATH)
    if exists:
        try:
            with open(CONFIG_PATH, 'r', encoding='utf-8') as handle:
                data = json.load(handle)
            if isinstance(data, dict):
                cfg.update(data)
        except (OSError, ValueError) as exc:
            print(f'[配置] 读取 {CONFIG_PATH} 失败，使用默认配置：{exc}')
    _apply_env(cfg)
    cfg = _sanitize(cfg)

    if not exists:
        _save(cfg)
    os.makedirs(os.path.join(cfg['data_dir'], 'files'), exist_ok=True)
    return cfg


def _save(cfg: dict) -> None:
    payload = {key: cfg.get(key) for key in DEFAULT_CONFIG}
    try:
        with open(CONFIG_PATH, 'w', encoding='utf-8') as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
        print(f'[配置] 已写入 {CONFIG_PATH}')
    except OSError as exc:
        print(f'[配置] 写入 {CONFIG_PATH} 失败：{exc}')
