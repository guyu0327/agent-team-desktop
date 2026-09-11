import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Conversation, Message } from '@/types'
import {
  addMembers,
  createGroup as apiCreateGroup,
  createSingle,
  deleteConversation,
  listConversations,
  listMessages,
  markRead,
  pinConversation,
  removeMember,
  renameConversation,
  resetMessages,
  sendMessageStream,
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

  function isCoordinating(conversationId: string): boolean {
    return !!orchestratingByConv.value[conversationId]
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

  function sendMessage(content: string): Promise<void> {
    const conversationId = activeId.value
    if (!conversationId) return Promise.resolve()
    const prev = sendQueue.get(conversationId) ?? Promise.resolve()
    const task = prev.then(() => doSend(conversationId, content))
    sendQueue.set(
      conversationId,
      task.catch(() => {}),
    )
    return task
  }

  async function doSend(conversationId: string, content: string) {
    let needsResync = false
    // 编排协作时消息可能进入新建的项目群，结束时要清理这些会话的 typing/coordination 状态
    const typingCids = new Set<string>([conversationId])
    const coordCids = new Set<string>()
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
      })
    } finally {
      for (const cid of typingCids) typingByConv.value[cid] = false
      for (const cid of coordCids) delete orchestratingByConv.value[cid]
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
    if (activeId.value === conversationId) activeId.value = null
  }

  async function renameGroup(conversationId: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    await renameConversation(conversationId, trimmed)
    const conv = findConv(conversationId)
    if (conv) conv.name = trimmed
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

  async function createGroup(name: string, memberIds: string[]): Promise<Conversation> {
    const conv = await apiCreateGroup(name.trim() || '未命名群聊', memberIds)
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
    orchestratingByConv,
    isCoordinating,
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
    addGroupMembers,
    removeGroupMember,
  }
})
