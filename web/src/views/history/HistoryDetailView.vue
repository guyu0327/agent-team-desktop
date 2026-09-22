<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { Conversation, Message } from '@/types'
import { listMessages } from '@/api/conversation'
import { restoreArchivedTask } from '@/api/tasks'
import { useHistoryStore } from '@/stores/history'
import { useAgentStore } from '@/stores/agent'
import { useUserStore } from '@/stores/user'
import { alertAction, confirmAction } from '@/composables/confirm'
import { showToast } from '@/composables/toast'
import MessageBubble from '@/components/common/MessageBubble.vue'
import ContextMenu from '@/components/common/ContextMenu.vue'
import { copyImage, copyText } from '@/utils/clipboard'
import { formatDividerTime } from '@/utils/time'
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

const title = computed(() => {
  if (!conv.value) return t('history.title')
  // 微信归档固定显示机器人名（切过智能体后 agentId 已不代表最初处理者）；有好友标识时加后缀区分
  if (conv.value.channel === 'wechat')
    return conv.value.wechatPeer ? `${t('chat.wechatBotName')}-${conv.value.wechatPeer}` : t('chat.wechatBotName')
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

watch(() => props.id, load, { immediate: true })

function shouldShowDivider(index: number): boolean {
  if (index === 0) return true
  return messages.value[index].timestamp - messages.value[index - 1].timestamp > DIVIDER_GAP
}

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

function senderBadge(msg: Message): string | undefined {
  if (isSelf(msg)) return undefined
  return agentStore.getById(msg.senderId)?.isOrchestrator ? t('common.orchestrator') : undefined
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
      <!-- 任务归档按快照恢复定时任务；普通归档可恢复会话；微信归档不可恢复聊天，仅供留档查看 -->
      <button v-if="conv?.category === 'task'" class="primary-btn" :disabled="restoring" @click="restoreTask">
        {{ t('history.restoreTask') }}
      </button>
      <button v-else-if="conv?.channel !== 'wechat'" class="primary-btn" :disabled="restoring" @click="continueChat">
        {{ restoring ? t('history.restoring') : t('history.continueChat') }}
      </button>
      <button class="danger-btn" @click="removeHistory">{{ t('common.delete') }}</button>
    </header>

    <div class="message-list">
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
          :self="isSelf(msg)"
          :sender-name="senderInfo(msg).name"
          :sender-avatar="senderInfo(msg).avatar"
          :badge="senderBadge(msg)"
          :show-name="conv?.type === 'group' && !isSelf(msg)"
          @bubble-menu="openMsgCtx($event, msg)"
        />
      </template>
      <div v-if="messages.length === 0" class="empty">{{ t('history.noMessages') }}</div>
    </div>

    <ContextMenu
      v-if="msgCtx"
      :x="msgCtx.x"
      :y="msgCtx.y"
      :items="msgCtxItems"
      @select="onMsgCtxSelect"
      @close="msgCtx = null"
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

.primary-btn,
.danger-btn {
  flex-shrink: 0;
  padding: 7px $spacing-xl;
  border-radius: $radius-sm;
  font-size: $font-size-sm;
  cursor: pointer;
  transition: background $transition-fast, opacity $transition-fast;

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
}

.primary-btn {
  background: $primary-color;
  color: $text-white;

  &:hover:not(:disabled) {
    background: $primary-hover;
  }
}

.danger-btn {
  background: $bg-input;
  border: 1px solid rgba(250, 81, 81, 0.45);
  color: #fa5151;

  &:hover:not(:disabled) {
    background: rgba(250, 81, 81, 0.12);
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
</style>
