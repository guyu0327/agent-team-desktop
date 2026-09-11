<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import type { Agent, ModelPreset, ModelPresetDraft } from '@/types'
import { useModelPresetStore } from '@/stores/modelPreset'
import { useAgentStore } from '@/stores/agent'
import { alertAction, confirmAction } from '@/composables/confirm'
import Avatar from '@/components/common/Avatar.vue'

const presetStore = useModelPresetStore()
const agentStore = useAgentStore()

type Mode = { kind: 'idle' } | { kind: 'create' } | { kind: 'edit'; preset: ModelPreset }

const mode = ref<Mode>({ kind: 'idle' })
const saving = ref(false)
const formError = ref('')

const editingPreset = computed(() => (mode.value.kind === 'edit' ? mode.value.preset : null))

const form = reactive<ModelPresetDraft & { apiKey: string }>({
  name: '',
  baseUrl: '',
  apiKey: '',
  remark: '',
})

function startCreate() {
  mode.value = { kind: 'create' }
  form.name = ''
  form.baseUrl = ''
  form.apiKey = ''
  form.remark = ''
  formError.value = ''
}

function startEdit(preset: ModelPreset) {
  mode.value = { kind: 'edit', preset }
  form.name = preset.name
  form.baseUrl = preset.baseUrl
  form.apiKey = ''
  form.remark = preset.remark
  formError.value = ''
}

function cancelForm() {
  mode.value = { kind: 'idle' }
  formError.value = ''
}

function validate(): string {
  if (!form.name.trim()) return '请填写模型名称'
  if (!form.baseUrl.trim()) return '请填写 API 地址'
  return ''
}

async function save() {
  const err = validate()
  if (err) {
    formError.value = err
    return
  }
  saving.value = true
  formError.value = ''
  try {
    if (mode.value.kind === 'edit') {
      await presetStore.updatePresetById(mode.value.preset.id, { ...form })
    } else {
      await presetStore.addPreset({ ...form })
    }
    mode.value = { kind: 'idle' }
  } catch (e) {
    formError.value = e instanceof Error ? e.message : '保存失败，请稍后再试'
  } finally {
    saving.value = false
  }
}

async function remove(preset: ModelPreset) {
  const ok = await confirmAction({
    title: '删除模型预设',
    message: `确定删除模型预设「${preset.name}」吗？`,
    confirmText: '删除',
    danger: true,
  })
  if (!ok) return
  try {
    if (mode.value.kind === 'edit' && mode.value.preset.id === preset.id) {
      mode.value = { kind: 'idle' }
    }
    await presetStore.removePreset(preset.id)
  } catch (e) {
    alertAction(e instanceof Error ? e.message : '删除失败，请稍后再试')
  }
}

function maskKey(key: string): string {
  if (!key) return '未配置'
  if (key.length <= 8) return '••••••'
  return `${key.slice(0, 4)}••••${key.slice(-4)}`
}

function agentsUsing(preset: ModelPreset): Agent[] {
  return agentStore.agents.filter((a) => a.presetId === preset.id)
}
</script>

