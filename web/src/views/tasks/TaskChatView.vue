<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useConversationStore } from '@/stores/conversation'
import { useUserStore } from '@/stores/user'
import { useAgentStore } from '@/stores/agent'
import { useModelPresetStore } from '@/stores/modelPreset'
import { alertAction, confirmAction } from '@/composables/confirm'
import { stopOrchestration } from '@/api/conversation'
import type { Agent, Message, OpRequest, ScheduledTask } from '@/types'
import MessageBubble from '@/components/common/MessageBubble.vue'
import ContextMenu from '@/components/common/ContextMenu.vue'
import Avatar from '@/components/common/Avatar.vue'
import {
  deleteConversationTasks,
  deleteTask,
  listTasksOfConversation,
  runTaskNow,
  updateConversationTaskStatus,
  updateTask,
} from '@/api/tasks'
import TaskFormModal from './components/TaskFormModal.vue'
import { formatDividerTime } from '@/utils/time'
import { copyText } from '@/utils/clipboard'
import { exportConversation } from '@/utils/chatExport'
import { showToast } from '@/composables/toast'
import { t } from '@/i18n'

/**
 * 任务页右侧的只读结果区：展示定时任务触发的智能体执行结果。
 * 独立于 ChatView——无输入区，选中具体任务时页头提供编辑/暂停/删除，
 * 触发消息（user 轮次带 taskId）不展示。
 */
const props = defineProps<{ id: string }>()

const conversationStore = useConversationStore()
const userStore = useUserStore()
const agentStore = useAgentStore()
const presetStore = useModelPresetStore()
const route = useRoute()
const router = useRouter()

const DIVIDER_GAP = 5 * 60 * 1000

const listRef = ref<HTMLElement>()
/** 编辑当前选中任务的弹窗 */
const showTaskForm = ref(false)
/** 当前会话的任务列表（右上角操作与标题展示用） */
const tasks = ref<ScheduledTask[]>([])

const activeTaskId = computed(() =>
  typeof route.query.task === 'string' && route.query.task ? route.query.task : null,
)

const activeTask = computed(() => tasks.value.find((task) => task.id === activeTaskId.value))

/** 协作任务群本身就是一个任务：直接点开群（无 ?task= 筛选）时头部操作落在它唯一的任务上 */
const currentTask = computed(() => {
  if (activeTask.value) return activeTask.value
  if (conversation.value?.type === 'group') return tasks.value[0] ?? null
  return null
})

function statusLabel(status: ScheduledTask['status']): string {
  return status === 'active' ? t('tasks.statusActive') : status === 'paused' ? t('tasks.statusPaused') : t('tasks.statusDone')
}

async function refreshTasks() {
  try {
    tasks.value = await listTasksOfConversation(props.id)
  } catch {
    /* 任务列表加载失败不阻塞结果展示 */
  }
}

const conversation = computed(() => conversationStore.findConv(props.id))

const messages = computed(() => conversationStore.currentMessages)

/** 任务触发的合成消息（user 轮次带 taskId）不在前端展示，只看执行结果 */
const visibleMessages = computed(() =>
  messages.value.filter((m) => !(m.senderType === 'user' && m.taskId)),
)

watch(conversation, (conv) => {
  if (!conv) router.push('/tasks')
})

