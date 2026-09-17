<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useConversationStore } from '@/stores/conversation'
import { useUserStore } from '@/stores/user'
import { useAgentStore } from '@/stores/agent'
import { useModelPresetStore } from '@/stores/modelPreset'
import { alertAction, confirmAction } from '@/composables/confirm'
import { showSettings } from '@/composables/settingsModal'
import { stopOrchestration } from '@/api/conversation'
import type { Agent, Attachment, Message, OpRequest } from '@/types'
import MessageBubble from '@/components/common/MessageBubble.vue'
import FileGrantsPopover from '@/components/common/FileGrantsPopover.vue'
import ContextMenu from '@/components/common/ContextMenu.vue'
import ChatMenu from './components/ChatMenu.vue'
import Avatar from '@/components/common/Avatar.vue'
import { formatDividerTime } from '@/utils/time'
import { fsContentUrl, isImagePath } from '@/utils/image'
import { copyImage, copyText } from '@/utils/clipboard'
import { desktop, pathBasename } from '@/api/desktop'
import { useRealtimeVoice } from '@/composables/realtimeVoice'

const props = defineProps<{ id: string }>()

const conversationStore = useConversationStore()
const userStore = useUserStore()
const agentStore = useAgentStore()
const presetStore = useModelPresetStore()
const route = useRoute()
const router = useRouter()

const DIVIDER_GAP = 5 * 60 * 1000

const draft = ref('')
const listRef = ref<HTMLElement>()
const inputRef = ref<HTMLTextAreaElement>()
const menuOpen = ref(false)
const showGrants = ref(false)
const pendingAttachments = ref<Attachment[]>([])

// @ 成员自动补全：start 为草稿中 @ 的下标，query 为 @ 后到光标间的文本
const mention = ref<{ start: number; query: string } | null>(null)
const mentionIndex = ref(0)
// Esc 关闭后记录位置，光标未动前不再弹出
let mentionDismissed: { start: number; pos: number } | null = null

const conversation = computed(() =>
  conversationStore.conversations.find((c) => c.id === props.id),
)
const messages = computed(() => conversationStore.currentMessages)

watch(conversation, (conv) => {
  if (!conv && route.name === 'Chat') router.push('/chat')
})

const title = computed(() => {
  const conv = conversation.value
  if (!conv) return '聊天'
  if (conv.type === 'group') return conv.name
  const agent = conv.agentId ? agentStore.getById(conv.agentId) : undefined
  return agent?.name ?? '已删除的智能体'
})

const singleAgent = computed(() => {
  const conv = conversation.value
  return conv?.type === 'single' && conv.agentId
    ? (agentStore.getById(conv.agentId) ?? null)
    : null
})

const coordinator = computed(() => {
  if (!conversationStore.isCoordinating(props.id)) return null
  const agentId = conversationStore.orchestratingByConv[props.id]
  return agentId ? (agentStore.getById(agentId) ?? null) : null
})

const discussing = computed(() => conversationStore.isDiscussing(props.id))

const imageAgentName = computed(() => conversationStore.isGeneratingImage(props.id))

// 消息气泡右键菜单：imgSrc 非空表示右键点在气泡内的图片上，额外提供复制图片
const msgCtx = ref<{ x: number; y: number; msg: Message; imgSrc: string | null } | null>(null)

function openMsgCtx(e: MouseEvent, msg: Message) {
  const imgEl = (e.target as HTMLElement | null)?.closest('img') as HTMLImageElement | null
  msgCtx.value = { x: e.clientX, y: e.clientY, msg, imgSrc: imgEl?.getAttribute('src') ?? null }
}

const msgCtxItems = computed(() => {
  if (!msgCtx.value) return []
  const items = [{ key: 'copy-text', label: '复制文字' }]
  if (msgCtx.value.imgSrc) items.push({ key: 'copy-image', label: '复制图片' })
  return items
})

async function onMsgCtxSelect(key: string) {
  const ctx = msgCtx.value
  if (!ctx) return
  try {
    if (key === 'copy-text') {
      await copyText(ctx.msg.content)
    } else if (key === 'copy-image' && ctx.imgSrc) {
      await copyImage(ctx.imgSrc)
    }
  } catch (err) {
    alertAction(err instanceof Error ? err.message : '复制失败')
  }
}

