<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Agent, Conversation } from '@/types'
import { useAgentStore } from '@/stores/agent'
import { useConversationStore } from '@/stores/conversation'
import { useModelPresetStore } from '@/stores/modelPreset'
import { alertAction } from '@/composables/confirm'
import Avatar from '@/components/common/Avatar.vue'
import { t } from '@/i18n'

const props = defineProps<{ conversation: Conversation }>()
const emit = defineEmits<{ close: [] }>()

const agentStore = useAgentStore()
const conversationStore = useConversationStore()
const presetStore = useModelPresetStore()

// 遮罩关闭判定：按下与松开都发生在遮罩上才关闭，按住从卡片内拖到遮罩松手不关
const maskDown = ref(false)
const maskUp = ref(false)

const selectedIds = ref<string[]>([])
const adding = ref(false)

const candidates = computed(() =>
  agentStore.agents.filter((a) => !props.conversation.memberIds.includes(a.id)),
)

// 通讯录同款分组（groupName 分组 + 未分组兜底），组头可折叠
const collapsed = ref<Set<string>>(new Set())
function toggleGroup(groupName: string) {
  const next = new Set(collapsed.value)
  if (next.has(groupName)) next.delete(groupName)
  else next.add(groupName)
  collapsed.value = next
}

interface AgentGroup {
  name: string
  agents: Agent[]
}

const groups = computed<AgentGroup[]>(() => {
  const named = new Map<string, Agent[]>()
  const ungrouped: Agent[] = []
  for (const a of candidates.value) {
    if (a.groupName) {
      const list = named.get(a.groupName)
      if (list) list.push(a)
      else named.set(a.groupName, [a])
    } else {
      ungrouped.push(a)
    }
  }
  const result: AgentGroup[] = [...named.entries()].map(([groupName, agents]) => ({ name: groupName, agents }))
  if (ungrouped.length > 0) result.push({ name: t('contact.ungrouped'), agents: ungrouped })
  return result
})

// 通讯录同款描述：简介 → 预设名 → 未关联预设
function agentDesc(a: Agent) {
  return a.description || (a.presetId ? presetStore.findById(a.presetId)?.name : '') || t('common.noPreset')
}

function toggle(id: string) {
  const idx = selectedIds.value.indexOf(id)
  if (idx >= 0) selectedIds.value.splice(idx, 1)
  else selectedIds.value.push(id)
}

async function confirmAdd() {
  if (adding.value || selectedIds.value.length === 0) return
  adding.value = true
  try {
    await conversationStore.addGroupMembers(props.conversation.id, selectedIds.value)
    emit('close')
  } catch (e) {
    alertAction(e instanceof Error && e.message ? e.message : t('common.opFailed'))
  } finally {
    adding.value = false
  }
}
</script>

<template>
  <div
    class="modal-overlay"
    @pointerdown="maskDown = $event.target === $event.currentTarget"
    @pointerup="maskUp = $event.target === $event.currentTarget"
    @click.self="maskDown && maskUp && emit('close')"
  >
    <div class="modal-card">
      <h2 class="modal-title">{{ t('chat.addMember') }}</h2>
      <p class="modal-subtitle">{{ t('message.pickMembers', { sel: selectedIds.length, total: candidates.length }) }}</p>

      <div v-if="candidates.length > 0" class="member-list">
        <div v-for="group in groups" :key="group.name" class="group">
          <button type="button" class="group-header" @click="toggleGroup(group.name)">
            <svg
              class="chevron"
              :class="{ expanded: !collapsed.has(group.name) }"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
            <span class="group-name">{{ group.name }}</span>
            <span class="group-count">{{ group.agents.length }}</span>
          </button>

          <template v-if="!collapsed.has(group.name)">
            <button
              v-for="agent in group.agents"
              :key="agent.id"
              type="button"
              class="member-row"
              :class="{ selected: selectedIds.includes(agent.id) }"
              @click="toggle(agent.id)"
            >
              <Avatar :name="agent.name" :avatar="agent.avatar" :size="32" />
              <div class="member-info">
                <span class="member-name">{{ agent.name }}</span>
                <span class="member-desc">{{ agentDesc(agent) }}</span>
              </div>
              <span class="check" :class="{ checked: selectedIds.includes(agent.id) }">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
                  <path d="m5 12 5 5 9-10" />
                </svg>
              </span>
            </button>
          </template>
        </div>
      </div>
      <p v-else class="empty">{{ t('chat.allInGroup') }}</p>

      <div class="actions">
        <button class="btn" @click="emit('close')">{{ t('common.cancel') }}</button>
        <button class="btn primary" :disabled="selectedIds.length === 0 || adding" @click="confirmAdd">
          {{ t('chat.addMember') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 120;
}

.modal-card {
  width: 400px;
  max-height: 70vh;
  background: $bg-panel;
  border-radius: $radius-lg;
  box-shadow: $shadow-md;
  padding: $spacing-xl;
  display: flex;
  flex-direction: column;
  gap: $spacing-md;
}

.modal-title {
  font-size: $font-size-lg;
  font-weight: 600;
  color: $text-primary;
}

.modal-subtitle {
  font-size: $font-size-xs;
  color: $text-tertiary;
}

.member-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.group-header {
  display: flex;
  align-items: center;
  gap: $spacing-xs;
  width: 100%;
  padding: $spacing-sm $spacing-md;
  background: transparent;
  cursor: pointer;
  user-select: none;
  border-radius: $radius-sm;
  transition: background $transition-fast;

  &:hover {
    background: $bg-panel-hover;
  }

  .chevron {
    width: 14px;
    height: 14px;
    color: $text-tertiary;
    transition: transform $transition-fast;
    flex-shrink: 0;

    &.expanded {
      transform: rotate(90deg);
    }
  }

  .group-name {
    font-size: $font-size-xs;
    color: $text-tertiary;
  }

  .group-count {
    font-size: $font-size-xs;
    color: $text-tertiary;
    margin-left: auto;
  }
}

.member-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: $spacing-md;
  padding: $spacing-sm;
  border-radius: $radius-sm;
  background: transparent;
  cursor: pointer;
  transition: background $transition-fast;
  text-align: left;

  &:hover,
  &.selected {
    background: $bg-panel-hover;
  }

  .member-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .member-name {
    font-size: $font-size-base;
    color: $text-primary;
  }

  .member-desc {
    font-size: $font-size-xs;
    color: $text-tertiary;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .check {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 1.5px solid $text-tertiary;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: transparent;
    transition: all $transition-fast;

    svg {
      width: 12px;
      height: 12px;
    }

    &.checked {
      background: $primary-color;
      border-color: $primary-color;
      color: $text-white;
    }
  }
}

.empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: $font-size-sm;
  color: $text-tertiary;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: $spacing-md;
  padding-top: $spacing-sm;
  border-top: 1px solid $border-color;
}

.btn {
  padding: 8px $spacing-xxl;
  border-radius: $radius-sm;
  background: $bg-input;
  color: $text-primary;
  font-size: $font-size-base;
  cursor: pointer;
  transition: background $transition-fast;

  &:hover:not(:disabled) {
    background: $bg-hover;
  }

  &.primary {
    background: $primary-color;
    color: $text-white;

    &:hover:not(:disabled) {
      background: $primary-hover;
    }
  }

  &:disabled {
    background: $bg-input;
    color: $text-tertiary;
    cursor: not-allowed;
  }
}
</style>
