import type { Conversation, Message } from '@/types'
import { request } from './http'

export interface MessagePage {
  list: Message[]
  hasMore: boolean
}

export function listConversations(): Promise<Conversation[]> {
  return request('/conversations')
}

export function createSingle(agentId: string): Promise<Conversation> {
  return request('/conversations/single', { method: 'POST', body: { agentId } })
}

export function createGroup(name: string, memberIds: string[]): Promise<Conversation> {
  return request('/conversations/group', { method: 'POST', body: { name, memberIds } })
}

export function renameConversation(id: string, name: string): Promise<void> {
  return request(`/conversations/${id}/name`, { method: 'PUT', body: { name } })
}

export function pinConversation(id: string, pinned: boolean): Promise<void> {
  return request(`/conversations/${id}/pin`, { method: 'PUT', body: { pinned } })
}

export function markRead(id: string): Promise<void> {
  return request(`/conversations/${id}/read`, { method: 'POST', body: {} })
}

export function addMembers(id: string, agentIds: string[]): Promise<Conversation> {
  return request(`/conversations/${id}/members`, { method: 'POST', body: { agentIds } })
}

export function removeMember(id: string, agentId: string): Promise<{ deleted: boolean }> {
  return request(`/conversations/${id}/members/${agentId}`, { method: 'DELETE' })
}

export function deleteConversation(id: string): Promise<void> {
  return request(`/conversations/${id}`, { method: 'DELETE' })
}

export function resetMessages(id: string): Promise<void> {
  return request(`/conversations/${id}/messages`, { method: 'DELETE' })
}

export function listMessages(id: string, before?: number, limit = 50): Promise<MessagePage> {
  const query = before !== undefined ? `?before=${before}&limit=${limit}` : `?limit=${limit}`
  return request(`/conversations/${id}/messages${query}`)
}

export interface SendStreamHandlers {
  onUserMessage?(msg: Message): void
  /** 消息所属会话由 e.conversationId 指定（编排协作时成员消息可能进入其他会话） */
  onReplyStart?(e: { messageId: string; agentId: string; conversationId?: string }): void
  onDelta?(e: { messageId: string; delta: string; conversationId?: string }): void
  onReplyEnd?(e: { messageId: string; agentId: string; content: string; conversationId?: string }): void
  onReplyError?(e: { messageId?: string; agentId?: string; error: string; conversationId?: string }): void
  /** 编排协作中后端新建了项目群 */
  onConversationCreated?(conv: Conversation): void
  /** 编排者开始/结束协调（会话级状态） */
  onCoordinationStart?(e: { agentId: string; conversationId: string }): void
  onCoordinationEnd?(e: { agentId: string; conversationId: string }): void
  onDone?(): void
}

interface SseBlock {
  event: string
  data: string
}

/**
 * 发送消息并消费后端 SSE 流。resolve 表示流正常走完（含 agent 回复出错但已持久化的情况）；
 * reject 仅在请求本身失败（网络/HTTP 错误）时发生。
 */
export async function sendMessageStream(
  conversationId: string,
  content: string,
  handlers: SendStreamHandlers,
): Promise<void> {
  const res = await fetch(`/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  if (!res.ok || !res.body) {
    let message = `发送失败 (${res.status})`
    try {
      const data = await res.json()
      if (typeof data?.message === 'string') message = data.message
    } catch {
      /* 非 JSON 错误体 */
    }
    throw new Error(message)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const block = parseBlock(buffer.slice(0, idx))
      buffer = buffer.slice(idx + 2)
      if (block) dispatch(block, handlers)
    }
  }
}

function parseBlock(block: string): SseBlock | null {
  let event = 'message'
  const dataLines: string[] = []
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
  }
  if (dataLines.length === 0) return null
  return { event, data: dataLines.join('\n') }
}

function dispatch(block: SseBlock, handlers: SendStreamHandlers) {
  let payload: any
  try {
    payload = JSON.parse(block.data)
  } catch {
    return
  }
  switch (block.event) {
    case 'user_message':
      handlers.onUserMessage?.(payload as Message)
      break
    case 'reply_start':
      handlers.onReplyStart?.(payload)
      break
    case 'delta':
      handlers.onDelta?.(payload)
      break
    case 'reply_end':
      handlers.onReplyEnd?.(payload)
      break
    case 'reply_error':
      handlers.onReplyError?.(payload)
      break
    case 'conversation_created':
      handlers.onConversationCreated?.(payload as Conversation)
      break
    case 'coordination_start':
      handlers.onCoordinationStart?.(payload)
      break
    case 'coordination_end':
      handlers.onCoordinationEnd?.(payload)
      break
    case 'done':
      handlers.onDone?.()
      break
  }
}