const pendingRequests = computed(() => conversationStore.pendingOpRequests(props.id))

const OP_TITLES: Record<OpRequest['opType'], string> = {
  write: '请求写入文件',
  edit: '请求修改文件',
  shell: '请求执行终端命令',
}

async function decideOp(r: OpRequest, decision: 'once' | 'conversation' | 'deny') {
  try {
    const res = await conversationStore.decideOpRequest(props.id, r.requestId, decision)
    if (!res.applied) alertAction('该请求已失效（等待超时或已被处理）')
  } catch (err) {
    alertAction(err instanceof Error ? err.message : '操作失败')
  }
}

const configTip = computed(() => {
  const agent = singleAgent.value
  if (!agent) return null
  const preset = agent.presetId ? presetStore.findById(agent.presetId) : undefined
  if (!preset) return `「${agent.name}」还未关联模型预设`
  if (!preset.baseUrl.trim() || !preset.hasKey) {
    return `「${agent.name}」的模型预设缺少 API 地址或 Key`
  }
  return null
})

const inputPlaceholder = computed(() => {
  if (conversation.value?.type === 'group') {
    return '输入消息，@成员名 可指定回答，Enter 发送'
  }
  return '输入消息，Enter 发送，Shift+Enter 换行'
})

const memberAgents = computed<Agent[]>(() => {
  const conv = conversation.value
  if (conv?.type !== 'group') return []
  return conv.memberIds
    .map((id) => agentStore.getById(id))
    .filter((a): a is Agent => !!a)
})

const mentionCandidates = computed(() => {
  if (!mention.value) return []
  const q = mention.value.query.toLowerCase()
  return memberAgents.value.filter((m) => m.name.toLowerCase().includes(q))
})

watch(mentionCandidates, () => {
  mentionIndex.value = 0
})

function syncMention() {
  const el = inputRef.value
  const conv = conversation.value
  if (!el || conv?.type !== 'group') {
    mention.value = null
    return
  }
  const pos = el.selectionStart ?? 0
  const at = draft.value.lastIndexOf('@', pos - 1)
  if (at === -1) {
    mention.value = null
    return
  }
  const fragment = draft.value.slice(at + 1, pos)
  if (/[\s@]/.test(fragment)) {
    mention.value = null
    return
  }
  if (mentionDismissed && mentionDismissed.start === at && mentionDismissed.pos === pos) {
    mention.value = null
    return
  }
  mentionDismissed = null
  if (mention.value?.start === at && mention.value.query === fragment) return
  mention.value = { start: at, query: fragment }
}

function pickMention(agent: Agent) {
  const m = mention.value
  const el = inputRef.value
  if (!m || !el) return
  const pos = el.selectionStart ?? draft.value.length
  const before = draft.value.slice(0, m.start)
  const after = draft.value.slice(pos)
  const insert = `@${agent.name} `
  draft.value = before + insert + after
  mention.value = null
  nextTick(() => {
    el.focus()
    const caret = (before + insert).length
    el.setSelectionRange(caret, caret)
  })
}

// 实时转写：按住麦克风说话，识别文本实时刷新到草稿尾部（tailLen 剥离法，不干扰用户编辑头部）
const {
  phase: rtPhase,
  streamText: rtStreamText,
  elapsed: rtElapsed,
  configured: rtConfigured,
  stopping: rtStopping,
  refreshConfigured: rtRefresh,
  start: rtStart,
  stop: rtStop,
  reset: rtReset,
} = useRealtimeVoice()

let rtTailLen = 0

watch(rtStreamText, (text) => {
  if (rtPhase.value === 'idle') return
  const cut = Math.min(rtTailLen, draft.value.length)
  draft.value = draft.value.slice(0, draft.value.length - cut) + text
  rtTailLen = text.length
})

watch(rtPhase, (p, old) => {
  if (old && old !== 'idle' && p === 'idle') {
    rtTailLen = 0
    nextTick(() => {
      const el = inputRef.value
      if (!el) return
      el.focus()
      el.setSelectionRange(draft.value.length, draft.value.length)
    })
  }
})

