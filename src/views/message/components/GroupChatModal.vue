<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAgentStore } from '@/stores/agent'
import { useConversationStore } from '@/stores/conversation'
import { useModelPresetStore } from '@/stores/modelPreset'
import Avatar from '@/components/common/Avatar.vue'

const emit = defineEmits<{
  close: []
  created: [conversationId: string]
}>()

const agentStore = useAgentStore()
const conversationStore = useConversationStore()
const presetStore = useModelPresetStore()

const name = ref('')
const selectedIds = ref<string[]>([])
const freeMode = ref(false)

const canCreate = computed(() => selectedIds.value.length > 0)

function toggle(id: string) {
  const idx = selectedIds.value.indexOf(id)
  if (idx >= 0) selectedIds.value.splice(idx, 1)
  else selectedIds.value.push(id)
}

async function create() {
  if (!canCreate.value) return
  const conv = await conversationStore.createGroup(
    name.value.trim() || '未命名群聊',
    selectedIds.value,
    freeMode.value ? 'free' : 'passive',
  )
  emit('created', conv.id)
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal-card">
      <h2 class="modal-title">发起群聊</h2>

      <div class="field">
        <label class="label">群名称</label>
        <input v-model="name" class="input" placeholder="默认：未命名群聊" autofocus />
      </div>

      <div class="field">
        <label class="label">群内回复方式</label>
        <button type="button" class="mode-row" @click="freeMode = !freeMode">
          <span class="mode-info">
            <span class="mode-name">自由讨论</span>
            <span class="mode-desc">开启后成员接龙自由讨论，无需逐个 @；关闭时 @谁谁回，没@全员依次回复</span>
          </span>
          <span class="switch" :class="{ on: freeMode }"><span class="knob"></span></span>
        </button>
      </div>

      <div class="field members-field">
        <label class="label">选择成员（{{ selectedIds.length }}/{{ agentStore.agents.length }}）</label>
        <div class="member-list">
          <button
            v-for="agent in agentStore.agents"
            :key="agent.id"
            type="button"
            class="member-row"
            :class="{ selected: selectedIds.includes(agent.id) }"
            @click="toggle(agent.id)"
          >
            <Avatar :name="agent.name" :avatar="agent.avatar" :size="32" />
            <div class="member-info">
              <span class="member-name">{{ agent.name }}</span>
              <span class="member-model">{{ (agent.presetId && presetStore.findById(agent.presetId)?.name) || '未关联预设' }}</span>
            </div>
            <span class="check" :class="{ checked: selectedIds.includes(agent.id) }">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
                <path d="m5 12 5 5 9-10" />
              </svg>
            </span>
          </button>
        </div>
      </div>

      <div class="actions">
        <button class="btn" @click="emit('close')">取消</button>
        <button class="btn primary" :disabled="!canCreate" @click="create">创建</button>
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

.hint {
  font-size: $font-size-xs;
  color: $text-tertiary;
  line-height: 1.5;
}

.mode-row {
  display: flex;
  align-items: center;
  gap: $spacing-md;
  padding: $spacing-sm $spacing-md;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  text-align: left;
  transition: border-color $transition-fast;

  &:hover {
    border-color: $primary-color;
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

.members-field {
  flex: 1;
  min-height: 0;
}

.member-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.member-row {
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

  .member-model {
    font-size: $font-size-xs;
    color: $text-tertiary;
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
