<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { ModelPresetDraft, ModelPresetProtocol } from '@/types'
import { useModelPresetStore } from '@/stores/modelPreset'
import { t } from '@/i18n'

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

      <p v-if="formError" class="error">{{ formError }}</p>

      <div class="actions">
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
