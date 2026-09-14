import { request } from './http'
import type { AsrStreamSettings } from '@/types'

export function getAsrStreamSettings(): Promise<AsrStreamSettings> {
  return request('/settings/asr-stream')
}

export function updateAsrStreamSettings(draft: AsrStreamSettings): Promise<AsrStreamSettings> {
  return request('/settings/asr-stream', { method: 'PUT', body: draft })
}
