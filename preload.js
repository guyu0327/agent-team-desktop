const { contextBridge, ipcRenderer, webUtils } = require('electron')

// main 通过 webPreferences.additionalArguments 传入桌面模式下的本地后端地址与访问令牌；
// Vite 开发模式没有这些参数，前端走同源代理且后端不校验令牌
const readArg = (name) => {
  const prefix = `--agentteam-${name}=`
  const arg = process.argv.find((a) => a.startsWith(prefix))
  return arg ? arg.slice(prefix.length) : null
}

contextBridge.exposeInMainWorld('agentTeam', {
  apiBase: readArg('api'),
  token: readArg('token'),
  // 桌面壳平台（process.platform），前端据此做 macOS 布局适配；浏览器模式无此字段
  platform: process.platform,
  // 数据管理（非桌面模式下为 undefined，设置页据此隐藏入口）
  exportBackup: (targetDir) => ipcRenderer.invoke('data:export', targetDir ?? null),
  importBackup: (backupDir) => ipcRenderer.invoke('data:import', backupDir ?? null),
  openDataDir: () => ipcRenderer.invoke('data:open-dir'),
  // 原生文件选择：pickFiles 返回路径数组，pickDirectory 返回单个路径，取消均返回 null
  pickFiles: (opts) => ipcRenderer.invoke('dialog:pick', { mode: 'file', ...opts }),
  pickDirectory: (opts) =>
    ipcRenderer.invoke('dialog:pick', { mode: 'dir', ...opts }).then((r) => (r ? r[0] : null)),
  // 拖拽文件转本机绝对路径（Electron 44 起 File.path 已移除）；非桌面模式下无此方法
  pathForFile: (file) => webUtils.getPathForFile(file),
  // 自绘红绿灯（macOS）：侧边栏顶部按钮触发的窗口控制
  windowMinimize: () => ipcRenderer.send('win:minimize'),
  windowToggleMaximize: () => ipcRenderer.send('win:toggle-maximize'),
  // 关闭确认：主进程拦截关闭后通知前端弹应用内样式的确认框，前端回报用户选择；
  // 界面挂载后先上报就绪，此后点关闭不再走原生对话框
  closeUiReady: () => ipcRenderer.send('app:close-ui-ready'),
  onCloseRequest: (cb) => ipcRenderer.on('app:close-request', () => cb()),
  closeChoice: (choice) => ipcRenderer.send('app:close-choice', choice),
})