async function startRealtime() {
  rtTailLen = 0
  rtReset()
  await rtStart((message) => alertAction(message))
}

/** 按住说话：按下开始，任意位置松手结束（含 pointercancel） */
function onMicDown() {
  if (rtPhase.value !== 'idle') return
  if (!rtConfigured.value) {
    showSettings.value = true
    return
  }
  void startRealtime()
}

function onReleaseAnywhere() {
  if (rtPhase.value !== 'idle') rtStop()
}

onMounted(() => {
  void rtRefresh()
  window.addEventListener('pointerup', onReleaseAnywhere)
  window.addEventListener('pointercancel', onReleaseAnywhere)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerup', onReleaseAnywhere)
  window.removeEventListener('pointercancel', onReleaseAnywhere)
})

const micTitle = computed(() => {
  if (rtPhase.value === 'streaming') return rtStopping.value ? '转写收尾中…' : '松开结束'
  if (rtPhase.value === 'connecting') return '正在连接实时识别…'
  if (!rtConfigured.value) return '未配置实时语音识别，点击前往设置'
  return '按住说话，实时转写'
})

function shouldShowDivider(index: number): boolean {
  if (index === 0) return true
  return messages.value[index].timestamp - messages.value[index - 1].timestamp > DIVIDER_GAP
}

function isSelf(msg: Message): boolean {
  return msg.senderType === 'user'
}

function senderInfo(msg: Message): { name: string; avatar?: string } {
  if (isSelf(msg)) {
    return { name: userStore.user?.name ?? '我', avatar: userStore.user?.avatar }
  }
  const agent = agentStore.getById(msg.senderId)
  return { name: agent?.name ?? '未知智能体', avatar: agent?.avatar }
}

function senderBadge(msg: Message): string | undefined {
  if (isSelf(msg)) return undefined
  return agentStore.getById(msg.senderId)?.isOrchestrator ? '编排者' : undefined
}

/** 贴底自动滚动：用户上翻即暂停，滚回底部（或发消息/切会话）后恢复 */
const stickToBottom = ref(true)
let lastScrollTop = 0

function onListScroll() {
  const el = listRef.value
  if (!el) return
  const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
  if (distanceFromBottom < 40) {
    stickToBottom.value = true
  } else if (el.scrollTop < lastScrollTop) {
    // 只要向上滚就立即暂停，不设距离阈值
    stickToBottom.value = false
  }
  lastScrollTop = el.scrollTop
}

async function scrollToBottom() {
  if (!stickToBottom.value) return
  await nextTick()
  const el = listRef.value
  // nextTick 期间用户可能已向上滚动，滚动前再核对一次
  if (!el || !stickToBottom.value) return
  el.scrollTo({ top: el.scrollHeight })
  // 同步方向检测基准，避免残留 scrollTop 被误判为向上滚动
  lastScrollTop = el.scrollTop
}

async function forceScrollToBottom() {
  stickToBottom.value = true
  await scrollToBottom()
}

function jumpToBottom() {
  forceScrollToBottom()
}

watch(
  () => props.id,
  (id) => {
    if (!id) return
    mention.value = null
    pendingAttachments.value = []
    conversationStore.setActive(id)
    forceScrollToBottom()
  },
  { immediate: true },
)

watch(
  () => [messages.value.length, messages.value[messages.value.length - 1]?.content] as const,
  () => scrollToBottom(),
)

watch(imageAgentName, () => scrollToBottom())

async function handleSend() {
  const content = draft.value.trim()
  const attachments = pendingAttachments.value
  if (!content && attachments.length === 0) return
  draft.value = ''
  pendingAttachments.value = []
  mention.value = null
  forceScrollToBottom()
  try {
    await conversationStore.sendMessage(content, attachments)
  } catch (err) {
    draft.value = content
    pendingAttachments.value = attachments
    alertAction(err instanceof Error ? err.message : '发送失败')
  }
}

/** 路径加入附件：按 path 去重，文件按扩展名识别图片 */
function addEntries(entries: { path: string; type: 'file' | 'dir' }[]) {
  const fresh: Attachment[] = entries
    .filter(({ path }) => !pendingAttachments.value.some((a) => a.path === path))
    .map(({ path, type }) => ({
      path,
      type: type === 'dir' ? 'dir' : isImagePath(path) ? 'image' : 'file',
      name: pathBasename(path),
    }))
  pendingAttachments.value = [...pendingAttachments.value, ...fresh]
}

