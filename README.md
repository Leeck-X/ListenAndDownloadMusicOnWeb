# MusicDownloaderUi

网易云音乐 / QQ 音乐 歌曲下载器，Python 实现，基于本地 Web 界面：

- **Web 版**：Python 本地 HTTP 服务 + 纯 HTML/CSS/JS 前端，在浏览器里操作，另有一个桌面窗口显示服务状态与日志，可最小化到系统托盘。

> 仅供个人学习与备份使用，请遵守相关音乐平台的服务条款与版权规定，勿用于商业用途。

## Web 版特性

**界面与模式**

- 顶部栏：下载、导出、下载任务、打开下载目录、设置五个入口，另有「下载模式 / 播放器模式」一键切换
- **播放器模式**：左半屏为封面、歌曲信息、进度条、播放控制与音量，右半屏为跟随播放高亮并自动居中的滚动歌词
- **下载模式**：搜索框右侧并列「当前音乐封面」按钮，点击弹出独立播放器窗口（左侧封面 / 信息 / 进度 / 控制 / 音量，右侧顶部滑块切换 **歌词 / 播放列表 / 歌曲信息**），窗口可拖动、可拉伸，标题过长时以传送带方式滚动
- 列表上方信息条左侧显示实时状态（查询中 / 已加载 N 首，滚动到底继续加载 / 当前音源音质），不再占用静态操作提示
- 整个界面按钮化 + 一体式列表，无标签页跳转；列表、播放器、悬浮岛均不可选中文字
- 「运行日志」收进设置页，不再单独占用入口

**双音源**

- 顶部一键切换「网易云音乐 / QQ 音乐」，登录态与凭证各自独立保存
- 统一音源 Provider 接口，音质档位随音源自动校正

**搜索 / 歌单 / 我的音乐**

- 搜索框自动识别输入类型：普通文本走搜索，歌单 ID 或歌单链接直接加载歌单，单曲链接（网易云 `/song?id=`、QQ `/songDetail/`）直接定位
- 「我的歌单」弹窗浏览自己创建与收藏的歌单；查询框左侧拨码开关组内的爱心按钮一键载入「我喜欢的音乐」
- 搜索、歌单、我的音乐**共用同一个表格与同一个搜索框**，新结果直接覆盖旧列表
- 结果滚动到底部自动预加载下一页

**列表**

- 勾选复选框与实时已选计数，双击播放，右键菜单（播放 / 查看详情 / 下载此曲 / 选中 / 下载已选 / 复制信息）
- 拖动表头调整列宽：序号列宽度按当前列表最大序号位数自适应，其余列默认按「歌名 / 歌手 / 专辑长一些、时长 / 大小短一些」分配；**缩小极限为默认宽度的一半，放大不设限**
- 列宽与列表相关控件状态在切换列表来源后自动刷新

**播放列表（左缘悬浮岛 + 播放器窗口）**

- 播放列表只由用户显式添加：**双击歌曲**（加入并播放）、**全部播放**（整批追加）、右键 **添加到播放列表**，或右键 **下一首播放**（插到当前曲之后）；同名歌曲按标识去重
- 鼠标贴近左边缘唤出，点击别处自动隐藏，岛头可拖动并记忆位置；岛与播放器窗口的播放列表均**可拉伸、列表带滚动条**
- 条目支持单击切换当前播放、右键菜单（播放这首 / 下一首播放 / 从播放列表移除 / 清空播放列表）、悬停显示小 × 直接移除

**下载任务（独立窗口）**

