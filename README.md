# ListenAndDownloadMusicOnWeb

面向网易云音乐 / QQ 音乐的歌曲检索、播放与下载工具。后端为 Python 本地 HTTP 服务，前端为原生 HTML / CSS / JavaScript 单页应用，二者通过本机 HTTP + JSON 通信。

- 服务固定绑定回环地址 `127.0.0.1`，不对外网暴露；
- 附带桌面守护窗口，展示服务状态与实时日志，关闭窗口后最小化至系统托盘；
- 前端零构建链，静态资源由本地服务直接托管。

> 仅供个人学习与数据备份使用，请遵守相关音乐平台的服务条款与版权规定，勿用于商业用途。

## 功能特性

### 界面与交互模式

- 导航栏提供下载、导出、下载任务、下载目录、设置五项入口，并支持「下载模式 / 播放器模式」切换
- **播放器模式**：左右分栏，左侧为封面、曲目信息、播放进度与控制，右侧为跟随播放进度高亮并自动居中的滚动歌词
- **下载模式**：检索栏右侧为当前曲目封面入口，点击打开独立播放器窗口；窗口内以上方标签页切换 **歌词 / 播放队列 / 曲目信息**
- 列表工具条展示加载状态、已选数量，并提供全选 / 清空勾选、全部播放

### 音源与音质

- 双音源切换（网易云音乐 / QQ 音乐），登录态与凭证相互隔离
- Provider 适配层统一音源接口；音质档位随音源自动校正；编码格式由音质推导（无损及以上 FLAC，其余 MP3）

### 检索与数据源

- 输入内容自动识别：关键词检索、歌单 ID / 歌单链接解析、单曲链接定位（网易云 `/song?id=`、QQ `/songDetail/`）
- **歌单 / 我喜欢的音乐模式下，检索默认作用于已加载列表的本地匹配**（歌名 / 歌手 / 专辑），不发起远端请求；仅当显式切换至「搜索」分段时，才调用远端检索接口
- 「我的歌单」支持自建与收藏列表；收藏快捷入口加载「我喜欢的音乐」
- 检索、歌单、收藏共用同一数据表格；滚动触底按偏移量增量分页加载

### 列表

- 复选框多选与实时计数，双击播放，上下文菜单提供播放 / 详情 / 单曲下载 / 选中 / 批量下载 / 复制元数据
- 表头拖拽调整列宽：序号列按当前最大序号位数自适应，其余列按内容类型分配；最小宽度为默认值的 50%，无上限

### 播放队列

- 仅接受显式入队：双击曲目、全部播放、上下文菜单「加入队列 / 下一首播放」；按曲目标识去重
- 指针接近视口左缘时唤出浮动面板，失焦自动收起；支持单击切换、上下文菜单与悬停移除

### 下载任务

- 独立任务窗口，支持拖动、缩放与滚动，位置持久化
- 任务级控制：暂停 / 继续 / 取消 / 重试；展开可查看单曲进度与日志
- 线程池并发下载（1~8 可配）、进度节流聚合上报、断点续传（HTTP Range）
- 可选写入音频标签、内嵌封面与歌词标签；跳过已存在文件；失败自动重试
- 命名模板变量 `{artist}` `{name}` `{album}` `{index}`；支持按歌手 / 专辑 / 歌手+专辑分层存放，可与按任务分目录叠加
- 完成后动作：无 / 消息 / 弹窗 / 打开目录 / 关机；可在设置中配置默认值，提交任务时可覆盖本次选择；动作由后端执行，前端关闭后仍然生效

### 状态栏歌词

- 播放时于状态栏左侧渲染当前歌词，并按歌词排版宽度动态压缩进度条可用区域；切换行时以弹性过渡复位
- 歌词区域宽度上限为视口宽度的 60%（可配置，亦可整体关闭）；超出上限时按行内时间比例计算横向偏移，当前字词保持在可视区域约 70% 位置
- 进度条右侧保留固定宽度的数值进度位；区域压缩仅影响可视填充，不改变实际进度；任务完成后点击数值可清除进度显示
- 无播放曲目时，封面入口与播放器回退至用户头像