/** 原生对话框选中的路径加入附件 */
function addPaths(paths: string[], type: 'file' | 'dir') {
  addEntries(paths.map((path) => ({ path, type })))
}

async function pickFiles() {
  try {
    const paths = await desktop.pickFiles({ title: '选择文件', multi: true })
    if (paths) addPaths(paths, 'file')
  } catch (e) {
    alertAction(e instanceof Error ? e.message : '选择文件失败')
  }
}

async function pickFolder() {
  try {
    const dir = await desktop.pickDirectory({ title: '选择文件夹' })
    if (dir) addPaths([dir], 'dir')
  } catch (e) {
    alertAction(e instanceof Error ? e.message : '选择文件夹失败')
  }
}

function removeAttachment(path: string) {
  pendingAttachments.value = pendingAttachments.value.filter((a) => a.path !== path)
}

// 拖拽文件/文件夹到输入框添加附件：dragenter/leave 在子元素间成对触发，用计数器抵消
const dragDepth = ref(0)
const isDragging = computed(() => dragDepth.value > 0)

function hasFiles(e: DragEvent) {
  return Array.from(e.dataTransfer?.types ?? []).includes('Files')
}

function onDragEnter(e: DragEvent) {
  if (!hasFiles(e)) return
  dragDepth.value++
}

function onDragLeave() {
  dragDepth.value = Math.max(0, dragDepth.value - 1)
}

function onDragOver(e: DragEvent) {
  if (!hasFiles(e)) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  dragDepth.value = 0
  const items = e.dataTransfer?.items
  if (!items || items.length === 0) return
  if (!desktop.pathForFile) {
    alertAction('拖拽添加附件需在桌面客户端中使用')
    return
  }
  // entry 离开本事件即失效，必须同步消费，不得 await
  const entries: { path: string; type: 'file' | 'dir' }[] = []
  for (let i = 0; i < items.length; i++) {
    const entry = items[i].webkitGetAsEntry()
    const file = items[i].getAsFile()
    if (!file) continue
    const path = desktop.pathForFile(file)
    if (!path) continue
    entries.push({ path, type: entry?.isDirectory ? 'dir' : 'file' })
  }
  if (entries.length > 0) addEntries(entries)
}

async function handleStopCoordination() {
  const name = coordinator.value?.name
  const ok = await confirmAction({
    title: '终止',
    message: discussing.value
      ? '确定要终止正在进行的自由讨论吗？已产生的发言会保留。'
      : `确定要终止「${name ?? '编排者'}」正在进行的协作吗？已产生的输出会保留。`,
    confirmText: '终止',
    danger: true,
  })
  if (!ok) return
  try {
    const res = await stopOrchestration(props.id)
    if (!res.stopped) alertAction('当前没有进行中的协作')
  } catch (err) {
    alertAction(err instanceof Error ? err.message : '终止失败')
  }
}

function onKeydown(e: KeyboardEvent) {
  if (mentionCandidates.value.length > 0) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      mentionIndex.value = (mentionIndex.value + 1) % mentionCandidates.value.length
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      mentionIndex.value =
        (mentionIndex.value - 1 + mentionCandidates.value.length) % mentionCandidates.value.length
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      pickMention(mentionCandidates.value[mentionIndex.value])
      return
    }
    if (e.key === 'Escape') {
      const el = inputRef.value
      mentionDismissed =
        mention.value && el ? { start: mention.value.start, pos: el.selectionStart ?? 0 } : null
      mention.value = null
      return
    }
  }
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}
</script>

