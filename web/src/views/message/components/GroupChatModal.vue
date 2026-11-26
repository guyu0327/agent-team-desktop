<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAgentStore } from '@/stores/agent'
import { useConversationStore } from '@/stores/conversation'
import { useModelPresetStore } from '@/stores/modelPreset'
import Avatar from '@/components/common/Avatar.vue'
import type { Agent } from '@/types'
import { t } from '@/i18n'

const emit = defineEmits<{
  close: []
  created: [conversationId: string]
}>()

const agentStore = useAgentStore()

// 遮罩关闭判定：按下与松开都发生在遮罩上才关闭，按住从卡片内拖到遮罩松手不关
const maskDown = ref(false)
const maskUp = ref(false)
const conversationStore = useConversationStore()
const presetStore = useModelPresetStore()

const name = ref('')
const selectedIds = ref<string[]>([])
/** 编排者（会话角色）：建群只能建被动群，自由讨论进群后在群菜单里切（避免建群时不设主持、
 *  日后切被动模式出现没有主持人的情况）；在已选成员中指定，默认第一个勾选的 */
const hostId = ref('')

// 勾选变化时保持 hostId 始终指向已选成员：取消了主持的勾选则顺延给下一个已选成员
function syncHost() {
  if (selectedIds.value.length === 0) {
    hostId.value = ''
  } else if (!selectedIds.value.includes(hostId.value)) {
    hostId.value = selectedIds.value[0]
  }
}

// 成员按通讯录同款分组展示（ groupName 分组 + 未分组兜底），组头可折叠
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
  for (const a of agentStore.agents) {
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

const canCreate = computed(() => selectedIds.value.length > 0)

function toggle(id: string) {
  const idx = selectedIds.value.indexOf(id)
  if (idx >= 0) selectedIds.value.splice(idx, 1)
  else selectedIds.value.push(id)
  syncHost()
}

async function create() {
  if (!canCreate.value) return
  const conv = await conversationStore.createGroup(
    name.value.trim() || t('message.unnamed'),
    selectedIds.value,
    'passive',
    hostId.value || null,
  )
  emit('created', conv.id)
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
      <h2 class="modal-title">{{ t('message.newGroup') }}</h2>

      <div class="field">
        <label class="label">{{ t('chat.groupName') }}</label>
        <input v-model="name" class="input" :placeholder="t('message.namePlaceholder')" autofocus />
      </div>

      <div class="field members-field">
        <label class="label">{{ t('message.pickMembers', { sel: selectedIds.length, total: agentStore.agents.length }) }}</label>
        <div class="member-list">
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
                  <span class="member-desc">{{ agent.description || (agent.presetId && presetStore.findById(agent.presetId)?.name) || t('common.noPreset') }}</span>
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
      </div>

      <!-- 编排者（会话角色）：在已选成员中指定，默认第一个勾选的，点击可换；自由讨论进群后切 -->
      <div v-if="selectedIds.length > 0" class="field">
        <label class="label" :title="t('message.hostHint')">{{ t('message.hostLabel') }}</label>
        <div class="host-chips">
          <button
            v-for="id in selectedIds"
            :key="id"
            type="button"
            class="host-chip"
            :class="{ selected: id === hostId }"
            :title="agentStore.getById(id)?.name"
            @click="hostId = id"
          >
            <Avatar :name="agentStore.getById(id)?.name ?? ''" :avatar="agentStore.getById(id)?.avatar" :size="20" />
            {{ agentStore.getById(id)?.name }}
          </button>
        </div>
      </div>

      <div class="actions">
        <button class="btn" @click="emit('close')">{{ t('common.cancel') }}</button>
        <button class="btn primary" :disabled="!canCreate" @click="create">{{ t('message.create') }}</button>
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
  z-index: 100;
}

.modal-card {
  width: 420px;
  max-height: 80vh;
  background: $bg-panel;
  border-radius: $radius-lg;
  box-shadow: $shadow-md;
  padding: $spacing-xl;
  display: flex;
  flex-direction: column;
  gap: $spacing-lg;
}

.modal-title {
  font-size: $font-size-lg;
  font-weight: 600;
  color: $text-primary;
}

.field {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;
}

.label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: $font-size-sm;
  color: $text-secondary;
}

.input {
  width: 100%;
  padding: 9px $spacing-md;
  border-radius: $radius-sm;
  background: $bg-input;
  color: $text-primary;
  font-size: $font-size-base;

  &::placeholder {
    color: $text-tertiary;
  }

  &:focus {
    outline: 1px solid $primary-color;
  }
}

.members-field {
  flex: 1;
  min-height: 0;
}

.host-chips {
  display: flex;
  flex-wrap: wrap;
  gap: $spacing-sm;
  // 选满成员时 chips 换行无限堆叠会挤压成员列表，限高约三行、超出滚动
  max-height: 100px;
  overflow-y: auto;
}

.host-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: $radius-md;
  border: 1px solid $border-color;
  background: transparent;
  color: $text-secondary;
  font-size: $font-size-sm;
  cursor: pointer;
  transition: border-color $transition-fast, color $transition-fast, background $transition-fast;

  &:hover {
    border-color: $primary-color;
    color: $text-primary;
  }

  &.selected {
    border-color: $primary-color;
    color: $primary-color;
    background: $primary-light;
  }
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
  // 在 .group 容器内不再是 flex 子元素，需显式占满整行（勾选圈才贴右缘）
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

  &:hover {
    background: $bg-panel-hover;
  }

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
