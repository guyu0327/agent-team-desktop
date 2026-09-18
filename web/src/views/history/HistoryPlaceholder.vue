<script setup lang="ts">
import { t } from '@/i18n'
</script>

<template>
  <div class="history-placeholder drag-region">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 12a9 9 0 1 0 3-6.7L3.5 7.5" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l3.5 2" />
    </svg>
    <p>{{ t('history.placeholder') }}</p>
  </div>
</template>

<style scoped lang="scss">
.history-placeholder {
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
