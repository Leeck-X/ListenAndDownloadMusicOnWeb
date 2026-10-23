# ListenAndDownloadMusicOnWeb

网易云音乐 / QQ 音乐 歌曲下载器，Python 实现，本地 Web 界面：

- 后端 Python 本地 HTTP 服务（固定监听 `127.0.0.1`，不对外暴露），前端为纯 HTML / CSS / JS，无需构建工具；
- 另有一个桌面窗口展示服务状态与实时日志，关闭窗口即最小化到系统托盘。

> 仅供个人学习与备份使用，请遵守相关音乐平台的服务条款与版权规定，勿用于商业用途。

## 功能

**界面与模式**

- 顶栏：下载、导出、下载任务、打开下载目录、设置；支持「下载模式 / 播放器模式」一键切换
- **播放器模式**：左半屏封面、歌曲信息、进度与控制，右半屏为跟随高亮并自动居中的滚动歌词
- **下载模式**：搜索框右侧为「当前音乐封面」按钮，点击打开独立播放器窗口，右侧滑块可切换 **歌词 / 播放列表 / 歌曲信息**
- 列表上方信息条显示实时状态（查询中 / 已加载 N 首、滚动到底继续加载）与已选数量，并提供「全选 / 清空勾选」「全部播放」

**双音源**

- 一键切换「网易云音乐 / QQ 音乐」，登录态与凭证各自独立
- 统一 Provider 接口，音质档位随音源自动校正；编码格式由音质推导（无损及以上 flac，其余 mp3）

**搜索 / 歌单 / 我的音乐**

- 搜索框自动识别输入：普通文本搜索，歌单 ID / 歌单链接直接加载，单曲链接（网易云 `/song?id=`、QQ `/songDetail/`）直接定位
- 「我的歌单」浏览自建与收藏的歌单；拨码开关组内的爱心按钮载入「我喜欢的音乐」
- 搜索、歌单、我的音乐共用同一表格与同一搜索框，新结果覆盖旧列表；滚动到底自动加载下一页

**列表**

- 勾选复选框与实时计数，双击播放，右键菜单（播放 / 查看详情 / 下载此曲 / 选中 / 下载已选 / 复制信息）
- 拖动表头调整列宽：序号列按当前最大序号位数自适应，其余列按内容类型分配；缩小极限为默认宽度的一半，放大不设限

**播放列表**

- 仅由用户显式添加：双击歌曲、全部播放、右键「添加到播放列表」或「下一首播放」；按歌曲标识去重
- 鼠标贴近左边缘唤出，点击别处自动隐藏；条目支持单击切换、右键菜单、悬停小 × 移除

**下载任务**

- 顶栏按钮打开独立窗口，可拖动、可拉伸、列表可滚动，位置可记忆
- 任务可暂停 / 继续 / 取消 / 重试，展开可查看逐曲进度与日志
- 多线程并发下载（1~8 可配）、进度节流上报、断点续传（HTTP Range）
- 可选写入歌曲标签、内嵌封面、歌词标签；跳过已存在文件；失败自动重试
- 命名模板 `{artist} {name} {album} {index}`，可按 歌手 / 专辑 / 歌手+专辑 分文件夹；可选按任务分文件夹
- 下载完成后动作：无 / 消息 / 弹窗 / 打开目录 / 关机，可在设置中设为默认，提交下载时也能临时改选；动作由后端执行，浏览器关闭仍生效

**状态栏歌词**

- 播放时状态栏左侧显示当前歌词，按长度把下载进度条向右顶开，歌词变短后弹性伸回
- 歌词宽度上限默认为窗口宽度的 60%，可在设置中调整或关闭；超长时按传送带滚动，当前字保持在视野约 70% 处
- 进度条右侧固定预留数字进度位，顶开只遮挡左侧可视填充、不影响真实比例；任务完成后点击数字可清空进度条
- 无歌曲播放时，封面按钮与播放器封面使用用户头像

**设置与导出**

- 设置页固定尺寸、内容独立滚动，含 **音乐 / 用户 / 系统 / 日志** 四个分类
- 密钥按音源分组：网易云 weapi 密钥与 QQ 音乐凭证分别配置
- 配置支持整份导入 / 导出；列表可导出 CSV / M3U / TXT

## 环境要求

- Windows
- Python 3.10 及以上（开发环境为 3.14）

依赖：`requests`、`pycryptodome`、`qrcode`、`pillow`、`mutagen`、`qqmusic-api-python`、`pystray`

## 安装与运行

```bash
pip install -r requirements.txt
python MusicDownloaderWeb.py
```

启动后终端会打印访问地址（默认 `http://127.0.0.1:8756`）与当前配置摘要，**不会自动打开浏览器**，请自行访问。桌面窗口展示服务状态与实时日志，关闭即最小化到系统托盘，托盘菜单可重新打开窗口 / 打开网页 / 退出。

## 目录结构

```text
.
├── MusicDownloaderWeb.py  # 入口：启动本地服务 + 桌面窗口
├── webserver.py           # HTTP 服务、路由与静态前端托管
├── webservice.py          # 业务服务层（搜索 / 播放 / 下载任务 / 日志缓冲）
├── cfgstore.py            # 默认配置、读写、导入导出与字段校正
├── finisher.py            # 下载完成后的动作（消息 / 弹窗 / 打开目录 / 关机）
├── uipanel.py             # 桌面窗口 + 系统托盘
├── providers.py           # 音源工厂（网易云 / QQ）
├── api.py                 # 网易云 Provider
├── qq_api.py              # QQ 音乐 Provider
├── downloader.py          # 下载器（进度 / 重试 / 暂停取消 / 标签歌词）
├── encrypt.py             # 网易云 weapi 加密
├── models.py              # 数据模型（Song 等）
├── web/                   # 前端（无构建工具）
│   ├── index.html
│   ├── app.css
│   └── app.js
├── config.json            # 配置与凭证（不入库，运行后自动生成）
└── requirements.txt       # 依赖清单
```

## 配置说明

程序读取同目录下的 `config.json`，所有配置项均可在 Web 设置页修改，无需手动编辑。

- **服务配置**：`port`（默认 8756，0 表示自动挑选空闲端口）、`log_level`；`host` 固定为 `127.0.0.1`，不可修改
- **用户配置**：`source`、`level` / `encode_type`、`download_dir`、`name_template`、`folder_structure`、`task_folder`、歌词与标签开关、`workers`、`retry`、`skip_existing`、`finish_action`、`status_lyric` / `status_lyric_max` 等
- **密钥**：`weapi_keys` 为网易云 weapi 加密接口使用的密钥，可在设置页修改并立即生效；`qq_credential` 为 QQ 音乐登录凭证；`credentials` 为内置 API 凭证留档，当前不参与请求

`config.json` 会保存登录 Cookie 与凭证，已被 `.gitignore` 忽略，请勿提交到公开仓库。

## 本地 HTTP 接口

前后端通过本机 HTTP + JSON 轮询通信（无 WebSocket / SSE）：

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
POST /api/search               关键词搜索
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
POST /api/export               列表导出（csv / m3u / txt）
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

生成的 `MusicDownloader.exe` 为单文件、静态链接，目标机器无需安装 Python。exe 以**自身所在目录**作为配置与下载目录，整个文件夹可随意移动；发布时请将 `config.json` 与 exe 放在同一目录。

## 更新日志

见 [CHANGELOG.md](CHANGELOG.md)。