<template>
  <div class="models-view">
    <header class="view-header">
      <h2 class="title">模型预设</h2>
      <button v-if="mode.kind === 'idle'" class="btn primary" @click="startCreate">新建预设</button>
    </header>

    <div class="view-body">
      <div v-if="mode.kind !== 'idle'" class="form-card">
        <h3 class="form-title">{{ editingPreset ? `编辑预设：${editingPreset.name}` : '新建模型预设' }}</h3>

        <div class="field">
          <label class="label required">模型名称</label>
          <input v-model="form.name" class="input" placeholder="如：deepseek-chat，新建智能体时按名称匹配" />
        </div>

        <div class="field">
          <label class="label required">API 地址</label>
          <input v-model="form.baseUrl" class="input" placeholder="如 https://api.deepseek.com/v1" />
        </div>

        <div class="field">
          <label class="label">API Key</label>
          <input
            v-model="form.apiKey"
            class="input"
            type="password"
            :placeholder="editingPreset ? `当前：${maskKey(editingPreset.apiKey)}，留空表示不修改` : '保存在服务器数据库'"
            autocomplete="off"
          />
        </div>

        <div class="field">
          <label class="label">备注</label>
          <input v-model="form.remark" class="input" maxlength="50" placeholder="可选，如：公司主账号" />
        </div>

        <p v-if="formError" class="error">{{ formError }}</p>

        <div class="actions">
          <button class="btn primary" :disabled="saving" @click="save">
            {{ saving ? '保存中…' : '保存' }}
          </button>
          <button class="btn" @click="cancelForm">取消</button>
        </div>
      </div>

      <div class="preset-list">
        <div v-for="preset in presetStore.presets" :key="preset.id" class="preset-card" :class="{ editing: mode.kind === 'edit' && mode.preset.id === preset.id }">
          <div class="preset-main">
            <div class="preset-head">
              <span class="preset-name">{{ preset.name }}</span>
              <span class="preset-key">{{ maskKey(preset.apiKey) }}</span>
            </div>
            <div class="preset-url">{{ preset.baseUrl }}</div>
            <div v-if="preset.remark" class="preset-remark">{{ preset.remark }}</div>

            <div class="preset-usage">
              <template v-if="agentsUsing(preset).length > 0">
                <span class="usage-label">使用中：</span>
                <router-link
                  v-for="a in agentsUsing(preset)"
                  :key="a.id"
                  :to="`/contact/${a.id}/edit`"
                  class="usage-agent"
                  :title="`编辑 ${a.name}`"
                >
                  <Avatar :name="a.name" :avatar="a.avatar" :size="22" />
                  <span class="usage-name">{{ a.name }}</span>
                </router-link>
              </template>
              <span v-else class="usage-label">暂无智能体使用</span>
            </div>
          </div>
          <div class="preset-actions">
            <button class="mini-btn" @click="startEdit(preset)">编辑</button>
            <button class="mini-btn danger" @click="remove(preset)">删除</button>
          </div>
        </div>

        <div v-if="presetStore.presets.length === 0 && mode.kind === 'idle'" class="empty">
          还没有模型预设，点击右上角「新建预设」添加
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.models-view {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.view-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: $spacing-lg $spacing-xxl;
  border-bottom: 1px solid $border-color;
}

.title {
  font-size: $font-size-lg;
  font-weight: 600;
  color: $text-primary;
}

.view-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: $spacing-xxl;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: $spacing-xl;
}

.form-card {
  width: 520px;
  background: $bg-panel;
  border-radius: $radius-lg;
  padding: $spacing-xxl;
  box-shadow: $shadow-md;
  display: flex;
  flex-direction: column;
  gap: $spacing-lg;
}

.form-title {
  font-size: $font-size-base;
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

  &.required::after {
    content: ' *';
    color: #fa5151;
  }
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

.error {
  font-size: $font-size-xs;
  color: #fa5151;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: $spacing-md;
  padding-top: $spacing-sm;
  border-top: 1px solid $border-color;
}

.preset-list {
  width: 520px;
  display: flex;
  flex-direction: column;
  gap: $spacing-md;
}

.preset-card {
  display: flex;
  align-items: flex-start;
  gap: $spacing-md;
  background: $bg-panel;
  border: 1px solid transparent;
  border-radius: $radius-lg;
  padding: $spacing-lg;

  &.editing {
    border-color: $primary-color;
  }
}

.preset-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.preset-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $spacing-md;
}

.preset-name {
  font-size: $font-size-base;
  font-weight: 600;
  color: $text-primary;
}

.preset-key {
  font-size: $font-size-xs;
  color: $text-tertiary;
  font-family: monospace;
}

.preset-url {
  font-size: $font-size-sm;
  color: $text-secondary;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.preset-remark {
  font-size: $font-size-xs;
  color: $text-tertiary;
}

.preset-usage {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: $spacing-sm;
  margin-top: $spacing-xs;
  padding-top: $spacing-sm;
  border-top: 1px solid $border-light;

  .usage-label {
    font-size: $font-size-xs;
    color: $text-tertiary;
  }

  .usage-agent {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px $spacing-sm 2px 2px;
    border-radius: $radius-sm;
    transition: background $transition-fast;

    &:hover {
      background: $bg-hover;

      .usage-name {
        color: $primary-color;
      }
    }

    .usage-name {
      font-size: $font-size-xs;
      color: $text-secondary;
    }
  }
}

.preset-actions {
  display: flex;
  gap: $spacing-sm;
  flex-shrink: 0;
}

.mini-btn {
  padding: 4px $spacing-md;
  border-radius: $radius-sm;
  background: $bg-input;
  color: $text-secondary;
  font-size: $font-size-xs;
  cursor: pointer;
  transition: background $transition-fast, color $transition-fast;

  &:hover {
    background: $bg-hover;
    color: $text-primary;
  }

  &.danger:hover {
    background: rgba(250, 81, 81, 0.15);
    color: #fa5151;
  }
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

.empty {
  padding: $spacing-xxl;
  text-align: center;
  color: $text-tertiary;
  font-size: $font-size-sm;
}
</style>