const title = computed(() => {
  const conv = conversation.value
  if (!conv) return t('nav.tasks')
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

/** 协作任务群成员（点击头部「（N人）」展示），编排者排第一 */
const memberAgents = computed<Agent[]>(() => {
  const conv = conversation.value
  if (conv?.type !== 'group') return []
  return conv.memberIds
    .map((id) => agentStore.getById(id))
    .filter((a): a is Agent => !!a)
    .sort((a, b) => Number(b.isOrchestrator) - Number(a.isOrchestrator))
})

const showMembers = ref(false)

const coordinator = computed(() => {
  if (!conversationStore.isCoordinating(props.id)) return null
  const agentId = conversationStore.orchestratingByConv[props.id]
  return agentId ? (agentStore.getById(agentId) ?? null) : null
})

const discussing = computed(() => conversationStore.isDiscussing(props.id))

const imageAgentName = computed(() => conversationStore.isGeneratingImage(props.id))

// 消息气泡右键菜单：只读视图仅保留复制
const msgCtx = ref<{ x: number; y: number; msg: Message } | null>(null)

function openMsgCtx(e: MouseEvent, msg: Message) {
  msgCtx.value = { x: e.clientX, y: e.clientY, msg }
}

const msgCtxItems = computed(() =>
  msgCtx.value ? [{ key: 'copy-text', label: t('chat.copyText') }] : [],
)

async function onMsgCtxSelect(key: string) {
  const ctx = msgCtx.value
  if (!ctx) return
  try {
    if (key === 'copy-text') {
      await copyText(ctx.msg.content)
      showToast(t('chat.copied'))
    }
  } catch (err) {
    alertAction(err instanceof Error ? err.message : t('chat.copyFailed'))
  }
}

const pendingRequests = computed(() => conversationStore.pendingOpRequests(props.id))

async function decideOp(r: OpRequest, decision: 'once' | 'conversation' | 'deny') {
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
}))

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

function isSelf(msg: Message): boolean {
  return msg.senderType === 'user'
}

function senderInfo(msg: Message): { name: string; avatar?: string } {
  if (isSelf(msg)) {
    return { name: userStore.user?.name ?? t('chat.replySelf'), avatar: userStore.user?.avatar }
  }
  const agent = agentStore.getById(msg.senderId)
  return { name: agent?.name ?? t('common.unknownAgent'), avatar: agent?.avatar }
}

/** 任务线程内消息带任务名徽标，与同线程其他任务区分 */
function senderBadge(msg: Message): string | undefined {
  if (isSelf(msg)) return undefined
  if (msg.taskName) return msg.taskName
  return agentStore.getById(msg.senderId)?.isOrchestrator ? t('common.orchestrator') : undefined
}

/** 思考中指示条：任务触发到回复开始/接龙间隙显示「谁在思考」 */
const showThinking = computed(() => {
  // 任务回合经扇出订阅送达，typing 要到 reply_start 才置位；pending 预告须单独成立，
  // 否则「立即执行」到首段回复之间的空窗没有指示，用户会以为卡住了
  if (conversationStore.pendingReplyByConv[props.id]) return true
  if (!conversationStore.isTyping(props.id)) return false
  const last = messages.value[messages.value.length - 1]
  return !(last && last.senderType === 'agent')
})

const thinkingAgent = computed(() => {
  const id = conversationStore.pendingReplyByConv[props.id]
    ?? conversation.value?.agentId
    ?? coordinator.value?.id
  return id ? agentStore.getById(id) : undefined
})

/** 贴底自动滚动：上翻暂停，滚回底部或切换会话后恢复 */
const stickToBottom = ref(true)
let lastScrollTop = 0

function onListScroll() {
  const el = listRef.value
  if (!el) return
  const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
  if (distanceFromBottom < 40) {
    stickToBottom.value = true
  } else if (el.scrollTop < lastScrollTop) {
    stickToBottom.value = false
  }
  lastScrollTop = el.scrollTop
}

async function scrollToBottom() {
  if (!stickToBottom.value) return
  await nextTick()
  const el = listRef.value
  if (!el || !stickToBottom.value) return
  el.scrollTo({ top: el.scrollHeight })
  lastScrollTop = el.scrollTop
}

async function forceScrollToBottom() {
  stickToBottom.value = true
  await scrollToBottom()
}

function jumpToBottom() {
  forceScrollToBottom()
}

// 任务线程没有本地发送方，常驻订阅扇出事件，定时触发的回合才能实时可见
let stopWatch: (() => void) | null = null

function subscribe() {
  stopWatch?.()
  stopWatch = conversationStore.watchConversation(props.id)
}

function unsubscribe() {
  stopWatch?.()
  stopWatch = null
}

watch(
  () => props.id,
  (id) => {
    if (!id) return
    unsubscribe()
    showMembers.value = false
    conversationStore.setActive(id)
    forceScrollToBottom()
    subscribe()
    refreshTasks()
  },
  { immediate: true },
)

// 左列表的任务操作（暂停/删除/编辑）会重拉任务会话列表，这里借机同步任务数据
watch(() => conversationStore.taskConversations, () => refreshTasks())

