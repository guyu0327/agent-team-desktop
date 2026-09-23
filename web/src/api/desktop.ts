import { t } from '@/i18n'

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
  /** 用系统默认方式打开本机文件/文件夹（工作区文件快捷打开） */
  openPath?: (p: string) => Promise<{ ok: boolean; error?: string }>
  /** 判定路径是否文件夹（粘贴附件时 File API 区分不了） */
  statPath?: (p: string) => Promise<{ ok: boolean; isDir?: boolean }>
  /** 无源剪贴板图片（截图等）落盘临时文件，返回可附件化路径 */
  saveClipboardImage?: (buf: Uint8Array) => Promise<{ ok: boolean; path?: string; error?: string }>
  /** 原生文件选择：返回所选路径数组，取消返回 null */
  pickFiles: (opts?: { title?: string; defaultPath?: string; multi?: boolean }) => Promise<string[] | null>
  pickDirectory: (opts?: { title?: string; defaultPath?: string }) => Promise<string | null>
  /** 文本另存为：系统保存对话框选位置后写入（聊天记录导出等），取消返回 canceled */
  saveTextFile?: (
    defaultName: string,
    content: string,
  ) => Promise<{ ok?: boolean; path?: string; error?: string; canceled?: boolean }>
  /** 系统设置：开机自启。getLoginItem 返回当前状态；setLoginItem 切换并返回实际生效状态 */
  getLoginItem?: () => Promise<boolean>
  setLoginItem?: (open: boolean) => Promise<boolean>
  /** 系统设置：切换主题外观（同步原生标题栏配色并持久化），返回实际生效主题 */
  setTheme?: (theme: 'dark' | 'light') => Promise<'dark' | 'light'>
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

/** 用系统默认方式打开本机文件/文件夹；返回错误文案，null 表示成功（浏览器模式不支持） */
export async function openLocalPath(path: string): Promise<string | null> {
  if (!desktop?.openPath) return t('common.openDesktopOnly')
  const r = await desktop.openPath(path)
  return r?.ok ? null : r?.error || t('common.openFailed')
}

/** 从路径提取文件/文件夹名（兼容 \ 与 /） */
export function pathBasename(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '')
  const idx = Math.max(trimmed.lastIndexOf('\\'), trimmed.lastIndexOf('/'))
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed
}
