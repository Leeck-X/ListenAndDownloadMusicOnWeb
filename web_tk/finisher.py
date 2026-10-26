"""下载完成后的动作：无 / 消息 / 弹窗 / 打开下载目录 / 关机。

Web 服务层（webservice.py）使用本模块：动作统一由后端执行，
默认动作保存在 config.json 的 finish_action 字段；下载时可在「下载选项」
里为本次任务临时改选，不影响全局设置。

「消息」为 Windows 通知（托盘气泡），「弹窗」为基于后台窗口的提示，
按钮为「打开目录」「好的」。界面通过 set_ui_hooks 注册两个界面回调，
未注册时对应动作直接报错，由调用方记入日志。
"""
from __future__ import annotations

import os
import subprocess
import sys

# 完成动作：值 -> 中文标签（设置页 / 下载选项下拉框）
FINISH_ACTION_LABELS = {
    'none': '无',
    'message': '消息',
    'popup': '弹窗',
    'open_dir': '打开目录',
    'shutdown': '关机',
}

SHUTDOWN_DELAY = 60          # 关机延迟（秒），留出取消时间

# 界面回调：notify(title, text, folder) / popup(title, text, folder)
_notify_hook = None
_popup_hook = None


def set_ui_hooks(notify=None, popup=None) -> None:
    """注册界面回调，由各入口在创建窗口后调用。"""
    global _notify_hook, _popup_hook
    _notify_hook = notify
    _popup_hook = popup


def open_download_dir(cfg: dict) -> str:
    """打开下载目录（Windows 专用），返回目录路径。"""
    path = cfg.get('download_dir') or ''
    if not path:
        raise ValueError('未设置下载目录')
    os.makedirs(path, exist_ok=True)
    if sys.platform != 'win32':
        raise ValueError('当前系统不支持自动打开目录')
    os.startfile(path)  # noqa: S606 - Windows 专用
    return path


def shutdown_machine(summary: str = '') -> None:
    """延迟关机（Windows 专用）；期间可用 shutdown /a 取消。"""
    if sys.platform != 'win32':
        raise ValueError('当前系统不支持自动关机')
    note = (summary or '下载任务已完成')[:120]
    subprocess.run(['shutdown', '/s', '/t', str(SHUTDOWN_DELAY), '/c', note],
                   check=True, timeout=10)


def run_finish_action(cfg: dict, summary: str, action: str = None) -> str:
    """执行「下载完成后」动作，返回给日志用的结果描述。

    action 为空时取全局设置；任务级选项优先。
    动作失败时抛 ValueError，由调用方记录日志，不影响下载结果。
    """
    action = action or cfg.get('finish_action') or 'none'
    folder = cfg.get('download_dir') or ''
    if action == 'none':
        return ''
    if action == 'open_dir':
        return f'已打开下载目录：{open_download_dir(cfg)}'
    if action == 'shutdown':
        shutdown_machine(summary)
        return f'将在 {SHUTDOWN_DELAY} 秒后关机（可运行 shutdown /a 取消）'
    if action == 'message':
        if _notify_hook is None:
            raise ValueError('当前环境不支持 Windows 消息提醒')
        _notify_hook('音乐下载器 · 下载完成', summary, folder)
        return '已发送 Windows 消息提醒'
    if action == 'popup':
        if _popup_hook is None:
            raise ValueError('当前环境不支持弹窗提醒')
        _popup_hook('下载完成', summary, folder)
        return '已弹出完成提示'
    raise ValueError(f'未知的完成动作：{action}')