<template>
  <div class="chat-view">
    <header class="chat-header drag-region">
      <span class="title">
        {{ title }}
        <span v-if="conversation?.type === 'group'" class="member-count">
          （{{ conversation.memberIds.length }}人）
        </span>
      </span>
      <div class="more-wrap">
        <button class="more" title="聊天信息" @click.stop="menuOpen = !menuOpen">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <circle cx="5" cy="12" r="1.8" />
            <circle cx="12" cy="12" r="1.8" />
            <circle cx="19" cy="12" r="1.8" />
          </svg>
        </button>
        <ChatMenu
          v-if="menuOpen && conversation"
          :conversation="conversation"
          @close="menuOpen = false"
        />
      </div>
    </header>

    <div class="list-wrap">
      <div ref="listRef" class="message-list" @scroll="onListScroll">
        <template v-for="(msg, i) in messages" :key="msg.id">
          <div v-if="shouldShowDivider(i)" class="time-divider">
            {{ formatDividerTime(msg.timestamp) }}
          </div>
          <MessageBubble
            :message="msg"
            :self="isSelf(msg)"
            :sender-name="senderInfo(msg).name"
            :sender-avatar="senderInfo(msg).avatar"
            :badge="senderBadge(msg)"
            :show-name="conversation?.type === 'group' && !isSelf(msg)"
            :typing="conversationStore.isTyping(props.id) && i === messages.length - 1"
            @contextmenu.prevent="openMsgCtx($event, msg)"
          />
        </template>
        <ContextMenu
          v-if="msgCtx"
          :x="msgCtx.x"
          :y="msgCtx.y"
          :items="msgCtxItems"
          @select="onMsgCtxSelect"
          @close="msgCtx = null"
        />
        <div v-if="imageAgentName" class="image-gen-tip">
          <span class="ring" />
          <span class="text">「{{ imageAgentName }}」正在生成图片</span>
          <span class="dots"><i /><i /><i /></span>
        </div>
        <div v-if="messages.length === 0" class="empty">暂无消息，开始聊天吧</div>
      </div>

      <button v-if="!stickToBottom" class="to-bottom" title="回到底部" @click="jumpToBottom">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 5v14M19 12l-7 7-7-7" />
        </svg>
      </button>
    </div>

    <div v-if="coordinator || discussing" class="coordination-tip">
      <span class="pulse"></span>
      <span v-if="coordinator">「{{ coordinator.name }}」正在协调团队…</span>
      <span v-else>自由讨论中，成员正在接龙发言…</span>
      <button class="stop-btn" @click="handleStopCoordination">终止</button>
    </div>

    <div v-if="configTip && singleAgent" class="config-tip">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
        <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" stroke-linecap="round" />
      </svg>
      <span>{{ configTip }}，</span>
      <router-link :to="`/contact/${singleAgent.id}`" class="link">去配置</router-link>
    </div>

    <div v-if="pendingRequests.length > 0" class="op-requests">
      <div v-for="r in pendingRequests" :key="r.requestId" class="op-card">
        <div class="op-head">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" stroke-linecap="round" />
          </svg>
          <span class="op-title">「{{ r.agentName }}」{{ OP_TITLES[r.opType] ?? '请求执行受控操作' }}</span>
        </div>
        <div v-if="r.target" class="op-target">{{ r.target }}</div>
        <pre v-if="r.detail" class="op-detail">{{ r.detail }}</pre>
        <div class="op-actions">
          <button class="op-btn deny" @click="decideOp(r, 'deny')">拒绝</button>
          <button class="op-btn conv" @click="decideOp(r, 'conversation')">本会话允许</button>
          <button class="op-btn once" @click="decideOp(r, 'once')">允许一次</button>
        </div>
      </div>
    </div>

    <footer
      class="input-area"
      :class="{ dragging: isDragging }"
      @dragenter="onDragEnter"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
    >
      <div v-if="isDragging" class="drop-hint">松开鼠标，添加为附件</div>
      <div v-if="mentionCandidates.length > 0" class="mention-popup">
        <div class="mention-title">选择要 @ 的成员</div>
        <button
          v-for="(m, i) in mentionCandidates"
          :key="m.id"
          type="button"
          class="mention-row"
          :class="{ active: i === mentionIndex }"
          @mousedown.prevent="pickMention(m)"
          @mousemove="mentionIndex = i"
        >
          <Avatar :name="m.name" :avatar="m.avatar" :size="26" />
          <span class="mention-name">{{ m.name }}</span>
        </button>
      </div>
      <div v-if="pendingAttachments.length > 0" class="attach-row">
        <span
          v-for="att in pendingAttachments"
          :key="att.path"
          class="attach-chip"
          :title="att.path"
        >
          <img v-if="att.type === 'image'" class="attach-thumb" :src="fsContentUrl(att.path)" alt="" />
          <svg v-else-if="att.type === 'dir'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
            <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zm0 0v5h5" />
          </svg>
          <span class="attach-name">{{ att.name }}</span>
          <button class="attach-remove" title="移除" @click="removeAttachment(att.path)">✕</button>
        </span>
      </div>
      <div v-if="rtPhase === 'streaming' && rtStopping" class="voice-status">转写收尾中…</div>
      <div v-else-if="rtPhase === 'streaming'" class="voice-status recording">
        ● {{ rtElapsed }}s · 实时转写中 · 松开结束
      </div>
      <div v-else-if="rtPhase === 'connecting'" class="voice-status">实时识别连接中…</div>
      <div class="toolbar">
        <span class="tool" title="发送文件" @click="pickFiles">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
            <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zm0 0v5h5" />
          </svg>
        </span>
        <span class="tool" title="发送文件夹" @click="pickFolder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          </svg>
        </span>
        <span class="tool" title="会话文件授权" @click="showGrants = !showGrants">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
            <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z" />
            <path d="M9 12l2 2 4-4" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
        <span
          class="tool mic"
          :class="{ live: rtPhase !== 'idle' }"
          :title="micTitle"
          @pointerdown.prevent="onMicDown"
          @contextmenu.prevent
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke-linecap="round" />
          </svg>
        </span>
      </div>
      <textarea
        ref="inputRef"
        v-model="draft"
        class="input"
        :placeholder="inputPlaceholder"
        rows="3"
        @input="syncMention"
        @click="syncMention"
        @keyup="syncMention"
        @keydown="onKeydown"
      />
      <div class="send-row">
        <button class="send-btn" :disabled="!draft.trim() && pendingAttachments.length === 0" @click="handleSend">
          发送
        </button>
      </div>

      <FileGrantsPopover v-if="showGrants" :conversation-id="props.id" @close="showGrants = false" />
    </footer>
  </div>
