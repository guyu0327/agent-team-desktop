<script setup lang="ts">
import { t } from '@/i18n'
</script>

<template>
  <div class="chat-placeholder drag-region">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
      <path
        d="M12 3C6.48 3 2 6.94 2 11.75c0 2.66 1.4 5.04 3.62 6.65-.12.83-.5 2.1-1.12 3.1 0 0 2.3-.2 4.12-1.4.74.16 1.52.25 2.33.25h.05c5.52 0 10-3.94 10-8.75S17.52 3 12 3z"
      />
    </svg>
    <p>{{ t('message.pickToChat') }}</p>
  </div>
</template>

<style scoped lang="scss">
.chat-placeholder {
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
