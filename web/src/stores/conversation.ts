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
  listTaskConversations,
  markRead,
  pinConversation,
  removeMember,
  renameConversation,
  resetMessages,
  sendMessageStream,
  setConversationMode,
  subscribeConversationEvents,
} from '@/api/conversation'
import type { SendStreamHandlers } from '@/api/conversation'
import { useAgentStore } from '@/stores/agent'

export const useConversationStore = defineStore('conversation', () => {
  const agentStore = useAgentStore()

  const conversations = ref<Conversation[]>([])
  /** 定时任务会话（category=task 的线程/群），只在任务页使用 */
  const taskConversations = ref<Conversation[]>([])
  const messagesMap = ref<Record<string, Message[]>>({})
  const activeId = ref<string | null>(null)
  /** 任务会话内按任务筛选消息（taskId，null=全部） */
  const taskFilter = ref<string | null>(null)
  const typingByConv = ref<Record<string, boolean>>({})
  /** 会话 -> 正在协调的编排者 agentId */
  const orchestratingByConv = ref<Record<string, string>>({})
  /** 会话 -> 是否正在自由讨论接龙 */
  const discussingByConv = ref<Record<string, boolean>>({})
  /** 会话 -> 正在生成图片的智能体名（generate_image 执行窗口，结束即清除） */
  const imageGenByConv = ref<Record<string, string>>({})
  /** 会话 -> 待用户决定的受控操作审批请求（智能体调用 write/edit/execute 时产生） */
  const opRequestsByConv = ref<Record<string, OpRequest[]>>({})
  /** 会话 -> 即将发言的智能体（reply_pending 到 reply_start 的思考窗口，独立思考条据此显示是谁） */
  const pendingReplyByConv = ref<Record<string, string>>({})

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
    return conversations.value.find((c) => c.id === id) ?? taskConversations.value.find((c) => c.id === id)
  }

  async function loadConversations() {
    conversations.value = await listConversations()
    pruneMessages()
  }

  /** 任务页左侧列表：定时任务会话（服务端按最近消息倒序返回） */
  async function loadTaskConversations() {
    taskConversations.value = await listTaskConversations()
  }

  async function setActive(id: string) {
    activeId.value = id
    await openMessages(id)
  }

  function setTaskFilter(taskId: string | null) {
    taskFilter.value = taskId
    if (activeId.value) openMessages(activeId.value).catch(() => {})
  }

  async function openMessages(id: string) {
    // 记录请求时的筛选条件：响应回来若筛选已变（快速切换任务/会话），丢弃本次结果，
    // 避免旧条件的（可能为空的）结果覆盖新内容——表现为内容闪一下后消失
    const filter = taskFilter.value ?? undefined
    const page = await listMessages(id, undefined, 50, filter)
    if (activeId.value !== id) return
    if ((taskFilter.value ?? undefined) !== filter) return
    const existing = messagesMap.value[id] ?? []
    // 合并而非整体替换：流式中的消息要等段落收尾才落库，服务端副本内容为空，
    // 直接替换会丢掉已累积的增量（切走再切回时输出消失，直到 reply_end 全文覆盖才恢复）。
    // 同 ID 保留内容更完整的一份（即本地流式对象，后续 delta 继续拼在它上面）
    messagesMap.value[id] = page.list.map((m) => {
      const local = existing.find((e) => e.id === m.id)
      return local && local.content.length > m.content.length ? local : m
    })
    const conv = findConv(id)
    if (conv && conv.unreadCount > 0) {
      conv.unreadCount = 0
      markRead(id).catch(() => {})
    }
  }

  function pruneMessages() {
    // 任务线程的消息缓存也要保留：否则任何一次 loadConversations
    // （如切换任务会话时上一会话的 finish）都会把任务页正在看的内容清空
    const ids = new Set(
      [...conversations.value, ...taskConversations.value].map((c) => c.id),
    )
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

  /** 一轮流式回复的公共事件处理：本地发送（doSend）与任务扇出订阅（watchConversation）共用 */
  function streamHandlers(conversationId: string) {
    // 编排协作时消息可能进入新建的项目群，结束时要清理这些会话的 typing/coordination 状态
    const typingCids = new Set<string>([conversationId])
    const coordCids = new Set<string>()
    const imgCids = new Set<string>()
    const state = { needsResync: false }
    const cidOf = (e: { conversationId?: string }) => e.conversationId ?? conversationId
    const handlers: SendStreamHandlers = {
      onUserMessage: (msg) => pushMessage(msg),
      onReplyStart: (e) => {
        const cid = cidOf(e)
        typingByConv.value[cid] = true
        typingCids.add(cid)
        // 占位气泡出现，思考窗口结束，气泡内打字点接管
        delete pendingReplyByConv.value[cid]
        // 观察者重连时后端会重放进行中的段（reply_start），本地已有同 ID 气泡则不重复插
        const list = messagesMap.value[cid] ?? []
        if (list.some((m) => m.id === e.messageId)) return
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
        if (!msg) return
        // replay 标记的是重连时补发的该段全量快照（本地在断开期间的增量已不可信），替换而非追加
        if (e.replay) msg.content = e.delta
        else msg.content += e.delta
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
          state.needsResync = true
        }
      },
      onConversationCreated: (conv) => {
        replaceConv(conv)
        loadTaskConversations().catch(() => {})
      },
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
      onReplyPending: (e) => {
        pendingReplyByConv.value[e.conversationId] = e.agentId
      },
      onImageStart: (e) => {
        imageGenByConv.value[e.conversationId] = e.agentName
        imgCids.add(e.conversationId)
      },
      onImageEnd: (e) => {
        delete imageGenByConv.value[e.conversationId]
      },
    }
    async function finish() {
      for (const cid of typingCids) {
        typingByConv.value[cid] = false
        delete pendingReplyByConv.value[cid]
      }
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
      loadTaskConversations().catch(() => {})
      if (state.needsResync && activeId.value === conversationId) {
        openMessages(conversationId).catch(() => {})
      }
    }
    return { handlers, finish }
  }

  async function doSend(conversationId: string, content: string, attachments: Attachment[]) {
    const { handlers, finish } = streamHandlers(conversationId)
    try {
      // 思考中状态从发出消息即开始（此前要到 reply_start 才置位，而 reply_start 与首个
      // 文本增量几乎同时到达，动画基本不可见），直到本轮流式回复结束由 finally 清理
      typingByConv.value[conversationId] = true
      await sendMessageStream(conversationId, content, handlers, attachments)
    } finally {
      await finish()
    }
  }

  /**
   * 常驻订阅会话的扇出事件：定时任务触发的回合没有任何本地发送方，
   * 正在查看该会话的前端靠它实时看到流式输出。返回取消订阅函数。
   */
  function watchConversation(conversationId: string): () => void {
    // 重挂载（切走再切回）时先清掉上一订阅可能残留的会话状态：后端会在注册观察者时
    // 重放仍在进行的协作与流中回复；回合已结束则保持干净，避免残留的协作条/思考指示
    delete orchestratingByConv.value[conversationId]
    delete discussingByConv.value[conversationId]
    typingByConv.value[conversationId] = false
    delete pendingReplyByConv.value[conversationId]
    const { handlers, finish } = streamHandlers(conversationId)
    // 回合结束（done 事件）才做收尾清理；取消订阅≠回合结束，切走时协作可能仍在进行
    handlers.onDone = () => finish().catch(() => {})
    const stop = subscribeConversationEvents(conversationId, handlers)
    return () => stop()
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
    findConv,
    typingByConv,
    isTyping,
    imageGenByConv,
    isGeneratingImage,
    orchestratingByConv,
    isCoordinating,
    discussingByConv,
    isDiscussing,
    opRequestsByConv,
    pendingReplyByConv,
    pendingOpRequests,
    decideOpRequest,
    clearOpRequests,
    loadConversations,
    taskConversations,
    loadTaskConversations,
    setActive,
    taskFilter,
    setTaskFilter,
    watchConversation,
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
