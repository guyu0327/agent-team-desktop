<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { desktop } from '@/api/desktop'
import { showCloseModal, dontAsk, chooseClose, requestClose } from '@/composables/closeConfirm'
import { t } from '@/i18n'

// 阻止浏览器/Electron 对文件拖拽的默认导航（打开文件）；输入区自身的 drop 处理不受影响
const preventDragNavigation = (e: DragEvent) => e.preventDefault()

onMounted(() => {
  window.addEventListener('dragover', preventDragNavigation)
  window.addEventListener('drop', preventDragNavigation)
  if (desktop) {
    desktop.closeUiReady()
    desktop.onCloseRequest(requestClose)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('dragover', preventDragNavigation)
  window.removeEventListener('drop', preventDragNavigation)
})
</script>

<template>
  <router-view />
  <div v-if="showCloseModal" class="close-mask">
    <div class="close-card">
      <h3 class="close-title">{{ t('close.title') }}</h3>
      <p class="close-message">{{ t('close.msg') }}</p>
      <p class="close-detail">
        {{ t('close.detail') }}
      </p>
      <div class="close-actions">
        <label class="close-remember">
          <input v-model="dontAsk" type="checkbox" />
          {{ t('close.dontAsk') }}
        </label>
        <button class="close-btn" @click="chooseClose('minimize')">{{ t('close.minimize') }}</button>
        <button class="close-btn quit" @click="chooseClose('quit')">{{ t('close.quit') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.close-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 400;
}

.close-card {
  width: 360px;
  background: $bg-panel;
  border: 1px solid $border-color;
  border-radius: $radius-lg;
  box-shadow: $shadow-md;
  padding: $spacing-xl;
}

.close-title {
  font-size: $font-size-base;
  font-weight: 600;
  color: $text-primary;
  margin-bottom: $spacing-md;
}

.close-message {
  font-size: $font-size-base;
  color: $text-primary;
  margin-bottom: $spacing-xs;
}

.close-detail {
  font-size: $font-size-sm;
  color: $text-secondary;
  line-height: 1.6;
  margin-bottom: $spacing-lg;
}

.close-actions {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
}

.close-remember {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: $font-size-sm;
  color: $text-secondary;
  cursor: pointer;
  user-select: none;

  input {
    accent-color: $primary-color;
    cursor: pointer;
  }
}

.close-btn {
  padding: 7px $spacing-lg;
  border-radius: $radius-sm;
  background: $primary-color;
  color: $text-white;
  font-size: $font-size-sm;
  cursor: pointer;
  transition: background $transition-fast;

  &:hover {
    background: $primary-hover;
  }

  &.quit {
    background: $bg-input;
    color: #fa5151;

    &:hover {
      background: rgba(250, 81, 81, 0.12);
    }
  }
}
</style>