### 设置与数据交换

- 设置面板固定尺寸、内容区独立滚动，分为音乐 / 用户 / 系统 / 日志四类
- 密钥按音源分组：网易云 weapi 密钥与 QQ 音乐凭证独立配置
- 配置支持整体导入 / 导出；列表支持 CSV / M3U / TXT 导出

## 环境要求

- Windows
- Python 3.10 及以上（开发环境为 3.14）

依赖：`requests`、`pycryptodome`、`qrcode`、`pillow`、`mutagen`、`qqmusic-api-python`、`pystray`

## 安装与运行

```bash
pip install -r requirements.txt
python MusicDownloaderWeb.py
```

启动后终端输出访问地址（默认 `http://127.0.0.1:8756`）与当前配置摘要，**不会自动打开浏览器**。桌面窗口展示服务状态与实时日志，关闭即最小化至系统托盘，托盘菜单可重新打开窗口 / 打开网页 / 退出。

## Server 版（公网多用户部署）

仓库同时提供面向公网的多用户服务端，代码位于 `server/`，与本地版仅共享音源与下载核心模块，配置、数据、部署方式完全独立。

### 功能裁剪

- 移除桌面窗口、系统托盘、关机 / 提示音 / 弹窗 / 打开目录等本地动作，服务纯后台常驻
- 移除本地播放器与播放队列，聚焦「检索 → 勾选 → 下载 → 浏览器取回」闭环
- 移除配置导入导出与本机路径设置；登录方式收敛为 **Cookie / 凭证导入**（不提供扫码）
- 新增账号注册登录、每用户 Cookie 隔离、存储配额、文件过期清理、并发任务限制

### 运行

```bash
pip install -r server/requirements.txt
python server/app.py
```

默认监听 `0.0.0.0:3434`，首次启动自动生成 `server/server_config.json` 并创建数据目录 `server/server_data`（SQLite 数据库 `app.db` + 各用户下载文件）。

### 配置

服务器级参数由 `server/server_config.json` 或环境变量控制：

- `host` / `port`：监听地址与端口，也可用 `MD_SERVER_HOST` / `MD_SERVER_PORT`
- `data_dir`：数据目录（`MD_SERVER_DATA_DIR`）
- `quota_mb`：每用户存储配额，0 表示不限（`MD_SERVER_QUOTA_MB`）
- `retention_hours`：成品文件保留时长，到期自动删除（`MD_SERVER_RETENTION_HOURS`）
- `max_tasks_per_user` / `download_workers`：每用户并行任务数与单任务并发下载数
- `weapi_keys` / `qq_credential`：由管理员统一配置的公共密钥，前端无读取与修改入口

### 安全约定

密码使用 PBKDF2-HMAC-SHA256（20 万轮）散列，会话令牌仅以摘要入库，Cookie 为 HttpOnly + SameSite=Lax；登录失败按 IP 与用户名限流；请求体有大小上限；文件下载校验归属并约束在用户目录内。公网部署应置于 HTTPS 反向代理之后，并将 `secure_cookie` 置为 `true`。

## 目录结构

