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