onBeforeUnmount(() => {
  unsubscribe()
  conversationStore.setTaskFilter(null)
})

// 任务页 chips 写入 ?task=，这里同步按任务筛选消息
watch(
  () => route.query.task,
  (taskId) => {
    conversationStore.setTaskFilter(typeof taskId === 'string' && taskId ? taskId : null)
  },
)

watch(
  () => [visibleMessages.value.length, visibleMessages.value[visibleMessages.value.length - 1]?.content] as const,
  () => scrollToBottom(),
)

watch(imageAgentName, () => scrollToBottom())

function shouldShowDivider(index: number): boolean {
  if (index === 0) return true
  return visibleMessages.value[index].timestamp - visibleMessages.value[index - 1].timestamp > DIVIDER_GAP
}

async function handleStopCoordination() {
  const name = coordinator.value?.name ?? t('common.orchestrator')
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
    conversationStore.clearOpRequests(props.id)
  } catch (err) {
    alertAction(err instanceof Error ? err.message : t('chat.stopFailed'))
  }
}

async function togglePause() {
  const task = currentTask.value
  if (!task) return
  try {
    await updateTask(task.id, { status: task.status === 'paused' ? 'active' : 'paused' })
    refreshTasks()
    conversationStore.loadTaskConversations().catch(() => {})
  } catch (e) {
    alertAction(e instanceof Error ? e.message : t('common.opFailed'))
  }
}

/** 立即执行一次：手动触发与到点相同的流程，结果实时推回本视图 */
const running = ref(false)

async function runNow() {
  const task = currentTask.value
  if (!task || running.value) return
  running.value = true
  try {
    await runTaskNow(task.id)
    showToast(t('tasks.runTriggered'))
    refreshTasks()
    conversationStore.loadTaskConversations().catch(() => {})
  } catch (e) {
    alertAction(e instanceof Error ? e.message : t('common.opFailed'))
  } finally {
    running.value = false
  }
}

async function removeTask() {
  const task = currentTask.value
  if (!task) return
  const ok = await confirmAction({
    title: t('common.delete'),
    message: t('tasks.deleteMsg'),
    confirmText: t('common.delete'),
    danger: true,
  })
  if (!ok) return
  try {
    await deleteTask(task.id)
    // 停止筛选被删任务，回到该主体的全部消息；协作任务群删光任务后主体消失，回到任务页
    if (activeTaskId.value) router.push(`/tasks/${props.id}`)
    else router.push('/tasks')
    refreshTasks()
    // 任务删光时主体会从列表消失，重拉列表同步
    conversationStore.loadTaskConversations().catch(() => {})
  } catch (e) {
    alertAction(e instanceof Error ? e.message : t('common.opFailed'))
  }
}

function onTaskSaved() {
  showTaskForm.value = false
  refreshTasks()
  conversationStore.loadTaskConversations().catch(() => {})
}

/** 批量暂停/恢复：与列表右键菜单一致，作用于该主体全部任务 */
async function bulkStatusAll(status: 'active' | 'paused') {
  try {
    await updateConversationTaskStatus(props.id, status)
    refreshTasks()
    conversationStore.loadTaskConversations().catch(() => {})
  } catch (e) {
    alertAction(e instanceof Error ? e.message : t('common.opFailed'))
  }
}

/** 删除该主体全部任务，删光后主体从列表消失 */
async function removeAllTasks() {
  const ok = await confirmAction({
    title: t('tasks.deleteAll'),
    message: t('tasks.deleteAllMsg'),
    confirmText: t('common.delete'),
    danger: true,
  })
  if (!ok) return
  try {
    await deleteConversationTasks(props.id)
    router.push('/tasks')
    refreshTasks()
    conversationStore.loadTaskConversations().catch(() => {})
  } catch (e) {
    alertAction(e instanceof Error ? e.message : t('common.opFailed'))
  }
}

/** 导出当前任务会话全部消息为 Markdown 文件 */
async function exportChat() {
  const conv = conversation.value
  if (!conv) return
  await exportConversation(conv, 'task')
}

