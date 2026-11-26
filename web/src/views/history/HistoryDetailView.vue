<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { Agent, Conversation, Message } from '@/types'
import { listMessages } from '@/api/conversation'
import { getQqStatus, type QqStatus } from '@/api/qq'
import { restoreArchivedTask } from '@/api/tasks'
import { useHistoryStore } from '@/stores/history'
import { useAgentStore } from '@/stores/agent'
import { useUserStore } from '@/stores/user'
import { alertAction, confirmAction } from '@/composables/confirm'
import { showToast } from '@/composables/toast'
import { useQuestionNav } from '@/composables/questionNav'
import MessageBubble from '@/components/common/MessageBubble.vue'
import ContextMenu from '@/components/common/ContextMenu.vue'
import { copyImage, copyText } from '@/utils/clipboard'
import { formatDividerTime } from '@/utils/time'
import { exportConversation } from '@/utils/chatExport'
import { channelConversation } from '@/utils/conversationName'
import { QQ_AVATAR } from '@/constants/channelAvatars'
import { t } from '@/i18n'

const props = defineProps<{ id: string }>()

const router = useRouter()
const historyStore = useHistoryStore()
const agentStore = useAgentStore()
const userStore = useUserStore()

const DIVIDER_GAP = 5 * 60 * 1000
const PAGE_SIZE = 50

const messages = ref<Message[]>([])
const hasMore = ref(false)
const loadingMore = ref(false)
const restoring = ref(false)

const conv = computed<Conversation | undefined>(() => historyStore.archived.find((c) => c.id === props.id))

/** 机主 openid：QQ 会话里区分哪些 user 消息是自己发的 */
const qqStatus = ref<QqStatus | null>(null)

async function refreshQqStatus() {
  try {
    qqStatus.value = await getQqStatus()
  } catch {
    /* 读取失败保持旧值 */
  }
}

const title = computed(() => {
  if (!conv.value) return t('history.title')
  // 通道归档（微信/QQ）固定显示机器人名（切过智能体后 agentId 已不代表最初处理者）
  const channelName = channelConversation(conv.value)
  if (channelName) return channelName.name
  // 任务归档的标题就是任务名
  if (conv.value.category === 'task') return conv.value.name || t('history.taskTag')
  if (conv.value.type === 'group') return conv.value.name || t('history.group')
  const agent = conv.value.agentId ? agentStore.getById(conv.value.agentId) : undefined
  return agent?.name ?? t('common.deletedAgent')
})

/** 归档标签：任务归档与普通归档区分 */
const tagText = computed(() =>
  conv.value?.category === 'task' ? t('history.taskTag') : t('history.tag'),
)

/** 定时任务触发的合成消息（user 轮次带 taskId）不在前端展示 */
function isTaskTrigger(m: Message): boolean {
  return m.senderType === 'user' && !!m.taskId
}

async function load() {
  try {
    const page = await listMessages(props.id, undefined, PAGE_SIZE)
    messages.value = page.list.filter((m) => !isTaskTrigger(m))
    hasMore.value = page.hasMore
  } catch {
    messages.value = []
    hasMore.value = false
  }
}

/** 向头部拼接更早的消息 */
async function loadMore() {
  if (loadingMore.value || messages.value.length === 0) return
  loadingMore.value = true
  try {
    const before = messages.value[0]?.timestamp
    if (before === undefined) return
    const page = await listMessages(props.id, before, PAGE_SIZE)
    messages.value = [...page.list.filter((m) => !isTaskTrigger(m)), ...messages.value]
    hasMore.value = page.hasMore
  } finally {
    loadingMore.value = false
  }
}

const listRef = ref<HTMLElement | null>(null)

// ---------- 提问导航条：消息区右缘贴滚动条的刻度条，「我发出的提问」每条一个刻度（DeepSeek 风格） ----------
// 悬停任意刻度展开附近提问索引面板（卡片式，悬停行钉在其刻度旁、滚轮式缩放变淡）；移入面板后同一套滚轮跟随鼠标（行悬停滑窗+滚轮滚动）、点击平滑跳转、可视高亮。共享逻辑在 composables/questionNav.ts；
// 只读归档无音乐律动，仅纯刻度。「我发的」用 isSelf 判定（QQ 外部成员消息不算），气泡展示的 :self 口径不变
const { navMarks, navActiveIds, navHoverId, navPanelOpen, navPanelItems, navItemStyle, navItemHovered, navPanelStyle, hoverNavMark, hoverNavItem, rollNavPanel, openNavPanel, scheduleNavPanelClose, closeNavPanelNow, jumpToMsg, navOnScroll } =
  useQuestionNav({
    listRef,
    messages,
    source: () => [props.id, messages.value.length] as const,
  })

