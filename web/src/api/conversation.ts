import type { Attachment, Conversation, Message, OpRequest } from '@/types'
import { t } from '@/i18n'
import { API_TOKEN, apiHeaders, apiUrl } from './base'
import { request } from './http'

export interface MessagePage {
  list: Message[]
  hasMore: boolean
}

export function listConversations(): Promise<Conversation[]> {
  return request('/conversations')
}

/** 定时任务会话（category=task），任务页左侧列表用 */
export function listTaskConversations(): Promise<Conversation[]> {
  return request('/tasks/conversations')
}

/** 历史会话（已归档）列表，按归档时间倒序；agentId 非空时只回与其绑定的会话 */
export function listArchivedConversations(agentId?: string): Promise<Conversation[]> {
  const query = agentId ? `?archived=true&agentId=${encodeURIComponent(agentId)}` : '?archived=true'
  return request(`/conversations${query}`)
}

/** 归档到历史会话（后端会先中断进行中的回复/协作） */
export function archiveConversation(id: string): Promise<void> {
  return request(`/conversations/${id}/archive`, { method: 'POST', body: {} })
}

/** 从历史会话恢复到消息列表（单聊冲突时原活跃会话自动入历史） */
export function restoreConversation(id: string): Promise<Conversation> {
  return request(`/conversations/${id}/restore`, { method: 'POST', body: {} })
}

/** 重置群聊：旧群归档进历史会话，原群名/成员/聊天模式重建新群 */
export function resetGroupConversation(id: string): Promise<Conversation> {
  return request(`/conversations/${id}/reset`, { method: 'POST', body: {} })
}

export function createSingle(agentId: string): Promise<Conversation> {
  return request('/conversations/single', { method: 'POST', body: { agentId } })
}

export function createGroup(
  name: string,
  memberIds: string[],
  chatMode: 'passive' | 'free' = 'passive',
): Promise<Conversation> {
  return request('/conversations/group', { method: 'POST', body: { name, memberIds, chatMode } })
}

export function renameConversation(id: string, name: string): Promise<void> {
  return request(`/conversations/${id}/name`, { method: 'PUT', body: { name } })
}

export function pinConversation(id: string, pinned: boolean): Promise<void> {
  return request(`/conversations/${id}/pin`, { method: 'PUT', body: { pinned } })
}

export function setConversationMode(id: string, mode: 'passive' | 'free'): Promise<void> {
  return request(`/conversations/${id}/mode`, { method: 'PUT', body: { mode } })
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

export function stopOrchestration(id: string): Promise<{ stopped: boolean }> {
  return request(`/conversations/${id}/stop`, { method: 'POST', body: {} })
}

/** 审批卡片决定受控操作：decision = once（允许一次）| conversation（本会话允许）| deny（拒绝） */
export function decideOperation(
  id: string,
  requestId: string,
  decision: 'once' | 'conversation' | 'deny',
): Promise<{ applied: boolean }> {
  return request(`/conversations/${id}/op-grant`, { method: 'POST', body: { requestId, decision } })
}

export function listMessages(id: string, before?: number, limit = 50, taskId?: string): Promise<MessagePage> {
  const params = new URLSearchParams()
  if (before !== undefined) params.set('before', String(before))
  params.set('limit', String(limit))
  if (taskId) params.set('taskId', taskId)
  return request(`/conversations/${id}/messages?${params.toString()}`)
}

export interface SendStreamHandlers {
  onUserMessage?(msg: Message): void
  /** 消息所属会话由 e.conversationId 指定（编排协作时成员消息可能进入其他会话） */
  onReplyStart?(e: { messageId: string; agentId: string; conversationId?: string }): void
  /** 一位成员即将开始回复（模型思考窗口，含接龙/依次回复的间隔期，比 reply_start 早） */
  onReplyPending?(e: { agentId: string; conversationId: string }): void
  onDelta?(e: { messageId: string; delta: string; conversationId?: string; replay?: boolean }): void
  onReplyEnd?(e: { messageId: string; agentId: string; content: string; conversationId?: string }): void
  onReplyError?(e: { messageId?: string; agentId?: string; error: string; conversationId?: string }): void
  /** 编排协作中后端新建了项目群 */
  onConversationCreated?(conv: Conversation): void
  /** 编排者开始/结束协调（会话级状态） */
  onCoordinationStart?(e: { agentId: string; conversationId: string }): void
  onCoordinationEnd?(e: { agentId: string; conversationId: string }): void
  /** 自由讨论接龙开始/结束（会话级状态） */
  onDiscussionStart?(e: { conversationId: string }): void
  onDiscussionEnd?(e: { conversationId: string }): void
  /** 受控操作审批请求（写入/修改/执行命令时触发，智能体原地等待决定） */
  onOpRequest?(e: OpRequest): void
  /** 文生图开始/结束（generate_image 执行窗口，按会话展示生成动画） */
  onImageStart?(e: { agentId: string; agentName: string; conversationId: string }): void
  onImageEnd?(e: { conversationId: string }): void
  /** 系统标注消息（微信通道切换处理智能体等），渲染为居中分隔条 */
  onSystemNote?(msg: Message): void
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
  attachments: Attachment[] = [],
): Promise<void> {
  const res = await fetch(apiUrl(`/api/conversations/${conversationId}/messages`), {
    method: 'POST',
    headers: apiHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ content, attachments: attachments.map((a) => ({ path: a.path })) }),
  })
  if (!res.ok || !res.body) {
    let message = `${t('chat.sendFailed')} (${res.status})`
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
    case 'reply_pending':
      handlers.onReplyPending?.(payload)
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
    case 'discussion_start':
      handlers.onDiscussionStart?.(payload)
      break
    case 'discussion_end':
      handlers.onDiscussionEnd?.(payload)
      break
    case 'op_request':
      handlers.onOpRequest?.(payload as OpRequest)
      break
    case 'image_start':
      handlers.onImageStart?.(payload)
      break
    case 'image_end':
      handlers.onImageEnd?.(payload)
      break
    case 'system_note':
      handlers.onSystemNote?.(payload as Message)
      break
    case 'done':
      handlers.onDone?.()
      break
  }
}

const STREAM_EVENTS = [
  'user_message', 'reply_start', 'reply_pending', 'delta', 'reply_end', 'reply_error',
  'conversation_created', 'coordination_start', 'coordination_end',
  'discussion_start', 'discussion_end', 'op_request', 'image_start', 'image_end',
  'system_note', 'done',
] as const

/**
 * 常驻订阅某会话的后端扇出事件（定时任务触发时实时可见）。
 * 返回取消订阅函数；令牌走 query 参数（EventSource 无法带自定义头）。
 */
export function subscribeConversationEvents(conversationId: string, handlers: SendStreamHandlers): () => void {
  const token = API_TOKEN ? `?token=${encodeURIComponent(API_TOKEN)}` : ''
  const es = new EventSource(apiUrl(`/api/conversations/${conversationId}/events${token}`))
  for (const name of STREAM_EVENTS) {
    es.addEventListener(name, (ev) => {
      dispatch({ event: name, data: (ev as MessageEvent).data ?? '' }, handlers)
    })
  }
  es.onerror = () => {
    // 后端异常收尾不发 done（连接直接断开）：按结束处理清掉「协作中」横幅；
    // 若回合实际仍在进行，EventSource 自动重连后由快照重放恢复状态
    handlers.onDone?.()
  }
  return () => es.close()
}
