import type { FileGrant } from '@/types'
import { request } from './http'

export function listFileGrants(conversationId: string): Promise<FileGrant[]> {
  return request(`/conversations/${conversationId}/files`)
}

export function revokeFile(conversationId: string, path: string): Promise<{ deleted: boolean }> {
  return request(`/conversations/${conversationId}/files?path=${encodeURIComponent(path)}`, {
    method: 'DELETE',
  })
}