// 切换历史会话时组件被路由复用（仅参数变化）：等新消息就绪后在同一帧「换内容 + 滚动归零」，避免闪烁
watch(
  () => props.id,
  async () => {
    await load()
    listRef.value?.scrollTo({ top: 0 })
  },
  { immediate: true },
)

watch(
  () => conv.value?.channel,
  (ch) => {
    if (ch === 'qq') refreshQqStatus()
  },
  { immediate: true },
)

function shouldShowDivider(index: number): boolean {
  if (index === 0) return true
  return messages.value[index].timestamp - messages.value[index - 1].timestamp > DIVIDER_GAP
}

/** QQ 会话里从 QQ 侧发来的外部消息（群成员/私聊好友）：气泡同样靠右（与微信通道一致——
 *  通道对端在右、智能体在左），但保留名字+企鹅头像+角色徽标；'u0' 是旧消息的本地发送占位 */
function isExternal(msg: Message): boolean {
  if (msg.senderType !== 'user') return false
  if (conv.value?.channel !== 'qq') return false
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
  return conv.value?.hostAgentId === msg.senderId ? t('common.host') : undefined
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

async function continueChat() {
  if (restoring.value) return
  restoring.value = true
  try {
    const dto = await historyStore.restore(props.id)
    router.push(`/chat/${dto.id}`)
  } catch (e) {
    showToast(e instanceof Error ? e.message : t('history.restoreFailed'))
  } finally {
    restoring.value = false
  }
}

/** 恢复任务：按归档快照重建定时任务，成功后跳到任务页 */
async function restoreTask() {
  if (restoring.value) return
  restoring.value = true
  try {
    const task = await restoreArchivedTask(props.id)
    showToast(t('history.taskRestored'))
    router.push(`/tasks/${task.conversationId}`)
  } catch (e) {
    showToast(e instanceof Error ? e.message : t('history.restoreFailed'))
  } finally {
    restoring.value = false
  }
}

async function removeHistory() {
  const ok = await confirmAction({
    title: t('history.deleteTitle'),
    message: t('history.deleteMsg'),
    confirmText: t('common.delete'),
    danger: true,
  })
  if (!ok) return
  try {
    await historyStore.deleteArchived(props.id)
    router.replace('/history')
  } catch (e) {
    showToast(e instanceof Error ? e.message : t('history.deleteFailed'))
  }
}

/** 导出该归档会话全部消息为 Markdown 文件 */
async function exportChat() {
  if (!conv.value) return
  await exportConversation(conv.value, 'history')
}

/** 页头「更多」菜单：低频操作（导出等）收纳处 */
const moreCtx = ref<{ x: number; y: number } | null>(null)
/** 菜单顺序全局统一：更新数据 → 导出（紧邻删除正上方）→ 删除数据；与列表右键菜单一致 */
const moreItems = computed(() => {
  const items: { key: string; label: string; danger?: boolean }[] = []
  const c = conv.value
  if (!c) return items
  // 任务归档只能恢复任务；通道归档（微信/QQ）不可恢复聊天
  if (c.category === 'task') items.push({ key: 'restore-task', label: t('history.restoreTask') })
  else if (c.channel !== 'wechat' && c.channel !== 'qq')
    items.push({ key: 'continue', label: restoring.value ? t('history.restoring') : t('history.continueChat') })
  items.push({ key: 'export', label: t('chat.exportChat') })
  items.push({ key: 'delete', label: t('common.delete'), danger: true })
  return items
})

function openMore(e: MouseEvent) {
  moreCtx.value = { x: e.clientX, y: e.clientY }
}

async function onMoreSelect(key: string) {
  if (key === 'restore-task') await restoreTask()
  else if (key === 'continue') await continueChat()
  else if (key === 'export') await exportChat()
  else if (key === 'delete') await removeHistory()
}

// 消息气泡右键菜单（与聊天页一致）：右键点在气泡内图片上时额外提供复制图片
const msgCtx = ref<{ x: number; y: number; msg: Message; imgSrc: string | null } | null>(null)

function openMsgCtx(e: MouseEvent, msg: Message) {
  const imgEl = (e.target as HTMLElement | null)?.closest('img') as HTMLImageElement | null
  msgCtx.value = { x: e.clientX, y: e.clientY, msg, imgSrc: imgEl?.getAttribute('src') ?? null }
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
</script>

<template>
  <div class="history-detail">
    <header class="detail-header drag-region">
      <span class="title">{{ title }}</span>
      <span class="archive-tag">{{ tagText }}</span>
      <div class="spacer" />
      <!-- 任务归档按快照恢复定时任务；普通归档可恢复会话；微信归档不可恢复聊天，仅供留档查看。操作全部收进「更多」菜单 -->
      <button class="head-more" :title="t('common.more')" @click.stop="openMore($event)">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
    </header>

    <div class="list-wrap">
      <div ref="listRef" class="message-list" @scroll="navOnScroll">
        <button v-if="hasMore" class="load-more" :disabled="loadingMore" @click="loadMore">
          {{ loadingMore ? t('history.loading') : t('history.loadMore') }}
        </button>
        <template v-for="(msg, i) in messages" :key="msg.id">
          <div v-if="shouldShowDivider(i)" class="time-divider">
            {{ formatDividerTime(msg.timestamp) }}
          </div>
          <div v-if="msg.senderType === 'system'" class="system-note">{{ msg.content }}</div>
          <MessageBubble
            v-else
            :message="msg"
            :self="msg.senderType === 'user'"
            :data-nav-id="isSelf(msg) ? msg.id : undefined"
            :sender-name="senderInfo(msg).name"
            :sender-avatar="senderInfo(msg).avatar"
            :badge="senderBadge(msg)"
            :show-name="(conv?.type === 'group' || isExternal(msg)) && !isSelf(msg)"
            :avatar-navigable="senderAgent(msg) !== undefined"
            @bubble-menu="openMsgCtx($event, msg)"
            @avatar-open="openAgentProfile(msg)"
          />
        </template>
        <div v-if="messages.length === 0" class="empty">{{ t('history.noMessages') }}</div>
      </div>

      <!-- 提问导航条：我发出的提问每条一个刻度贴滚动条左侧；悬停任意刻度展开全部提问索引面板，点击跳转 -->
      <div v-if="navMarks.length >= 2" class="msg-nav">
        <div
          v-for="m in navMarks"
          :key="m.id"
          class="msg-nav-mark"
          :class="{ active: navActiveIds.includes(m.id), hover: navHoverId === m.id }"
          :style="{ top: `calc(50% + ${m.off}px)` }"
          @click="jumpToMsg(m.id)"
          @mouseenter="hoverNavMark(m)"
          @mouseleave="scheduleNavPanelClose()"
        ></div>
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

    <ContextMenu
      v-if="msgCtx"
      :x="msgCtx.x"
      :y="msgCtx.y"
      :items="msgCtxItems"
      @select="onMsgCtxSelect"
      @close="msgCtx = null"
    />
    <ContextMenu
      v-if="moreCtx"
      :x="moreCtx.x"
      :y="moreCtx.y"
      :items="moreItems"
      @select="onMoreSelect"
      @close="moreCtx = null"
    />
  </div>
</template>

<style scoped lang="scss">
.history-detail {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.detail-header {
  display: flex;
  align-items: center;
  gap: $spacing-md;
  padding: 0 $spacing-lg;
  height: 52px;
  border-bottom: 1px solid $border-color;
  flex-shrink: 0;

  .title {
    font-size: $font-size-md;
    font-weight: 600;
    color: $text-primary;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .archive-tag {
    flex-shrink: 0;
    padding: 2px $spacing-md;
    border-radius: 999px;
    font-size: $font-size-xs;
    background: $bg-input;
    color: $text-tertiary;
  }

  .spacer {
    flex: 1;
  }
}

.head-more {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: $radius-sm;
  color: $text-secondary;
  cursor: pointer;
  transition: background $transition-fast, color $transition-fast;

  svg {
    width: 20px;
    height: 20px;
  }

  &:hover {
    background: $bg-panel-hover;
    color: $text-primary;
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
}

.load-more {
  align-self: center;
  padding: 5px $spacing-xl;
  border-radius: 999px;
  background: $bg-input;
  color: $text-secondary;
  font-size: $font-size-xs;
  cursor: pointer;
  transition: background $transition-fast;

  &:hover:not(:disabled) {
    background: $bg-hover;
  }

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
}

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
  font-size: $font-size-sm;
  color: $text-tertiary;
}

/* 导航条的定位容器：包住 message-list，刻度条绝对定位贴其右缘 */
.list-wrap {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
}

/* 提问导航条：贴滚动条左侧的细刻度条，「我发出的提问」≥2 条且内容可滚动时出现。
   样式与 ChatView 保持一致；归档只读无音乐律动，刻度恒定 12px 长 */
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
    flex-shrink: 0;
    width: 12px;
    height: 3px;
    border-radius: 2px;
    /* 次级文本色而非边框色：深色主题下边框色只有 8% 白，刻度会隐形 */
    background: var(--c-text-secondary);
    opacity: 0.55;
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
    opacity: 0.6;
  }

  &.active:hover::before {
    opacity: 1;
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
</style>