</template>

<style scoped lang="scss">
.chat-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  position: relative;
}

.list-wrap {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
}

.to-bottom {
  position: absolute;
  right: 20px;
  bottom: 16px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: $bg-panel;
  border: 1px solid $border-color;
  box-shadow: $shadow-md;
  color: $text-secondary;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20;
  transition: color $transition-fast, border-color $transition-fast;

  svg {
    width: 18px;
    height: 18px;
  }

  &:hover {
    color: $primary-color;
    border-color: $primary-color;
  }
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 $spacing-lg;
  height: 52px;
  flex-shrink: 0;
  border-bottom: 1px solid $border-color;

  .title {
    font-size: $font-size-md;
    font-weight: 600;
    color: $text-primary;

    .member-count {
      font-size: $font-size-sm;
      font-weight: 400;
      color: $text-tertiary;
    }
  }

  .more-wrap {
    position: relative;
    display: flex;
    align-items: center;
  }

  .more {
    display: flex;
    align-items: center;
    color: $text-secondary;
    cursor: pointer;
    border-radius: $radius-sm;
    padding: $spacing-xs;

    svg {
      width: 20px;
      height: 20px;
    }

    &:hover {
      color: $text-primary;
      background: $bg-hover;
    }
  }
}

.message-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: $spacing-lg;
  display: flex;
  flex-direction: column;
  gap: $spacing-lg;

  .time-divider {
    align-self: center;
    font-size: $font-size-xs;
    color: $text-tertiary;
  }

  .empty {
    margin: auto;
    color: $text-tertiary;
    font-size: $font-size-sm;
  }
}

.image-gen-tip {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  width: fit-content;
  margin: $spacing-sm 0;
  padding: 8px $spacing-md;
  border-radius: $radius-md;
  background: $bg-panel;
  border: 1px solid $border-color;

  .ring {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    border-radius: 50%;
    border: 2px solid rgba($primary-color, 0.25);
    border-top-color: $primary-color;
    animation: image-gen-spin 0.9s linear infinite;
  }

  .text {
    font-size: $font-size-sm;
    color: $text-secondary;
  }

  .dots {
    display: flex;
    gap: 3px;

    i {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: $text-tertiary;
      animation: image-gen-blink 1.2s infinite ease-in-out;

      &:nth-child(2) {
        animation-delay: 0.2s;
      }

      &:nth-child(3) {
        animation-delay: 0.4s;
      }
    }
  }
}

