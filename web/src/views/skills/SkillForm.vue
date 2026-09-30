<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useSkillStore } from '@/stores/skill'
import { renderMarkdown } from '@/utils/markdown'
import { t } from '@/i18n'

const props = defineProps<{ id?: string }>()

const router = useRouter()
const skillStore = useSkillStore()

const isEdit = computed(() => !!props.id)

const form = reactive({
  skillId: '',
  name: '',
  description: '',
  content: '',
})

// /skills/add 与 /skills/:id/edit 复用同一组件实例，路由切换时需重放表单回显
watch(
  () => props.id,
  async () => {
    if (props.id) {
      try {
        const detail = await skillStore.fetchDetail(props.id)
        form.skillId = detail.skillId
        form.name = detail.name
        form.description = detail.description
        form.content = detail.content
      } catch {
        router.push('/skills')
      }
    } else {
      form.skillId = ''
      form.name = ''
      form.description = ''
      form.content = ''
    }
  },
  { immediate: true },
)

const saving = ref(false)
const formError = ref('')

const ID_RE = /^[a-z0-9][a-z0-9-_]{0,63}$/

function validate(): string {
  if (!isEdit.value && !ID_RE.test(form.skillId.trim())) return t('skillForm.errId')
  if (!form.name.trim()) return t('skillForm.errName')
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
      await skillStore.updateSkillById(props.id, {
        name: form.name.trim(),
        description: form.description,
        content: form.content,
      })
      router.push(`/skills/${props.id}`)
    } else {
      const detail = await skillStore.addSkill({
        skillId: form.skillId.trim(),
        name: form.name.trim(),
        description: form.description,
        content: form.content,
      })
      router.push(`/skills/${detail.skillId}`)
    }
  } catch (e) {
    formError.value = e instanceof Error ? e.message : t('skillForm.errSave')
  } finally {
    saving.value = false
  }
}

function cancel() {
  router.back()
}
</script>

<template>
  <div class="skill-form">
    <div class="form-card">
      <h2 class="form-title">{{ isEdit ? t('skillForm.editTitle', { name: form.name }) : t('skillForm.addTitle') }}</h2>

      <div class="field">
        <label class="label required">{{ t('skillForm.nameLabel') }}</label>
        <input v-model="form.name" class="input" maxlength="50" :placeholder="t('skillForm.namePh')" />
      </div>

      <div class="field">
        <label class="label required">{{ t('skillForm.idLabel') }}</label>
        <input
          v-model="form.skillId"
          class="input mono"
          :disabled="isEdit"
          :placeholder="isEdit ? form.skillId : 'weekly-report-guide'"
        />
        <p class="hint">{{ t('skillForm.idHint') }}</p>
      </div>

      <div class="field">
        <label class="label">{{ t('skillForm.descLabel') }}</label>
        <input v-model="form.description" class="input" maxlength="100" :placeholder="t('skillForm.descPh')" />
      </div>

      <div class="field">
        <label class="label">{{ t('skills.contentLabel') }}</label>
        <textarea v-model="form.content" class="input content-input" rows="14" :placeholder="t('skillForm.contentPh')"></textarea>
      </div>

      <div v-if="form.content.trim()" class="field">
        <label class="label">{{ t('skills.preview') }}</label>
        <div class="preview" v-html="renderMarkdown(form.content)"></div>
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
.skill-form {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  justify-content: center;
  padding: $spacing-xxl * 2 $spacing-lg;
}

.form-card {
  width: 640px;
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

.hint {
  font-size: $font-size-xs;
  color: $text-tertiary;
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

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  &.mono {
    font-family: Consolas, Menlo, monospace;
  }
}

.content-input {
  resize: vertical;
  min-height: 180px;
  line-height: 1.6;
  font-family: Consolas, Menlo, monospace;
  font-size: $font-size-sm;
}

.preview {
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  padding: $spacing-md;
  font-size: $font-size-base;
  color: $text-primary;
  line-height: 1.7;
  word-break: break-word;
  max-height: 320px;
  overflow-y: auto;
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
