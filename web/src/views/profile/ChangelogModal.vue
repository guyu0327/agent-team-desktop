<script setup lang="ts">
import { APP_VERSION } from '@/constants/app'
import { CHANGELOG } from './changelog'
import { t } from '@/i18n'

const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <div class="changelog-mask" @click.self="emit('close')">
    <div class="changelog-card">
      <h3 class="title">{{ t('changelog.title') }}</h3>
      <div class="entry-list">
        <div v-for="entry in CHANGELOG" :key="entry.date" class="entry">
          <div class="entry-head">
            <span class="version">v{{ entry.date.replaceAll('-', '.') }}</span>
            <span v-if="entry.date.replaceAll('-', '.') === APP_VERSION" class="current-chip">{{ t('changelog.currentVersion') }}</span>
          </div>
          <ol class="items">
            <li v-for="item in entry.items" :key="item">{{ item }}</li>
          </ol>
        </div>
      </div>
      <div class="actions">
        <button class="btn" @click="emit('close')">{{ t('common.close') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.changelog-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.changelog-card {
  width: 420px;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  background: $bg-panel;
  border: 1px solid $border-color;
  border-radius: $radius-lg;
  box-shadow: $shadow-md;
  padding: $spacing-lg;
}

.title {
  font-size: $font-size-base;
  font-weight: 600;
  color: $text-primary;
  margin-bottom: $spacing-md;
}

.entry-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: $spacing-lg;
  padding-right: $spacing-xs;
}

.entry-head {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  padding-bottom: $spacing-xs;
  border-bottom: 1px solid $border-light;

  .version {
    font-size: $font-size-sm;
    font-weight: 600;
    color: $primary-color;
    font-family: 'JetBrains Mono', Consolas, Menlo, monospace;
  }

  .current-chip {
    font-size: $font-size-xs;
    line-height: 1;
    padding: 3px 7px;
    border-radius: $radius-sm;
    color: $primary-color;
    background: rgba(var(--c-primary-rgb), 0.12);
  }
}

.items {
  margin-top: $spacing-sm;
  padding-left: 22px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  list-style: decimal;

  li {
    font-size: $font-size-sm;
    color: $text-secondary;
    line-height: 1.6;

    &::marker {
      color: $text-tertiary;
      font-variant-numeric: tabular-nums;
    }
  }
}

.actions {
  display: flex;
  justify-content: flex-end;
  margin-top: $spacing-md;
}

.btn {
  padding: 6px $spacing-xl;
  border-radius: $radius-sm;
  background: $bg-input;
  color: $text-primary;
  font-size: $font-size-sm;
  cursor: pointer;
  transition: background $transition-fast;

  &:hover {
    background: $bg-hover;
  }
}
</style>