```text
.
├── MusicDownloaderWeb.py  # 入口：启动本地服务 + 桌面窗口
├── webserver.py           # HTTP 服务、路由与静态前端托管
├── webservice.py          # 业务服务层（检索 / 播放 / 下载任务 / 日志缓冲）
├── cfgstore.py            # 默认配置、读写、导入导出与字段校正
├── finisher.py            # 下载完成后动作（消息 / 弹窗 / 打开目录 / 关机）
├── uipanel.py             # 桌面窗口 + 系统托盘
├── providers.py           # 音源工厂（网易云 / QQ）
├── api.py                 # 网易云 Provider
├── qq_api.py              # QQ 音乐 Provider
├── downloader.py          # 下载器（进度 / 重试 / 暂停取消 / 标签与歌词）
├── encrypt.py             # 网易云 weapi 加密
├── models.py              # 数据模型（Song 等）
├── web/                   # 前端（原生实现，无构建链）
│   ├── index.html
│   ├── app.css
│   └── app.js
├── server/                # 公网多用户服务端（独立入口与前端）
│   ├── app.py             # 入口：监听端口、初始化数据库与清理线程
│   ├── config.py          # 服务器级配置（server_config.json / 环境变量）
│   ├── store.py           # SQLite：账号 / 会话 / 偏好 / 文件
│   ├── accounts.py        # 密码散列、会话令牌、登录限流
│   ├── context.py         # 每用户独立音源实例池
│   ├── service.py         # 业务层（检索 / 下载任务 / 配额 / 过期清理）
│   ├── routes.py          # HTTP 路由、鉴权与文件流式下载
│   └── web/               # 精简前端（登录、检索、任务、文件）
├── config.json            # 配置与凭证（不入库，运行后自动生成）
└── requirements.txt       # 依赖清单
```

## 配置说明

程序读取同目录下的 `config.json`，所有配置项均可在 Web 设置页修改，无需手动编辑。

- **服务配置**：`port`（默认 8756，0 表示自动选择空闲端口）、`log_level`；`host` 固定为 `127.0.0.1`，不可修改
- **用户配置**：`source`、`level` / `encode_type`、`download_dir`、`name_template`、`folder_structure`、`task_folder`、歌词与标签开关、`workers`、`retry`、`skip_existing`、`finish_action`、`status_lyric` / `status_lyric_max` 等
- **密钥**：`weapi_keys` 为网易云 weapi 加密接口使用的密钥，可在设置页修改并立即生效；`qq_credential` 为 QQ 音乐登录凭证；`credentials` 为内置 API 凭证留档，当前不参与请求

`config.json` 会保存登录 Cookie 与凭证，已被 `.gitignore` 忽略，请勿提交至公开仓库。

## 本地 HTTP 接口

前后端采用本机 HTTP + JSON 轮询通信（未引入 WebSocket / SSE）：

```text
GET  /api/meta                 音源、音质档位、编码类型等元信息
GET  /api/config               读取配置（敏感字段以布尔位下发）
GET  /api/config/export        导出整份配置
GET  /api/account              登录态与账号信息
GET  /api/my_playlists         我的歌单
GET  /api/liked                我喜欢的音乐
GET  /api/liked_keys           我喜欢的歌曲标识集合
GET  /api/tasks                下载任务列表（轮询）
GET  /api/logs                 服务日志（轮询）
POST /api/config               更新配置
POST /api/config/import        导入配置
POST /api/search               关键词检索
POST /api/playlist             按歌单 ID / 链接加载歌单
POST /api/song                 单曲链接定位
POST /api/probe                音质探测
POST /api/lyric                获取歌词
POST /api/play                 获取播放地址
POST /api/download             提交下载任务
POST /api/task/action          任务暂停 / 继续 / 取消 / 重试
POST /api/login/cookie         导入 Cookie 登录
POST /api/login/qr/start       扫码登录 - 开始
POST /api/login/qr/poll        扫码登录 - 轮询
POST /api/logout               退出登录
POST /api/logs/clear           清空日志
POST /api/open_dir             打开下载目录
POST /api/export               列表导出（CSV / M3U / TXT）
```

## 打包为单文件可执行程序

```bash
pip install pyinstaller
python -m PyInstaller --noconfirm --clean --onefile --windowed --name MusicDownloader ^
  --collect-all qqmusic_api ^
  --hidden-import mutagen.id3 --hidden-import mutagen.flac --hidden-import mutagen.mp4 ^
  --hidden-import qrcode.image.pil ^
  --add-data "web;web" MusicDownloaderWeb.py
```

产物为单文件、静态链接，目标机器无需安装 Python。程序以**可执行文件所在目录**作为配置与下载目录，整个目录可整体迁移。

## 更新日志

见 [CHANGELOG.md](CHANGELOG.md)。
