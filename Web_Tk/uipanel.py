"""桌面 UI：服务器状态窗口（可最小化到系统托盘）+ 每个下载任务的进度窗口。

设计约束与要点：
- Tk 只能在主线程创建并驱动 mainloop，因此本地 HTTP 服务跑在后台线程；
- 日志直接读 WebService 的环形缓冲（logs_since），不额外挂 sink；
- 任务进度轮询 WebService.tasks()：新任务自动开窗，任务结束自动关窗；
- 任务窗口拦截关闭按钮（WM_DELETE_WINDOW → 最小化），下载中无法关闭；
- 托盘菜单回调在 pystray 线程执行，统一投递到线程安全队列，由 Tk 轮询消费；
- tkinter / 托盘不可用时 available=False，入口退化为纯控制台模式。
"""
from __future__ import annotations

import os
import queue
import threading
import time

from models import ENCODE_TYPES, LEVELS_BY_SOURCE
from providers import SOURCE_LABELS
from webservice import LOG_LEVEL_ORDER

# 任务状态中文名
STATUS_CN = {
    'pending': '等待中', 'running': '下载中', 'paused': '已暂停',
    'cancelling': '取消中', 'cancelled': '已取消', 'done': '已完成', 'failed': '有失败',
}
# 视为「进行中」的状态（决定关掉的任务窗口是否该重开）
ACTIVE_STATUS = ('pending', 'running', 'paused', 'cancelling')
# 任务结束后延迟自动关闭（秒），留出查看结果的时间
TASK_CLOSE_DELAY = 3.0
# 日志级别配色（深色背景）
LEVEL_COLORS = {'debug': '#8a8a9a', 'info': '#9fd6a8', 'warn': '#e0b96a', 'error': '#ff8b84'}

FONT_UI = 'Microsoft YaHei UI'
FONT_MONO = 'Consolas'


def _load_tk():
    try:
        import tkinter as tk
        from tkinter import ttk
    except Exception:  # noqa: BLE001 - 无 GUI 环境
        return None, None
    return tk, ttk


def _tray_image():
    """托盘图标：纯代码绘制（紫底 + 白色音符），避免额外资源文件。"""
    try:
        from PIL import Image, ImageDraw
    except Exception:  # noqa: BLE001 - 无 PIL 则不做托盘
        return None
    size = 64
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.ellipse((1, 1, size - 1, size - 1), fill=(124, 92, 255, 255))
    white = (255, 255, 255, 255)
    draw.ellipse((16, 34, 38, 54), fill=white)      # 符头
    draw.rectangle((33, 16, 37, 46), fill=white)     # 符杆
    draw.rectangle((33, 15, 50, 21), fill=white)     # 符尾
    return img


