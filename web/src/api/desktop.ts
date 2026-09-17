/** Electron 桌面壳通过 preload 注入的原生能力（window.agentTeam） */
export interface DesktopBridge {
  apiBase: string
  token: string
  /** 桌面壳平台（process.platform），浏览器模式无此字段 */
  platform?: string
  /** 数据管理 */
  exportBackup: (targetDir?: string) => Promise<{ ok: boolean; dir?: string; error?: string; canceled?: boolean }>
  importBackup: (backupDir?: string) => Promise<{ ok: boolean; error?: string; canceled?: boolean }>
  openDataDir: () => Promise<{ ok: boolean }>
  /** 原生文件选择：返回所选路径数组，取消返回 null */
  pickFiles: (opts?: { title?: string; defaultPath?: string; multi?: boolean }) => Promise<string[] | null>
  pickDirectory: (opts?: { title?: string; defaultPath?: string }) => Promise<string | null>
  /** 拖拽文件转本机绝对路径（同步），仅桌面模式可用 */
  pathForFile?: (file: File) => string
  /** 自绘红绿灯（macOS）：窗口最小化 / 缩放 */
  windowMinimize: () => void
  windowToggleMaximize: () => void
  /** 关闭确认：界面就绪上报后，点关闭由前端弹应用内确认框 */
  closeUiReady: () => void
  onCloseRequest: (cb: () => void) => void
  closeChoice: (choice: 'minimize' | 'quit') => void
}

export const desktop = (window as any).agentTeam as DesktopBridge

/** 从路径提取文件/文件夹名（兼容 \ 与 /） */
export function pathBasename(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '')
  const idx = Math.max(trimmed.lastIndexOf('\\'), trimmed.lastIndexOf('/'))
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed
}