@keyframes image-gen-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes image-gen-blink {
  0%,
  60%,
  100% {
    opacity: 0.3;
    transform: translateY(0);
  }

  30% {
    opacity: 1;
    transform: translateY(-2px);
  }
}

.coordination-tip {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  padding: $spacing-sm $spacing-lg;
  background: rgba(16, 185, 129, 0.08);
  border-top: 1px solid rgba(16, 185, 129, 0.22);
  color: #34d399;
  font-size: $font-size-sm;
  flex-shrink: 0;

  .pulse {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #34d399;
    animation: coordination-pulse 1.4s infinite ease-in-out;
    flex-shrink: 0;
  }

  .stop-btn {
    margin-left: auto;
    padding: 2px 10px;
    border-radius: $radius-sm;
    border: 1px solid rgba(255, 255, 255, 0.22);
    color: $text-secondary;
    font-size: $font-size-xs;
    transition: all $transition-fast;

    &:hover {
      color: #ff6b6b;
      border-color: rgba(255, 107, 107, 0.5);
      background: rgba(255, 107, 107, 0.08);
    }
  }
}

@keyframes coordination-pulse {
  0%,
  100% {
    opacity: 0.35;
    transform: scale(0.85);
  }

  50% {
    opacity: 1;
    transform: scale(1.1);
  }
}

.op-requests {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;
  padding: $spacing-sm $spacing-lg;
  border-top: 1px solid rgba(250, 157, 59, 0.25);
  background: rgba(250, 157, 59, 0.08);
  max-height: 320px;
  overflow-y: auto;
}

