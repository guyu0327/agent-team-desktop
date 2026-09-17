/**
 * 后端 API 地址与本地访问令牌。
 * 浏览器 / Vite 开发环境为空（同源，走代理或同域部署）；
 * Electron 桌面壳通过 preload 注入 window.agentTeam（跨域直连本地后端，需携带令牌）。
 */
const injected: { apiBase?: string; token?: string } = (window as any).agentTeam ?? {}

export const API_BASE: string = injected.apiBase ?? ''
export const API_TOKEN: string = injected.token ?? ''

/** 带 base 的 API 路径 */
export function apiUrl(path: string): string {
  return `${API_BASE}${path}`
}

/** 公共请求头（本地访问令牌） */
export function apiHeaders(extra?: Record<string, string>): Record<string, string> {
  return API_TOKEN ? { 'X-AT-Token': API_TOKEN, ...extra } : { ...extra }
}

/** 把后端地址转成 WebSocket host（空 base 时取当前页面 host，保持同源行为） */
export function apiWsHost(): string {
  if (!API_BASE) return location.host
  return API_BASE.replace(/^https?:\/\//, '').replace(/\/$/, '')
}

/** WebSocket 连接地址（附加令牌：浏览器 WebSocket 无法设置自定义头） */
export function apiWsUrl(path: string): string {
  const proto = API_BASE ? (API_BASE.startsWith('https') ? 'wss' : 'ws') : location.protocol === 'https:' ? 'wss' : 'ws'
  const sep = path.includes('?') ? '&' : '?'
  const token = API_TOKEN ? `${sep}token=${encodeURIComponent(API_TOKEN)}` : ''
  return `${proto}://${apiWsHost()}${path}${token}`
}
