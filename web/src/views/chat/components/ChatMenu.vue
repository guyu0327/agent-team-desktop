<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { Agent, Conversation } from '@/types'
import { useAgentStore } from '@/stores/agent'
import { useConversationStore } from '@/stores/conversation'
import { useModelPresetStore } from '@/stores/modelPreset'
import { alertAction, confirmAction } from '@/composables/confirm'
import { resetGroupConversation } from '@/api/conversation'
import { resetWechatConversation } from '@/api/wechat'
import { exportConversation } from '@/utils/chatExport'
import Avatar from '@/components/common/Avatar.vue'
import { t } from '@/i18n'

const props = defineProps<{ conversation: Conversation }>()
const emit = defineEmits<{ close: [] }>()

const router = useRouter()
const agentStore = useAgentStore()
const conversationStore = useConversationStore()
const presetStore = useModelPresetStore()

const isWechat = computed(() => props.conversation.channel === 'wechat')

const rootEl = ref<HTMLElement>()

const isGroup = computed(() => props.conversation.type === 'group')
const members = computed(() =>
  props.conversation.memberIds
    .map((id) => agentStore.getById(id))
    .filter((a): a is Agent => !!a),
)
const candidates = computed(() =>
  agentStore.agents.filter((a) => !props.conversation.memberIds.includes(a.id)),
)

const adding = ref(false)
const kicking = ref(false)
const editingName = ref(false)
const nameDraft = ref('')

function onDocClick(e: MouseEvent) {
  const target = e.target as Node | null
  if (!rootEl.value || !target) return
  if (rootEl.value.contains(target)) return
  emit('close')
}
onMounted(() => setTimeout(() => document.addEventListener('click', onDocClick), 0))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))

function togglePin() {
  conversationStore.togglePinned(props.conversation.id)
  emit('close')
}

/** 导出当前会话全部消息为 Markdown 文件（附件仅标注文本） */
async function exportChat() {
  emit('close')
  await exportConversation(props.conversation, props.conversation.type === 'group' ? 'group' : 'single')
}

/** 开始新会话：当前会话入历史，立即打开与该智能体的全新会话 */
async function startNewChat() {
  const ok = await confirmAction({
    title: t('chat.newSession'),
    message: t('chat.newSessionMsg'),
    confirmText: t('chat.newSession'),
  })
  if (!ok) return
  emit('close')
  try {
    await conversationStore.archiveConversation(props.conversation.id)
    const agentId = props.conversation.agentId
    if (!agentId) {
      router.push('/chat')
      return
    }
    const newId = await conversationStore.openConversationWith(agentId)
    router.push(`/chat/${newId}`)
  } catch (e) {
    alertAction(e instanceof Error ? e.message : t('common.opFailed'))
  }
}

async function deleteChat() {
  const ok = await confirmAction({
    title: t('chat.deleteChat'),
    message: t('chat.deleteChatMsg'),
    confirmText: t('common.delete'),
    danger: true,
  })
  if (!ok) return
  emit('close')
  try {
    await conversationStore.archiveConversation(props.conversation.id)
    router.push('/chat')
  } catch (e) {
    alertAction(e instanceof Error ? e.message : t('common.opFailed'))
  }
}

/** 微信会话重置：旧会话归档进历史（不可恢复聊天），绑定迁移到全新会话，消息无缝流入 */
async function resetWechat() {
  const ok = await confirmAction({
    title: t('chat.resetSession'),
    message: t('chat.resetSessionMsg'),
    confirmText: t('chat.resetSession'),
  })
  if (!ok) return
  emit('close')
  try {
    const res = await resetWechatConversation(props.conversation.id)
    await conversationStore.loadConversations()
    router.push(`/chat/${res.conversationId}`)
  } catch (e) {
    alertAction(e instanceof Error ? e.message : t('common.opFailed'))
  }
}