.op-card {
  border: 1px solid rgba(250, 157, 59, 0.35);
  border-radius: $radius-md;
  background: $bg-panel;
  padding: $spacing-sm $spacing-md;

  .op-head {
    display: flex;
    align-items: center;
    gap: $spacing-sm;
    color: #fa9d3b;

    svg {
      width: 16px;
      height: 16px;
      flex-shrink: 0;
    }

    .op-title {
      font-size: $font-size-sm;
      font-weight: 600;
      color: $text-primary;
    }
  }

  .op-target {
    margin-top: $spacing-xs;
    font-family: 'JetBrains Mono', Consolas, Menlo, monospace;
    font-size: $font-size-xs;
    color: $text-secondary;
    word-break: break-all;
  }

  .op-detail {
    margin: $spacing-xs 0 0;
    padding: $spacing-sm;
    border-radius: $radius-sm;
    background: $bg-input;
    border: 1px solid $border-color;
    font-family: 'JetBrains Mono', Consolas, Menlo, monospace;
    font-size: $font-size-xs;
    line-height: 1.5;
    color: $text-secondary;
    max-height: 140px;
    overflow-y: auto;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .op-actions {
    display: flex;
    justify-content: flex-end;
    gap: $spacing-sm;
    margin-top: $spacing-sm;
  }
}

.op-btn {
  padding: 4px $spacing-lg;
  border-radius: $radius-sm;
  font-size: $font-size-sm;
  cursor: pointer;
  border: 1px solid $border-color;
  transition: all $transition-fast;

  &.once {
    background: $primary-color;
    border-color: $primary-color;
    color: $text-white;

    &:hover {
      background: $primary-hover;
    }
  }

  &.conv {
    background: $bg-input;
    color: $text-primary;

    &:hover {
      background: $bg-hover;
    }
  }

  &.deny {
    background: $bg-input;
    color: #fa5151;
    border-color: rgba(250, 81, 81, 0.4);

    &:hover {
      background: rgba(250, 81, 81, 0.08);
    }
  }
}

.config-tip {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  padding: $spacing-sm $spacing-lg;
  background: rgba(250, 157, 59, 0.1);
  border-top: 1px solid rgba(250, 157, 59, 0.25);
  color: #fa9d3b;
  font-size: $font-size-sm;
  flex-shrink: 0;

  svg {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  .link {
    color: $primary-color;

    &:hover {
      text-decoration: underline;
    }
  }
}

.input-area {
  position: relative;
  flex-shrink: 0;
  border-top: 1px solid $border-color;
  padding: $spacing-sm $spacing-lg $spacing-md;
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;

  &.dragging {
    outline: 2px dashed $primary-color;
    outline-offset: -6px;
    background: rgba($primary-color, 0.06);
  }
}

.drop-hint {
  position: absolute;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  color: $primary-color;
  font-size: $font-size-sm;
  background: rgba($bg-panel, 0.85);
  border-radius: inherit;
}

.mention-popup {
  position: absolute;
  bottom: calc(100% + $spacing-sm);
  left: $spacing-lg;
  width: 260px;
  max-height: 240px;
  overflow-y: auto;
  background: $bg-panel;
  border: 1px solid $border-color;
  border-radius: $radius-md;
  box-shadow: $shadow-md;
  padding: $spacing-sm;
  z-index: 60;

  .mention-title {
    font-size: $font-size-xs;
    color: $text-tertiary;
    padding: $spacing-xs $spacing-sm $spacing-sm;
  }

  .mention-row {
    display: flex;
    align-items: center;
    gap: $spacing-sm;
    width: 100%;
    padding: $spacing-sm;
    border-radius: $radius-sm;
    cursor: pointer;
    text-align: left;
    transition: background $transition-fast;

    &.active {
      background: $bg-hover;

      .mention-name {
        color: $primary-color;
      }
    }

    .mention-name {
      font-size: $font-size-sm;
      color: $text-primary;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }
}

.toolbar {
  display: flex;
  gap: $spacing-lg;

  .tool {
    display: flex;
    align-items: center;
    color: $text-secondary;
    cursor: pointer;

    svg {
      width: 20px;
      height: 20px;
    }

    &:hover {
      color: $text-primary;
    }
  }

  .mic {
    user-select: none;
    touch-action: none;

    &.recording {
      color: #fa5151;
      animation: mic-pulse 1.2s infinite ease-in-out;
    }

    &.live {
      color: #07c160;
      animation: mic-pulse 1.2s infinite ease-in-out;
    }
  }
}

.voice-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: $font-size-sm;
  color: $text-secondary;

  &.recording {
    color: #fa5151;
    animation: mic-pulse 1.2s infinite ease-in-out;
  }

  &.cancellable {
    cursor: pointer;
    user-select: none;

    &:hover {
      color: $text-primary;
    }
  }
}

@keyframes mic-pulse {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.45;
  }
}

.attach-row {
  display: flex;
  flex-wrap: wrap;
  gap: $spacing-sm;
}

.attach-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 260px;
  padding: 5px 8px 5px 10px;
  border-radius: $radius-sm;
  background: $bg-input;
  border: 1px solid $border-color;

  svg {
    width: 15px;
    height: 15px;
    color: $text-secondary;
    flex-shrink: 0;
  }

  .attach-thumb {
    width: 28px;
    height: 28px;
    border-radius: 4px;
    object-fit: cover;
    border: 1px solid $border-color;
    flex-shrink: 0;
    background: rgba(0, 0, 0, 0.3);
  }

  .attach-name {
    font-size: $font-size-sm;
    color: $text-primary;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .attach-remove {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    color: $text-tertiary;
    font-size: 11px;
    line-height: 1;
    cursor: pointer;
    flex-shrink: 0;
    transition: all $transition-fast;

    &:hover {
      background: rgba(250, 81, 81, 0.15);
      color: #fa5151;
    }
  }
}

.input {
  width: 100%;
  resize: none;
  background: transparent;
  color: $text-primary;
  font-size: $font-size-base;
  line-height: 1.5;

  &::placeholder {
    color: $text-tertiary;
  }
}

.send-row {
  display: flex;
  justify-content: flex-end;
}

.send-btn {
  padding: 6px $spacing-xl;
  border-radius: $radius-sm;
  background: $primary-color;
  color: $text-white;
  font-size: $font-size-sm;
  cursor: pointer;
  transition: background $transition-fast;

  &:hover:not(:disabled) {
    background: $primary-hover;
  }

  &:disabled {
    background: $bg-input;
    color: $text-tertiary;
    cursor: not-allowed;
  }
}
</style>
