const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const net = require('net')
const crypto = require('crypto')

// 开发模式：npm run dev，加载 Vite 开发服务器（需自行启动 agent-team-web 与后端 8080）
// 桌面模式：npm start，自动拉起 resources/server 下的后端并加载 resources/web 前端
const isDev = process.argv.includes('--dev')

// 打包态资源在 <安装目录>/resources（extraResources），开发态在项目 resources/ 下
const RESOURCE_ROOT = app.isPackaged ? process.resourcesPath : path.join(__dirname, 'resources')
// 固定数据目录名，避免打包后因 productName 变化导致数据目录漂移
if (app.isPackaged) app.setName('agent-team-desktop')

/** @type {import('child_process').ChildProcess | null} */
let backend = null
let backendPort = null
let backendToken = null
let quitting = false

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port
      srv.close(() => resolve(port))
    })
    srv.on('error', reject)
  })
}

function javaExecutable() {
  // 打包时可将 jlink 裁剪的 JRE 放到 resources/jre，自动优先使用
  const bundled = path.join(RESOURCE_ROOT, 'jre', 'bin', process.platform === 'win32' ? 'java.exe' : 'java')
  return fs.existsSync(bundled) ? bundled : 'java'
}

/** 本地访问令牌：首次启动生成并持久化，防止本机其他进程/网页访问后端 */
function loadOrCreateToken() {
  const file = path.join(app.getPath('userData'), 'token')
  if (fs.existsSync(file)) {
    const token = fs.readFileSync(file, 'utf8').trim()
    if (token) return token
  }
  const token = crypto.randomBytes(32).toString('hex')
  fs.writeFileSync(file, token, { encoding: 'utf8' })
  return token
}

async function startBackend() {
  const userData = app.getPath('userData')
  const toUrl = (p) => p.replace(/\\/g, '/')
  const dbUrl = `jdbc:sqlite:${toUrl(path.join(userData, 'data', 'agent_team.db'))}`

  const args = [
    '-jar',
    path.join(RESOURCE_ROOT, 'server', 'agent-team-server.jar'),
    `--server.port=${backendPort}`,
    `--spring.datasource.url=${dbUrl}`,
    `--app.workspace.root=${path.join(userData, 'workspace')}`,
    `--app.security.token=${backendToken}`,
  ]

  backend = spawn(javaExecutable(), args, { stdio: ['ignore', 'pipe', 'pipe'] })
  backend.stdout.on('data', (d) => process.stdout.write(`[server] ${d}`))
  backend.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`))
  backend.on('exit', (code) => {
    if (!quitting) {
      // 后端意外退出：提示并退出应用，避免窗口处于不可用状态
      dialog.showErrorBox('服务异常', `后端服务意外退出（code=${code}），应用即将关闭。`)
      app.quit()
    }
  })

  // 健康检查：/api/user 返回即就绪（空库会自动建默认用户）
  const url = `http://127.0.0.1:${backendPort}/api/user`
  const deadline = Date.now() + 60_000
  for (;;) {
    if (backend.exitCode !== null) throw new Error('后端进程在启动过程中退出')
    if (Date.now() > deadline) throw new Error('后端服务启动超时')
    try {
      const res = await fetch(url, { headers: { 'X-AT-Token': backendToken } })
      if (res.ok) return
    } catch { /* 尚未就绪，继续等待 */ }
    await new Promise((r) => setTimeout(r, 500))
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    autoHideMenuBar: true,
    title: '智群 AgentTeam',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      additionalArguments: backendPort
        ? [`--agentteam-api=http://127.0.0.1:${backendPort}`, `--agentteam-token=${backendToken}`]
        : [],
    },
  })

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173')
    win.show()
  } else {
    // 先显示启动等待页，后端就绪后由 whenReady 切换到前端
    win.loadFile(path.join(__dirname, 'boot.html'))
    win.show()
  }
  return win
}

// ---------- 数据备份/恢复（设置页「数据管理」通过 preload 调用） ----------

/** 调用本地后端 API（自动携带访问令牌） */
async function backendApi(pathname) {
  const res = await fetch(`http://127.0.0.1:${backendPort}${pathname}`, {
    headers: { 'X-AT-Token': backendToken },
  })
  if (!res.ok) throw new Error(`后端接口 ${pathname} 返回 ${res.status}`)
  return res
}

/** 未显式指定目录时弹系统目录选择框 */
async function pickDir(title, specified) {
  if (specified) return specified
  const [win] = BrowserWindow.getAllWindows()
  const r = await dialog.showOpenDialog(win, {
    title,
    properties: ['openDirectory', 'createDirectory'],
  })
  return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0]
}

