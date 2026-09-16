import { request } from './http'
import type { AsrStreamSettings, AsrStreamStatus } from '@/types'

export function getAsrStreamSettings(): Promise<AsrStreamStatus> {
  return request('/settings/asr-stream')
}

export function updateAsrStreamSettings(draft: AsrStreamSettings): Promise<AsrStreamStatus> {
  return request('/settings/asr-stream', { method: 'PUT', body: draft })
}
