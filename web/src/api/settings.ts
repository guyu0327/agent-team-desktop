import type { WorkspaceSettings } from '@/types'
import { request } from './http'

export function getWorkspaceSettings(): Promise<WorkspaceSettings> {
  return request('/settings/workspace')
}

export function updateWorkspaceSettings(root: string, extraDirs: string[]): Promise<WorkspaceSettings> {
  return request('/settings/workspace', { method: 'PUT', body: { root, extraDirs } })
}

export interface CoordinationLimits {
  overallMinutes: number
  memberMinutes: number
}

export function getCoordinationLimits(): Promise<CoordinationLimits> {
  return request('/settings/coordination')
}

export function updateCoordinationLimits(overallMinutes: number, memberMinutes: number): Promise<CoordinationLimits> {
  return request('/settings/coordination', { method: 'PUT', body: { overallMinutes, memberMinutes } })
}

export interface ContextCompression {
  enabled: boolean
  budgetChars: number
}

export function getContextCompression(): Promise<ContextCompression> {
  return request('/settings/context-compression')
}

export function updateContextCompression(enabled: boolean, budgetChars: number): Promise<ContextCompression> {
  return request('/settings/context-compression', { method: 'PUT', body: { enabled, budgetChars } })
}

/** 浏览器自动化设置：headless=false 时弹出真实浏览器窗口供用户围观 AI 操作；persistLogin 保持网站登录态；whitelist 域名免审批 */
export interface BrowserSettings {
  headless: boolean
  persistLogin: boolean
  whitelist: string[]
}

export function getBrowserSettings(): Promise<BrowserSettings> {
  return request('/settings/browser')
}

export function updateBrowserSettings(
  headless: boolean,
  persistLogin: boolean,
  whitelist: string[],
): Promise<BrowserSettings> {
  return request('/settings/browser', { method: 'PUT', body: { headless, persistLogin, whitelist } })
}
