import { request } from './http'

export interface AppLogItem {
  id: string
  type: string
  conversationId: string | null
  agentId: string | null
  content: string
  createdAt: number
}

export interface AppLogPage {
  list: AppLogItem[]
  hasMore: boolean
}

export function listLogs(params: {
  type?: string
  from?: number
  to?: number
  page?: number
  pageSize?: number
}): Promise<AppLogPage> {
  const query = new URLSearchParams()
  if (params.type) query.set('type', params.type)
  if (params.from != null) query.set('from', String(params.from))
  if (params.to != null) query.set('to', String(params.to))
  query.set('page', String(params.page ?? 1))
  query.set('pageSize', String(params.pageSize ?? 50))
  return request(`/logs?${query.toString()}`)
}
