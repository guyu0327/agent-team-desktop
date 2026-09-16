import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Attachment, Conversation, Message, OpRequest } from '@/types'
import {
  addMembers,
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

  /** 审批卡片决定；请求已超时失效时后端返回 applied=false，同样移除卡片 */
  async function decideOpRequest(conversationId: string, requestId: string, decision: 'once' | 'conversation' | 'deny') {
    try {
      return await decideOperation(conversationId, requestId, decision)
    } finally {
      const list = opRequestsByConv.value[conversationId]
      if (list) opRequestsByConv.value[conversationId] = list.filter((r) => r.requestId !== requestId)
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
        ? `${agentStore.getById(msg.senderId)?.name ?? '成员'}: ${msg.content}`
        : msg.content
    conv.lastMessageTime = msg.timestamp
  }

  function pushMessage(msg: Message) {
    const list = messagesMap.value[msg.conversationId]
    if (list) list.push(msg)
    else messagesMap.value[msg.conversationId] = [msg]
    const conv = findConv(msg.conversationId)
    if (conv) applyPreview(conv, msg)
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
        },
        onDiscussionStart: (e) => {
          discussingByConv.value[e.conversationId] = true
          coordCids.add(e.conversationId)
        },
        onDiscussionEnd: (e) => {
          delete discussingByConv.value[e.conversationId]
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
        if (activeId.value === conversationId) await markRead(conversationId)
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
    const conv = await apiCreateGroup(name.trim() || '未命名群聊', memberIds, chatMode)
    conversations.value.push(conv)
    return conv
  }

  /** 后端已级联处理会话，这里只需重新对齐列表 */
  async function handleAgentRemoved() {
    await loadConversations()
    if (activeId.value && !findConv(activeId.value)) activeId.value = null
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
    renameGroup,
    setChatMode,
    addGroupMembers,
    removeGroupMember,
  }
})
