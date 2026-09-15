import type { FileGrant, FileListing } from '@/types'
import { request } from './http'

/** 浏览服务器目录；path 为空返回盘符根视图 */
export function listDir(path?: string): Promise<FileListing> {
  const query = path ? `?path=${encodeURIComponent(path)}` : ''
  return request(`/fs/list${query}`)
}

export function listFileGrants(conversationId: string): Promise<FileGrant[]> {
  return request(`/conversations/${conversationId}/files`)
}

export function revokeFile(conversationId: string, path: string): Promise<{ deleted: boolean }> {
  return request(`/conversations/${conversationId}/files?path=${encodeURIComponent(path)}`, {
    method: 'DELETE',
  })
}
