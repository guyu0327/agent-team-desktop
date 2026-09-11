<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useConversationStore } from '@/stores/conversation'
import { useUserStore } from '@/stores/user'
import { useAgentStore } from '@/stores/agent'
import { useModelPresetStore } from '@/stores/modelPreset'
import { alertAction, confirmAction } from '@/composables/confirm'
import { stopOrchestration } from '@/api/conversation'
import type { Agent, Message } from '@/types'
import MessageBubble from '@/components/common/MessageBubble.vue'
import ChatMenu from './components/ChatMenu.vue'
import Avatar from '@/components/common/Avatar.vue'
import { formatDividerTime } from '@/utils/time'

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

const configTip = computed(() => {
  const agent = singleAgent.value
  if (!agent) return null
  const preset = agent.presetId ? presetStore.findById(agent.presetId) : undefined
  if (!preset) return `「${agent.name}」还未关联模型预设`
  if (!preset.baseUrl.trim() || !preset.apiKey.trim()) {
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

async function scrollToBottom() {
  await nextTick()
  listRef.value?.scrollTo({ top: listRef.value.scrollHeight })
}

watch(
  () => props.id,
  (id) => {
    if (!id) return
    mention.value = null
    conversationStore.setActive(id)
    scrollToBottom()
  },
  { immediate: true },
)

watch(
  () => [messages.value.length, messages.value[messages.value.length - 1]?.content] as const,
  () => scrollToBottom(),
)

async function handleSend() {
  const content = draft.value.trim()
  if (!content) return
  draft.value = ''
  mention.value = null
  try {
    await conversationStore.sendMessage(content)
  } catch (err) {
    draft.value = content
    alertAction(err instanceof Error ? err.message : '发送失败')
  }
}

async function handleStopCoordination() {
  const name = coordinator.value?.name
  const ok = await confirmAction({
    title: '终止协作',
    message: `确定要终止「${name ?? '编排者'}」正在进行的协作吗？已产生的输出会保留。`,
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
    <header class="chat-header">
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

    <div ref="listRef" class="message-list">
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
        />
      </template>
      <div v-if="messages.length === 0" class="empty">暂无消息，开始聊天吧</div>
    </div>

    <div v-if="coordinator" class="coordination-tip">
      <span class="pulse"></span>
      <span>「{{ coordinator.name }}」正在协调团队…</span>
      <button class="stop-btn" @click="handleStopCoordination">终止</button>
    </div>

    <div v-if="configTip && singleAgent" class="config-tip">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
        <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" stroke-linecap="round" />
      </svg>
      <span>{{ configTip }}，</span>
      <router-link :to="`/contact/${singleAgent.id}`" class="link">去配置</router-link>
    </div>

    <footer class="input-area">
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
      <div class="toolbar">
        <span class="tool" title="发送文件">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          </svg>
        </span>
        <span class="tool" title="语音">
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
        <button class="send-btn" :disabled="!draft.trim()" @click="handleSend">发送</button>
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
