<script setup lang="ts">
import { ref } from 'vue'
import { useUserStore } from '@/stores/user'
import { alertAction } from '@/composables/confirm'
import Avatar from '@/components/common/Avatar.vue'

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
    editing.value = false
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
  <div class="profile-view">
    <div class="profile-card" v-if="userStore.user">
      <Avatar :name="userStore.user.name" :avatar="userStore.user.avatar" :size="72" />

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
          <button class="btn primary" :disabled="!nameDraft.trim() || saving" @click="save">
            {{ saving ? '保存中…' : '保存' }}
          </button>
          <button class="btn" @click="cancel">取消</button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
.profile-view {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: $bg-content;
}

.profile-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: $spacing-md;
  padding: $spacing-xxl * 2;
  background: $bg-panel;
  border-radius: $radius-lg;
  box-shadow: $shadow-md;
  min-width: 360px;

  .name {
    font-size: $font-size-xl;
    font-weight: 600;
  }

  .uid {
    font-size: $font-size-sm;
    color: $text-secondary;
  }

  .signature {
    font-size: $font-size-sm;
    color: $text-tertiary;
  }
}

.edit-btn {
  margin-top: $spacing-md;
  padding: 7px $spacing-xxl;
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

.actions {
  width: 100%;
  display: flex;
  justify-content: flex-end;
  gap: $spacing-md;
  margin-top: $spacing-sm;
}

.btn {
  padding: 7px $spacing-xxl;
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