/**
 * 导出备份：数据库快照（后端 VACUUM INTO，含未落 WAL 的数据）+ workspace/ 拷入目标目录。
 * 传入 targetDir 可跳过弹窗（自动化测试用）。
 */
ipcMain.handle('data:export', async (_e, targetDir) => {
  try {
    const dir = await pickDir('选择备份保存位置', targetDir)
    if (!dir) return { canceled: true }
    const res = await backendApi('/api/settings/backup/database')
    fs.writeFileSync(path.join(dir, 'agent_team.db'), Buffer.from(await res.arrayBuffer()))
    const wsSrc = path.join(app.getPath('userData'), 'workspace')
    if (fs.existsSync(wsSrc)) fs.cpSync(wsSrc, path.join(dir, 'workspace'), { recursive: true })
    return { ok: true, dir }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

/**
 * 从备份目录恢复：校验 → 确认 → 停后端 → 覆盖数据库（含清除 -wal/-shm 残留）与 workspace → 整体重启。
 * 传入 backupDir 可跳过弹窗（自动化测试用）。
 */
ipcMain.handle('data:import', async (_e, backupDir) => {
  try {
    const dir = await pickDir('选择备份目录', backupDir)
    if (!dir) return { canceled: true }
    const dbSrc = path.join(dir, 'agent_team.db')
    if (!fs.existsSync(dbSrc)) {
      return { ok: false, error: '所选目录中没有 agent_team.db，不是有效的备份目录' }
    }
    const [win] = BrowserWindow.getAllWindows()
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning',
      message: '确定从该备份恢复吗？',
      detail: `将覆盖当前全部数据（数据库与工作区文件），完成后应用会自动重启：\n${dir}`,
      buttons: ['取消', '恢复并重启'],
      defaultId: 1,
      cancelId: 0,
    })
    if (response !== 1) return { canceled: true }

    const dataDir = path.join(app.getPath('userData'), 'data')
    fs.mkdirSync(dataDir, { recursive: true })
    // 停后端：先置 quitting，避免触发"后端意外退出"弹窗
    quitting = true
    if (backend && backend.exitCode === null) {
      backend.kill()
      await new Promise((resolve) => backend.once('exit', resolve))
    }
    // WAL/SHM 残留会污染恢复后的库，必须一并清掉
    for (const suffix of ['', '-wal', '-shm']) {
      fs.rmSync(path.join(dataDir, `agent_team.db${suffix}`), { force: true })
    }
    fs.copyFileSync(dbSrc, path.join(dataDir, 'agent_team.db'))
    // 工作区与备份保持一致：先清空，备份里有才拷入
    const wsSrc = path.join(dir, 'workspace')
    const wsDest = path.join(app.getPath('userData'), 'workspace')
    fs.rmSync(wsDest, { recursive: true, force: true })
    if (fs.existsSync(wsSrc)) fs.cpSync(wsSrc, wsDest, { recursive: true })

    app.relaunch()
    app.exit(0)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('data:open-dir', async () => {
  await shell.openPath(app.getPath('userData'))
  return { ok: true }
})

// ---------- 原生文件选择（系统资源管理器对话框） ----------

/**
 * mode=file：openFile，multi 时可多选；mode=dir：openDirectory。
 * 返回路径数组（目录也是数组单项）；取消返回 null。
 */
ipcMain.handle('dialog:pick', async (_e, opts) => {
  const { mode = 'file', title, defaultPath, multi = false } = opts ?? {}
  const [win] = BrowserWindow.getAllWindows()
  const r = await dialog.showOpenDialog(win, {
    title: title ?? (mode === 'dir' ? '选择文件夹' : '选择文件'),
    defaultPath: defaultPath || undefined,
    properties:
      mode === 'dir'
        ? ['openDirectory', 'createDirectory']
        : multi
          ? ['openFile', 'multiSelections']
          : ['openFile'],
  })
  return r.canceled || r.filePaths.length === 0 ? null : r.filePaths
})

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(async () => {
    if (isDev) {
      createWindow()
    } else {
      try {
        // 端口与令牌必须在创建窗口前确定：webPreferences.additionalArguments 只能创建时传入
        backendPort = await getFreePort()
        backendToken = loadOrCreateToken()
        const win = createWindow()
        await startBackend()
        win.loadFile(path.join(RESOURCE_ROOT, 'web', 'index.html'))
      } catch (err) {
        dialog.showErrorBox('启动失败', `后端服务未能启动：\n${err.message}`)
        app.quit()
        return
      }
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('before-quit', () => {
    quitting = true
    if (backend && backend.exitCode === null) backend.kill()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