- 顶栏「下载任务」按钮打开独立窗口（不再占用右侧悬浮岛），标题栏可拖动、窗口可拉伸、列表可滚动，位置可记忆
- 任务可暂停 / 继续 / 取消 / 重试，展开可查看逐曲进度与日志
- 多线程并发下载（并发数 1~8 可配），进度节流上报，断点续传（HTTP Range）
- 可选写入歌词、歌曲标签、内嵌封面与歌词标签；跳过已存在的文件；失败自动重试
- 命名模板支持 `{artist} {name} {album} {index}`，可按 歌手 / 专辑 / 歌手+专辑 分文件夹组织
- 可选「按任务分文件夹」：在下载目录下为每次任务新建 `任务 日期-时间` 子目录（与歌手 / 专辑分层叠加，互不冲突）；关闭时保持原有结构
- 下载结束后可选提示音 + 右下角浮窗 + 任务栏闪烁通知
- **下载完成后动作**（设置 → 音乐，可选并保存为默认）：无 / 消息 / 弹窗 / 打开目录 / 关机；每次提交下载时还能在下载选项窗里临时改选，只对当前任务生效
- 「消息」为 Windows 托盘气泡，「弹窗」为基于后台窗口的右下角提示（提供「打开目录」「好的」）；动作由后端执行，浏览器关闭也会生效
- 关机动作默认延迟 60 秒，期间可运行 `shutdown /a` 取消

**状态栏歌词**

- 播放时状态栏最左侧显示当前歌词，并随歌词长度把下载进度条向右「顶」开，歌词变短后弹性伸回
- 歌词宽度上限为窗口宽度的 60%（设置 → 音乐 可调，可整体关闭）；超长歌词按传送带滚动，当前唱到的字保持在视野约 70% 处
- 进度条右侧固定预留「| 99.9%」数字进度位，歌词顶开只遮挡左侧可视填充、不影响真实比例；任务完成后点击数字即可清空进度条
- 无歌曲播放时，封面按钮与播放器封面使用用户头像

**设置与导出**

- 设置页固定尺寸、内容独立滚动，切换分类时窗口不再跳动，含 **音乐 / 用户 / 系统 / 日志** 四个分类
- 系统分类下按音源分组配置密钥：**网易云音乐 · 密钥**（weapi 的 key1 / iv / pub_key / modulus）与 **QQ 音乐 · 密钥 / 凭证**（登录凭证 JSON，可一键清空）
- 配置支持整份导入 / 导出（含敏感字段，用于本机备份迁移）
- 列表可导出 CSV 表格 / M3U 播放列表 / TXT 歌名清单

## 环境要求

- Windows
- Python 3.10 及以上（开发环境为 3.14）

## 目录结构

```text
MusicDownloader/
├─ Web_Tk/        Web 版完整可运行副本：MusicDownloaderWeb.py + 共享模块 + web/ + config.json
├─ web/           Web 版前端静态文件（HTML / CSS / JS）
├─ api.py / providers.py / downloader.py / cfgstore.py …  共享核心模块
└─ config.json    本机配置（含登录凭证，已被 .gitignore 忽略）
```

`Web_Tk/` 带有完整的共享模块与 `config.json`，可单独拷贝出去运行；仓库根目录则是开发版本的共用模块。

## 安装与运行

```bash
pip install -r requirements.txt
```

**Web 版（推荐）**

```bash
cd Web_Tk
python MusicDownloaderWeb.py
```

启动后终端会打印访问地址（默认 `http://127.0.0.1:8756`）与当前配置摘要，**不会自动打开浏览器**，请自行在浏览器中访问该地址。同时会弹出一个桌面窗口展示服务状态与实时日志：关闭该窗口即最小化到系统托盘，托盘菜单可重新打开窗口 / 打开网页 / 退出程序。服务仅监听回环地址，不对外暴露。

## 配置说明

程序读取同目录下的 `config.json`（配置读写逻辑位于 `cfgstore.py`）。所有配置项均可在 Web 设置页中修改，无需手动编辑文件。

