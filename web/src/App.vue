<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { desktop } from '@/api/desktop'
import { showCloseModal, dontAsk, chooseClose, requestClose } from '@/composables/closeConfirm'

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
      <h3 class="close-title">关闭智群 AgentTeam</h3>
      <p class="close-message">要最小化还是退出应用？</p>
      <p class="close-detail">
        最小化后应用收入右下角托盘继续运行，点击托盘图标即可恢复；退出将结束后端服务，进行中的回复与协作会被中断。
      </p>
      <div class="close-actions">
        <label class="close-remember">
          <input v-model="dontAsk" type="checkbox" />
          不再询问
        </label>
        <button class="close-btn" @click="chooseClose('minimize')">最小化到托盘</button>
        <button class="close-btn quit" @click="chooseClose('quit')">退出</button>
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
