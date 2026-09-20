<script setup lang="ts">
import { t } from '@/i18n'
</script>

<template>
  <div class="tasks-placeholder drag-region">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" stroke-linecap="round" />
    </svg>
    <p>{{ t('tasks.pickToView') }}</p>
  </div>
</template>

<style scoped lang="scss">
.tasks-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: $spacing-md;
  color: $text-tertiary;

  svg {
    width: 64px;
    height: 64px;
    opacity: 0.4;
  }

  p {
    font-size: $font-size-sm;
  }
}
</style>
