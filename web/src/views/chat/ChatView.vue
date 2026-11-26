<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useConversationStore } from '@/stores/conversation'
import { useUserStore } from '@/stores/user'
import { useAgentStore } from '@/stores/agent'
import { useModelPresetStore } from '@/stores/modelPreset'
import { alertAction, confirmAction } from '@/composables/confirm'
import { openSettings, showSettings } from '@/composables/settingsModal'
import { stopOrchestration } from '@/api/conversation'
import { getWechatStatus, updateWechatSettings, type WechatStatus } from '@/api/wechat'
import { getQqStatus, updateQqSettings, type QqStatus } from '@/api/qq'
import type { Agent, AskRequest, Attachment, Message, OpRequest } from '@/types'
import MessageBubble from '@/components/common/MessageBubble.vue'
import AskCard from '@/components/common/AskCard.vue'
import SessionGrantsPopover from '@/components/common/SessionGrantsPopover.vue'
import ContextMenu from '@/components/common/ContextMenu.vue'
import ChatMenu from './components/ChatMenu.vue'
import HistoryPopover from './components/HistoryPopover.vue'
import Avatar from '@/components/common/Avatar.vue'
import { formatDividerTime } from '@/utils/time'
import { channelConversation } from '@/utils/conversationName'
import { QQ_AVATAR } from '@/constants/channelAvatars'
import { fsContentUrl, isImagePath } from '@/utils/image'
import { copyImage, copyText } from '@/utils/clipboard'
import { showToast } from '@/composables/toast'
import { desktop, pathBasename } from '@/api/desktop'
import { useRealtimeVoice } from '@/composables/realtimeVoice'
import { useMusicDance } from '@/composables/musicDance'
import { useQuestionNav } from '@/composables/questionNav'
import { t } from '@/i18n'

const props = defineProps<{ id: string }>()

const conversationStore = useConversationStore()
const userStore = useUserStore()
const agentStore = useAgentStore()
const presetStore = useModelPresetStore()
const route = useRoute()
const router = useRouter()

const DIVIDER_GAP = 5 * 60 * 1000
const INPUT_HEIGHT_KEY = 'chat-input-height'

const draft = ref('')
const listRef = ref<HTMLElement>()
const inputRef = ref<HTMLTextAreaElement>()
const inputAreaRef = ref<HTMLElement>()
// 输入区高度：null 为默认（rows=3 自然高度），拖上边框调整，localStorage 记忆、双击恢复
const inputHeight = ref<number | null>(null)
const resizing = ref(false)
let defaultInputHeight = 0
const menuOpen = ref(false)
const showHistory = ref(false)
const showMembers = ref(false)
const showFileGrants = ref(false)
const showToolGrants = ref(false)
const pendingAttachments = ref<Attachment[]>([])

// @ 成员自动补全：start 为草稿中 @ 的下标，query 为 @ 后到光标间的文本
const mention = ref<{ start: number; query: string } | null>(null)
const mentionIndex = ref(0)
// Esc 关闭后记录位置，光标未动前不再弹出
let mentionDismissed: { start: number; pos: number } | null = null

const conversation = computed(() => conversationStore.conversations.find((c) => c.id === props.id))
const messages = computed(() => conversationStore.currentMessages)

watch(conversation, (conv) => {
  if (!conv && route.name === 'Chat') router.push('/chat')
})

// 切换会话时收起上一会话残留的成员弹层
watch(() => conversation.value?.id, () => {
  showMembers.value = false
})

const isWechat = computed(() => conversation.value?.channel === 'wechat')
const isQq = computed(() => conversation.value?.channel === 'qq')
const isChannelConv = computed(() => isWechat.value || isQq.value)

// ---------- 通道会话（微信/QQ）：当前处理智能体展示与切换 ----------
const wechatStatus = ref<WechatStatus | null>(null)
const qqStatus = ref<QqStatus | null>(null)
const showWechatAgentPop = ref(false)

const channelStatus = computed<WechatStatus | QqStatus | null>(() =>
  isQq.value ? qqStatus.value : wechatStatus.value,
)

async function refreshWechatStatus() {
  try {
    wechatStatus.value = await getWechatStatus()
  } catch {
    /* 读取失败保持旧值，下次打开重试 */
  }
}

async function refreshQqStatus() {
  try {
    qqStatus.value = await getQqStatus()
  } catch {
    /* 读取失败保持旧值，下次打开重试 */
  }
}

watch(isChannelConv, (v) => {
  if (isQq.value) refreshQqStatus()
  else if (isWechat.value) refreshWechatStatus()
  if (!v) showWechatAgentPop.value = false
}, { immediate: true })

/** 配置为空时按服务端规则（取第一个智能体）展示实际生效的智能体 */
const channelAgent = computed<Agent | null>(() => {
  const id = channelStatus.value?.agentId
  if (id) return agentStore.getById(id) ?? null
  return agentStore.agents[0] ?? null
})

async function setChannelAgent(agentId: string) {
  if (isQq.value) {
    const s = qqStatus.value
    if (!s) return
    try {
      qqStatus.value = await updateQqSettings({
        enabled: s.enabled,
        agentId,
        autoWrite: s.autoWrite,
        autoShell: s.autoShell,
        maxReplyChars: s.maxReplyChars,
        roundTimeoutMinutes: s.roundTimeoutMinutes,
        c2cPolicy: s.c2cPolicy,
        c2cWhitelist: s.c2cWhitelist,
        groupPolicy: s.groupPolicy,
        groupWhitelist: s.groupWhitelist,
      })
    } catch {
      /* 保存失败保持本地原值 */
    }
  } else {
    const s = wechatStatus.value
    if (!s) return
    try {
      wechatStatus.value = await updateWechatSettings({
        enabled: s.enabled,
        agentId,
        autoWrite: s.autoWrite,
        autoShell: s.autoShell,
        maxReplyChars: s.maxReplyChars,
        roundTimeoutMinutes: s.roundTimeoutMinutes,
      })
    } catch {
      /* 保存失败保持本地原值 */
    }
  }
  showWechatAgentPop.value = false
}

const title = computed(() => {
  const conv = conversation.value
  if (!conv) return t('chat.title')
  const channelName = channelConversation(conv)
  if (channelName) return channelName.name
  if (conv.type === 'group') return conv.name
  const agent = conv.agentId ? agentStore.getById(conv.agentId) : undefined
  return agent?.name ?? t('common.deletedAgent')
})

const singleAgent = computed(() => {
  const conv = conversation.value
  return conv?.type === 'single' && conv.agentId
    ? (agentStore.getById(conv.agentId) ?? null)
    : null
})

const coordinator = computed(() => {
  if (!conversationStore.isCoordinating(props.id)) return null
  const cur = conversationStore.orchestratingByConv[props.id]
  return cur ? (agentStore.getById(cur.agentId) ?? null) : null
})

/** 协调横幅模式：task=编排者单聊里自己执行任务，team=已建群/在群里协调成员（缺省 team） */
const teamMode = computed(() => conversationStore.orchestratingByConv[props.id]?.mode !== 'task')

const discussing = computed(() => conversationStore.isDiscussing(props.id))

/** 普通回复进行中：发送按钮切换为「停止」（协作/讨论已有横幅终止入口，不重复提供） */
const canStopReply = computed(() =>
  conversationStore.isTyping(props.id) && !coordinator.value && !discussing.value)

const imageAgentName = computed(() => conversationStore.isGeneratingImage(props.id))

/** 实时联网活动提示（本会话最近一次搜索/抓取，start=进行中，end=已完成） */
const webActivity = computed(() => conversationStore.webActivityByConv[props.id] ?? null)