- **服务配置**：`port`（默认 8756，0 表示自动挑空闲端口）、`log_level`；`host` 固定为 `127.0.0.1`，设置页不可修改。
- **用户配置**：`source`（音源）、`level` / `encode_type`（音质与编码，编码由音质自动推导：无损及以上为 flac，其余为 mp3）、`download_dir`（下载目录）、`name_template`、`folder_structure`、`task_folder`（按任务分文件夹）、歌词与标签相关的开关、`workers`（并发数）、`retry`、`skip_existing` 等。
- **密钥**：`weapi_keys` 为网易云 weapi 加密接口真正使用的密钥，默认值与网易云 web 客户端一致，可在设置页查看 / 修改，保存后立即生效且不会重建登录态；`qq_credential` 为 QQ 音乐登录凭证（扫码或 Cookie 导入后写入）；`credentials` 为内置 API 凭证留档，当前不参与任何请求。

**`config.json` 会保存你的登录 Cookie 与凭证，已被 `.gitignore` 忽略，请勿提交到公开仓库。**

## 本地 HTTP 接口

前端与后端通过本机 HTTP + JSON 通信（轮询，无 WebSocket / SSE），主要接口：

```
GET  /api/meta                 音源、音质档位、编码类型等元信息
GET  /api/config               读取当前配置（敏感字段以布尔位下发）
GET  /api/account              登录态与账号信息
GET  /api/my_playlists         我的歌单
GET  /api/liked                我喜欢的音乐
GET  /api/tasks                下载任务列表（轮询）
GET  /api/logs                 服务日志（轮询）
POST /api/search               关键词搜索
POST /api/playlist             按歌单 ID / 链接加载歌单
POST /api/song                 单曲链接定位
POST /api/play                 获取播放地址
POST /api/lyric                获取歌词
POST /api/probe                音质探测
POST /api/download             提交下载任务
POST /api/task/action          任务暂停 / 继续 / 取消 / 重试
POST /api/login/cookie         导入 Cookie 登录
POST /api/login/qr/start|poll  扫码登录
POST /api/logout               退出登录
POST /api/config/import|update 配置导入 / 更新
GET  /api/config/export        配置导出
POST /api/export               列表导出（csv / m3u / txt）
POST /api/open_dir             打开下载目录
POST /api/logs/clear           清空日志
```

## 目录结构

```
.
├── MusicDownloaderWeb.py  # Web 版入口（本地服务 + 桌面窗口）
├── webserver.py           # 本地 HTTP 服务、路由与静态前端托管
├── webservice.py          # 业务服务层（搜索 / 播放 / 下载任务 / 日志缓冲）
├── cfgstore.py            # 默认配置、读写、导入导出与字段校正
├── uipanel.py             # 桌面窗口 + 系统托盘
├── web/                   # 前端（无构建工具）
│   ├── index.html
│   ├── app.css
│   └── app.js
├── providers.py           # 音源工厂（网易云 / QQ）
├── api.py                 # 网易云 Provider
├── qq_api.py              # QQ 音乐 Provider
├── downloader.py          # 下载器（进度 / 重试 / 暂停取消 / 标签歌词）
├── encrypt.py             # 网易云 weapi 加密
├── models.py              # 数据模型（Song 等）
├── config.json            # 配置与凭证（不入库，运行后自动生成）
└── requirements.txt       # 依赖清单
```

## 打包为单文件 exe

```bash
pip install pyinstaller
python -m PyInstaller --noconfirm --clean --onefile --windowed --name MusicDownloader ^
  --collect-all qqmusic_api ^
  --hidden-import mutagen.id3 --hidden-import mutagen.flac --hidden-import mutagen.mp4 ^
  --hidden-import qrcode.image.pil ^
  --add-data "web;web" MusicDownloaderWeb.py
```

生成的 `MusicDownloader.exe` 为单文件、静态链接，目标机器无需安装 Python。exe 运行时会以**自身所在目录**作为配置与下载目录，因此整个文件夹可随意移动。发布时请将 `config.json` 与 exe 放在同一目录（发布包已包含）。

## 更新日志

见 [CHANGELOG.md](CHANGELOG.md)。
