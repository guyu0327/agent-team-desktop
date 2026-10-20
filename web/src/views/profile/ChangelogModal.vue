<script setup lang="ts">
import { computed, ref } from 'vue'
import { APP_VERSION } from '@/constants/app'
import { CHANGELOG } from './changelog'
import { t } from '@/i18n'

const emit = defineEmits<{ close: [] }>()

// 遮罩关闭判定：按下与松开都发生在遮罩上才关闭，按住从卡片内拖到遮罩松手不关
const maskDown = ref(false)
const maskUp = ref(false)

/** 条目按首个「：」拆成 主题 + 详情；无「：」的条目不可展开 */
interface StructuredItem {
  topic: string
  detail: string
}

const structured = computed(() =>
  CHANGELOG.map((entry) => ({
    ...entry,
    items: entry.items.map<StructuredItem>((item) => {
      const i = item.indexOf('：')
      return i <= 0 ? { topic: item, detail: '' } : { topic: item.slice(0, i), detail: item.slice(i + 1) }
    }),
  })),
)

const expanded = ref(new Set<string>())

function toggleItem(date: string, idx: number) {
  const key = `${date}#${idx}`
  const next = new Set(expanded.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expanded.value = next
}
</script>

<template>
  <div
    class="changelog-mask"
    @pointerdown="maskDown = $event.target === $event.currentTarget"
    @pointerup="maskUp = $event.target === $event.currentTarget"
    @click.self="maskDown && maskUp && emit('close')"
  >
    <div class="changelog-card">
      <h3 class="title">{{ t('changelog.title') }}</h3>
      <div class="entry-list">
        <div v-for="entry in structured" :key="entry.date" class="entry">
          <div class="entry-head">
            <span class="version">v{{ entry.date.replaceAll('-', '.') }}</span>
            <span v-if="entry.date.replaceAll('-', '.') === APP_VERSION" class="current-chip">{{ t('changelog.currentVersion') }}</span>
          </div>
          <ol class="items">
            <li v-for="(item, idx) in entry.items" :key="item.topic" :class="{ expandable: !!item.detail }">
              <button
                v-if="item.detail"
                class="item-toggle"
                type="button"
                @click="toggleItem(entry.date, idx)"
              >
                <svg class="item-caret" :class="{ open: expanded.has(`${entry.date}#${idx}`) }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M6 9l6 6 6-6" />
                </svg>
                <span class="item-topic">{{ item.topic }}</span>
              </button>
              <span v-else class="item-topic">{{ item.topic }}</span>
              <div v-if="item.detail && expanded.has(`${entry.date}#${idx}`)" class="item-detail">{{ item.detail }}</div>
            </li>
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

.item-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  line-height: inherit;
  text-align: left;
  cursor: pointer;

  &:hover .item-topic {
    color: $text-primary;
  }

  .item-caret {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
    color: $text-tertiary;
    transition: transform $transition-fast;

    &.open {
      transform: rotate(180deg);
    }
  }
}

.item-topic {
  color: inherit;
}

.item-detail {
  margin: 3px 0 2px 16px;
  font-size: $font-size-xs;
  color: $text-tertiary;
  line-height: 1.7;
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