class DesktopUi:
    """服务器状态窗口 + 托盘 + 任务窗口；run() 在主线程驱动 mainloop。"""

    TICK_MS = 400

    def __init__(self, service, cfg: dict, url: str):
        self.service = service
        self.cfg = cfg
        self.url = url
        self.tk, self.ttk = _load_tk()
        self.available = self.tk is not None

        self.root = None
        self.status_label = None
        self.log_text = None
        self._status_text = ''          # 避免重复 config 造成的无谓重绘
        self.tasks_win = {}             # task_id -> 窗口控件字典
        self.closed_tasks = set()       # 已自动关窗的任务（避免反复重开）
        self.log_seq = 0
        self.tray = None
        self._commands = queue.Queue()
        self._closing = False

    # ---------------- 线程 -> Tk 投递 ----------------
    def post(self, fn) -> None:
        """供其他线程（托盘回调）调用，把动作排入 Tk 主线程执行。"""
        self._commands.put(fn)

    # ---------------- 下载完成提醒（供 finisher 注册） ----------------
    def notify_message(self, title: str, text: str, folder: str = '') -> None:
        """Windows 消息提醒：托盘气泡；无托盘时退化为弹窗。"""
        self.post(lambda: self._notify_message_ui(title, text, folder))

    def show_finish_popup(self, title: str, text: str, folder: str = '') -> None:
        """下载完成弹窗：按钮为「打开目录」「好的」。"""
        self.post(lambda: self._finish_popup_ui(title, text, folder))

    def _notify_message_ui(self, title: str, text: str, folder: str) -> None:
        if self.root is None:
            return
        if self.tray is not None:
            try:
                self.tray.notify(text, title)
                return
            except Exception:  # noqa: BLE001 - 托盘通知失败则退回弹窗
                pass
        self._finish_popup_ui(title, text, folder)

    def _finish_popup_ui(self, title: str, text: str, folder: str) -> None:
        if self.root is None:
            return
        tk = self.tk
        win = tk.Toplevel(self.root)
        win.title(title)
        win.resizable(False, False)
        win.attributes('-topmost', True)
        body = tk.Frame(win, padx=18, pady=14)
        body.pack(fill='both', expand=True)
        tk.Label(body, text=title, anchor='w',
                 font=(FONT_UI, 11, 'bold')).pack(fill='x')
        tk.Label(body, text=text, justify='left', anchor='w', wraplength=360).pack(
            fill='x', pady=(6, 12))
        row = tk.Frame(body)
        row.pack(fill='x')

        def open_folder():
            win.destroy()
            if folder:
                try:
                    os.startfile(folder)  # noqa: S606 - Windows 专用
                except Exception:  # noqa: BLE001 - 打不开目录不影响提醒
                    pass

        tk.Button(row, text='打开目录', width=10, command=open_folder).pack(
            side='right', padx=(6, 0))
        tk.Button(row, text='好的', width=10, command=win.destroy).pack(side='right')
        win.update_idletasks()
        width, height = win.winfo_reqwidth(), win.winfo_reqheight()
        screen_w, screen_h = win.winfo_screenwidth(), win.winfo_screenheight()
        win.geometry(f'+{screen_w - width - 40}+{screen_h - height - 80}')
        win.deiconify()
        win.lift()

    # ---------------- 构建界面 ----------------
    def _build_server_window(self) -> None:
        tk, ttk = self.tk, self.ttk
        root = tk.Tk()
        root.title('音乐下载器 · Web 服务')
        root.geometry('860x520+80+80')
        root.minsize(620, 360)
        root.protocol('WM_DELETE_WINDOW', self._on_server_close)
        self.root = root

        head = tk.Frame(root, padx=12, pady=10)
        head.pack(fill='x')
        self.status_label = tk.Label(head, text='启动中…', anchor='w',
                                     font=(FONT_UI, 10, 'bold'))
        self.status_label.pack(side='left')
        buttons = tk.Frame(head)
        buttons.pack(side='right')
        for text, command in (('打开网页', self.open_web),
                              ('清空日志', self.clear_logs),
                              ('最小化到托盘', self.hide_to_tray)):
            tk.Button(buttons, text=text, command=command, width=11).pack(side='left', padx=3)

        address = tk.Frame(root, padx=12)
        address.pack(fill='x', pady=(0, 2))
        tk.Label(address, text='访问地址', fg='#666666').pack(side='left')
        entry = tk.Entry(address, readonlybackground='#f4f4f6', borderwidth=0)
        entry.insert(0, self.url)
        entry.config(state='readonly')
        entry.pack(side='left', fill='x', expand=True, padx=(8, 0), ipady=3)

        summary = self._summary_text()
        tk.Label(root, text=summary, anchor='w', fg='#666666').pack(fill='x', padx=12, pady=(6, 0))

        body = tk.Frame(root, padx=12, pady=10)
        body.pack(fill='both', expand=True)
        scroll = tk.Scrollbar(body)
        scroll.pack(side='right', fill='y')
        self.log_text = tk.Text(body, wrap='none', state='disabled', borderwidth=0,
                                background='#1b1b22', foreground='#e6e6ee',
                                insertbackground='#e6e6ee', font=(FONT_MONO, 9),
                                yscrollcommand=scroll.set)
        self.log_text.pack(side='left', fill='both', expand=True)
        scroll.config(command=self.log_text.yview)
        for level, color in LEVEL_COLORS.items():
            self.log_text.tag_config(level, foreground=color)

        ttk.Style().configure('Task.Horizontal.TProgressbar', thickness=10)

    def _summary_text(self) -> str:
        cfg = self.cfg
        source = cfg.get('source', 'netease')
        level = dict(LEVELS_BY_SOURCE.get(source, [])).get(cfg.get('level'), cfg.get('level'))
        encode = dict(ENCODE_TYPES).get(cfg.get('encode_type'), cfg.get('encode_type'))
        return (f'下载目录 {cfg.get("download_dir")}    ·    '
                f'音源 {SOURCE_LABELS.get(source, source)} / {level} / {encode}    ·    '
                f'并发 {cfg.get("workers")} 线程    ·    重试 {cfg.get("retry")} 次')

    def _open_task_window(self, task: dict):
        tk, ttk = self.tk, self.ttk
        tid = task['id']
        win = tk.Toplevel(self.root)
        win.title(f'下载任务 #{tid}')
        win.geometry('600x400')
        win.minsize(460, 280)
        win.protocol('WM_DELETE_WINDOW', lambda: self._minimize_task(tid))

        head = tk.Frame(win, padx=12, pady=8)
        head.pack(fill='x')
        title = tk.Label(head, text=f'任务 #{tid}', anchor='w', font=(FONT_UI, 11, 'bold'))
        title.pack(side='left')
        meta = tk.Label(head, text='', anchor='e', fg='#666666')
        meta.pack(side='right')

        bar = ttk.Progressbar(win, style='Task.Horizontal.TProgressbar',
                              maximum=100, value=0)
        bar.pack(fill='x', padx=12)

        hint = tk.Label(win, text='下载中窗口不可关闭，只能最小化；任务结束后自动关闭',
                        anchor='w', fg='#666666', font=(FONT_UI, 9))
        hint.pack(fill='x', padx=12, pady=(6, 0))

        body = tk.Frame(win, padx=12, pady=8)
        body.pack(fill='both', expand=True)
        scroll = tk.Scrollbar(body)
        scroll.pack(side='right', fill='y')
        text = tk.Text(body, wrap='word', state='disabled', borderwidth=0,
                       background='#1b1b22', foreground='#e6e6ee',
                       font=(FONT_MONO, 9), yscrollcommand=scroll.set)
        text.pack(side='left', fill='both', expand=True)
        scroll.config(command=text.yview)

        info = {'win': win, 'title': title, 'meta': meta, 'bar': bar, 'hint': hint,
                'text': text, 'ending': None}
        self.tasks_win[tid] = info
        self._append_task_log(info, {'time': time.time(), 'level': 'info',
                                     'message': f'任务 #{tid} 已加入队列，共 {task["total"]} 首'})
        win.deiconify()
        return info

    # ---------------- 窗口操作 ----------------
    def show_server(self) -> None:
        if self.root is None:
            return
        self.root.deiconify()
        self.root.lift()
        self.root.focus_force()

    def hide_to_tray(self) -> None:
        if self.root is None:
            return
        self.root.withdraw()
        if self.tray is not None:
            try:
                self.tray.notify('服务仍在后台运行，双击托盘图标可重新打开窗口', '音乐下载器')
            except Exception:  # noqa: BLE001 - 部分平台不支持通知
                pass

    def _on_server_close(self) -> None:
        """关闭服务器窗口：有托盘则隐藏到托盘，无托盘则直接退出。"""
        if self.tray is not None:
            self.hide_to_tray()
        else:
            self.shutdown()

    def _minimize_task(self, tid: int) -> None:
        info = self.tasks_win.get(tid)
        if info is None:
            return
        info['win'].iconify()

    def _close_task_window(self, tid: int) -> None:
        info = self.tasks_win.pop(tid, None)
        if info is not None:
            try:
                info['win'].destroy()
            except Exception:  # noqa: BLE001 - 窗口可能已被销毁
                pass
        self.closed_tasks.add(tid)

    def _append_log(self, item: dict) -> None:
        widget = self.log_text
        if widget is None:
            return
        level = item['level']
        stamp = time.strftime('%H:%M:%S', time.localtime(item['time']))
        widget.config(state='normal')
        widget.insert('end', f'[{stamp}] {level.upper():<5} {item["message"]}\n', level)
        self._trim(widget)
        widget.see('end')
        widget.config(state='disabled')

    def _append_task_log(self, info: dict, item: dict) -> None:
        widget = info['text']
        stamp = time.strftime('%H:%M:%S', time.localtime(item['time']))
        widget.config(state='normal')
        widget.insert('end', f'[{stamp}] {item["message"]}\n', item['level'])
        self._trim(widget, limit=400)
        widget.see('end')
        widget.config(state='disabled')

    @staticmethod
    def _trim(widget, limit: int = 700) -> None:
        lines = int(widget.index('end-1c').split('.')[0])
        if lines > limit:
            widget.delete('1.0', f'{lines - limit}.0')

    def open_web(self) -> None:
        import webbrowser
        try:
            webbrowser.open(self.url)
        except Exception:  # noqa: BLE001 - 打不开浏览器也不应影响服务
            pass

    def clear_logs(self) -> None:
        self.service.clear_logs()
        if self.log_text is not None:
            self.log_text.config(state='normal')
            self.log_text.delete('1.0', 'end')
            self.log_text.config(state='disabled')

    # ---------------- 轮询 ----------------
    def _tick(self) -> None:
        if self._closing:
            return
        while True:
            try:
                fn = self._commands.get_nowait()
            except queue.Empty:
                break
            try:
                fn()
            except Exception:  # noqa: BLE001 - 单个动作异常不影响轮询
                pass
        try:
            self._poll_logs()
            self._poll_tasks()
            self._refresh_status()
        except Exception:  # noqa: BLE001 - 刷新异常不应中断 UI
            pass
        self.root.after(self.TICK_MS, self._tick)

    def _poll_logs(self) -> None:
        items = self.service.logs_since(self.log_seq, 'debug')
        if not items:
            return
        threshold = LOG_LEVEL_ORDER.get(self.cfg.get('log_level', 'info'), 20)
        for item in items:
            self.log_seq = max(self.log_seq, int(item['seq']))
            message = item['message']
            for tid, info in list(self.tasks_win.items()):
                if f'[任务{tid}]' in message:
                    self._append_task_log(info, item)
            if LOG_LEVEL_ORDER.get(item['level'], 20) >= threshold:
                self._append_log(item)

    def _poll_tasks(self) -> None:
        tasks = self.service.tasks()
        alive = set()
        for task in tasks:
            tid = task['id']
            alive.add(tid)
            info = self.tasks_win.get(tid)
            if info is None:
                if tid in self.closed_tasks and task['status'] not in ACTIVE_STATUS:
                    continue
                self.closed_tasks.discard(tid)
                info = self._open_task_window(task)
            self._refresh_task_window(tid, info, task)
        for tid in list(self.tasks_win):
            if tid not in alive:
                self._close_task_window(tid)
        for tid in list(self.closed_tasks):
            if tid not in alive:
                self.closed_tasks.discard(tid)

    def _refresh_task_window(self, tid: int, info: dict, task: dict) -> None:
        status = task['status']
        counts = task['counts']
        info['bar']['value'] = round(task['overall'] * 100, 1)
        info['title'].config(text=f'任务 #{tid} · {STATUS_CN.get(status, status)}')
        meta = f"{counts.get('done', 0)}/{task['total']} 完成"
        if counts.get('failed'):
            meta += f" · {counts['failed']} 失败"
        meta += f" · {task['level']} / {task['encode_type']}"
        if task.get('speed'):
            meta += f" · {task['speed']}"
        info['meta'].config(text=meta)
        if status not in ('done', 'failed', 'cancelled'):
            return
        if info['ending'] is None:
            info['ending'] = time.time() + TASK_CLOSE_DELAY
            summary = STATUS_CN.get(status, status)
            self._append_task_log(info, {
                'time': time.time(), 'level': 'warn' if status == 'failed' else 'info',
                'message': f'任务结束：{summary}，{meta}',
            })
        remain = info['ending'] - time.time()
        if remain <= 0:
            self._close_task_window(tid)
            return
        info['hint'].config(text=f'任务已结束，{int(remain) + 1} 秒后自动关闭（可先最小化）')

    def _refresh_status(self) -> None:
        tasks = self.service.tasks()
        active = sum(1 for t in tasks if t['status'] in ACTIVE_STATUS)
        text = (f'● 服务运行中    ·    任务 {len(tasks)} 个'
                f'（进行中 {active}）    ·    托盘图标可退出')
        if text == self._status_text:
            return
        self._status_text = text
        if self.status_label is not None:
            self.status_label.config(text=text)

    # ---------------- 托盘 ----------------
    def _start_tray(self) -> None:
        try:
            import pystray
        except Exception:  # noqa: BLE001 - 未安装则不做托盘
            return
        image = _tray_image()
        if image is None:
            return
        menu = pystray.Menu(
            pystray.MenuItem('显示状态窗口', lambda *_: self.post(self.show_server), default=True),
            pystray.MenuItem('打开网页', lambda *_: self.post(self.open_web)),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem('退出程序', lambda *_: self.post(self.shutdown)),
        )
        try:
            icon = pystray.Icon('music-downloader', image, '音乐下载器 · Web 服务', menu)
            threading.Thread(target=icon.run, name='tray-icon', daemon=True).start()
        except Exception:  # noqa: BLE001 - 托盘创建失败则退化为普通窗口
            return
        self.tray = icon

    # ---------------- 生命周期 ----------------
    def run(self) -> None:
        self._build_server_window()
        self._start_tray()
        self.root.after(self.TICK_MS, self._tick)
        self.root.mainloop()

    def shutdown(self) -> None:
        if self._closing:
            return
        self._closing = True
        if self.tray is not None:
            try:
                self.tray.stop()
            except Exception:  # noqa: BLE001
                pass
            self.tray = None
        if self.root is not None:
            try:
                self.root.quit()
                self.root.destroy()
            except Exception:  # noqa: BLE001
                pass
