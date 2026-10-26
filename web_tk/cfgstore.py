"""配置读写：默认配置 + config.json 持久化。

本模块提供默认配置、读写、字段校正与导入导出，供 Web 服务层（webservice.py）使用。
config.json 含 cookie / 凭证等敏感信息，已被 .gitignore 忽略，切勿提交。
"""
import json
import os
import sys

from encrypt import WEApiKeys
from finisher import FINISH_ACTION_LABELS

APP_DIR = os.path.dirname(os.path.abspath(__file__))
if getattr(sys, 'frozen', False):
    # 打包为单文件 exe 后，__file__ 指向临时解包目录，
    # 配置与下载目录应跟随 exe 所在目录，否则配置无法持久化。
    APP_DIR = os.path.dirname(os.path.abspath(sys.executable))
CONFIG_PATH = os.path.join(APP_DIR, 'config.json')

# 默认配置；凭证等敏感信息保存在同目录的 config.json 中，不写入源码
DEFAULT_CONFIG = {
    'source': 'netease',          # 当前音源：netease | qq
    'cookie': '',                 # 网易云 cookie
    'qq_credential': {},          # QQ 音乐登录凭证（Credential.model_dump）
    'credentials': {},            # 网易云 API 凭证（当前不参与任何请求，仅为留档）
    'weapi_keys': WEApiKeys().to_dict(),   # weapi 加密密钥（真正生效，可在设置页修改）
    'download_dir': os.path.join(APP_DIR, 'downloads'),
    'level': 'exhigh',
    'encode_type': 'mp3',
    'name_template': '{artist} - {name}',
    'folder_structure': 'none',   # 文件组织：none | artist | album | artist_album
    'task_folder': False,         # 每次下载任务在下载目录下单独建文件夹（与文件组织叠加）
    'save_lyric': True,
    'embed_tag': True,
    'embed_cover': True,
    'embed_lyric': True,          # 把歌词写入音频标签（除 .lrc 外）
    'cover_fallback': True,
    'skip_existing': True,
    'retry': 3,
    'workers': 3,                 # 并发下载线程数（1~8）
    'cancel_cleanup': 'ask',      # 取消下载后：ask 每次询问 | delete 总是删除 | keep 总是保留
    'finish_action': 'none',      # 下载完成后：none | message | popup | open_dir | shutdown
    'status_lyric': True,         # 播放时在底部状态栏显示歌词，随长度顶开进度条
    'status_lyric_max': 60,       # 状态栏歌词最大宽度（占窗口宽度百分比，10~60）
    'open_dir_after_download': False,   # 旧版字段：仅为兼容旧配置保留
    'notify_on_finish': True,     # 下载结束后弹出通知浮窗 + 提示音
    'use_anonimous': True,
    # ---- 服务配置（web 版本地服务的系统级参数）----
    'host': '127.0.0.1',          # 监听地址，仅本机使用
    'port': 8756,                 # 监听端口（0 表示自动挑选空闲端口）
    'log_level': 'info',          # 日志级别：debug | info | warn | error
}

# 服务配置键（设置页「服务配置」区），其余归入「用户配置」区
SERVICE_KEYS = ('host', 'port', 'log_level')
# 日志级别取值
LOG_LEVELS = ('debug', 'info', 'warn', 'error')
# 敏感字段：不通过公开接口下发、导入导出时也不剔除（导出用于整份备份）
SECRET_KEYS = ('cookie', 'qq_credential', 'credentials', 'weapi_keys')


def load_config() -> dict:
    """读取同目录 config.json，缺失的字段用默认值补齐。"""
    cfg = json.loads(json.dumps(DEFAULT_CONFIG))   # 深拷贝
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
                saved = json.load(f)
            for key, value in saved.items():
                cfg[key] = value
            # 旧配置没有 finish_action：用原「完成后打开目录」开关迁移
            if 'finish_action' not in saved and saved.get('open_dir_after_download'):
                cfg['finish_action'] = 'open_dir'
        except (OSError, ValueError):
            pass
    return normalize_config(cfg)


def save_config(cfg: dict) -> None:
    with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)


def public_config(cfg: dict) -> dict:
    """导出给前端的安全配置：剔除敏感字段，仅保留是否已配置的布尔位。

    weapi_keys 例外：它是加密密钥而非账号凭证，且设置页需要查看 / 修改，故原样下发。
    """
    public = {key: value for key, value in cfg.items() if key not in SECRET_KEYS}
    public['has_cookie'] = bool(cfg.get('cookie'))
    public['has_qq_credential'] = bool(cfg.get('qq_credential'))
    public['weapi_keys'] = WEApiKeys.from_config(cfg.get('weapi_keys')).to_dict()
    return public


def normalize_config(cfg: dict) -> dict:
    """校正类型与取值范围，避免非法数值写入后导致服务或下载异常。"""
    def to_int(key, default, low, high):
        try:
            value = int(cfg.get(key, default))
        except (TypeError, ValueError):
            value = default
        cfg[key] = max(low, min(high, value))

    to_int('port', 8756, 0, 65535)
    to_int('workers', 3, 1, 8)
    to_int('retry', 3, 0, 10)
    # 本版仅面向本机使用，监听地址固定为回环地址，不对外暴露（设置页亦不可修改）
    cfg['host'] = '127.0.0.1'
    if cfg.get('log_level') not in LOG_LEVELS:
        cfg['log_level'] = 'info'
    if cfg.get('folder_structure') not in ('none', 'artist', 'album', 'artist_album'):
        cfg['folder_structure'] = 'none'
    cfg['task_folder'] = bool(cfg.get('task_folder'))
    if cfg.get('cancel_cleanup') not in ('ask', 'delete', 'keep'):
        cfg['cancel_cleanup'] = 'ask'
    if cfg.get('finish_action') not in FINISH_ACTION_LABELS:
        cfg['finish_action'] = 'none'
    cfg['status_lyric'] = bool(cfg.get('status_lyric', True))
    try:
        max_width = int(cfg.get('status_lyric_max', 60))
    except (TypeError, ValueError):
        max_width = 60
    cfg['status_lyric_max'] = max(10, min(60, max_width))
    # 旧版「发信提醒」字段已废弃，读取时丢弃，避免旧密码残留或下发
    cfg.pop('email', None)
    cfg.pop('email_password', None)
    if cfg.get('source') not in ('netease', 'qq'):
        cfg['source'] = 'netease'
    return cfg


def export_config(cfg: dict) -> str:
    """整份导出（含 cookie / 凭证等敏感字段），供本机备份与迁移。"""
    return json.dumps(cfg, ensure_ascii=False, indent=2)


def import_config(cfg: dict, data) -> dict:
    """把导入的数据合并进当前配置：只接受已知键，其余忽略，避免写入脏数据。"""
    if isinstance(data, str):
        data = json.loads(data)
    if not isinstance(data, dict):
        raise ValueError('配置内容不是合法的 JSON 对象')
    merged = dict(cfg)
    for key, value in data.items():
        if key in DEFAULT_CONFIG:
            merged[key] = value
    return normalize_config(merged)
