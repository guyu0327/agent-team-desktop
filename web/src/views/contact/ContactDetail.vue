<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAgentStore } from '@/stores/agent'
import { useConversationStore } from '@/stores/conversation'
import { useModelPresetStore } from '@/stores/modelPreset'
import { confirmAction } from '@/composables/confirm'
import Avatar from '@/components/common/Avatar.vue'

const props = defineProps<{ id: string }>()

const router = useRouter()
const agentStore = useAgentStore()
const conversationStore = useConversationStore()
const presetStore = useModelPresetStore()

const agent = computed(() => agentStore.getById(props.id))

const metaRows = computed(() => {
  if (!agent.value) return []
  const preset = agent.value.presetId ? presetStore.findById(agent.value.presetId) : undefined
  return [
    { label: '模型预设', value: preset ? preset.name : '未关联，聊天前需选择' },
    { label: 'API 地址', value: preset ? preset.baseUrl : '未设置' },
    { label: 'API Key', value: preset?.hasKey ? '已配置（由预设提供）' : '未配置' },
    { label: '温度', value: String(agent.value.temperature) },
  ]
})

async function startChat() {
  if (!agent.value) return
  const conversationId = await conversationStore.openConversationWith(agent.value.id)
  router.push(`/chat/${conversationId}`)
}

async function remove() {
  if (!agent.value) return
  const ok = await confirmAction({
    title: '删除智能体',
    message: `确定删除智能体「${agent.value.name}」吗？相关会话记录将一并删除。`,
    confirmText: '删除',
    danger: true,
  })
  if (!ok) return
  await agentStore.removeAgent(agent.value.id)
  await conversationStore.handleAgentRemoved()
  router.push('/contact')
}
</script>

<template>
  <div class="contact-detail">
    <template v-if="agent">
      <div class="profile-card">
        <div class="profile-header">
          <Avatar :name="agent.name" :avatar="agent.avatar" :size="64" />
          <div class="profile-title">
            <h2 class="name">
              {{ agent.name }}
              <span v-if="agent.isOrchestrator" class="orch-chip">编排者</span>
            </h2>
            <p class="desc">{{ agent.description || '暂无描述' }}</p>
          </div>
        </div>

        <div class="meta-list">
          <div v-for="row in metaRows" :key="row.label" class="meta-row">
            <span class="label">{{ row.label }}</span>
            <span class="value" :class="{ warn: row.value.startsWith('未配置') }">{{ row.value }}</span>
          </div>
          <div class="meta-row column">
            <span class="label">角色设定（System Prompt）</span>
            <p class="prompt">{{ agent.systemPrompt || '未设置' }}</p>
          </div>
        </div>

        <div class="actions">
          <button class="action-btn primary" @click="startChat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            开始对话
          </button>
          <button class="action-btn" @click="router.push(`/contact/${agent.id}/edit`)">编辑</button>
          <button class="action-btn danger" @click="remove">删除</button>
        </div>
      </div>
    </template>
    <div v-else class="not-found">智能体不存在或已被删除</div>
  </div>
</template>

<style scoped lang="scss">
.contact-detail {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  justify-content: center;
  padding: $spacing-xxl * 2 $spacing-lg;
}

.profile-card {
  width: 520px;
  align-self: flex-start;
  background: $bg-panel;
  border-radius: $radius-lg;
  padding: $spacing-xxl;
  box-shadow: $shadow-md;
}

.profile-header {
  display: flex;
  align-items: center;
  gap: $spacing-lg;
  padding-bottom: $spacing-lg;
  border-bottom: 1px solid $border-color;

  .name {
    font-size: $font-size-xl;
    font-weight: 600;
    color: $text-primary;

    .orch-chip {
      display: inline-block;
      margin-left: 6px;
      font-size: $font-size-xs;
      font-weight: 400;
      line-height: 1;
      padding: 3px 7px;
      border-radius: $radius-sm;
      color: #34d399;
      border: 1px solid rgba(52, 211, 153, 0.4);
      background: rgba(52, 211, 153, 0.08);
      vertical-align: 3px;
    }
  }

  .desc {
    margin-top: $spacing-xs;
    font-size: $font-size-sm;
    color: $text-tertiary;
  }
}

.meta-list {
  padding: $spacing-md 0 $spacing-lg;
}

.meta-row {
  display: flex;
  padding: $spacing-sm 0;
  font-size: $font-size-base;

  .label {
    width: 120px;
    flex-shrink: 0;
    color: $text-tertiary;
  }

  .value {
    color: $text-primary;
    word-break: break-all;

    &.warn {
      color: #fa9d3b;
    }
  }

  &.column {
    flex-direction: column;
    gap: $spacing-sm;

    .prompt {
      font-size: $font-size-sm;
      color: $text-primary;
      line-height: 1.6;
      white-space: pre-wrap;
      background: $bg-base;
      border-radius: $radius-sm;
      padding: $spacing-md;
    }
  }
}

.actions {
  border-top: 1px solid $border-color;
  padding-top: $spacing-lg;
  display: flex;
  justify-content: center;
  gap: $spacing-md;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  padding: 8px $spacing-xl;
  border-radius: $radius-sm;
  font-size: $font-size-base;
  cursor: pointer;
  transition: background $transition-fast;
  background: $bg-input;
  color: $text-primary;

  svg {
    width: 18px;
    height: 18px;
  }

  &:hover {
    background: $bg-hover;
  }

  &.primary {
    background: $primary-color;
    color: $text-white;

    &:hover {
      background: $primary-hover;
    }
  }

  &.danger {
    background: transparent;
    color: #fa5151;
    border: 1px solid rgba(250, 81, 81, 0.4);

    &:hover {
      background: rgba(250, 81, 81, 0.1);
    }
  }
}

.not-found {
  margin: auto;
  color: $text-tertiary;
  font-size: $font-size-sm;
}
</style>
