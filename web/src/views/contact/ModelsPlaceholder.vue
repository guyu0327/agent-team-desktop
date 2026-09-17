<script setup lang="ts">
</script>

<template>
  <div class="models-placeholder drag-region">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
      <rect x="3" y="4" width="18" height="7" rx="2" />
      <rect x="3" y="13" width="18" height="7" rx="2" />
      <path d="M7 7.5h.01M7 16.5h.01M11 7.5h6M11 16.5h6" stroke-linecap="round" />
    </svg>
    <p>选择模型预设查看配置，或点击「新建预设」</p>
  </div>
</template>

<style scoped lang="scss">
.models-placeholder {
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
