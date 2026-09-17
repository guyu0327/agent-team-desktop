<script setup lang="ts">
import { ref } from 'vue'
import { useUserStore } from '@/stores/user'
import { alertAction } from '@/composables/confirm'
import Avatar from '@/components/common/Avatar.vue'

const emit = defineEmits<{
  close: []
}>()

const userStore = useUserStore()

const editing = ref(false)
const saving = ref(false)
const nameDraft = ref('')
const signatureDraft = ref('')
const nameInput = ref<HTMLInputElement>()

function startEdit() {
  nameDraft.value = userStore.user?.name ?? ''
  signatureDraft.value = userStore.user?.signature ?? ''
  editing.value = true
  setTimeout(() => nameInput.value?.focus(), 0)
}

async function save() {
  if (!nameDraft.value.trim() || saving.value) return
  saving.value = true
  try {
    await userStore.updateProfile(nameDraft.value, signatureDraft.value)
    emit('close')
  } catch (err) {
    alertAction(err instanceof Error ? err.message : '保存失败')
  } finally {
    saving.value = false
  }
}

function cancel() {
  editing.value = false
}
</script>

<template>
  <div class="popover-mask" @click="emit('close')">
    <div class="profile-pop" @click.stop v-if="userStore.user">
      <Avatar :name="userStore.user.name" :avatar="userStore.user.avatar" :size="64" />

      <template v-if="!editing">
        <h2 class="name">{{ userStore.user.name }}</h2>
        <p class="uid">账号：{{ userStore.user.id }}</p>
        <p class="signature">{{ userStore.user.signature || '这个人很懒，什么都没写~' }}</p>
        <button class="edit-btn" @click="startEdit">编辑资料</button>
      </template>

      <template v-else>
        <div class="field">
          <label class="label">用户名</label>
          <input
            ref="nameInput"
            v-model="nameDraft"
            class="input"
            placeholder="输入用户名"
            maxlength="20"
            @keyup.enter="save"
          />
        </div>
        <div class="field">
          <label class="label">个性签名</label>
          <input
            v-model="signatureDraft"
            class="input"
            placeholder="输入个性签名"
            maxlength="50"
            @keyup.enter="save"
          />
        </div>
        <div class="actions">
          <button class="btn" @click="cancel">取消</button>
          <button class="btn primary" :disabled="!nameDraft.trim() || saving" @click="save">
            {{ saving ? '保存中…' : '保存' }}
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
// 透明点击层：点卡片外任意处关闭；卡片锚定侧栏头像右下方
.popover-mask {
  position: fixed;
  inset: 0;
  z-index: 100;
}

.profile-pop {
  position: fixed;
  top: 50px;
  left: 66px;
  width: 280px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: $spacing-md;
  padding: $spacing-xxl;
  background: $bg-panel;
  border: 1px solid $border-color;
  border-radius: $radius-lg;
  box-shadow: $shadow-md;

  .name {
    font-size: $font-size-lg;
    font-weight: 600;
  }

  .uid {
    font-size: $font-size-sm;
    color: $text-secondary;
  }

  .signature {
    font-size: $font-size-sm;
    color: $text-tertiary;
    text-align: center;
  }
}

.edit-btn {
  margin-top: $spacing-sm;
  padding: 6px $spacing-xxl;
  border-radius: $radius-sm;
  background: $primary-color;
  color: $text-white;
  font-size: $font-size-base;
  cursor: pointer;
  transition: background $transition-fast;

  &:hover {
    background: $primary-hover;
  }
}

.field {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: $spacing-xs;
}

.label {
  font-size: $font-size-sm;
  color: $text-secondary;
}

.input {
  width: 100%;
  padding: 8px $spacing-md;
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

.actions {
  width: 100%;
  display: flex;
  justify-content: flex-end;
  gap: $spacing-md;
  margin-top: $spacing-sm;
}

.btn {
  padding: 6px $spacing-xl;
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