async function disbandGroup() {
  const name = props.conversation.name || t('chat.thisGroup')
  const ok = await confirmAction({
    title: t('chat.disband'),
    message: t('chat.disbandMsg', { name }),
    confirmText: t('chat.disbandOk'),
    danger: true,
  })
  if (!ok) return
  emit('close')
  try {
    await conversationStore.archiveConversation(props.conversation.id)
    router.push('/chat')
  } catch (e) {
    alertAction(e instanceof Error ? e.message : t('common.opFailed'))
  }
}

/** 群聊重置：旧群归档进历史会话，原群名/成员/聊天模式重建新群，一键从头开始 */
async function resetGroup() {
  const name = props.conversation.name || t('chat.thisGroup')
  const ok = await confirmAction({
    title: t('chat.resetSession'),
    message: t('chat.resetGroupMsg', { name }),
    confirmText: t('chat.resetSession'),
  })
  if (!ok) return
  emit('close')
  try {
    const fresh = await resetGroupConversation(props.conversation.id)
    await conversationStore.loadConversations()
    router.push(`/chat/${fresh.id}`)
  } catch (e) {
    alertAction(e instanceof Error ? e.message : t('common.opFailed'))
  }
}

function startEdit() {
  nameDraft.value = props.conversation.name
  editingName.value = true
}

const currentMode = computed(() => props.conversation.chatMode ?? 'passive')

async function toggleMode() {
  const next = currentMode.value === 'free' ? 'passive' : 'free'
  try {
    await conversationStore.setChatMode(props.conversation.id, next)
  } catch (e) {
    alertAction(e instanceof Error ? e.message : t('chat.modeFailed'))
  }
}

function saveName() {
  if (!editingName.value) return
  editingName.value = false
  const value = nameDraft.value.trim()
  if (value && value !== props.conversation.name) {
    conversationStore.renameGroup(props.conversation.id, value)
  }
}

function toggleAdd() {
  kicking.value = false
  adding.value = !adding.value
}

function toggleKick() {
  adding.value = false
  kicking.value = !kicking.value
}

function invite(agent: Agent) {
  conversationStore.addGroupMembers(props.conversation.id, [agent.id])
}

function kick(agent: Agent) {
  conversationStore.removeGroupMember(props.conversation.id, agent.id)
}

/** 点击成员头像快速跳转到智能体界面（踢人模式下点击仍是移除） */
function openAgent(agent: Agent) {
  if (kicking.value) return
  emit('close')
  router.push(`/contact/${agent.id}`)
}
</script>