const webTip = computed(() => {
  const a = webActivity.value
  if (!a) return null
  if (a.tool === 'web_search') {
    return a.phase === 'start'
      ? t('chat.webSearching', { q: a.query ?? '' })
      : a.ok === false
        ? t('chat.webSearchFail')
        : t('chat.webSearched', { q: a.query ?? '' })
  }
  const host = (() => {
    try {
      return a.url ? new URL(a.url).host : ''
    } catch {
      return a.url ?? ''
    }
  })()
  return a.phase === 'start'
    ? t('chat.webFetching', { host })
    : a.ok === false
      ? t('chat.webFetchFail')
      : t('chat.webFetched', { host })
})

/** 实时浏览器操作提示（本会话最近一次 browser_* 工具执行，start=进行中，end=已完成） */
const browseActivity = computed(() => conversationStore.browseActivityByConv[props.id] ?? null)

const BROWSE_LABEL_KEYS: Record<string, string> = {
  browser_open: 'chat.browserToolOpen',
  browser_click: 'chat.browserToolClick',
  browser_type: 'chat.browserToolType',
  browser_select: 'chat.browserToolSelect',
  browser_scroll: 'chat.browserToolScroll',
  browser_screenshot: 'chat.browserToolShot',
  browser_snapshot: 'chat.browserToolSnapshot',
  browser_back: 'chat.browserToolBack',
  browser_close: 'chat.browserToolClose',
  browser_current: 'chat.browserToolCurrent',
  browser_refresh: 'chat.browserToolRefresh',
  browser_tabs: 'chat.browserToolTabs',
  browser_select_tab: 'chat.browserToolSelectTab',
}

const browseTip = computed(() => {
  const a = browseActivity.value
  if (!a) return null
  const key = BROWSE_LABEL_KEYS[a.tool]
  const action = key ? t(key) : a.tool
  if (a.phase === 'start') return t('chat.browserWorking', { action })
  if (a.ok === false) return t('chat.browserFailed')
  return t('chat.browserDone', { action })
})

/** 实时通用工具调用提示（本会话最近一次文件/命令/技能等工具执行） */
const toolActivity = computed(() => conversationStore.toolActivityByConv[props.id] ?? null)

/** 上下文压缩进行中（compress_start 到 compress_end）：后台执行不阻塞回复，输入区指示条上转圈 */
const compressing = computed(() => conversationStore.compressingByConv[props.id])
/** 最近一次压缩失败原因：指示条转圈原地变红色叹号，点击展开看原因 */
const compressError = computed(() => conversationStore.compressErrorByConv[props.id] ?? null)
const compressErrOpen = ref(false)
watch(compressError, (v) => {
  if (!v) compressErrOpen.value = false
})
const toggleCompressErr = () => {
  if (compressError.value) compressErrOpen.value = !compressErrOpen.value
}

const toolTip = computed(() => {
  const a = toolActivity.value
  if (!a) return null
  const key = TOOL_LABEL_KEYS[a.tool]
  const action = key ? t(key) : a.tool
  if (a.phase === 'start') return t('chat.toolWorking', { action })
  if (a.ok === false) return t('chat.toolFailed')
  const target = a.target && a.target.length > 50 ? `${a.target.slice(0, 50)}…` : a.target
  return target ? t('chat.toolDoneTarget', { action, target }) : t('chat.toolDone', { action })
})

const TOOL_LABEL_KEYS: Record<string, string> = {
  read_file: 'chat.toolReadFile',
  write_file: 'chat.toolWriteFile',
  edit_file: 'chat.toolEditFile',
  list_files: 'chat.toolListFiles',
  grep_files: 'chat.toolGrepFiles',
  glob_files: 'chat.toolGlobFiles',
  execute: 'chat.toolExecute',
  view_image: 'chat.toolViewImage',
  generate_image: 'chat.toolGenerateImage',
  schedule_task: 'chat.toolScheduleTask',
  list_scheduled_tasks: 'chat.toolListTasks',
  update_scheduled_task: 'chat.toolUpdateTask',
  cancel_scheduled_task: 'chat.toolCancelTask',
  list_skills: 'chat.toolListSkills',
  install_skill: 'chat.toolInstallSkill',
  delegate: 'chat.toolDelegate',
  create_team: 'chat.toolCreateTeam',
  add_member: 'chat.toolAddMember',
  list_team: 'chat.toolListTeam',
  finish: 'chat.toolFinish',
  recordToMemory: 'chat.toolRecordMemory',
  retrieveFromMemory: 'chat.toolRetrieveMemory',
}

// 消息气泡右键菜单（仅气泡本体）：imgSrc 非空表示右键点在气泡内的图片上，额外提供复制图片
const msgCtx = ref<{ x: number; y: number; msg: Message; imgSrc: string | null } | null>(null)

function openMsgCtx(e: MouseEvent, msg: Message) {
  const imgEl = (e.target as HTMLElement | null)?.closest('img') as HTMLImageElement | null
  msgCtx.value = { x: e.clientX, y: e.clientY, msg, imgSrc: imgEl?.getAttribute('src') ?? null }
}

// 头像右键菜单：@ 该成员
const avatarCtx = ref<{ x: number; y: number; agent: Agent } | null>(null)

function openAvatarCtx(e: MouseEvent, msg: Message) {
  const agent = agentStore.getById(msg.senderId)
  if (!agent) return
  avatarCtx.value = { x: e.clientX, y: e.clientY, agent }
}

const avatarCtxItems = computed(() =>
  avatarCtx.value ? [{ key: 'mention', label: `@${avatarCtx.value.agent.name}` }] : [],
)

function onAvatarCtxSelect(key: string) {
  if (key === 'mention' && avatarCtx.value) insertIntoDraft(`@${avatarCtx.value.agent.name} `)
}

const msgCtxItems = computed(() => {
  if (!msgCtx.value) return []
  const items = [{ key: 'copy-text', label: t('chat.copyText') }]
  if (msgCtx.value.imgSrc) items.push({ key: 'copy-image', label: t('chat.copyImage') })
  return items
})

async function onMsgCtxSelect(key: string) {
  const ctx = msgCtx.value
  if (!ctx) return
  try {
    if (key === 'copy-text') {
      await copyText(ctx.msg.content)
      showToast(t('chat.copied'))
    } else if (key === 'copy-image' && ctx.imgSrc) {
      await copyImage(ctx.imgSrc)
      showToast(t('chat.imageCopied'))
    }
  } catch (err) {
    alertAction(err instanceof Error ? err.message : t('chat.copyFailed'))
  }
}

const pendingRequests = computed(() => conversationStore.pendingOpRequests(props.id))

async function decideOp(r: OpRequest, decision: 'once' | 'conversation' | 'deny' | 'whitelist') {
  try {
    await conversationStore.decideOpRequest(props.id, r, decision)
  } catch (err) {
    alertAction(err instanceof Error ? err.message : t('common.opFailed'))
  }
}

const OP_TITLES = computed<Record<OpRequest['opType'], string>>(() => ({
  write: t('chat.opWrite'),
  edit: t('chat.opEdit'),
  shell: t('chat.opShell'),
  browser: t('chat.opBrowser'),
  computer: t('chat.opComputer'),
}))

const pendingAsks = computed(() => conversationStore.pendingAsks(props.id))

async function answerAsk(ask: AskRequest, text: string) {
  try {
    await conversationStore.answerAskCard(props.id, ask, text)
  } catch (err) {
    alertAction(err instanceof Error ? err.message : t('common.opFailed'))
  }
}

const configTip = computed(() => {
  const agent = singleAgent.value
  if (!agent) return null
  const preset = agent.presetId ? presetStore.findById(agent.presetId) : undefined
  if (!preset) return t('chat.configNoPreset', { name: agent.name })
  if (!preset.baseUrl.trim() || !preset.hasKey) {
    return t('chat.configNoApi', { name: agent.name })
  }
  return null
})

const inputPlaceholder = computed(() => {
  // 回复/讨论进行中：发送即插话（当前成员说完生效）——发送按钮此时是停止键，靠提示告知键盘入口
  if (conversationStore.isTyping(props.id)) {
    return t('chat.phInterject')
  }
  if (conversation.value?.type === 'group') {
    return t('chat.phGroup')
  }
  return t('chat.phSingle')
})

