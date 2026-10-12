<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ModelPreset } from '@/types'
import { useAgentStore } from '@/stores/agent'
import { useModelPresetStore } from '@/stores/modelPreset'
import { applyModelPresetToAgents } from '@/api/modelPreset'
import { alertAction } from '@/composables/confirm'
import Avatar from '@/components/common/Avatar.vue'
import { t } from '@/i18n'

const props = defineProps<{ preset: ModelPreset }>()
const emit = defineEmits<{ close: []; applied: [count: number] }>()

const agentStore = useAgentStore()
const presetStore = useModelPresetStore()

const isImage = props.preset.protocol !== 'openai-chat'

const selected = ref<Set<string>>(
  new Set(
    agentStore.agents
      .filter((a) => (isImage ? a.imagePresetId === props.preset.id : a.presetId === props.preset.id))
      .map((a) => a.id),
  ),
)

const applying = ref(false)
const selectedCount = computed(() => selected.value.size)

function presetName(id: string) {
  return presetStore.findById(id)?.name ?? ''
}

function toggle(id: string) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}

function toggleAll() {
  selected.value = selected.value.size === agentStore.agents.length ? new Set() : new Set(agentStore.agents.map((a) => a.id))
}

async function confirm() {
  if (applying.value || selectedCount.value === 0) return
  applying.value = true
  try {
    const res = await applyModelPresetToAgents(props.preset.id, [...selected.value])
    await agentStore.loadAgents()
    emit('applied', res.applied)
  } catch (e) {
    alertAction(e instanceof Error ? e.message : t('models.applyFailed'))
  } finally {
    applying.value = false
  }
}
</script>

<template>
  <div class="dialog-overlay" @click.self="emit('close')">
    <div class="dialog">
      <h3 class="title">{{ t('models.applyAgents') }}</h3>
      <p class="subtitle">
        {{ preset.name }}
        <span class="hint">{{ isImage ? t('models.applyHintImage') : t('models.applyHintChat') }}</span>
      </p>

      <template v-if="agentStore.agents.length > 0">
        <div class="toolbar">
          <button type="button" class="link-btn" @click="toggleAll">
            {{ selectedCount === agentStore.agents.length ? t('models.applyNone') : t('models.applyAll') }}
          </button>
          <span class="count">{{ t('models.applySelected', { n: selectedCount }) }}</span>
        </div>
        <div class="agent-list">
          <label v-for="a in agentStore.agents" :key="a.id" class="agent-row" :class="{ checked: selected.has(a.id) }">
            <input type="checkbox" :checked="selected.has(a.id)" @change="toggle(a.id)" />
            <Avatar :name="a.name" :avatar="a.avatar" :size="28" />
            <span class="name">{{ a.name }}</span>
            <span class="current" :title="presetName(isImage ? a.imagePresetId : a.presetId)">
              {{ t('models.applyCurrent', { name: presetName(isImage ? a.imagePresetId : a.presetId) || t('contact.notSet') }) }}
            </span>
          </label>
        </div>
      </template>
      <p v-else class="empty">{{ t('models.applyNoAgents') }}</p>

      <div class="actions">
        <button class="btn" @click="emit('close')">{{ t('common.cancel') }}</button>
        <button
          class="btn primary"
          :disabled="applying || selectedCount === 0"
          :title="selectedCount === 0 ? t('models.applySelected', { n: 0 }) : undefined"
          @click="confirm"
        >
          {{ applying ? t('models.applying') : t('models.applyConfirm', { n: selectedCount }) }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
}

.dialog {
  width: 440px;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  background: $bg-panel;
  border-radius: $radius-lg;
  box-shadow: $shadow-md;
  padding: $spacing-xl;
}

.title {
  font-size: $font-size-lg;
  font-weight: 600;
  color: $text-primary;
}

.subtitle {
  margin-top: $spacing-xs;
  font-size: $font-size-sm;
  color: $text-secondary;
  display: flex;
  align-items: center;
  gap: $spacing-sm;

  .hint {
    font-size: $font-size-xs;
    color: $text-tertiary;
  }
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: $spacing-md;

  .link-btn {
    background: none;
    border: none;
    padding: 0;
    font-size: $font-size-xs;
    color: $primary-color;
    cursor: pointer;

    &:hover {
      text-decoration: underline;
    }
  }

  .count {
    font-size: $font-size-xs;
    color: $text-tertiary;
  }
}

.agent-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  margin-top: $spacing-sm;
  border: 1px solid $border-color;
  border-radius: $radius-md;
  padding: 4px;
}

.agent-row {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  padding: 6px $spacing-sm;
  border-radius: $radius-sm;
  cursor: pointer;
  transition: background $transition-fast;

  &:hover {
    background: $bg-hover;
  }

  &.checked {
    background: $primary-light;
  }

  input {
    accent-color: $primary-color;
    cursor: pointer;
    flex-shrink: 0;
  }

  .name {
    font-size: $font-size-sm;
    color: $text-primary;
    flex-shrink: 0;
    max-width: 140px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .current {
    margin-left: auto;
    font-size: $font-size-xs;
    color: $text-tertiary;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.empty {
  margin-top: $spacing-lg;
  text-align: center;
  font-size: $font-size-sm;
  color: $text-tertiary;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: $spacing-md;
  margin-top: $spacing-lg;
  padding-top: $spacing-md;
  border-top: 1px solid $border-color;
}

.btn {
  padding: 7px $spacing-xl;
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
