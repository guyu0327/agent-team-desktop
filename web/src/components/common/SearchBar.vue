<script setup lang="ts">
defineProps<{ modelValue: string; placeholder?: string }>()
defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <div class="search-bar drag-region">
    <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
    <input
      type="text"
      :value="modelValue"
      :placeholder="placeholder ?? '搜索'"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
  </div>
</template>

<style scoped lang="scss">
.search-bar {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  padding: $spacing-sm $spacing-md;
  background: $bg-input;
  border-radius: $radius-sm;
  margin: $spacing-md;

  .search-icon {
    width: 14px;
    height: 14px;
    color: $text-tertiary;
    flex-shrink: 0;
  }

  input {
    flex: 1;
    min-width: 0;
    background: none;
    font-size: $font-size-sm;
    color: $text-primary;

    &::placeholder {
      color: $text-tertiary;
    }
  }
}
</style>
