import type { WorkspaceSettings } from '@/types'
import { request } from './http'

export function getWorkspaceSettings(): Promise<WorkspaceSettings> {
  return request('/settings/workspace')
}

export function updateWorkspaceSettings(root: string, extraDirs: string[]): Promise<WorkspaceSettings> {
  return request('/settings/workspace', { method: 'PUT', body: { root, extraDirs } })
}
