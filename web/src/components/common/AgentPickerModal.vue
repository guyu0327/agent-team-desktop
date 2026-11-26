<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Agent } from '@/types'
import { useAgentStore } from '@/stores/agent'
import { useModelPresetStore } from '@/stores/modelPreset'
import Avatar from './Avatar.vue'
import { t } from '@/i18n'

const props = defineProps<{
  title: string
  /** 当前选中的智能体（'' 表示自动档） */
  selectedId?: string
  /** 自动档文案（如「自动（第一个智能体）」），不传不显示该行 */
  autoLabel?: string
}>()
const emit = defineEmits<{ select: [id: string]; close: [] }>()

const agentStore = useAgentStore()
const presetStore = useModelPresetStore()

// 遮罩关闭判定：按下与松开都发生在遮罩上才关闭，按住从卡片内拖到遮罩松手不关
const maskDown = ref(false)
const maskUp = ref(false)

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

// 通讯录同款描述：简介 → 预设名 → 未关联预设
function agentDesc(a: Agent) {
  return a.description || (a.presetId ? presetStore.findById(a.presetId)?.name : '') || t('common.noPreset')
}

/** 单选即选即关 */
function pick(id: string) {
  emit('select', id)
  emit('close')
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
      <h2 class="modal-title">{{ title }}</h2>

      <div class="member-list">
        <button v-if="autoLabel" type="button" class="member-row" :class="{ selected: !selectedId }" @click="pick('')">
          <span class="auto-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5z" />
            </svg>
          </span>
          <div class="member-info">
            <span class="member-name">{{ autoLabel }}</span>
          </div>
          <span class="check" :class="{ checked: !selectedId }">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
              <path d="m5 12 5 5 9-10" />
            </svg>
          </span>
        </button>

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
              :class="{ selected: selectedId === agent.id }"
              @click="pick(agent.id)"
            >
              <Avatar :name="agent.name" :avatar="agent.avatar" :size="32" />
              <div class="member-info">
                <span class="member-name">{{ agent.name }}</span>
                <span class="member-desc">{{ agentDesc(agent) }}</span>
              </div>
              <span class="check" :class="{ checked: selectedId === agent.id }">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
                  <path d="m5 12 5 5 9-10" />
                </svg>
              </span>
            </button>
          </template>
        </div>

        <p v-if="agentStore.agents.length === 0" class="empty">{{ t('contact.empty') }}</p>
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

  .auto-badge {
    width: 32px;
    height: 32px;
    border-radius: $radius-md;
    background: $primary-light;
    color: $primary-color;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;

    svg {
      width: 16px;
      height: 16px;
    }
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
  padding: $spacing-lg 0;
  text-align: center;
  font-size: $font-size-sm;
  color: $text-tertiary;
}
</style>
