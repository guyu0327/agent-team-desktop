# 智群 AgentTeam · 桌面壳（Electron）

私有化部署的桌面客户端：Electron 窗口内置 [agent-team-web](https://github.com/guyu0327/agent-team-web) 前端，并自动拉起 [agent-team-server](https://github.com/guyu0327/agent-team-server) 后端（SQLite 单文件数据库），零外部依赖，开箱即用。

## 相关仓库

- [agent-team-server](https://github.com/guyu0327/agent-team-server)：Spring Boot 后端（编排、会话、消息、SSE）
- [agent-team-web](https://github.com/guyu0327/agent-team-web)：Vue 3 前端（类微信界面）

## 架构

```
agent-team-desktop（本项目，Electron 壳）
├── main.js               主进程：拉起/监控后端、启动等待页、单实例锁、本地访问令牌
├── preload.js            向渲染进程注入 window.agentTeam（apiBase + token、原生文件选择、pathForFile 拖拽路径解析）
├── boot.html             后端就绪前的启动等待页
└── resources/            构建产物（不入库，见下方「产物同步」）
    ├── server/           后端 fat jar（Spring Boot，默认 SQLite）
    ├── web/              前端构建产物（Vite dist）
    └── jre/              jlink 裁剪的 JRE（约 51MB，见 scripts/build-jre.cmd）
```

## 运行模式

| 命令 | 模式 | 行为 |
| --- | --- | --- |
| `npm start` | 桌面模式 | 立即显示启动等待页 → 自动分配空闲端口 → spawn `java -jar resources/server/agent-team-server.jar`（SQLite，数据落在用户目录）→ 健康检查 `/api/user` → 切换到内置前端；关窗弹出应用内确认框（最小化到托盘或退出） |
| `npm run dev` | 开发模式 | 仅加载 Vite 开发服务器 `http://localhost:5173`，不拉起后端；需自行启动 agent-team-web（`npm run dev`，代理到 8080）与 agent-team-server（裸跑，无令牌校验） |

桌面模式下数据目录为 `%APPDATA%/agent-team-desktop/`（`data/agent_team.db` + `workspace/` + `token` 访问令牌），与应用目录完全隔离。

安全机制：主进程生成随机令牌传给后端（`app.security.token`）并注入前端，所有 API 请求自动携带，防止本机其他进程或浏览器网页读写本地 API。

数据备份/恢复：设置页「数据管理」支持导出备份（数据库快照 + `workspace/` 拷贝到所选文件夹）与从备份恢复（覆盖当前全部数据后应用自动重启），也可直接打开数据目录。

托盘与关闭行为：应用常驻系统托盘（左键唤回主窗口，右键菜单：显示主窗口 / 退出）。点关闭按钮弹出应用内样式的确认框——最小化到托盘（后端继续运行）或退出（结束后端），勾选「不再询问」后按所选动作直接执行（记忆在前端 localStorage）。外部 http(s) 链接（如模型控制台）统一交给系统默认浏览器打开。

应用图标：`build/icon.ico` / `build/icon.png` 为唯一来源——rcedit 写入 exe、开发态窗口/任务栏图标、托盘图标（打包态经 extraResources 复制到安装目录 resources）均取自这里，更换图标只需替换 build/ 下两个文件。

## 产物同步

`resources/` 下均为构建产物，不入库。克隆后先执行同步再 `npm start`：

```bash
# 1. 后端 jar
cd ../agent-team-server && ./mvnw -DskipTests package
cp target/agent-team-server-0.0.1-SNAPSHOT.jar ../agent-team-desktop/resources/server/agent-team-server.jar

# 2. 前端构建产物（先清后拷，避免残留旧哈希命名的资源）
cd ../agent-team-web && npm run build
rm -rf ../agent-team-desktop/resources/web
cp -r dist ../agent-team-desktop/resources/web
```

## 打包分发

前置：完成「产物同步」与 JRE 裁剪，然后：

```bash
npm run dist        # NSIS 安装包 → dist/agent-team-desktop-setup-x.y.z.exe
npm run dist:dir    # 免安装解包版 → dist/win-unpacked/（打包态调试用）
```

- 安装包内置 JRE，目标机器无需安装 Java
- electron-builder 工具链已配置国内镜像（`.npmrc`）
- 运行时数据统一在 `%APPDATA%/agent-team-desktop/`，与安装位置无关；单实例锁保证重复启动只聚焦已有窗口

### 环境要求

- Node.js 18+（构建时）
- 构建 JRE 与后端 jar 需要 JDK 21+；**运行打包产物不需要 Java**（已内置裁剪版 JRE）
- Electron 二进制已配置国内镜像（`.npmrc`），`npm install` 即可

## 待办

- [x] 数据备份/恢复（设置页「数据管理」：导出备份 / 从备份恢复 / 打开数据目录）
- [x] 应用图标（`build/icon.ico` + `build/icon.png`，rcedit 写入 exe，窗口/任务栏/托盘同源）
- [ ] 代码签名（未签名，首次运行可能有 SmartScreen 提示）
- [ ] 自动更新（electron-updater，按需）
- [ ] macOS 打包（dmg/app，暂缓）