<template>
  <div ref="rootEl" class="chat-menu" @click.stop>
    <template v-if="isGroup">
      <div class="member-grid">
        <div
          v-for="m in members"
          :key="m.id"
          class="member-cell"
          :class="{ kickable: kicking }"
          :title="kicking ? t('chat.kickMember', { name: m.name }) : m.name"
          @click="kicking ? kick(m) : openAgent(m)"
        >
          <div class="cell-avatar">
            <Avatar :name="m.name" :avatar="m.avatar" :size="40" />
            <span v-if="kicking" class="remove-mask">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </span>
          </div>
          <span class="cell-name">{{ m.name }}</span>
        </div>

        <button class="add-cell" :title="t('chat.addMember')" @click="toggleAdd">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        <button
          class="add-cell"
          :class="{ active: kicking }"
          :title="t('chat.kick')"
          @click="toggleKick"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
            <path d="M5 12h14" />
          </svg>
        </button>
      </div>

      <div v-if="adding" class="candidate-list">
        <div class="section-title">{{ t('chat.pickMember') }}</div>
        <button
          v-for="c in candidates"
          :key="c.id"
          class="candidate-row"
          @click="invite(c)"
        >
          <Avatar :name="c.name" :avatar="c.avatar" :size="28" />
          <span class="cand-name">{{ c.name }}</span>
          <span class="cand-model">{{ presetStore.findById(c.presetId)?.name ?? t('common.noPreset') }}</span>
        </button>
        <div v-if="candidates.length === 0" class="empty">{{ t('chat.allInGroup') }}</div>
      </div>

      <div class="name-section">
        <div class="section-title">{{ t('chat.groupName') }}</div>
        <input
          v-if="editingName"
          v-model="nameDraft"
          class="name-input"
          autofocus
          @keyup.enter="saveName"
          @blur="saveName"
        />
        <button v-else class="name-row" @click="startEdit">
          <span class="name-text">{{ conversation.name }}</span>
          <svg class="edit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">
            <path d="m18 2 4 4-13 13H5v-4z" />
          </svg>
        </button>
      </div>

      <div class="mode-section">
        <div class="section-title">{{ t('chat.groupMode') }}</div>
        <button class="mode-row" @click="toggleMode">
          <span class="mode-info">
            <span class="mode-name">{{ t('chat.freeMode') }}</span>
            <span class="mode-desc">{{ t('chat.freeModeDesc') }}</span>
          </span>
          <span class="switch" :class="{ on: currentMode === 'free' }"><span class="knob"></span></span>
        </button>
      </div>

      <div class="menu-section">
        <button class="menu-item" @click="exportChat">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
          </svg>
          {{ t('chat.exportChat') }}
        </button>
        <button class="menu-item" @click="togglePin">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z"
            />
          </svg>
          {{ conversation.pinned ? t('chat.unpin') : t('chat.pin') }}
        </button>
        <button class="menu-item" @click="resetGroup">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"
            />
          </svg>
          {{ t('chat.resetSession') }}
        </button>
      </div>

      <div class="danger-section">
        <button class="menu-item danger" @click="disbandGroup">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13zm12.6 3.4-1.4-1.4-1.4 1.4-1.1-1.1 1.4-1.4-1.4-1.4 1.1-1.1 1.4 1.4 1.4-1.4 1.1 1.1-1.4 1.4 1.4 1.4z"
            />
          </svg>
          {{ t('chat.disband') }}
        </button>
      </div>
    </template>

    <template v-else>
      <button class="menu-item" @click="exportChat">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
        </svg>
        {{ t('chat.exportChat') }}
      </button>
      <button class="menu-item" @click="togglePin">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z"
          />
        </svg>
        {{ conversation.pinned ? t('chat.unpin') : t('chat.pin') }}
      </button>
      <button v-if="isWechat" class="menu-item" @click="resetWechat">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"
          />
        </svg>
        {{ t('chat.resetSession') }}
      </button>
      <button v-else class="menu-item" @click="startNewChat">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"
          />
        </svg>
        {{ t('chat.newSession') }}
      </button>
      <button class="menu-item danger" @click="deleteChat">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
        </svg>
        {{ t('chat.deleteChat') }}
      </button>
    </template>
  </div>
</template>

<style scoped lang="scss">
.chat-menu {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  width: 280px;
  max-height: 65vh;
  overflow-y: auto;
  background: $bg-panel;
  border: 1px solid $border-color;
  border-radius: $radius-md;
  box-shadow: $shadow-md;
  z-index: 50;
}

.section-title {
  font-size: $font-size-xs;
  color: $text-tertiary;
  padding: $spacing-sm 0 $spacing-xs;
}

.member-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: $spacing-md;
  padding: $spacing-md;
}