/** 页头「更多」菜单：任务操作与导出全部收纳于此，页头只留标题与状态 */
const moreCtx = ref<{ x: number; y: number } | null>(null)
/** 菜单顺序全局统一：不影响数据 → 更新数据 → 删除数据 */
const moreItems = computed(() => {
  const items: { key: string; label: string; danger?: boolean }[] = []
  const task = currentTask.value
  // 顶部：不影响数据
  if (task && !running.value) items.push({ key: 'run', label: t('tasks.runNow') })
  items.push({ key: 'export', label: t('chat.exportChat') })
  // 中间：更新数据（单个任务操作在前，批量在后）
  if (task) {
    items.push({ key: 'edit', label: t('tasks.edit') })
    if (task.status !== 'done') {
      items.push({ key: 'pause', label: task.status === 'paused' ? t('tasks.resume') : t('tasks.pause') })
    }
  }
  // 批量操作与列表右键一致：有暂停的可全部恢复、有进行中的可全部暂停；协作任务群只有一个任务不展示
  if (conversation.value?.type !== 'group') {
    if (tasks.value.some((x) => x.status === 'paused'))
      items.push({ key: 'resume-all', label: t('tasks.resumeAll') })
    if (tasks.value.some((x) => x.status === 'active'))
      items.push({ key: 'pause-all', label: t('tasks.pauseAll') })
  }
  // 底部：删除数据
  if (task) items.push({ key: 'delete', label: t('common.delete'), danger: true })
  if (conversation.value?.type !== 'group')
    items.push({ key: 'delete-all', label: t('tasks.deleteAll'), danger: true })
  return items
})

function openMore(e: MouseEvent) {
  moreCtx.value = { x: e.clientX, y: e.clientY }
}

async function onMoreSelect(key: string) {
  if (key === 'run') await runNow()
  else if (key === 'edit') showTaskForm.value = true
  else if (key === 'pause') await togglePause()
  else if (key === 'delete') await removeTask()
  else if (key === 'resume-all') await bulkStatusAll('active')
  else if (key === 'pause-all') await bulkStatusAll('paused')
  else if (key === 'delete-all') await removeAllTasks()
  else if (key === 'export') await exportChat()
}
</script>

<template>
  <div class="task-chat-view">
    <header class="view-header drag-region">
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
        <span v-if="currentTask" class="task-status" :class="currentTask.status">
          {{ statusLabel(currentTask.status) }}
        </span>
      </span>
      <button class="head-more" :title="t('common.more')" @click.stop="openMore($event)">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
    </header>

    <template v-if="showMembers && memberAgents.length > 0">
      <div class="member-mask" @click="showMembers = false" />
      <div class="member-pop">
        <div class="member-pop-title">{{ t('chat.groupMembers') }}</div>
        <button v-for="a in memberAgents" :key="a.id" class="member-row" @click="showMembers = false">
          <Avatar :name="a.name" :avatar="a.avatar" :size="28" />
          <span class="member-name">{{ a.name }}</span>
          <span v-if="a.isOrchestrator" class="member-badge">{{ t('common.orchestrator') }}</span>
        </button>
      </div>
    </template>

    <div class="list-wrap">
      <div ref="listRef" class="message-list" @scroll="onListScroll">
        <template v-for="(msg, i) in visibleMessages" :key="msg.id">
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
            :typing="conversationStore.isTyping(props.id) && i === visibleMessages.length - 1"
            @bubble-menu="openMsgCtx($event, msg)"
          />
        </template>
        <div v-if="showThinking" class="thinking-row">
          <Avatar v-if="thinkingAgent" :name="thinkingAgent.name" :avatar="thinkingAgent.avatar" :size="36" />
          <div class="thinking-col">
            <span v-if="thinkingAgent" class="thinking-name">{{ thinkingAgent.name }}</span>
            <div class="thinking-bubble">
              <span class="dots"><span></span><span></span><span></span></span>
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
        <div v-if="imageAgentName" class="image-gen-tip">
          <span class="ring" />
          <span class="text">{{ t('chat.imgGen', { name: imageAgentName }) }}</span>
          <span class="dots"><i /><i /><i /></span>
        </div>
        <div v-if="visibleMessages.length === 0" class="empty">{{ t('tasks.emptyResult') }}</div>
      </div>

      <button v-if="!stickToBottom" class="to-bottom" :title="t('chat.toBottom')" @click="jumpToBottom">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 5v14M19 12l-7 7-7-7" />
        </svg>
      </button>
    </div>

    <div v-if="coordinator || discussing" class="coordination-tip">
      <span class="pulse"></span>
      <span v-if="coordinator">{{ t('chat.coordinating', { name: coordinator.name }) }}</span>
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
          <button class="op-btn conv" @click="decideOp(r, 'conversation')">{{ t('chat.opAllowConv') }}</button>
          <button class="op-btn once" @click="decideOp(r, 'once')">{{ t('chat.opAllowOnce') }}</button>
        </div>
      </div>
    </div>

    <TaskFormModal
      v-if="showTaskForm && currentTask"
      :task="currentTask"
      @close="showTaskForm = false"
      @saved="onTaskSaved"
    />
  </div>
