<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { settleAlert, settleConfirm, useAlertState, useConfirmState } from '@/composables/confirm'

const state = useConfirmState()
const alert = useAlertState()
const confirmBtn = ref<HTMLButtonElement>()
const alertBtn = ref<HTMLButtonElement>()

function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (alert.visible) {
    settleAlert()
  } else if (state.visible) {
    settleConfirm(false)
  }
}
onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))

watch(
  () => state.visible,
  async (v) => {
    if (v) {
      await nextTick()
      confirmBtn.value?.focus()
    }
  },
)

watch(
  () => alert.visible,
  async (v) => {
    if (v) {
      await nextTick()
      alertBtn.value?.focus()
    }
  },
)
</script>

<template>
  <Teleport to="body">
    <transition name="dialog-fade">
      <div v-if="state.visible" class="dialog-overlay" @click.self="settleConfirm(false)">
        <div class="dialog-card" role="alertdialog" :aria-label="state.title">
          <h3 class="dialog-title">{{ state.title }}</h3>
          <p class="dialog-message">{{ state.message }}</p>
          <div class="dialog-actions">
            <button class="dlg-btn" @click="settleConfirm(false)">{{ state.cancelText }}</button>
            <button
              ref="confirmBtn"
              class="dlg-btn"
              :class="state.danger ? 'danger' : 'primary'"
              @click="settleConfirm(true)"
            >
              {{ state.confirmText }}
            </button>
          </div>
        </div>
      </div>
    </transition>

    <transition name="dialog-fade">
      <div v-if="alert.visible" class="dialog-overlay" @click.self="settleAlert()">
        <div class="dialog-card" role="alertdialog">
          <p class="dialog-message standalone">{{ alert.message }}</p>
          <div class="dialog-actions">
            <button ref="alertBtn" class="dlg-btn primary" @click="settleAlert()">
              {{ alert.buttonText }}
            </button>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped lang="scss">
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.dialog-card {
  width: 380px;
  max-width: calc(100vw - 48px);
  background: $bg-panel;
  border: 1px solid $border-color;
  border-radius: $radius-lg;
  box-shadow: $shadow-md;
  padding: $spacing-xxl;
}

.dialog-title {
  font-size: $font-size-md;
  font-weight: 600;
  color: $text-primary;
}

.dialog-message {
  margin-top: $spacing-md;
  font-size: $font-size-sm;
  color: $text-secondary;
  line-height: 1.6;
  white-space: pre-line;

  &.standalone {
    margin-top: 0;
  }
}

.dialog-actions {
  margin-top: $spacing-xxl;
  display: flex;
  justify-content: flex-end;
  gap: $spacing-md;
}

.dlg-btn {
  padding: 7px $spacing-xxl;
  border-radius: $radius-sm;
  background: $bg-input;
  color: $text-primary;
  font-size: $font-size-sm;
  cursor: pointer;
  transition: background $transition-fast, color $transition-fast;

  &:hover {
    background: $bg-hover;
  }

  &.primary {
    background: $primary-color;
    color: $text-white;

    &:hover {
      background: $primary-hover;
    }
  }

  &.danger {
    background: #fa5151;
    color: $text-white;

    &:hover {
      background: #e04444;
    }
  }
}

.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: opacity 0.18s ease;

  .dialog-card {
    transition: transform 0.18s ease;
  }
}

.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;

  .dialog-card {
    transform: scale(0.95);
  }
}
</style>
