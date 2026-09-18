import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { t } from '@/i18n'
import type { Attachment, Conversation, Message, OpRequest } from '@/types'
import {
  addMembers,
  archiveConversation as apiArchive,
  createGroup as apiCreateGroup,
  createSingle,
  decideOperation,
  deleteConversation,
  listConversations,
  listMessages,
  markRead,
  pinConversation,
  removeMember,
  renameConversation,
  resetMessages,
  sendMessageStream,
  setConversationMode,
} from '@/api/conversation'
import { useAgentStore } from '@/stores/agent'

export const useConversationStore = defineStore('conversation', () => {
  const agentStore = useAgentStore()

  const conversations = ref<Conversation[]>([])
  const messagesMap = ref<Record<string, Message[]>>({})
  const activeId = ref<string | null>(null)
  const typingByConv = ref<Record<string, boolean>>({})
  /** 会话 -> 正在协调的编排者 agentId */
  const orchestratingByConv = ref<Record<string, string>>({})
  /** 会话 -> 是否正在自由讨论接龙 */
  const discussingByConv = ref<Record<string, boolean>>({})
  /** 会话 -> 正在生成图片的智能体名（generate_image 执行窗口，结束即清除） */
  const imageGenByConv = ref<Record<string, string>>({})
  /** 会话 -> 待用户决定的受控操作审批请求（智能体调用 write/edit/execute 时产生） */
  const opRequestsByConv = ref<Record<string, OpRequest[]>>({})

  /** 同一会话的发送串行化，避免两次发送的回复流交错 */
  const sendQueue = new Map<string, Promise<void>>()

  const sortedConversations = computed(() =>
    [...conversations.value].sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1
      return (b.lastMessageTime ?? 0) - (a.lastMessageTime ?? 0)
    }),
  )

  const totalUnread = computed(() => conversations.value.reduce((sum, c) => sum + c.unreadCount, 0))

  const currentMessages = computed(() =>
    activeId.value ? (messagesMap.value[activeId.value] ?? []) : [],
  )

  function isTyping(conversationId: string): boolean {
    return !!typingByConv.value[conversationId]
  }

  /** 正在生成图片的智能体名，无则为空串 */
  function isGeneratingImage(conversationId: string): string {
    return imageGenByConv.value[conversationId] ?? ''
  }

  function isCoordinating(conversationId: string): boolean {
    return !!orchestratingByConv.value[conversationId]
  }

  function isDiscussing(conversationId: string): boolean {
    return !!discussingByConv.value[conversationId]
  }

  function pendingOpRequests(conversationId: string): OpRequest[] {
    return opRequestsByConv.value[conversationId] ?? []
  }

  function onOpRequest(e: OpRequest) {
    const list = opRequestsByConv.value[e.conversationId] ?? []
    if (!list.some((r) => r.requestId === e.requestId)) list.push(e)
    opRequestsByConv.value[e.conversationId] = list
  }

  function clearOpRequests(conversationId: string) {
    delete opRequestsByConv.value[conversationId]
  }

  /**
   * 审批卡片决定。「本会话允许」时后端会一并放行该会话同类型的其他待审批请求，
   * 这里同步关闭其余同类卡片；请求已超时失效（applied=false）时静默移除卡片，不再弹提示。
   */
  async function decideOpRequest(conversationId: string, request: OpRequest, decision: 'once' | 'conversation' | 'deny') {
    try {
      return await decideOperation(conversationId, request.requestId, decision)
    } finally {
      const list = opRequestsByConv.value[conversationId]
      if (!list) return
      const remaining = list.filter(
        (r) => (decision === 'conversation' ? r.opType !== request.opType : r.requestId !== request.requestId),
      )
      if (remaining.length > 0) opRequestsByConv.value[conversationId] = remaining
      else clearOpRequests(conversationId)
    }
  }

  function findConv(id: string): Conversation | undefined {
    return conversations.value.find((c) => c.id === id)
  }

  async function loadConversations() {
    conversations.value = await listConversations()
    pruneMessages()
  }

  async function setActive(id: string) {
    activeId.value = id
    await openMessages(id)
  }

  async function openMessages(id: string) {
    const page = await listMessages(id)
    if (activeId.value !== id) return
    messagesMap.value[id] = page.list
    const conv = findConv(id)
    if (conv && conv.unreadCount > 0) {
      conv.unreadCount = 0
      markRead(id).catch(() => {})
    }
  }

  function pruneMessages() {
    const ids = new Set(conversations.value.map((c) => c.id))
    for (const key of Object.keys(messagesMap.value)) {
      if (!ids.has(key)) delete messagesMap.value[key]
    }
  }

  function applyPreview(conv: Conversation, msg: Pick<Message, 'senderId' | 'senderType' | 'content' | 'timestamp'>) {
    if (!msg.content) return
    conv.lastMessage =
      conv.type === 'group' && msg.senderType === 'agent'
        ? `${agentStore.getById(msg.senderId)?.name ?? t('common.member')}: ${msg.content}`
        : msg.content
    conv.lastMessageTime = msg.timestamp
  }

  function pushMessage(msg: Message) {
    const list = messagesMap.value[msg.conversationId]
    if (list) list.push(msg)
    else messagesMap.value[msg.conversationId] = [msg]
    const conv = findConv(msg.conversationId)
    if (conv) {
      applyPreview(conv, msg)
      // 实时未读：非正在查看的会话，智能体新消息到达即计红点（口径同服务端：不含自己发的）
      if (msg.conversationId !== activeId.value && msg.senderType !== 'user') conv.unreadCount++
    }
  }

  function sendMessage(content: string, attachments: Attachment[] = []): Promise<void> {
    const conversationId = activeId.value
    if (!conversationId) return Promise.resolve()
    const prev = sendQueue.get(conversationId) ?? Promise.resolve()
    const task = prev.then(() => doSend(conversationId, content, attachments))
    sendQueue.set(
      conversationId,
      task.catch(() => {}),
    )
    return task
  }

  async function doSend(conversationId: string, content: string, attachments: Attachment[]) {
    let needsResync = false
    // 编排协作时消息可能进入新建的项目群，结束时要清理这些会话的 typing/coordination 状态
    const typingCids = new Set<string>([conversationId])
    const coordCids = new Set<string>()
    const imgCids = new Set<string>()
    const cidOf = (e: { conversationId?: string }) => e.conversationId ?? conversationId
    try {
      await sendMessageStream(conversationId, content, {
        onUserMessage: (msg) => pushMessage(msg),
        onReplyStart: (e) => {
          const cid = cidOf(e)
          typingByConv.value[cid] = true
          typingCids.add(cid)
          pushMessage({
            id: e.messageId,
            conversationId: cid,
            senderType: 'agent',
            senderId: e.agentId,
            content: '',
            timestamp: Date.now(),
            type: 'text',
          })
        },
        onDelta: (e) => {
          const msg = (messagesMap.value[cidOf(e)] ?? []).find((m) => m.id === e.messageId)
          if (msg) msg.content += e.delta
        },
        onReplyEnd: (e) => {
          const msg = (messagesMap.value[cidOf(e)] ?? []).find((m) => m.id === e.messageId)
          if (msg) msg.content = e.content
        },
        onReplyError: (e) => {
          if (e.messageId) {
            const msg = (messagesMap.value[cidOf(e)] ?? []).find((m) => m.id === e.messageId)
            if (msg) {
              msg.type = 'error'
              msg.content = e.error
            }
          } else {
            // 该错误消息已由后端持久化但前端没有其 ID，需要重拉消息对齐
            needsResync = true
          }
        },
        onConversationCreated: (conv) => replaceConv(conv),
        onCoordinationStart: (e) => {
          orchestratingByConv.value[e.conversationId] = e.agentId
          coordCids.add(e.conversationId)
        },
        onCoordinationEnd: (e) => {
          delete orchestratingByConv.value[e.conversationId]
          // 协作结束时后端已终止/唤醒全部审批等待，残留卡片均已失效
          clearOpRequests(e.conversationId)
        },
        onDiscussionStart: (e) => {
          discussingByConv.value[e.conversationId] = true
          coordCids.add(e.conversationId)
        },
        onDiscussionEnd: (e) => {
          delete discussingByConv.value[e.conversationId]
          clearOpRequests(e.conversationId)
        },
        onOpRequest: (e) => onOpRequest(e),
        onImageStart: (e) => {
          imageGenByConv.value[e.conversationId] = e.agentName
          imgCids.add(e.conversationId)
        },
        onImageEnd: (e) => {
          delete imageGenByConv.value[e.conversationId]
        },
      }, attachments)
    } finally {
      for (const cid of typingCids) typingByConv.value[cid] = false
      for (const cid of coordCids) delete orchestratingByConv.value[cid]
      for (const cid of imgCids) delete imageGenByConv.value[cid]
      try {
        // 协作/讨论会把消息写进原会话之外的新会话（如自动建的项目群）：
        // 凡此刻正在查看的会话都要标记已读，否则稍后 loadConversations 会用服务端
        // 旧计数把正在阅读的会话重新标成未读
        const touched = new Set<string>([...typingCids, ...coordCids, ...imgCids])
        for (const cid of touched) {
          if (activeId.value === cid) await markRead(cid)
        }
      } catch {
        /* 已读标记失败可忽略 */
      }
      loadConversations().catch(() => {})
      if (needsResync && activeId.value === conversationId) {
        openMessages(conversationId).catch(() => {})
      }
    }
  }

  async function togglePinned(conversationId: string) {
    const conv = findConv(conversationId)
    if (!conv) return
    const next = !conv.pinned
    conv.pinned = next
    try {
      await pinConversation(conversationId, next)
    } catch (e) {
      conv.pinned = !next
      throw e
    }
  }

  async function resetConversation(conversationId: string) {
    await resetMessages(conversationId)
    messagesMap.value[conversationId] = []
    delete opRequestsByConv.value[conversationId]
    const conv = findConv(conversationId)
    if (conv) {
      conv.lastMessage = ''
      conv.lastMessageTime = null
      conv.unreadCount = 0
    }
  }

  async function removeConversation(conversationId: string) {
    await deleteConversation(conversationId)
    conversations.value = conversations.value.filter((c) => c.id !== conversationId)
    delete messagesMap.value[conversationId]
    delete opRequestsByConv.value[conversationId]
    if (activeId.value === conversationId) activeId.value = null
  }

  async function renameGroup(conversationId: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    await renameConversation(conversationId, trimmed)
    const conv = findConv(conversationId)
    if (conv) conv.name = trimmed
  }

  async function setChatMode(conversationId: string, mode: 'passive' | 'free') {
    await setConversationMode(conversationId, mode)
    const conv = findConv(conversationId)
    if (conv) conv.chatMode = mode
  }

  async function addGroupMembers(conversationId: string, agentIds: string[]) {
    const conv = await addMembers(conversationId, agentIds)
    replaceConv(conv)
  }

  async function removeGroupMember(conversationId: string, agentId: string) {
    const res = await removeMember(conversationId, agentId)
    if (res.deleted) {
      conversations.value = conversations.value.filter((c) => c.id !== conversationId)
      delete messagesMap.value[conversationId]
      if (activeId.value === conversationId) activeId.value = null
    } else {
      await loadConversations()
    }
  }

  async function openConversationWith(agentId: string): Promise<string> {
    const conv = await createSingle(agentId)
    replaceConv(conv)
    return conv.id
  }

  async function createGroup(
    name: string,
    memberIds: string[],
    chatMode: 'passive' | 'free' = 'passive',
  ): Promise<Conversation> {
    const conv = await apiCreateGroup(name.trim() || t('message.unnamed'), memberIds, chatMode)
    conversations.value.push(conv)
    return conv
  }

  /** 后端已级联处理会话，这里只需重新对齐列表 */
  async function handleAgentRemoved() {
    await loadConversations()
    if (activeId.value && !findConv(activeId.value)) activeId.value = null
  }

  /** 归档到历史会话：本地清理与删除一致（后端会先中断进行中的回复/协作） */
  async function archiveConversation(conversationId: string) {
    await apiArchive(conversationId)
    conversations.value = conversations.value.filter((c) => c.id !== conversationId)
    delete messagesMap.value[conversationId]
    delete opRequestsByConv.value[conversationId]
    if (activeId.value === conversationId) activeId.value = null
  }

  function replaceConv(conv: Conversation) {
    const idx = conversations.value.findIndex((c) => c.id === conv.id)
    if (idx !== -1) conversations.value[idx] = conv
    else conversations.value.push(conv)
  }

  return {
    conversations,
    sortedConversations,
    totalUnread,
    currentMessages,
    activeId,
    typingByConv,
    isTyping,
    imageGenByConv,
    isGeneratingImage,
    orchestratingByConv,
    isCoordinating,
    discussingByConv,
    isDiscussing,
    opRequestsByConv,
    pendingOpRequests,
    decideOpRequest,
    clearOpRequests,
    loadConversations,
    setActive,
    sendMessage,
    pushMessage,
    openConversationWith,
    createGroup,
    handleAgentRemoved,
    togglePinned,
    resetConversation,
    removeConversation,
    archiveConversation,
    renameGroup,
    setChatMode,
    addGroupMembers,
    removeGroupMember,
  }
})
