<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { ModelPresetDraft, ModelPresetProtocol, ModelPresetTestResult } from '@/types'
import { useModelPresetStore } from '@/stores/modelPreset'
import { testModelPreset } from '@/api/modelPreset'
import { t } from '@/i18n'

const props = defineProps<{ id?: string }>()

const router = useRouter()
const presetStore = useModelPresetStore()

const isEdit = computed(() => !!props.id)
const existing = computed(() => (props.id ? presetStore.findById(props.id) : undefined))

const form = reactive<ModelPresetDraft & { apiKey: string }>({
  name: '',
  protocol: 'openai-chat',
  baseUrl: '',
  apiKey: '',
  remark: '',
  reasoningEffort: '',
})

// /models/add 与 /models/:id/edit 复用同一组件实例，路由切换时需重放表单回显
function syncForm() {
  const e = existing.value
  form.name = e?.name ?? ''
  form.protocol = e?.protocol ?? 'openai-chat'
  form.baseUrl = e?.baseUrl ?? ''
  form.apiKey = ''
  form.remark = e?.remark ?? ''
  form.reasoningEffort = e?.reasoningEffort ?? ''
}

watch(() => props.id, syncForm, { immediate: true })

const REASONING_OPTIONS = [
  { value: '', labelKey: 'presetForm.reasoningDefault' },
  { value: 'low', labelKey: 'presetForm.reasoningLow' },
  { value: 'medium', labelKey: 'presetForm.reasoningMedium' },
  { value: 'high', labelKey: 'presetForm.reasoningHigh' },
] as const

const PROTOCOL_OPTIONS = computed<{ value: ModelPresetProtocol; label: string }[]>(() => [
  { value: 'openai-chat', label: t('models.protocolChat') },
  { value: 'dashscope-image', label: t('models.protocolDashscope') },
  { value: 'openai-image', label: t('models.protocolOpenaiImage') },
  { value: 'siliconflow-image', label: t('models.protocolSiliconflow') },
])

const BASE_URL_PLACEHOLDERS = computed<Record<ModelPresetProtocol, string>>(() => ({
  'openai-chat': t('presetForm.urlPhChat'),
  'dashscope-image': t('presetForm.urlPhDashscope'),
  'openai-image': t('presetForm.urlPhOpenaiImage'),
  'siliconflow-image': t('presetForm.urlPhSiliconflow'),
}))

const NAME_PLACEHOLDERS = computed<Record<ModelPresetProtocol, string>>(() => ({
  'openai-chat': t('presetForm.namePhChat'),
  'dashscope-image': t('presetForm.namePhDashscope'),
  'openai-image': t('presetForm.namePhOpenaiImage'),
  'siliconflow-image': t('presetForm.namePhSiliconflow'),
}))

const saving = ref(false)
const formError = ref('')

function validate(): string {
  if (!form.name.trim()) return t('presetForm.errName')
  if (!form.baseUrl.trim()) return t('presetForm.errBaseUrl')
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
    formError.value = e instanceof Error ? e.message : t('presetForm.errSave')
  } finally {
    saving.value = false
  }
}

function cancel() {
  router.back()
}

const testable = computed(() => form.protocol === 'openai-chat')

const testing = ref(false)
const testResult = ref<ModelPresetTestResult | null>(null)

// 表单内容变化后旧测试结果即失效
watch(
  () => [form.name, form.protocol, form.baseUrl, form.apiKey, form.reasoningEffort],
  () => {
    testResult.value = null
  },
)

async function testConnection() {
  if (testing.value || !testable.value || !form.name.trim() || !form.baseUrl.trim()) return
  testing.value = true
  testResult.value = null
  try {
    testResult.value = await testModelPreset({
      presetId: props.id,
      name: form.name,
      protocol: form.protocol,
      baseUrl: form.baseUrl,
      apiKey: form.apiKey,
      reasoningEffort: form.reasoningEffort,
    })
  } catch (e) {
    testResult.value = {
      ok: false,
      latencyMs: 0,
      reply: '',
      message: e instanceof Error ? e.message : t('presetForm.testFailed'),
    }
  } finally {
    testing.value = false
  }
}

function latencyText(ms: number) {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}
</script>

<template>
  <div class="preset-form">
    <div class="form-card">
      <h2 class="form-title">{{ isEdit ? t('presetForm.editTitle', { name: existing?.name ?? '' }) : t('presetForm.addTitle') }}</h2>

      <div class="field">
        <label class="label required">{{ t('models.typeLabel') }}</label>
        <select v-model="form.protocol" class="input">
          <option v-for="opt in PROTOCOL_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
      </div>

      <div class="field">
        <label class="label required">{{ t('presetForm.nameLabel') }}</label>
        <input v-model="form.name" class="input" :placeholder="NAME_PLACEHOLDERS[form.protocol]" />
      </div>

      <div class="field">
        <label class="label required">{{ t('models.apiLabel') }}</label>
        <input v-model="form.baseUrl" class="input" :placeholder="BASE_URL_PLACEHOLDERS[form.protocol]" />
      </div>

      <div class="field">
        <label class="label">{{ t('models.keyLabel') }}</label>
        <input
          v-model="form.apiKey"
          class="input"
          type="password"
          :placeholder="existing ? (existing.hasKey ? t('presetForm.keyPhExisting') : t('presetForm.keyPhMissing')) : t('presetForm.keyPhNew')"
          autocomplete="off"
        />
      </div>

      <div class="field">
        <label class="label">{{ t('models.remarkLabel') }}</label>
        <input v-model="form.remark" class="input" maxlength="50" :placeholder="t('presetForm.remarkPh')" />
      </div>

      <div v-if="form.protocol === 'openai-chat'" class="field">
        <label class="label">{{ t('presetForm.reasoningLabel') }}</label>
        <select v-model="form.reasoningEffort" class="input">
          <option v-for="opt in REASONING_OPTIONS" :key="opt.value" :value="opt.value">{{ t(opt.labelKey) }}</option>
        </select>
        <span class="hint">{{ t('presetForm.reasoningHint') }}</span>
      </div>

      <p v-if="formError" class="error">{{ formError }}</p>

      <p v-if="testResult" class="test-result" :class="testResult.ok ? 'ok' : 'fail'">
        <template v-if="testResult.ok">{{ t('presetForm.testOk') }} · {{ latencyText(testResult.latencyMs) }}<template v-if="testResult.reply"> · {{ testResult.reply }}</template></template>
        <template v-else>{{ testResult.message }}</template>
      </p>

      <div class="actions">
        <button
          class="btn test-btn"
          :disabled="testing || !testable || !form.name.trim() || !form.baseUrl.trim()"
          :title="testable ? undefined : t('presetForm.testDisabled')"
          @click="testConnection"
        >
          {{ testing ? t('presetForm.testing') : t('presetForm.test') }}
        </button>
        <button class="btn" @click="cancel">{{ t('common.cancel') }}</button>
        <button class="btn primary" :disabled="saving" @click="save">
          {{ saving ? t('settings.saving') : isEdit ? t('common.save') : t('message.create') }}
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

.hint {
  font-size: $font-size-xs;
  color: $text-tertiary;
}

.error {
  font-size: $font-size-xs;
  color: #fa5151;
}

.test-result {
  font-size: $font-size-xs;
  word-break: break-all;

  &.ok {
    color: #07c160;
  }

  &.fail {
    color: #fa5151;
  }
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: $spacing-md;
  padding-top: $spacing-sm;
  border-top: 1px solid $border-color;

  .test-btn {
    margin-right: auto;
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
</style>
