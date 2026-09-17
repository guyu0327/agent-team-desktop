<script setup lang="ts">
</script>

<template>
  <div class="contact-placeholder drag-region">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
      <path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2" stroke-linecap="round" />
    </svg>
    <p>选择智能体查看配置，或点击「新建智能体」</p>
  </div>
</template>

<style scoped lang="scss">
.contact-placeholder {
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
