"""Web 版入口：启动本地服务 + 桌面窗口（服务器状态 / 下载任务进度）。

要点：
- 仅监听本机（固定 127.0.0.1），面向「本机使用」场景，不做账号鉴权；
- 启动不自动打开浏览器，前端由用户自行访问打印出的地址；
- HTTP 服务跑在后台线程，Tk 桌面窗口占据主线程：关闭窗口即最小化到系统托盘，
  托盘菜单可重新打开窗口 / 打开网页 / 退出；
- 无 tkinter 环境时退化为纯控制台模式（按 Ctrl+C 停止）。
"""
import sys
import threading
import time

from cfgstore import CONFIG_PATH, load_config
from finisher import FINISH_ACTION_LABELS, set_ui_hooks
from models import ENCODE_TYPES, LEVELS_BY_SOURCE
from providers import SOURCE_LABELS
from uipanel import DesktopUi
from webserver import serve
from webservice import LOG_LEVEL_ORDER, WebService

LABELS_FOLDER = {'none': '不分文件夹', 'artist': '按歌手', 'album': '按专辑',
                 'artist_album': '按歌手/专辑'}


def _make_console_sink(service: WebService):
    """把服务日志同步打到控制台，级别阈值取自当前配置。"""
    def sink(item):
        threshold = LOG_LEVEL_ORDER.get(service.cfg.get('log_level', 'info'), 20)
        if LOG_LEVEL_ORDER.get(item['level'], 20) < threshold:
            return
        stamp = time.strftime('%H:%M:%S', time.localtime(item['time']))
        print(f'[{stamp}] {item["level"].upper():<5} {item["message"]}', flush=True)
    return sink


def _print_config(cfg: dict, url: str) -> None:
    source = cfg.get('source', 'netease')
    level_label = dict(LEVELS_BY_SOURCE.get(source, [])).get(cfg.get('level'), cfg.get('level'))
    encode_label = dict(ENCODE_TYPES).get(cfg.get('encode_type'), cfg.get('encode_type'))
    lines = [
        '',
        '=' * 62,
        '  音乐下载器 · Web 版 已启动',
        f'  访问地址 : {url}   （在浏览器打开，仅本机可访问）',
        f'  配置文件 : {CONFIG_PATH}',
        f'  下载目录 : {cfg.get("download_dir")}',
        f'  当前音源 : {SOURCE_LABELS.get(source, source)}',
        f'  默认音质 : {level_label}   编码 : {encode_label}',
        f'  并发下载 : {cfg.get("workers")} 线程   重试 : {cfg.get("retry")} 次',
        f'  文件组织 : {LABELS_FOLDER.get(cfg.get("folder_structure"), "不分文件夹")}'
        f'   任务文件夹 : {"开" if cfg.get("task_folder") else "关"}',
        f'  跳过已存在 : {"是" if cfg.get("skip_existing") else "否"}'
        f'   完成后 : {FINISH_ACTION_LABELS.get(cfg.get("finish_action"), "无")}',
        f'  日志级别 : {cfg.get("log_level")}',
        '  按 Ctrl+C 停止服务',
        '=' * 62,
        '',
    ]
    print('\n'.join(lines), flush=True)


def _hide_console_if_own_window() -> None:
    """GUI 模式下隐藏本进程独占的控制台窗口，避免任务栏同时出现两个 Python 窗口。

    若程序是从用户已打开的终端启动（控制台里不止本进程），则不隐藏，避免影响该终端。
    """
    if sys.platform != 'win32':
        return
    try:
        import ctypes
        kernel32 = ctypes.windll.kernel32
        hwnd = kernel32.GetConsoleWindow()
        if not hwnd:
            return
        processes = (ctypes.c_uint * 8)()
        count = kernel32.GetConsoleProcessList(processes, 8)
        if 0 < count <= 1:
            ctypes.windll.user32.ShowWindow(hwnd, 0)   # SW_HIDE
    except Exception:  # noqa: BLE001 - 隐藏失败不影响主流程
        pass


def main() -> int:
    cfg = load_config()
    service = WebService(cfg)
    service.add_sink(_make_console_sink(service))

    try:
        httpd, url = serve(service, cfg)
    except OSError as exc:
        print(f'启动失败：无法监听 {cfg.get("host")}:{cfg.get("port")}（{exc}）', flush=True)
        return 1

    _print_config(cfg, url)
    threading.Thread(target=service.bootstrap, name='web-bootstrap', daemon=True).start()
    threading.Thread(target=httpd.serve_forever, name='web-http', daemon=True).start()

    ui = DesktopUi(service, cfg, url)
    if not ui.available:
        print('\n未检测到 tkinter，已退化为纯控制台模式（按 Ctrl+C 停止服务）', flush=True)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\n正在停止服务…', flush=True)
        finally:
            httpd.shutdown()
            httpd.server_close()
            service.log('info', '服务已停止')
        return 0

    print('\n桌面窗口已打开：关闭该窗口将最小化到系统托盘（托盘菜单可退出程序）', flush=True)
    # 下载完成「消息 / 弹窗」提醒基于后台 Tk root
    set_ui_hooks(ui.notify_message, ui.show_finish_popup)
    _hide_console_if_own_window()   # 双击启动时只保留一个窗口，避免任务栏出现两个 Python
    try:
        ui.run()
    except KeyboardInterrupt:
        print('\n正在停止服务…', flush=True)
        ui.shutdown()
    finally:
        httpd.shutdown()
        httpd.server_close()
        service.log('info', '服务已停止')
    return 0


if __name__ == '__main__':
    sys.exit(main())