.member-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: $spacing-xs;
  cursor: pointer;

  &:hover .cell-name {
    color: $primary-color;
  }

  &.kickable {
    &:hover .cell-name {
      color: #fa5151;
    }
  }

  .cell-avatar {
    position: relative;
  }

  .remove-mask {
    position: absolute;
    inset: 0;
    border-radius: $radius-sm;
    background: rgba(250, 81, 81, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    color: $text-white;

    svg {
      width: 18px;
      height: 18px;
    }
  }

  .cell-name {
    max-width: 100%;
    font-size: $font-size-xs;
    color: $text-secondary;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.add-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: $spacing-xs;
  align-self: start;
  aspect-ratio: 1;
  border-radius: $radius-sm;
  border: 1px dashed $text-tertiary;
  color: $text-secondary;
  cursor: pointer;
  transition: border-color $transition-fast, color $transition-fast;

  svg {
    width: 20px;
    height: 20px;
  }

  &:hover {
    border-color: $primary-color;
    color: $primary-color;
  }

  &.active {
    border-color: #fa5151;
    color: #fa5151;
    border-style: solid;
  }
}

.candidate-list {
  padding: 0 $spacing-md $spacing-sm;
  border-top: 1px solid $border-light;

  .candidate-row {
    display: flex;
    align-items: center;
    gap: $spacing-sm;
    width: 100%;
    padding: $spacing-sm;
    border-radius: $radius-sm;
    cursor: pointer;
    text-align: left;
    transition: background $transition-fast;

    &:hover {
      background: $bg-panel-hover;
    }

    .cand-name {
      font-size: $font-size-sm;
      color: $text-primary;
      flex: 1;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .cand-model {
      font-size: $font-size-xs;
      color: $text-tertiary;
    }
  }

  .empty {
    padding: $spacing-sm 0;
    font-size: $font-size-xs;
    color: $text-tertiary;
  }
}

.name-section {
  padding: $spacing-sm $spacing-md $spacing-md;
  border-top: 1px solid $border-light;
}

.name-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $spacing-sm;
  width: 100%;
  padding: $spacing-xs 0;
  cursor: pointer;
  border-radius: $radius-sm;

  &:hover .edit-icon {
    color: $primary-color;
  }

  .name-text {
    font-size: $font-size-base;
    color: $text-primary;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .edit-icon {
    width: 14px;
    height: 14px;
    color: $text-tertiary;
    flex-shrink: 0;
  }
}

.name-input {
  width: 100%;
  padding: 6px $spacing-sm;
  border-radius: $radius-sm;
  background: $bg-input;
  color: $text-primary;
  font-size: $font-size-base;

  &:focus {
    outline: 1px solid $primary-color;
  }
}

.mode-section {
  padding: $spacing-sm $spacing-md $spacing-md;
  border-top: 1px solid $border-light;
}

.mode-row {
  display: flex;
  align-items: center;
  gap: $spacing-md;
  padding: $spacing-sm;
  border-radius: $radius-sm;
  text-align: left;
  transition: background $transition-fast;

  &:hover {
    background: $bg-panel-hover;
  }

  .mode-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .mode-name {
    font-size: $font-size-base;
    color: $text-primary;
  }

  .mode-desc {
    font-size: $font-size-xs;
    color: $text-tertiary;
    line-height: 1.5;
  }
}

.switch {
  width: 40px;
  height: 22px;
  border-radius: 11px;
  background: $border-color;
  position: relative;
  transition: background $transition-fast;
  flex-shrink: 0;

  &.on {
    background: $primary-color;
  }

  .knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
    transition: transform $transition-fast;
  }

  &.on .knob {
    transform: translateX(18px);
  }
}

.menu-section {
  margin-top: $spacing-sm;
  border-top: 1px solid $border-light;
}

.danger-section {
  margin-top: $spacing-sm;
  border-top: 1px solid $border-light;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: $spacing-md;
  width: 100%;
  padding: 12px $spacing-lg;
  font-size: $font-size-base;
  color: $text-primary;
  cursor: pointer;
  text-align: left;
  transition: background $transition-fast;

  svg {
    width: 18px;
    height: 18px;
    color: $text-secondary;
    flex-shrink: 0;
  }

  &:hover {
    background: $bg-panel-hover;
  }

  &.danger,
  &.danger svg {
    color: #fa5151;

    &:hover {
      background: rgba(250, 81, 81, 0.08);
    }
  }
}
</style>
