import { request } from './http'
import type { AnySearchSettings, AnySearchStatus } from '@/types'

export function getAnySearchSettings(): Promise<AnySearchStatus> {
  return request('/settings/anysearch')
}

export function updateAnySearchSettings(draft: AnySearchSettings): Promise<AnySearchStatus> {
  return request('/settings/anysearch', { method: 'PUT', body: draft })
}

export function clearAnySearchSettings(): Promise<AnySearchStatus> {
  return request('/settings/anysearch', { method: 'DELETE' })
}
