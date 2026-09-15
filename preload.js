const { contextBridge, ipcRenderer } = require('electron')

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
  // 数据管理（非桌面模式下为 undefined，设置页据此隐藏入口）
  exportBackup: (targetDir) => ipcRenderer.invoke('data:export', targetDir ?? null),
  importBackup: (backupDir) => ipcRenderer.invoke('data:import', backupDir ?? null),
  openDataDir: () => ipcRenderer.invoke('data:open-dir'),
  // 原生文件选择：pickFiles 返回路径数组，pickDirectory 返回单个路径，取消均返回 null
  pickFiles: (opts) => ipcRenderer.invoke('dialog:pick', { mode: 'file', ...opts }),
  pickDirectory: (opts) =>
    ipcRenderer.invoke('dialog:pick', { mode: 'dir', ...opts }).then((r) => (r ? r[0] : null)),
})
