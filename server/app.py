"""Server 版入口。

用法：
    python server/app.py

与本地版（MusicDownloaderWeb.py）不同，这里没有桌面窗口 / 托盘，服务常驻运行，
监听地址、配额、保留时长等由 server_config.json（或环境变量）控制。
"""
from __future__ import annotations

import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from config import CONFIG_PATH, load_config          # noqa: E402
from routes import make_server                        # noqa: E402
from service import ServerService                     # noqa: E402
from store import Store                               # noqa: E402


def main() -> int:
    cfg = load_config()
    store = Store(cfg['data_dir'])
    service = ServerService(cfg, store)
    httpd, address = make_server(cfg, service)

    port = httpd.server_address[1]
    quota = f"{cfg['quota_mb']} MB/用户" if cfg['quota_mb'] else '不限'
    print('=' * 62)
    print(' 音乐下载器 Server 版')
    print(f' 监听地址 : {address}')
    print(f' 数据目录 : {cfg["data_dir"]}')
    print(f' 配置文件 : {CONFIG_PATH}')
    print(f' 账号系统 : {"已启用" if cfg["enable_users"] else "已关闭（共用访客空间）"}')
    print(f' 存储配额 : {quota}')
    print(f' 文件保留 : {cfg["retention_hours"]} 小时')
    print(f' 单用户任务上限 : {cfg["max_tasks_per_user"]}')
    print(' 公网部署请置于 HTTPS 反向代理之后，并设置 secure_cookie=true')
    print(' 按 Ctrl+C 停止服务')
    print('=' * 62, flush=True)

    try:
        httpd.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        print('\n正在停止服务…')
    finally:
        service.shutdown()
        httpd.server_close()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
