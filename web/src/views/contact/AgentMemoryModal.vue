<script setup lang="ts">
import { onMounted, ref } from 'vue'
import {
  listMemories,
  createMemory,
  updateMemory,
  deleteMemory,
  clearMemories,
} from '@/api/agent'
import type { AgentMemory } from '@/types'
import { confirmAction } from '@/composables/confirm'
import { showToast } from '@/composables/toast'
import { formatTime } from '@/utils/time'
import { t } from '@/i18n'

const props = defineProps<{ agentId: string; agentName: string }>()
const emit = defineEmits<{ close: [] }>()

// 遮罩关闭判定：按下与松开都发生在遮罩上才关闭，按住从卡片内拖到遮罩松手不关
const maskDown = ref(false)
const maskUp = ref(false)

const list = ref<AgentMemory[]>([])
const loading = ref(false)
const error = ref('')
const draft = ref('')
const adding = ref(false)
const editingId = ref<string | null>(null)
const editDraft = ref('')
const saving = ref(false)

async function load() {
  loading.value = true
  error.value = ''
  try {
    list.value = await listMemories(props.agentId)
  } catch {
    error.value = t('contact.memoryLoadFailed')
  } finally {
    loading.value = false
  }
}

async function add() {
  const content = draft.value.trim()
  if (!content) return
  adding.value = true
  try {
    await createMemory(props.agentId, content)
    draft.value = ''
    await load()
    showToast(t('contact.memoryAdded'))
  } catch {
    showToast(t('contact.memorySaveFailed'))
  } finally {
    adding.value = false
  }
}

function startEdit(m: AgentMemory) {
  editingId.value = m.id
  editDraft.value = m.content
}

async function saveEdit() {
  if (!editingId.value) return
  const content = editDraft.value.trim()
  if (!content) return
  saving.value = true
  try {
    await updateMemory(props.agentId, editingId.value, content)
    editingId.value = null
    await load()
    showToast(t('contact.memorySaved'))
  } catch {
    showToast(t('contact.memorySaveFailed'))
  } finally {
    saving.value = false
  }
}

async function removeOne(m: AgentMemory) {
  const ok = await confirmAction({
    title: t('contact.memoryDeleteTitle'),
    message: t('contact.memoryDeleteMsg', { text: m.content.slice(0, 50) }),
    confirmText: t('common.delete'),
    danger: true,
  })
  if (!ok) return
  try {
    await deleteMemory(props.agentId, m.id)
    await load()
    showToast(t('contact.memoryDeleted'))
  } catch {
    showToast(t('contact.memorySaveFailed'))
  }
}

async function clearAll() {
  if (list.value.length === 0) return
  const ok = await confirmAction({
    title: t('contact.memoryClearTitle'),
    message: t('contact.memoryClearMsg', { name: props.agentName }),
    confirmText: t('contact.memoryClear'),
    danger: true,
  })
  if (!ok) return
  try {
    await clearMemories(props.agentId)
    await load()
    showToast(t('contact.memoryCleared'))
  } catch {
    showToast(t('contact.memorySaveFailed'))
  }
}

onMounted(load)
</script>

