<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { ModelPresetDraft, ModelPresetProtocol } from '@/types'
import { useModelPresetStore } from '@/stores/modelPreset'

const props = defineProps<{ id?: string }>()

const router = useRouter()
const presetStore = useModelPresetStore()

const isEdit = computed(() => !!props.id)
const existing = props.id ? presetStore.findById(props.id) : undefined

const form = reactive<ModelPresetDraft & { apiKey: string }>({
  name: existing?.name ?? '',
  protocol: existing?.protocol ?? 'openai-chat',
  baseUrl: existing?.baseUrl ?? '',
  apiKey: '',
  remark: existing?.remark ?? '',
})

const PROTOCOL_OPTIONS: { value: ModelPresetProtocol; label: string }[] = [
  { value: 'openai-chat', label: '对话（OpenAI 兼容）' },
  { value: 'dashscope-image', label: '文生图（阿里 DashScope）' },
  { value: 'openai-image', label: '文生图（OpenAI Images 兼容）' },
  { value: 'siliconflow-image', label: '文生图（硅基流动）' },
]

const BASE_URL_PLACEHOLDERS: Record<ModelPresetProtocol, string> = {
  'openai-chat': '如 https://api.deepseek.com/v1',
  'dashscope-image': '完整接口地址，如 https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
  'openai-image': '完整接口地址，如 https://api.openai.com/v1/images/generations',
  'siliconflow-image': '完整接口地址，如 https://api.siliconflow.cn/v1/images/generations',
}

const NAME_PLACEHOLDERS: Record<ModelPresetProtocol, string> = {
  'openai-chat': '如：deepseek-chat，新建智能体时按名称匹配',
  'dashscope-image': '如：z-image-turbo、qwen-image',
  'openai-image': '如：dall-e-3、gpt-image-1',
  'siliconflow-image': '如：Kwai-Kolors/Kolors、Qwen/Qwen-Image',
}

const saving = ref(false)
const formError = ref('')

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
    if (isEdit.value && props.id) {
      await presetStore.updatePresetById(props.id, { ...form })
      router.push(`/models/${props.id}`)
    } else {
      const preset = await presetStore.addPreset({ ...form })
      router.push(`/models/${preset.id}`)
    }
  } catch (e) {
    formError.value = e instanceof Error ? e.message : '保存失败，请稍后再试'
  } finally {
    saving.value = false
  }
}

function cancel() {
  router.back()
}
</script>

<template>
  <div class="preset-form">
    <div class="form-card">
      <h2 class="form-title">{{ isEdit ? `编辑预设：${existing?.name ?? ''}` : '新建模型预设' }}</h2>

      <div class="field">
        <label class="label required">类型</label>
        <select v-model="form.protocol" class="input">
          <option v-for="opt in PROTOCOL_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
      </div>

      <div class="field">
        <label class="label required">模型名称</label>
        <input v-model="form.name" class="input" :placeholder="NAME_PLACEHOLDERS[form.protocol]" />
      </div>

      <div class="field">
        <label class="label required">API 地址</label>
        <input v-model="form.baseUrl" class="input" :placeholder="BASE_URL_PLACEHOLDERS[form.protocol]" />
      </div>

      <div class="field">
        <label class="label">API Key</label>
        <input
          v-model="form.apiKey"
          class="input"
          type="password"
          :placeholder="existing ? (existing.hasKey ? '已配置，留空表示不修改' : '未配置') : '保存在服务器数据库'"
          autocomplete="off"
        />
      </div>

      <div class="field">
        <label class="label">备注</label>
        <input v-model="form.remark" class="input" maxlength="50" placeholder="可选，如：公司主账号" />
      </div>

      <p v-if="formError" class="error">{{ formError }}</p>

      <div class="actions">
        <button class="btn" @click="cancel">取消</button>
        <button class="btn primary" :disabled="saving" @click="save">
          {{ saving ? '保存中…' : isEdit ? '保存' : '创建' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.preset-form {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  justify-content: center;
  padding: $spacing-xxl * 2 $spacing-lg;
}

.form-card {
  width: 520px;
  align-self: flex-start;
  background: $bg-panel;
  border-radius: $radius-lg;
  padding: $spacing-xxl;
  box-shadow: $shadow-md;
  display: flex;
  flex-direction: column;
  gap: $spacing-lg;
}

.form-title {
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

select.input {
  cursor: pointer;

  option {
    background: $bg-panel;
    color: $text-primary;
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
