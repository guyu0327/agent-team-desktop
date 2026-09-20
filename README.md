# 智群 AgentTeam · 桌面端（Electron + Vue）

私有化部署的桌面客户端：Electron 窗口内置 Vue 3 前端（`web/` 子目录，经 git subtree 并入），并自动拉起 [agent-team-server](https://github.com/guyu0327/agent-team-server) 后端（SQLite 单文件数据库），零外部依赖，开箱即用。

## 相关仓库

- [agent-team-server](https://github.com/guyu0327/agent-team-server)：Spring Boot 后端（编排、会话、消息、SSE）
- [agent-team-web](https://github.com/guyu0327/agent-team-web)：Vue 3 前端（类微信界面）——已并入本仓库 `web/` 子目录，原仓库已归档

## 主要功能

- 多语言界面：中文 / English 一键切换，全部界面文案接入 i18n
- 深浅色主题：整站换肤，Windows 自绘标题条配色同步，重启记忆上次选择
- 单聊与群聊：群聊支持自由讨论、编排者协作、成员 @ 与置顶；群内左键点头像即可 @ 对方；回复进行中发送按钮变为「停止」可随时掐断（协作/讨论在顶部横幅终止）
- 定时任务：侧边栏「定时任务」页管理任务会话，支持单次/每天/每周/固定间隔四种触发、错过补发、立即执行、暂停恢复与批量操作；分「普通任务」（执行智能体独立完成）与「协作任务」（编排者拉成员建任务群协作），删除自动归档到历史会话、可一键恢复；对话中智能体也能用 schedule_task 等工具为用户安排任务
- 任务后台自动放行：定时任务后台触发时无人响应审批卡片，按任务级「后台自动放行」配置执行——写入/修改文件默认放行、终端命令默认不放行（可开关），放行与拒绝均记入运行日志；对话中手动执行不受影响，仍走人工审批；任务触发轮若只输出文字未实际执行，会自动追加纠正指令重试一轮
- 历史会话：删除/解散/开始新会话的聊天自动归档到「历史会话」，可按日期分组、搜索、查看完整记录、继续聊天或彻底删除；定时任务删除后整批归档于此，以「定时任务」标签区分
- 模型预设与文生图：支持 OpenAI 兼容对话与 DashScope / OpenAI Images / 硅基流动文生图协议
- 受控操作审批：写入/修改文件、执行终端命令前弹卡片询问（允许一次 / 本会话允许 / 拒绝），「本会话允许」会批量放行同类待审批
- 实时语音转写：按住麦克风边说边出字（讯飞流式听写）
- 运行日志：设置页「数据管理」可查看后端关键日志，按类型/时间范围筛选
- 协作限制：设置页可配置编排协作与自由讨论的整体/单成员超时（默认 60/5 分钟）
- 上下文压缩：注入模型的历史超预算自动滚动摘要、图片首轮看完即降级为文字注记，设置页可调预算与开关（默认 6 万字符、开启）
- 智能体长期记忆：对话中自行决定记住用户偏好与重要信息（recordToMemory 工具），SQLite 落库、跨会话生效，每轮自动注入系统提示
- 系统设置：开机自启、深浅色主题、语言切换；工作区文件与授权目录可一键用系统默认方式打开

## 架构

```
agent-team-desktop（本项目，Electron 壳）
├── main.js               主进程：拉起/监控后端、启动等待页、单实例锁、本地访问令牌、双平台自绘标题栏（Windows 弱化标题条 / macOS 自绘红绿灯）、系统设置（主题/开机自启）
├── preload.js            向渲染进程注入 window.agentTeam（apiBase + token、原生文件选择、pathForFile 拖拽路径解析、剪贴板图片落盘、shell openPath）
├── boot.html             后端就绪前的启动等待页
├── web/                  Vue 3 前端源码（git subtree 并入，构建产物 web/dist 不入库）
└── resources/            后端与 JRE 产物（不入库，见下方「产物同步」）
    ├── server/           后端 fat jar（Spring Boot，默认 SQLite）
    └── jre/              jlink 裁剪的 JRE（win/、mac/ 按平台子目录，见 scripts/build-jre.cmd 与 build-jre.sh）
```

## 运行模式

| 命令 | 模式 | 行为 |
| --- | --- | --- |
| `npm start` | 桌面模式 | 立即显示启动等待页 → 自动分配空闲端口 → spawn `java -jar resources/server/agent-team-server.jar`（SQLite，数据落在用户目录）→ 健康检查 `/api/user` → 切换到内置前端；关窗弹出应用内确认框（最小化到托盘或退出） |
| `npm run dev` | 开发模式 | 仅加载 Vite 开发服务器 `http://localhost:5173`，不拉起后端；需先 `npm run dev:web`（起 web/ 前端开发服务器，代理到 8080），并自行启动 agent-team-server（裸跑，无令牌校验） |

桌面模式下数据目录为 `%APPDATA%/agent-team-desktop/`（`data/agent_team.db` + `workspace/` + `token` 访问令牌），与应用目录完全隔离。

安全机制：主进程生成随机令牌传给后端（`app.security.token`）并注入前端，所有 API 请求自动携带，防止本机其他进程或浏览器网页读写本地 API。

数据备份/恢复：设置页「数据管理」支持导出备份（数据库快照 + `workspace/` 拷贝到所选文件夹）与从备份恢复（覆盖当前全部数据后应用自动重启），也可直接打开数据目录。

托盘与关闭行为：应用常驻系统托盘（左键唤回主窗口，右键菜单：显示主窗口 / 退出）。点关闭（Windows 系统按钮、macOS 自绘红绿灯）弹出应用内样式的确认框——最小化到托盘（后端继续运行）或退出（结束后端），勾选「不再询问」后按所选动作直接执行（记忆在前端 localStorage）。外部 http(s) 链接（如模型控制台）统一交给系统默认浏览器打开。

自绘标题栏：双平台均隐藏原生标题栏由应用自绘——Windows 用 `titleBarOverlay` 保留系统绘制最小化/最大化/关闭按钮，图标+名称+版本号由前端绘成低亮度标题条（深浅色主题切换时系统按钮配色同步）；macOS 用 `hiddenInset` 隐藏原生栏，前端在侧边栏自绘红绿灯（关闭/最小化/缩放），顶部搜索栏、标题栏等区域标记 `drag-region` 可拖动窗口。

应用图标：`build/icon.ico` / `build/icon.png` 为唯一来源——rcedit 写入 exe、开发态窗口/任务栏图标、托盘图标（打包态经 extraResources 复制到安装目录 resources）均取自这里；Windows 托盘用 ico，macOS 托盘不支持 ico 改用同源 png（自动缩放到菜单栏尺寸）。更换图标只需替换 `build/icon.png` 后执行 `node scripts/build-icon.js` 重新生成全尺寸高清 ico（ico 已入库，无需手动维护）。

## 产物同步

`resources/` 与 `web/dist` 为构建产物，不入库。克隆后先执行同步再 `npm start`：

```bash
# 1. 前端构建产物（本仓库 web/ 子目录，Vue 3 + Vite）
npm --prefix web install
npm run build:web           # → web/dist

# 2. 后端 jar
cd ../agent-team-server && ./mvnw -DskipTests package
cp target/agent-team-server-0.0.1-SNAPSHOT.jar ../agent-team-desktop/resources/server/agent-team-server.jar

# 3. 裁剪内置 JRE（在对应平台的机器上执行；jar 优先取源码仓库构建产物，回落本项目已同步的产物）
scripts\build-jre.cmd      # Windows → resources/jre/win
./scripts/build-jre.sh     # macOS   → resources/jre/mac

# 4. 应用图标（替换 build/icon.png 后执行，重新生成多尺寸高清 build/icon.ico）
node scripts/build-icon.js
```

## 打包分发

前置：完成「产物同步」与 JRE 裁剪，然后在目标平台上执行（Windows 包只能在 Windows 打，mac 包只能在 Mac 打）：

```bash
npm run dist         # Windows NSIS 安装包 → dist/agent-team-desktop-setup-x.y.z.exe
npm run dist:dir     # Windows 免安装解包版 → dist/win-unpacked/（打包态调试用）
npm run dist:mac     # macOS dmg → dist/（须在 Mac 上执行）
npm run dist:mac:dir # macOS 免安装 .app → dist/mac-*/（打包态调试用）
```

- 安装包内置 JRE，目标机器无需安装 Java；extraResources 按 `${os}` 宏只打包目标平台那份 JRE（`resources/jre/win|mac/`），运行时 `main.js` 按同名字目录查找
- macOS 默认只打包当前机器架构（Apple Silicon 或 Intel），双架构都要支持用 `npx electron-builder --mac --x64 --arm64`
- 双平台均未签名：Windows 首次运行有 SmartScreen 提示；macOS 首次打开需右键 →「打开」，或 `xattr -cr /Applications/AgentTeam.app` 绕过 Gatekeeper
- electron-builder 工具链已配置国内镜像（`.npmrc`）
- 运行时数据统一在 `%APPDATA%/agent-team-desktop/`，与安装位置无关；单实例锁保证重复启动只聚焦已有窗口

### 环境要求

- Node.js 20.19+（构建 web/ 前端与 Electron 壳时）
- 构建 JRE 与后端 jar 需要 JDK 21+；**运行打包产物不需要 Java**（已内置裁剪版 JRE）
- Electron 二进制已配置国内镜像（`.npmrc`），`npm install` 即可

## 待办

- [x] 数据备份/恢复（设置页「数据管理」：导出备份 / 从备份恢复 / 打开数据目录）
- [x] 应用图标（`build/icon.ico` + `build/icon.png`，rcedit 写入 exe，窗口/任务栏/托盘同源）
- [x] 双平台自绘标题栏（Windows 弱化标题条 + 系统窗口按钮；macOS 侧边栏自绘红绿灯 + 顶部拖拽区）
- [ ] 代码签名（双平台均未签名，首次运行可能有 SmartScreen / Gatekeeper 提示）
- [ ] 自动更新（electron-updater，按需）
- [x] macOS 打包（dmg/app，`npm run dist:mac`，须在 Mac 上执行）
