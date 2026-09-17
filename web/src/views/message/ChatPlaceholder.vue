<script setup lang="ts">
</script>

<template>
  <div class="chat-placeholder drag-region">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
    <p>选择一个会话开始聊天</p>
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