const memberAgents = computed<Agent[]>(() => {
  const conv = conversation.value
  if (conv?.type !== 'group') return []
  return conv.memberIds
    .map((id) => agentStore.getById(id))
    .filter((a): a is Agent => !!a)
    // 编排者（会话角色）排第一，群成员弹层与 @ 提及候选都优先看到
    .sort((a, b) => Number(b.id === conv.hostAgentId) - Number(a.id === conv.hostAgentId))
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

/** 在光标处插入文本并聚焦（点头像 @ 成员等场景） */
function insertIntoDraft(text: string) {
  const el = inputRef.value
  const pos = el?.selectionStart ?? draft.value.length
  const end = el?.selectionEnd ?? pos
  const before = draft.value.slice(0, pos)
  const after = draft.value.slice(end)
  draft.value = before + text + after
  nextTick(() => {
    el?.focus()
    const caret = (before + text).length
    el?.setSelectionRange(caret, caret)
  })
}

/** 消息发送者对应的智能体（自己/QQ 外部成员/已删智能体为 undefined） */
function senderAgent(msg: Message): Agent | undefined {
  return msg.senderType === 'agent' ? agentStore.getById(msg.senderId) ?? undefined : undefined
}

/** 左键点智能体头像：跳转该智能体详情页 */
function openAgentProfile(msg: Message) {
  const agent = senderAgent(msg)
  if (agent) router.push({ name: 'ContactDetail', params: { id: agent.id } })
}

/** 本会话最近一轮注入模型的上下文字符量与预算（回合开始时由 context_size 事件推送） */
const ctxSize = computed(() => conversationStore.contextSizeByConv[props.id])

/** 字符数缩写（32400 → 32.4k），与压缩预算同一字符口径 */
function fmtK(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : String(n)
}

/** 上下文占预算的百分比（四舍五入取整，无预算按 0） */
function pct(n: number, total: number): string {
  return total > 0 ? String(Math.round((n * 100) / total)) : '0'
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

function clampInputHeight(h: number): number {
  const min = defaultInputHeight || 160
  const max = Math.round(window.innerHeight * 0.7)
  return Math.min(Math.max(h, min), Math.max(min, max))
}

function onResizeStart(e: PointerEvent) {
  const footer = inputAreaRef.value
  if (!footer || e.button !== 0) return
  e.preventDefault()
  const startY = e.clientY
  const startH = footer.getBoundingClientRect().height
  resizing.value = true
  document.documentElement.style.cursor = 'ns-resize'
  const onMove = (ev: PointerEvent) => {
    inputHeight.value = clampInputHeight(Math.round(startH + (startY - ev.clientY)))
  }
  const onUp = () => {
    resizing.value = false
    document.documentElement.style.cursor = ''
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
    if (inputHeight.value != null) localStorage.setItem(INPUT_HEIGHT_KEY, String(inputHeight.value))
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onUp)
}

function resetInputHeight() {
  inputHeight.value = null
  localStorage.removeItem(INPUT_HEIGHT_KEY)
}

function onWindowResize() {
  if (inputHeight.value != null) inputHeight.value = clampInputHeight(inputHeight.value)
  computeNavMarks()
}

onMounted(() => {
  void rtRefresh()
  danceResume() // 上次开着律动：进会话即恢复；无手势时自动挂到首次点击
  window.addEventListener('pointerup', onReleaseAnywhere)
  window.addEventListener('pointercancel', onReleaseAnywhere)
  window.addEventListener('resize', onWindowResize)
  // 先量默认高度（rows=3 自然高度）作最小值，再应用记忆的高度，避免量到已拉伸的状态
  nextTick(() => {
    const footer = inputAreaRef.value
    if (footer) defaultInputHeight = Math.round(footer.getBoundingClientRect().height)
    const saved = Number(localStorage.getItem(INPUT_HEIGHT_KEY))
    if (Number.isFinite(saved) && saved > 0) inputHeight.value = clampInputHeight(saved)
  })
})

onBeforeUnmount(() => {
  stopWatch?.()
  stopWatch = null
  danceDispose() // 离开聊天页停掉采集（意图仍在，重进自动恢复）
  window.removeEventListener('pointerup', onReleaseAnywhere)
  window.removeEventListener('pointercancel', onReleaseAnywhere)
  window.removeEventListener('resize', onWindowResize)
})

const micTitle = computed(() => {
  if (rtPhase.value === 'streaming') return rtStopping.value ? t('chat.voiceFinishing') : t('chat.voiceHoldStop')
  if (rtPhase.value === 'connecting') return t('chat.voiceConnecting')
  if (!rtConfigured.value) return t('chat.voiceNotConfigured')
  return t('chat.voiceHold')
})

function shouldShowDivider(index: number): boolean {
  if (index === 0) return true
  return messages.value[index].timestamp - messages.value[index - 1].timestamp > DIVIDER_GAP
}

/** QQ 会话里从 QQ 侧发来的外部消息（群成员/私聊好友）：气泡同样靠右（与微信通道一致——
 *  通道对端在右、智能体在左），但保留名字+企鹅头像+角色徽标；'u0' 是旧消息的本地发送占位 */
function isExternal(msg: Message): boolean {
  if (msg.senderType !== 'user') return false
  if (conversation.value?.channel !== 'qq') return false
  return !(msg.senderId === qqStatus.value?.ownerOpenid
    || msg.senderId === userStore.user?.id
    || msg.senderId === 'u0')
}

/** 自己人消息（不带外部身份标注）：本地发送与机主从 QQ 发来的 */
function isSelf(msg: Message): boolean {
  return msg.senderType === 'user' && !isExternal(msg)
}

/** 平台随事件下发的用户名（author.username）：取 seen 列表里该 openid 最近一次的名字 */
function qqMemberName(openid: string): string | null {
  return qqStatus.value?.seen.find((p) => p.openid === openid && p.name)?.name ?? null
}

function senderInfo(msg: Message): { name: string; avatar?: string } {
  // 仅外部 user 消息按「用户名（openid）」展示；agent 消息走下方智能体匹配，不吃企鹅头像
  if (isExternal(msg)) {
    const name = msg.senderName || qqMemberName(msg.senderId)
    return { name: name ? `${name}（${msg.senderId}）` : msg.senderId, avatar: QQ_AVATAR }
  }
  if (isSelf(msg)) {
    return { name: userStore.user?.name ?? t('chat.replySelf'), avatar: userStore.user?.avatar }
  }
  const agent = agentStore.getById(msg.senderId)
  return { name: agent?.name ?? t('common.unknownAgent'), avatar: agent?.avatar }
}

function senderBadge(msg: Message): string | undefined {
  // QQ 外部成员按群角色标注（群主/管理员），普通成员无徽标；其余按会话编排者标注（会话角色，动态）
  if (isExternal(msg)) {
    if (msg.senderRole === 'owner') return t('chat.qqOwner')
    if (msg.senderRole === 'admin') return t('chat.qqAdmin')
    return undefined
  }
  if (msg.senderType === 'user') return undefined
  // 自由讨论时指挥休眠、按普通成员接龙：气泡不再标指挥（挂着标签发言会误导为他在协调）
  if (conversation.value?.chatMode === 'free') return undefined
  return conversation.value?.hostAgentId === msg.senderId ? t('common.host') : undefined
}

/** 思考中指示条：发出消息即显示；reply_pending 预告的思考窗口（含接龙/依次回复的
 *  间隔期）持续显示；气泡正在流正文时由气泡内打字点接管；多段回复的间隙（上一段
 *  已说完、智能体在酝酿下一段）思考条回归。工具执行间隙除外：下方工具气泡已在
 *  指示活动，思考条再亮打字点会像「一直在思考」；下一段的实时思考文本出现时才
 *  回归，此时展示的正是思考内容本身 */
const showThinking = computed(() => {
  if (!conversationStore.isTyping(props.id)) return false
  if ((webTip.value || browseTip.value || toolTip.value) && !thinkingText.value) return false
  if (conversationStore.pendingReplyByConv[props.id]) return true
  const last = messages.value[messages.value.length - 1]
  if (!last || last.senderType !== 'agent') return true
  return conversationStore.activeMsgIdByConv[props.id] !== last.id
})

/** 思考中的智能体：优先「即将发言」的成员（接龙/依次回复的间隔期），单聊回落会话对象，
 *  编排者群聊回落协调者（coordination_start 早于模型思考，首段思考也有头像）；
 *  都未预告但思考正文已在流时，回落最后一位流式发言的成员——预告必然先于下一位的
 *  思考到达，此刻仍是上一回合所有人在酝酿下一段，指认他是安全的。其余情况（回合
 *  边界预告未到）返回空，思考条整行不出现：头像必须与气泡同帧出现，且不能先亮出
 *  上一位的头像冒充当前发言人 */
const thinkingAgent = computed(() => {
  const id = conversationStore.pendingReplyByConv[props.id]
    ?? conversation.value?.agentId
    ?? coordinator.value?.id
  if (id) return agentStore.getById(id)
  if (conversationStore.thinkingByConv[props.id]?.text) {
    for (let i = messages.value.length - 1; i >= 0; i--) {
      const a = agentStore.getById(messages.value[i].senderId)
      if (a) return a
    }
  }
  return undefined
})

/** 思考过程流文本（thinking_delta）：气泡未打开的思考窗口期在思考条内展示；有 messageId 的在气泡内 */
const thinkingText = computed(() => conversationStore.thinkingByConv[props.id]?.text ?? '')
const thinkingStreamEl = ref<HTMLElement | null>(null)
watch(thinkingText, () => {
  nextTick(() => {
    const el = thinkingStreamEl.value
    if (el) el.scrollTop = el.scrollHeight
  })
})

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
  navOnScroll()
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

// ---------- 音乐律动：电脑播放的声音经系统回环采集，导航刻度按频段像频谱柱一样跳动（开关在设置 → 系统设置） ----------

const {
  active: danceActive,
  resumeIfNeeded: danceResume,
  setCount: danceSetCount,
  setPainter: danceSetPainter,
  dispose: danceDispose,
} = useMusicDance()

// ---------- 提问导航条：消息区右缘贴滚动条的刻度条，「我发出的提问」每条一个刻度（DeepSeek 风格） ----------
// 悬停任意刻度展开附近提问索引面板（卡片式，悬停行钉在其刻度旁、滚轮式缩放变淡）；移入面板后同一套滚轮跟随鼠标（行悬停滑窗+滚轮滚动）、点击平滑跳转、可视高亮；律动开启时上下补淡色辅助条。共享逻辑在 composables/questionNav.ts
const {
  navMarks,
  danceFillers,
  navActiveIds,
  navHoverId,
  navPanelOpen,
  navPanelItems,
  navItemStyle,
  navItemHovered,
  navPanelStyle,
  hoverNavMark,
  hoverNavItem,
  rollNavPanel,
  openNavPanel,
  scheduleNavPanelClose,
  closeNavPanelNow,
  computeNavMarks,
  jumpToMsg,
  navOnScroll,
} = useQuestionNav({
  listRef,
  messages,
  source: () => [props.id, messages.value.length] as const,
  fillersEnabled: danceActive,
  onSlots: danceSetCount,
})

// 频谱→刻度：直接写行内 CSS 变量，绕开 Vue 响应式，60fps 无渲染开销。
// 辅助条与真刻度按 data-slot 对号入座（文档序与槽位序不同），导航条是 .message-list 的
// 兄弟节点（挂在 .list-wrap 上），不能从 listRef 里查
danceSetPainter((amps) => {
  const nodes = document.querySelectorAll<HTMLElement>('.msg-nav [data-slot]')
  nodes.forEach((el) => {
    const v = amps[Number(el.dataset.slot)] ?? 0
    el.style.setProperty('--amp', v.toFixed(3))
  })
})

// 常驻订阅扇出事件：微信等后台触发的回合没有本地发送方，正在查看该会话时靠它实时看到流式输出。
// 普通本地发送的事件只走各自请求的响应流，不会向观察者扇出，两路处理不会重复
let stopWatch: (() => void) | null = null

// 输入区草稿按会话留存：键入即写入 store（仅内存——切页/切会话保留、重启软件清空）；
// 切换会话时 props.id 的 watch 恢复对应草稿，顺带修掉草稿跨会话串门的旧问题
watch(draft, (text) => conversationStore.setChatDraft(props.id, text))

watch(
  () => props.id,
  (id) => {
    if (!id) return
    stopWatch?.()
    mention.value = null
    pendingAttachments.value = []
    // 恢复该会话的输入草稿（仅内存，重启即清）
    draft.value = conversationStore.chatDraftByConv[id] ?? ''
    conversationStore.setActive(id)
    forceScrollToBottom()
    stopWatch = conversationStore.watchConversation(id)
    // 进入/刷新会话即重算上下文指示，刷新页面后立即有数值，不必等下一轮回复
    conversationStore.refreshContextSize(id)
  },
  { immediate: true },
)

watch(
  () => [messages.value.length, messages.value[messages.value.length - 1]?.content] as const,
  () => scrollToBottom(),
)

// 思考条/行动提示条也在滚动容器内（渲染在消息之后），出现或增长时同样贴底跟随：
// 正文没出来前它们是「回合还在动」的唯一可见信号，被挡在视口下会显得像卡住了
watch(
  () => [showThinking.value, thinkingText.value, webTip.value, browseTip.value, toolTip.value] as const,
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
    alertAction(err instanceof Error ? err.message : t('chat.sendFailed'))
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
    const paths = await desktop.pickFiles({ title: t('chat.pickFiles'), multi: true })
    if (paths) addPaths(paths, 'file')
  } catch (e) {
    alertAction(e instanceof Error ? e.message : t('chat.pickFilesFailed'))
  }
}

async function pickFolder() {
  try {
    const dir = await desktop.pickDirectory({ title: t('chat.pickFolder') })
    if (dir) addPaths([dir], 'dir')
  } catch (e) {
    alertAction(e instanceof Error ? e.message : t('chat.pickFolderFailed'))
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
    alertAction(t('chat.dropNeedsDesktop'))
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

/** 粘贴添加附件：资源管理器复制的文件/文件夹直接取路径；截图等无源图片落盘临时目录 */
async function onPaste(e: ClipboardEvent) {
  const files = e.clipboardData?.files
  if (!files || files.length === 0) return
  if (!desktop.pathForFile) return
  e.preventDefault()
  const entries: { path: string; type: 'file' | 'dir' }[] = []
  for (const file of Array.from(files)) {
    const path = desktop.pathForFile(file)
    if (path) {
      entries.push({ path, type: 'file' })
      continue
    }
    if (!file.type.startsWith('image/') || !desktop.saveClipboardImage) continue
    const buf = new Uint8Array(await file.arrayBuffer())
    const r = await desktop.saveClipboardImage(buf)
    if (r.ok && r.path) entries.push({ path: r.path, type: 'file' })
  }
  if (entries.length === 0) return
  // File API 区分不了文件夹，用主进程 stat 修正，避免粘贴的文件夹显示成文件图标
  if (desktop.statPath) {
    for (const en of entries) {
      const st = await desktop.statPath(en.path)
      if (st.ok) en.type = st.isDir ? 'dir' : 'file'
    }
  }
  addEntries(entries)
}

async function handleStopCoordination() {
  const name = coordinator.value?.name ?? t('common.host')
  const ok = await confirmAction({
    title: t('chat.stop'),
    message: discussing.value ? t('chat.stopDiscussMsg') : t('chat.stopCoordMsg', { name }),
    confirmText: t('chat.stop'),
    danger: true,
  })
  if (!ok) return
  try {
    const res = await stopOrchestration(props.id)
    if (!res.stopped) {
      alertAction(t('chat.noActiveCoord'))
      return
    }
    // 后端已把待审批请求按拒绝唤醒，这里同步关闭本会话残留的卡片
    conversationStore.clearOpRequests(props.id)
  } catch (err) {
    alertAction(err instanceof Error ? err.message : t('chat.stopFailed'))
  }
}

/** 终止普通回复：直接掐断流，已产生的输出保留，流以 done 正常收尾后按钮自动还原 */
async function handleStopReply() {
  try {
    const res = await stopOrchestration(props.id)
    if (res.stopped) conversationStore.clearOpRequests(props.id)
  } catch {
    /* 终止失败时流会自行结束或超时，无需打断用户 */
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
  <div class="chat-view" @click="showWechatAgentPop = false">
    <header class="chat-header drag-region">
      <span class="title">
        {{ title }}
        <button
          v-if="conversation?.type === 'group'"
          class="member-count"
          :title="t('chat.groupMembers')"
          @click="showMembers = !showMembers"
        >
          {{ t('chat.memberCount', { n: conversation.memberIds.length }) }}
        </button>
      </span>
      <div class="more-wrap">
        <button
          v-if="isChannelConv"
          class="wechat-agent-chip"
          :title="t('settings.wechatAgent')"
          @click.stop="showWechatAgentPop = !showWechatAgentPop"
        >
          <Avatar v-if="channelAgent" :name="channelAgent.name" :avatar="channelAgent.avatar" :size="18" />
          <span class="chip-name">{{ channelAgent?.name ?? t('common.deletedAgent') }}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        <button
          v-if="!isChannelConv && conversation?.type === 'single' && conversation?.agentId"
          class="more"
          :title="t('nav.history')"
          @click.stop="showHistory = !showHistory"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 12a9 9 0 1 0 3-6.7L3.5 7.5" />
            <path d="M3 3v5h5" />
            <path d="M12 7v5l3.5 2" />
          </svg>
        </button>
        <button class="more" :title="t('chat.menu')" @click.stop="menuOpen = !menuOpen">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <circle cx="5" cy="12" r="1.8" />
            <circle cx="12" cy="12" r="1.8" />
            <circle cx="19" cy="12" r="1.8" />
          </svg>
        </button>
        <HistoryPopover
          v-if="showHistory && conversation?.agentId"
          :agent-id="conversation.agentId"
          @close="showHistory = false"
        />
        <ChatMenu
          v-if="menuOpen && conversation"
          :conversation="conversation"
          @close="menuOpen = false"
        />
        <!-- 通道会话（微信/QQ）：处理智能体切换列表（下一条外部消息生效） -->
        <div v-if="isChannelConv && showWechatAgentPop" class="wechat-agent-pop" @click.stop>
          <button class="wa-row" :class="{ on: !channelStatus?.agentId }" @click="setChannelAgent('')">
            {{ t('settings.wechatAgentAuto') }}
          </button>
          <button
            v-for="a in agentStore.agents"
            :key="a.id"
            class="wa-row"
            :class="{ on: channelStatus?.agentId === a.id }"
            @click="setChannelAgent(a.id)"
          >
            <Avatar :name="a.name" :avatar="a.avatar" :size="22" />
            <span>{{ a.name }}</span>
          </button>
        </div>
      </div>
    </header>

    <template v-if="showMembers && memberAgents.length > 0">
      <div class="member-mask" @click="showMembers = false" />
      <div class="member-pop">
        <div class="member-pop-title">{{ t('chat.groupMembers') }}</div>
        <button v-for="a in memberAgents" :key="a.id" class="member-row" @click="showMembers = false">
          <Avatar :name="a.name" :avatar="a.avatar" :size="28" />
          <span class="member-name">{{ a.name }}</span>
          <span v-if="a.id === conversation?.hostAgentId" class="member-badge">{{ t('common.host') }}</span>
        </button>
      </div>
    </template>

    <div class="list-wrap">
      <div ref="listRef" class="message-list" @scroll="onListScroll">
        <template v-for="(msg, i) in messages" :key="msg.id">
          <div v-if="shouldShowDivider(i)" class="time-divider">
            {{ formatDividerTime(msg.timestamp) }}
          </div>
          <div v-if="msg.senderType === 'system'" class="system-note">{{ msg.content }}</div>
          <MessageBubble
            v-else
            :message="msg"
            :self="msg.senderType === 'user'"
            :sender-name="senderInfo(msg).name"
            :sender-avatar="senderInfo(msg).avatar"
            :badge="senderBadge(msg)"
            :show-name="(conversation?.type === 'group' || isWechat || isExternal(msg)) && !isSelf(msg)"
            :typing="conversationStore.isTyping(props.id) && i === messages.length - 1"
            :thinking="conversationStore.thinkingByMsg[msg.id]"
            :mentionable="conversation?.type === 'group' && !isSelf(msg)"
            :avatar-navigable="senderAgent(msg) !== undefined"
            :data-nav-id="isSelf(msg) ? msg.id : undefined"
            @bubble-menu="openMsgCtx($event, msg)"
            @avatar-open="openAgentProfile(msg)"
            @avatar-menu="openAvatarCtx($event, msg)"
          />
        </template>
        <div v-if="showThinking && thinkingAgent" class="thinking-row">
          <Avatar v-if="thinkingAgent" :name="thinkingAgent.name" :avatar="thinkingAgent.avatar" :size="36" />
          <div class="thinking-col">
            <span v-if="thinkingAgent" class="thinking-name">{{ thinkingAgent.name }}</span>
            <div class="thinking-bubble">
              <div v-if="thinkingText" ref="thinkingStreamEl" class="thinking-stream">{{ thinkingText }}</div>
              <!-- 点动画只在思考文本尚未到达时显示，文字开始流出后由文字本身承担进行中信号 -->
              <span v-else class="dots"><span></span><span></span><span></span></span>
            </div>
          </div>
        </div>
        <ContextMenu
          v-if="msgCtx"
          :x="msgCtx.x"
          :y="msgCtx.y"
          :items="msgCtxItems"
          @select="onMsgCtxSelect"
          @close="msgCtx = null"
        />
        <ContextMenu
          v-if="avatarCtx"
          :x="avatarCtx.x"
          :y="avatarCtx.y"
          :items="avatarCtxItems"
          @select="onAvatarCtxSelect"
          @close="avatarCtx = null"
        />
        <div v-if="imageAgentName" class="image-gen-tip">
          <span class="ring" />
          <span class="text">{{ t('chat.imgGen', { name: imageAgentName }) }}</span>
          <span class="dots"><i /><i /><i /></span>
        </div>
        <div v-if="webTip" class="web-activity-tip">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3c2.5 2.6 3.9 5.7 3.9 9s-1.4 6.4-3.9 9c-2.5-2.6-3.9-5.7-3.9-9S9.5 5.6 12 3z" />
          </svg>
          <span class="text">{{ webTip }}</span>
        </div>
        <div v-if="browseTip" class="web-activity-tip">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
            <rect x="3" y="4" width="18" height="14" rx="2" />
            <path d="M3 8h18M8 21h8" />
          </svg>
          <span class="text">{{ browseTip }}</span>
        </div>
        <div v-if="toolTip" class="web-activity-tip">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
            <path d="M14.7 6.3a4.5 4.5 0 0 0-6 6L3 18l3 3 5.7-5.7a4.5 4.5 0 0 0 6-6L15 12l-3-3 2.7-2.7z" />
          </svg>
          <span class="text">{{ toolTip }}</span>
        </div>
        <div v-if="messages.length === 0" class="empty">{{ t('chat.emptyMsg') }}</div>
      </div>

      <button v-if="!stickToBottom" class="to-bottom" :title="t('chat.toBottom')" @click="jumpToBottom">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 5v14M19 12l-7 7-7-7" />
        </svg>
      </button>

      <!-- 提问导航条：我发出的提问每条一个刻度贴滚动条左侧；悬停任意刻度展开全部提问索引面板，点击跳转；律动开启时上下补淡色辅助条 -->
      <div v-if="navMarks.length >= 2" class="msg-nav">
        <div
          v-for="m in navMarks"
          :key="m.id"
          class="msg-nav-mark"
          :class="{ active: navActiveIds.includes(m.id), hover: navHoverId === m.id }"
          :style="{ top: `calc(50% + ${m.off}px)` }"
          :data-slot="m.slot"
          @click="jumpToMsg(m.id)"
          @mouseenter="hoverNavMark(m)"
          @mouseleave="scheduleNavPanelClose()"
        ></div>
        <template v-if="danceActive">
          <div
            v-for="f in danceFillers"
            :key="`filler-${f.slot}`"
            class="msg-nav-filler"
            :style="{ top: `calc(50% + ${f.off}px)` }"
            :data-slot="f.slot"
          />
        </template>
        <!-- 悬停刻度展开的提问面板（卡片式）：悬停行钉在其刻度旁使弹窗与刻度融合；
             移入面板后同一套滚轮跟随鼠标——行悬停滑窗、滚轮逐格滚，内容从鼠标底下滚过（卡片 top 钉死） -->
        <div
          v-if="navPanelOpen"
          class="msg-nav-panel"
          :style="navPanelStyle()"
          @mouseenter="openNavPanel"
          @mouseleave="scheduleNavPanelClose"
          @wheel.prevent="rollNavPanel($event.deltaY)"
        >
          <!-- 按窗口内位置作 key：滑窗时行原位换内容不移节点，缩放/透明度必被重补丁（滚轮槽位固定） -->
          <button
            v-for="(m, i) in navPanelItems"
            :key="i"
            type="button"
            class="msg-nav-item"
            :class="{ hover: navItemHovered(i, m.id), active: navActiveIds.includes(m.id) }"
            :style="navItemStyle(i)"
            @mouseenter="hoverNavItem(i, m)"
            @click="jumpToMsg(m.id); closeNavPanelNow()"
          >
            <span class="txt">{{ m.preview }}</span>
          </button>
        </div>
      </div>
    </div>

    <div v-if="coordinator || discussing" class="coordination-tip">
      <span class="pulse"></span>
      <span v-if="coordinator">{{ teamMode ? t('chat.coordinating', { name: coordinator.name }) : t('chat.executingTask', { name: coordinator.name }) }}</span>
      <span v-else>{{ t('chat.discussingTip') }}</span>
      <button class="stop-btn" @click="handleStopCoordination">{{ t('chat.stop') }}</button>
    </div>

    <div v-if="configTip && singleAgent" class="config-tip">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
        <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" stroke-linecap="round" />
      </svg>
      <span>{{ configTip }}</span>
      <router-link :to="`/contact/${singleAgent.id}`" class="link">{{ t('chat.goConfig') }}</router-link>
    </div>

    <div v-if="pendingRequests.length > 0" class="op-requests">
      <div v-for="r in pendingRequests" :key="r.requestId" class="op-card">
        <div class="op-head">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" stroke-linecap="round" />
          </svg>
          <span class="op-title">「{{ r.agentName }}」{{ OP_TITLES[r.opType] ?? t('chat.opOther') }}</span>
        </div>
        <div v-if="r.target" class="op-target">{{ r.target }}</div>
        <pre v-if="r.detail" class="op-detail">{{ r.detail }}</pre>
        <div class="op-actions">
          <button class="op-btn deny" @click="decideOp(r, 'deny')">{{ t('chat.opDeny') }}</button>
          <button v-if="r.opType === 'browser'" class="op-btn wl" @click="decideOp(r, 'whitelist')">{{ t('chat.opWhitelist') }}</button>
          <button class="op-btn conv" @click="decideOp(r, 'conversation')">{{ t('chat.opAllowConv') }}</button>
          <button class="op-btn once" @click="decideOp(r, 'once')">{{ t('chat.opAllowOnce') }}</button>
        </div>
      </div>
    </div>

    <div v-if="pendingAsks.length > 0" class="ask-requests">
      <AskCard v-for="a in pendingAsks" :key="a.requestId" :ask="a" @answer="answerAsk" />
    </div>

    <footer v-if="!isChannelConv" ref="inputAreaRef" class="input-area" :class="{ dragging: isDragging, resizing }"
      :style="inputHeight != null ? { height: `${inputHeight}px` } : undefined"
      @dragenter="onDragEnter" @dragover="onDragOver" @dragleave="onDragLeave"
      @drop="onDrop"
    >
      <div class="resize-handle" @pointerdown="onResizeStart" @dblclick="resetInputHeight" />
      <div v-if="isDragging" class="drop-hint">{{ t('chat.dropHint') }}</div>
      <div v-if="mentionCandidates.length > 0" class="mention-popup">
        <div class="mention-title">{{ t('chat.pickMentionAt') }}</div>
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
          <button class="attach-remove" :title="t('common.remove')" @click="removeAttachment(att.path)">✕</button>
        </span>
      </div>
      <div v-if="rtPhase === 'streaming' && rtStopping" class="voice-status">{{ t('chat.voiceFinishing') }}</div>
      <div v-else-if="rtPhase === 'streaming'" class="voice-status recording">
        ● {{ t('chat.voiceLive', { s: rtElapsed }) }}
      </div>
      <div v-else-if="rtPhase === 'connecting'" class="voice-status">{{ t('chat.voiceConnecting') }}</div>
      <div class="toolbar">
        <span class="tool" :title="t('chat.pickFiles')" @click="pickFiles">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
            <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zm0 0v5h5" />
          </svg>
        </span>
        <span class="tool" :title="t('chat.pickFolder')" @click="pickFolder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          </svg>
        </span>
        <span class="tool" :title="t('chat.sessionFileGrants')" @click="showFileGrants = !showFileGrants">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <rect x="10" y="11.8" width="4" height="3.2" rx="0.8" />
            <path d="M10.8 11.8v-1a1.2 1.2 0 0 1 2.4 0v1" />
          </svg>
        </span>
        <span class="tool" :title="t('chat.sessionToolGrants')" @click="showToolGrants = !showToolGrants">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
            <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z" />
            <path d="M9 12l2 2 4-4" stroke-linecap="round" stroke-linejoin="round" />
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
        @paste="onPaste"
      />
      <div class="send-row">
        <!-- 上下文注入量指示 + 压缩状态：压缩中百分比旁转圈，失败转圈原地变红色叹号（点击看原因）；点击文字打开压缩设置 -->
        <div v-if="ctxSize || compressing || compressError" class="ctx-status">
          <span
            v-if="ctxSize"
            class="ctx-size"
            :class="{ warn: ctxSize.chars > ctxSize.budget * 0.9 }"
            :title="t('chat.contextSizeTip')"
            @click="openSettings('compression')"
          >
            {{ t('chat.contextSize', { fixed: fmtK(ctxSize.fixed ?? 0), compress: fmtK(ctxSize.compressible ?? 0), total: fmtK(ctxSize.budget), percent: pct(ctxSize.chars, ctxSize.budget) }) }}
          </span>
          <span v-if="compressing" class="ctx-spin" :title="t('chat.compressing')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round">
              <path d="M12 3a9 9 0 1 0 9 9" />
            </svg>
          </span>
          <span v-else-if="compressError" class="ctx-err" :title="t('chat.compressErrTip')" @click="toggleCompressErr">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7.2v6M12 16.4v.4" />
            </svg>
          </span>
          <div v-if="compressErrOpen && compressError" class="compress-err-pop">{{ compressError }}</div>
        </div>
        <!-- 语音转文字：按住说话实时转写（未配置时点击前往设置） -->
        <span
          class="send-mic"
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
        <button v-if="canStopReply" class="send-btn stop" @click="handleStopReply">
          {{ t('chat.stopGenerating') }}
        </button>
        <button v-else class="send-btn" :disabled="!draft.trim() && pendingAttachments.length === 0" @click="handleSend">
          {{ t('chat.send') }}
         </button>
      </div>

      <SessionGrantsPopover v-if="showFileGrants" mode="files" :conversation-id="props.id" @close="showFileGrants = false" />
      <SessionGrantsPopover v-if="showToolGrants" mode="tools" :conversation-id="props.id" @close="showToolGrants = false" />
    </footer>

    <!-- 通道会话只读：聊天在微信/QQ 内进行，桌面端仅作镜像展示 -->
    <footer v-else class="input-area wechat-readonly">
      <div class="wechat-hint">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="7" y="2" width="10" height="20" rx="2" />
          <path d="M11 18h2" />
        </svg>
        <span>{{ isQq ? t('chat.qqReadOnly') : t('chat.wechatReadOnly') }}</span>
      </div>
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

/* 提问导航条：贴滚动条左侧的细刻度条，「我发出的提问」≥2 条且内容可滚动时出现 */
.msg-nav {
  position: absolute;
  top: $spacing-lg;
  bottom: $spacing-lg;
  /* 6px 滚动条 + 2px 空隙：贴在滚动条左侧 */
  right: 8px;
  width: 16px;
  z-index: 15;
  /* 空白区域不拦截消息点击，只有刻度本身可交互 */
  pointer-events: none;
}

.msg-nav-mark {
  position: absolute;
  right: 0;
  width: 16px;
  /* 刻度线 3px，盒高与密排步长一致（12px），悬停区正好铺满不留缝 */
  height: 12px;
  margin-top: -6px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  pointer-events: auto;
  cursor: pointer;

  &::before {
    content: '';
    /* 音乐律动：--amp 由 rAF 直接写元素行内变量（0~1 频谱能量），刻度向左伸展并增厚提亮；
       flex-shrink:0 放行溢出（右对齐向左长），否则伸展会被 16px 盒子钳回；
       width/height/opacity 不加 transition，60fps 逐帧写值叠加过渡会发闷 */
    flex-shrink: 0;
    width: calc(12px + var(--amp, 0) * 12px);
    height: calc(3px + var(--amp, 0) * 2px);
    border-radius: 2px;
    /* 次级文本色而非边框色：深色主题下边框色只有 8% 白，刻度会隐形 */
    background: var(--c-text-secondary);
    opacity: calc(0.55 + var(--amp, 0) * 0.45);
    transition: background $transition-fast;
  }

  &:hover::before,
  &.hover::before {
    width: 16px;
    background: $primary-color;
    opacity: 1;
  }

  &.active::before {
    background: $primary-color;
    opacity: calc(0.6 + var(--amp, 0) * 0.4);
  }

  &.active:hover::before {
    opacity: 1;
  }
}

/* 律动辅助条：填充真刻度上下的空档，颜色更淡、不可交互，让整条像一段完整声谱 */
.msg-nav-filler {
  position: absolute;
  right: 0;
  width: 16px;
  height: 12px;
  margin-top: -6px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  pointer-events: none;

  &::before {
    content: '';
    flex-shrink: 0;
    width: calc(8px + var(--amp, 0) * 10px);
    height: 3px;
    border-radius: 2px;
    background: var(--c-text-secondary);
    opacity: calc(0.16 + var(--amp, 0) * 0.4);
  }
}

/* 悬停刻度展开的提问面板（卡片式）：卡片贴着刻度条，悬停行钉在其刻度旁
 * （top 由 navPanelStyle 行内钳制计算），指到哪个刻度、卡片正对它的就是那行，弹窗与刻度融合；
 * top 过渡让卡片像刻度一样沿条平滑滑行，而非逐格瞬跳 */
.msg-nav-panel {
  position: absolute;
  right: 22px;
  width: 320px;
  padding: 4px;
  display: flex;
  flex-direction: column;
  background: $bg-panel;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  box-shadow: $shadow-md;
  pointer-events: auto;
  transition: top 0.18s ease;

  /* 隐形桥：面板右缘与刻度盒之间有 6px 死区（面板 right:22px 相对刻度条，右缘落在条外），
   * 慢速跨界时 180ms 宽限兜不住会闪关。桥向右盖满缝隙并压进刻度盒 2px，
   * 桥是面板自身的一部分——鼠标在缝上仍算在面板内，mouseleave 压根不触发 */
  &::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    right: -8px;
    width: 8px;
  }
}

.msg-nav-item {
  /* 行高固定：与刻度等距排列对应，缩放行不挤不跳 */
  height: 26px;
  display: flex;
  align-items: center;
  width: 100%;
  padding: 0 8px;
  border: none;
  border-radius: $radius-sm;
  background: transparent;
  text-align: left;
  cursor: pointer;
  font-size: $font-size-xs;
  /* 滚轮：行盒子不缩（布局稳定），内容缩放+变淡；向右缘（刻度侧）收缩保持融合感；
     高亮背景与刻度一样平滑过渡，悬停行切换时旧行淡出、新行淡入 */
  transform-origin: right center;
  transition: transform 0.15s ease, opacity 0.15s ease, background-color $transition-fast;
  will-change: transform, opacity;

  .txt {
    display: block;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: $text-primary;
  }

  &.hover,
  &:hover {
    background: $bg-hover;
  }
}

/* 点击导航刻度跳转后目标气泡的短暂描边提示 */
.message-list .nav-flash {
  outline: 2px solid transparent;
  outline-offset: 2px;
  animation: nav-flash-outline 1.4s ease forwards;
}

@keyframes nav-flash-outline {
  0% {
    outline-color: rgba(var(--c-primary-rgb), 0.9);
  }
  70% {
    outline-color: rgba(var(--c-primary-rgb), 0.45);
  }
  100% {
    outline-color: transparent;
  }
}

.chat-header {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $spacing-sm;
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
      padding: 0;
      border: none;
      background: none;
      cursor: pointer;
      transition: color $transition-fast;

      &:hover {
        color: $primary-color;
      }
    }
  }

  .more-wrap {
    position: relative;
    display: flex;
    align-items: center;
  }

  .wechat-agent-chip {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-right: $spacing-xs;
    padding: 3px $spacing-sm;
    border-radius: 999px;
    background: $bg-input;
    font-size: $font-size-xs;
    color: $text-secondary;
    cursor: pointer;
    flex-shrink: 0;
    transition: background $transition-fast, color $transition-fast;

    svg {
      width: 12px;
      height: 12px;
    }

    &:hover {
      background: $bg-hover;
      color: $text-primary;
    }
  }

  .wechat-agent-pop {
    position: absolute;
    top: calc(100% + 10px);
    right: 40px;
    z-index: 30;
    min-width: 200px;
    max-height: 60vh;
    overflow-y: auto;
    padding: $spacing-xs;
    background: $bg-panel;
    border: 1px solid $border-color;
    border-radius: $radius-md;
    box-shadow: $shadow-md;
    display: flex;
    flex-direction: column;

    .wa-row {
      display: flex;
      align-items: center;
      gap: $spacing-sm;
      padding: 6px $spacing-sm;
      border-radius: $radius-sm;
      font-size: $font-size-sm;
      color: $text-primary;
      text-align: left;
      cursor: pointer;

      &:hover {
        background: $bg-hover;
      }

      &.on {
        color: $primary-color;
        background: rgba(var(--c-primary-rgb), 0.1);
      }
    }
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

.member-mask {
  position: fixed;
  inset: 0;
  z-index: 29;
}

.member-pop {
  position: absolute;
  top: 54px;
  left: $spacing-lg;
  z-index: 30;
  min-width: 180px;
  max-width: 280px;
  max-height: 320px;
  overflow-y: auto;
  padding: $spacing-sm;
  background: $bg-panel;
  border: 1px solid $border-color;
  border-radius: $radius-md;
  box-shadow: $shadow-md;

  .member-pop-title {
    padding: 2px $spacing-sm $spacing-sm;
    font-size: $font-size-xs;
    color: $text-tertiary;
  }

  .member-row {
    display: flex;
    align-items: center;
    gap: $spacing-sm;
    width: 100%;
    padding: 6px $spacing-sm;
    border: none;
    background: none;
    border-radius: $radius-sm;
    cursor: pointer;
    text-align: left;
    transition: background $transition-fast;

    &:hover {
      background: $bg-hover;
    }

    .member-name {
      font-size: $font-size-sm;
      color: $text-primary;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .member-badge {
      flex-shrink: 0;
      padding: 1px 6px;
      border-radius: $radius-sm;
      background: rgba(var(--c-primary-rgb), 0.12);
      color: $primary-color;
      font-size: $font-size-xs;
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

  /* 系统标注（如微信会话的处理智能体切换记录）：居中弱化展示 */
  .system-note {
    align-self: center;
    max-width: 80%;
    font-size: $font-size-xs;
    color: $text-tertiary;
    background: var(--c-bg-hover);
    border-radius: 999px;
    padding: 2px 12px;
    text-align: center;
    word-break: break-all;
  }

  .empty {
    margin: auto;
    color: $text-tertiary;
    font-size: $font-size-sm;
  }
}

/* 思考中指示条：样式对齐 MessageBubble 的打字点动画（scoped 内 keyframes 独立命名） */
.thinking-row {
  display: flex;
  align-items: flex-start;
  gap: $spacing-md;
}

/* 名字在气泡上方，对齐消息气泡的排版（bubble-col / sender-name） */
.thinking-col {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.thinking-name {
  font-size: $font-size-xs;
  color: $text-tertiary;
  line-height: 1;
}

.thinking-bubble {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  align-items: center;
  padding: 13px $spacing-md;
  background: $bg-bubble-other;
  border-radius: 2px $radius-md $radius-md $radius-md;

  /* 思考过程流文本占满整行，打字点换行到左下角 */
  .thinking-stream {
    flex-basis: 100%;
    max-height: 132px;
    overflow-y: auto;
    white-space: pre-wrap;
    word-break: break-word;
    font-size: $font-size-sm;
    line-height: 1.55;
    color: $text-secondary;
  }

  .dots {
    display: flex;
    gap: 5px;
    align-items: center;

    span {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: $text-tertiary;
      animation: thinking-blink 1.2s infinite ease-in-out;

      &:nth-child(2) {
        animation-delay: 0.2s;
      }

      &:nth-child(3) {
        animation-delay: 0.4s;
      }
    }
  }
}

@keyframes thinking-blink {
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

.web-activity-tip {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  width: fit-content;
  max-width: 70%;
  margin: $spacing-sm 0 $spacing-sm calc(36px + #{$spacing-md});
  padding: 8px $spacing-md;
  border-radius: $radius-md;
  background: $bg-panel;
  border: 1px solid $border-color;

  svg {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    color: $text-tertiary;
  }

  .text {
    font-size: $font-size-sm;
    color: $text-secondary;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.image-gen-tip {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  width: fit-content;
  /* 与消息气泡对齐：让出头像宽度（36px）+ 头像与气泡的间距 */
  margin: $spacing-sm 0 $spacing-sm calc(36px + #{$spacing-md});
  padding: 8px $spacing-md;
  border-radius: $radius-md;
  background: $bg-panel;
  border: 1px solid $border-color;

  .ring {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    border-radius: 50%;
    border: 2px solid rgba(var(--c-primary-rgb), 0.25);
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

.ask-requests {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;
  padding: $spacing-sm $spacing-lg;
  border-top: 1px solid rgba($primary-color, 0.25);
  background: rgba($primary-color, 0.06);
  max-height: 320px;
  overflow-y: auto;
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

  &.wl {
    background: $bg-input;
    color: #07c160;
    border-color: rgba(7, 193, 96, 0.4);

    &:hover {
      background: rgba(7, 193, 96, 0.08);
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

  // 上边框即拖拽手柄：平时隐形，悬停/拖动时边框亮起提示可拖
  .resize-handle {
    position: absolute;
    top: -3px;
    left: 0;
    right: 0;
    height: 7px;
    z-index: 5;
    cursor: ns-resize;
    touch-action: none;
    user-select: none;
  }

  &:has(.resize-handle:hover),
  &.resizing {
    border-top-color: rgba(var(--c-primary-rgb), 0.65);
  }

  &.dragging {
    outline: 2px dashed $primary-color;
    outline-offset: -6px;
    background: rgba(var(--c-primary-rgb), 0.06);
  }

  &.wechat-readonly {
    align-items: center;
    justify-content: center;

    .wechat-hint {
      display: flex;
      align-items: center;
      gap: $spacing-sm;
      padding: $spacing-sm 0;
      font-size: $font-size-sm;
      color: $text-tertiary;

      svg {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
      }
    }
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
  background: rgba(var(--c-panel-rgb), 0.85);
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
  flex: 1 1 auto;
  min-height: 0;

  &::placeholder {
    color: $text-tertiary;
  }
}

.send-row {
  display: flex;
  justify-content: flex-end;
  align-items: center;
}

/* 语音转文字按钮（发送按钮左侧）：按住说话，识别中绿色脉冲 */
.send-mic {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1px solid $border-color;
  background: transparent;
  color: $text-secondary;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  margin-right: $spacing-sm;
  user-select: none;
  touch-action: none;
  flex-shrink: 0;
  transition: all $transition-fast;

  svg {
    width: 17px;
    height: 17px;
  }

  &:hover {
    color: $text-primary;
    border-color: $text-tertiary;
  }

  &.live {
    color: #07c160;
    border-color: rgba(7, 193, 96, 0.5);
    animation: mic-pulse 1.2s infinite ease-in-out;
  }
}

/* 上下文注入量指示（发送行左下角）：文字 + 压缩转圈/失败叹号同排，错误气泡锚定在其上方 */
.ctx-status {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  margin-right: auto;
  min-width: 0;
}

.ctx-size {
  font-size: $font-size-xs;
  color: $text-tertiary;
  transition: color $transition-fast;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;

  // 与其他可点元素同口径：悬浮亮一档（三级文字 → 二级文字），不跳主色
  &:hover {
    color: $text-secondary;
  }

  &.warn {
    color: #fa8a51;

    &:hover {
      color: #ffa76e;
    }
  }
}

/* 压缩进行中：百分比右侧转圈（后台压缩不阻塞回复，转圈表明摘要正在收敛） */
.ctx-spin {
  display: inline-flex;
  flex-shrink: 0;
  color: $text-tertiary;

  svg {
    width: 12px;
    height: 12px;
    animation: ctx-spin-rotate 0.9s linear infinite;
  }
}

@keyframes ctx-spin-rotate {
  to {
    transform: rotate(360deg);
  }
}

/* 压缩失败：转圈原地变红色叹号，点击展开失败原因 */
.ctx-err {
  display: inline-flex;
  flex-shrink: 0;
  color: #fa5151;
  cursor: pointer;

  svg {
    width: 13px;
    height: 13px;
  }
}

.compress-err-pop {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  z-index: 30;
  max-width: 420px;
  padding: 8px 10px;
  border-radius: $radius-md;
  background: $bg-panel;
  border: 1px solid $border-color;
  box-shadow: $shadow-md;
  font-size: $font-size-xs;
  color: $text-secondary;
  word-break: break-all;
  white-space: pre-wrap;
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

  &.stop {
    background: transparent;
    color: $text-secondary;
    border: 1px solid rgba(255, 255, 255, 0.16);

    &:hover {
      background: rgba(250, 81, 81, 0.14);
      color: #ff9c9c;
      border-color: rgba(250, 81, 81, 0.45);
    }
  }
}
</style>