</template>

<style scoped lang="scss">
.task-chat-view {
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

.view-header {
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
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;

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

    .task-status {
      flex-shrink: 0;
      padding: 1px 8px;
      border-radius: 999px;
      font-size: $font-size-xs;
      font-weight: 400;

      &.active {
        background: rgba(52, 211, 153, 0.14);
        color: #34d399;
      }

      &.paused {
        background: rgba(250, 157, 59, 0.14);
        color: #fa9d3b;
      }

      &.done {
        background: $bg-hover;
        color: $text-tertiary;
      }
    }
  }

  .head-more {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    margin-left: $spacing-md;
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

.head-btn {
  padding: 5px $spacing-lg;
  border-radius: $radius-sm;
  border: 1px solid $border-color;
  background: $bg-input;
  color: $text-primary;
  font-size: $font-size-sm;
  cursor: pointer;
  transition: background $transition-fast, border-color $transition-fast, color $transition-fast;

  &:hover {
    background: $bg-hover;
    border-color: $text-tertiary;
  }

  &.run {
    color: $primary-color;
    border-color: rgba(var(--c-primary-rgb), 0.45);

    &:hover:not(:disabled) {
      background: rgba(var(--c-primary-rgb), 0.1);
      border-color: rgba(var(--c-primary-rgb), 0.6);
    }

    &:disabled {
      opacity: 0.6;
      cursor: default;
    }
  }

  &.warn {
    color: #fa9d3b;
    border-color: rgba(250, 157, 59, 0.45);

    &:hover {
      background: rgba(250, 157, 59, 0.1);
      border-color: rgba(250, 157, 59, 0.6);
    }
  }

  &.resume {
    color: #34d399;
    border-color: rgba(52, 211, 153, 0.45);

    &:hover {
      background: rgba(52, 211, 153, 0.1);
      border-color: rgba(52, 211, 153, 0.6);
    }
  }

  &.danger {
    color: #fa5151;
    border-color: rgba(250, 81, 81, 0.4);

    &:hover {
      background: rgba(250, 81, 81, 0.1);
      border-color: rgba(250, 81, 81, 0.55);
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

/* 思考中指示条：样式对齐 MessageBubble 的打字点动画（scoped 内 keyframes 独立命名） */
.thinking-row {
  display: flex;
  align-items: flex-start;
  gap: $spacing-md;
}

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
  gap: 5px;
  align-items: center;
  padding: 13px $spacing-md;
  background: $bg-bubble-other;
  border-radius: 2px $radius-md $radius-md $radius-md;

  .dots {
    display: flex;
    gap: 5px;
    align-items: center;

    span {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: $text-tertiary;
      animation: task-thinking-blink 1.2s infinite ease-in-out;

      &:nth-child(2) {
        animation-delay: 0.2s;
      }

      &:nth-child(3) {
        animation-delay: 0.4s;
      }
    }
  }
}

@keyframes task-thinking-blink {
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

.image-gen-tip {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  width: fit-content;
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
    animation: task-image-spin 0.9s linear infinite;
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
      animation: task-image-blink 1.2s infinite ease-in-out;

      &:nth-child(2) {
        animation-delay: 0.2s;
      }

      &:nth-child(3) {
        animation-delay: 0.4s;
      }
    }
  }
}

@keyframes task-image-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes task-image-blink {
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
    animation: task-coordination-pulse 1.4s infinite ease-in-out;
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

@keyframes task-coordination-pulse {
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
</style>