<template>
  <div
    class="memory-mask"
    @pointerdown="maskDown = $event.target === $event.currentTarget"
    @pointerup="maskUp = $event.target === $event.currentTarget"
    @click.self="maskDown && maskUp && emit('close')"
  >
    <div class="memory-card">
      <div class="head">
        <h3 class="title">
          {{ t('contact.memoryData') }}
          <span class="sub">{{ props.agentName }} · {{ t('contact.memoryCount', { n: list.length }) }}</span>
        </h3>
        <div class="add-box">
          <textarea
            v-model="draft"
            class="add-input"
            rows="2"
            :placeholder="t('contact.memoryAddPlaceholder')"
          />
          <button class="btn primary" :disabled="adding || !draft.trim()" @click="add">
            {{ t('contact.memoryAdd') }}
          </button>
        </div>
      </div>

      <div class="list">
        <p v-if="error" class="status err">{{ error }}</p>
        <p v-else-if="!loading && list.length === 0" class="status">{{ t('contact.memoryEmpty') }}</p>
        <div v-for="m in list" :key="m.id" class="mem-row">
          <template v-if="editingId === m.id">
            <textarea v-model="editDraft" class="add-input" rows="3" />
            <div class="row-actions">
              <button class="btn primary" :disabled="saving || !editDraft.trim()" @click="saveEdit">
                {{ t('common.save') }}
              </button>
              <button class="btn" @click="editingId = null">{{ t('common.cancel') }}</button>
            </div>
          </template>
          <template v-else>
            <p class="mem-content">{{ m.content }}</p>
            <div class="row-main">
              <span class="mem-time">{{ formatTime(m.createdAt) }}</span>
              <div class="row-actions">
                <button class="link-btn" @click="startEdit(m)">{{ t('common.edit') }}</button>
                <button class="link-btn danger" @click="removeOne(m)">{{ t('common.delete') }}</button>
              </div>
            </div>
          </template>
        </div>
        <p v-if="loading" class="status">{{ t('history.loading') }}</p>
      </div>

      <div class="foot">
        <button class="btn danger" :disabled="list.length === 0" @click="clearAll">
          {{ t('contact.memoryClear') }}
        </button>
        <button class="btn" @click="emit('close')">{{ t('common.close') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.memory-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 210;
}

.memory-card {
  width: 620px;
  max-height: 78vh;
  display: flex;
  flex-direction: column;
  background: $bg-panel;
  border: 1px solid $border-color;
  border-radius: $radius-lg;
  box-shadow: $shadow-md;
  padding: $spacing-lg;
}

.head {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;
  margin-bottom: $spacing-md;
}

.title {
  font-size: $font-size-base;
  font-weight: 600;
  color: $text-primary;

  .sub {
    margin-left: $spacing-sm;
    font-size: $font-size-xs;
    font-weight: 400;
    color: $text-tertiary;
  }
}

.add-box {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;
  align-items: flex-end;

  .add-input {
    width: 100%;
  }
}

.add-input {
  background: $bg-input;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  color: $text-primary;
  font-size: $font-size-sm;
  padding: $spacing-sm;
  outline: none;
  resize: vertical;
  font-family: inherit;
  line-height: 1.5;

  &:focus {
    border-color: rgba(var(--c-primary-rgb), 0.55);
  }
}

.list {
  flex: 1;
  min-height: 120px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;
}

.status {
  text-align: center;
  color: $text-tertiary;
  font-size: $font-size-sm;
  padding: $spacing-lg 0;

  &.err {
    color: #fa5151;
  }
}

.mem-row {
  background: $bg-input;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  padding: $spacing-sm $spacing-md;
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;

  .mem-content {
    font-size: $font-size-sm;
    color: $text-primary;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .row-main {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .mem-time {
    font-size: $font-size-xs;
    color: $text-tertiary;
  }
}

.row-actions {
  display: flex;
  gap: $spacing-md;
}

.link-btn {
  background: none;
  border: none;
  padding: 0;
  font-size: $font-size-xs;
  color: var(--c-primary);
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }

  &.danger {
    color: #fa5151;
  }
}

.btn {
  padding: 6px $spacing-lg;
  border-radius: $radius-sm;
  font-size: $font-size-sm;
  cursor: pointer;
  background: $bg-input;
  border: 1px solid $border-color;
  color: $text-primary;
  transition: background $transition-fast;

  &:hover:not(:disabled) {
    background: $bg-hover;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &.primary {
    background: $primary-color;
    border-color: $primary-color;
    color: $text-white;

    &:hover:not(:disabled) {
      background: $primary-hover;
    }
  }

  &.danger {
    background: transparent;
    color: #fa5151;
    border-color: rgba(250, 81, 81, 0.4);

    &:hover:not(:disabled) {
      background: rgba(250, 81, 81, 0.1);
    }
  }
}

.foot {
  display: flex;
  justify-content: space-between;
  padding-top: $spacing-md;
  border-top: 1px solid $border-color;
  margin-top: $spacing-md;
}
</style>
