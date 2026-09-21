<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { listLogs, type AppLogItem } from '@/api/logs'
import { copyText } from '@/utils/clipboard'
import { alertAction } from '@/composables/confirm'
import { showToast } from '@/composables/toast'
import { formatTime } from '@/utils/time'
import { t } from '@/i18n'

const emit = defineEmits<{ close: [] }>()

const PAGE_SIZE = 50

const LOG_TYPES = computed<{ value: string; label: string }[]>(() => [
  { value: '', label: t('logs.allTypes') },
  { value: 'error', label: t('logs.typeError') },
  { value: 'op_request', label: t('logs.typeOpRequest') },
  { value: 'op_decision', label: t('logs.typeOpDecision') },
  { value: 'coordination', label: t('logs.typeCoordination') },
  { value: 'discussion', label: t('logs.typeDiscussion') },
  { value: 'image', label: t('logs.typeImage') },
  { value: 'compact', label: t('logs.typeCompact') },
  { value: 'task', label: t('logs.typeTask') },
  { value: 'wechat', label: t('logs.typeWechat') },
  { value: 'api_error', label: t('logs.typeApiError') },
])

function typeLabel(value: string): string {
  return LOG_TYPES.value.find((x) => x.value === value)?.label ?? value
}

const RANGE_OPTIONS = computed<{ value: string; label: string; days: number | null }[]>(() => [
  { value: 'all', label: t('logs.rangeAll'), days: null },
  { value: 'today', label: t('time.today'), days: 0 },
  { value: '3d', label: t('logs.range3d'), days: 3 },
  { value: '7d', label: t('logs.range7d'), days: 7 },
  { value: 'custom', label: t('logs.rangeCustom'), days: null },
])

const typeFilter = ref('')
const rangeFilter = ref('all')
const customFrom = ref('')
const customTo = ref('')
const list = ref<AppLogItem[]>([])
const hasMore = ref(false)
const page = ref(1)
const loading = ref(false)
const error = ref('')
const expandedId = ref<string | null>(null)

const startOfToday = computed(() => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
})

function timeRange(): { from?: number; to?: number } {
  if (rangeFilter.value === 'today') return { from: startOfToday.value }
  if (rangeFilter.value === '3d') return { from: startOfToday.value - 2 * 86400_000 }
  if (rangeFilter.value === '7d') return { from: startOfToday.value - 6 * 86400_000 }
  if (rangeFilter.value === 'custom') {
    const from = customFrom.value ? new Date(customFrom.value).getTime() : undefined
    const to = customTo.value ? new Date(customTo.value).getTime() : undefined
    return { from, to }
  }
  return {}
}

async function load(reset: boolean) {
  if (loading.value) return
  loading.value = true
  error.value = ''
  try {
    const next = reset ? 1 : page.value + 1
    const res = await listLogs({ type: typeFilter.value || undefined, ...timeRange(), page: next, pageSize: PAGE_SIZE })
    list.value = reset ? res.list : [...list.value, ...res.list]
    hasMore.value = res.hasMore
    page.value = next
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('logs.loadFailed')
  } finally {
    loading.value = false
  }
}

function switchFilter() {
  void load(true)
}

function toggleExpand(id: string) {
  expandedId.value = expandedId.value === id ? null : id
}

async function copyLog(item: AppLogItem) {
  try {
    await copyText(`[${formatTime(item.createdAt)}] [${typeLabel(item.type)}] ${item.content}`)
    showToast(t('chat.copied'))
  } catch (e) {
    alertAction(e instanceof Error ? e.message : t('chat.copyFailed'))
  }
}

onMounted(() => void load(true))
</script>

<template>
  <div class="logs-mask" @click.self="emit('close')">
    <div class="logs-card">
      <div class="head">
        <h3 class="title">{{ t('logs.title') }}</h3>
        <div class="filters">
          <select v-model="typeFilter" class="select" @change="switchFilter">
            <option v-for="opt in LOG_TYPES" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
          <select v-model="rangeFilter" class="select" @change="switchFilter">
            <option v-for="r in RANGE_OPTIONS" :key="r.value" :value="r.value">{{ r.label }}</option>
          </select>
          <template v-if="rangeFilter === 'custom'">
            <input v-model="customFrom" class="input time" type="datetime-local" @change="switchFilter" />
            <span class="sep">{{ t('logs.to') }}</span>
            <input v-model="customTo" class="input time" type="datetime-local" @change="switchFilter" />
          </template>
        </div>
      </div>

      <div class="list">
        <p v-if="error" class="status err">{{ error }}</p>
        <p v-else-if="!loading && list.length === 0" class="status">{{ t('logs.empty') }}</p>
        <div v-for="item in list" :key="item.id" class="log-row" :class="[`t-${item.type}`, { open: expandedId === item.id }]" @click="toggleExpand(item.id)">
          <div class="row-main">
            <span class="log-time">{{ formatTime(item.createdAt) }}</span>
            <span class="log-type">{{ typeLabel(item.type) }}</span>
            <span class="log-content">{{ item.content }}</span>
            <button class="copy-btn" :title="t('logs.copyLog')" @click.stop="copyLog(item)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M5 15V5a2 2 0 0 1 2-2h10" />
              </svg>
            </button>
          </div>
          <pre v-if="expandedId === item.id" class="detail">{{ item.content }}</pre>
        </div>
        <p v-if="loading" class="status">{{ t('history.loading') }}</p>
        <button v-else-if="hasMore" class="more-btn" @click="load(false)">{{ t('logs.loadMore') }}</button>
      </div>

      <div class="actions">
        <button class="btn" @click="emit('close')">{{ t('common.close') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.logs-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 210;
}

.logs-card {
  width: 680px;
  max-height: 78vh;
  display: flex;
  flex-direction: column;
  background: $bg-panel;
  border: 1px solid $border-color;
  border-radius: $radius-lg;
  box-shadow: $shadow-md;
  padding: $spacing-lg;
}

.head {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;
  margin-bottom: $spacing-md;
}

.title {
  font-size: $font-size-base;
  font-weight: 600;
  color: $text-primary;
}

.filters {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: $spacing-sm;
}

.select,
.input.time {
  background: $bg-input;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  color: $text-primary;
  font-size: $font-size-sm;
  padding: 5px 8px;
  outline: none;
}

.sep {
  color: $text-tertiary;
  font-size: $font-size-sm;
}

.list {
  flex: 1;
  min-height: 120px;
  overflow-y: auto;
  border: 1px solid $border-color;
  border-radius: $radius-md;
  padding: 6px;
}

.status {
  text-align: center;
  color: $text-tertiary;
  font-size: $font-size-sm;
  padding: 24px 0;

  &.err {
    color: #ff9c9c;
  }
}

.log-row {
  border-radius: $radius-sm;
  padding: 6px 8px;
  cursor: pointer;

  &:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  &.open {
    background: rgba(255, 255, 255, 0.06);
  }
}

.row-main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.log-time {
  flex-shrink: 0;
  font-size: $font-size-xs;
  color: $text-tertiary;
  font-family: 'JetBrains Mono', Consolas, monospace;
}

.log-type {
  flex-shrink: 0;
  font-size: $font-size-xs;
  line-height: 1;
  padding: 2px 6px;
  border-radius: $radius-sm;
  background: rgba(255, 255, 255, 0.08);
  color: $text-secondary;

  .t-error &,
  .t-api_error & {
    background: rgba(250, 81, 81, 0.15);
    color: #ff9c9c;
  }

  .t-op_request &,
  .t-op_decision & {
    background: rgba(251, 188, 84, 0.15);
    color: #fbbc54;
  }

  .t-coordination &,
  .t-discussion & {
    background: rgba(52, 211, 153, 0.12);
    color: #34d399;
  }

  .t-image & {
    background: rgba(120, 140, 255, 0.15);
    color: #9aa7ff;
  }
}

.log-content {
  flex: 1;
  min-width: 0;
  font-size: $font-size-sm;
  color: $text-primary;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.copy-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: $radius-sm;
  background: transparent;
  color: $text-tertiary;
  cursor: pointer;

  svg {
    width: 14px;
    height: 14px;
  }

  &:hover {
    background: rgba(255, 255, 255, 0.1);
    color: $text-primary;
  }
}

.detail {
  margin: 6px 0 0;
  padding: 8px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: $radius-sm;
  font-size: $font-size-xs;
  line-height: 1.5;
  color: $text-secondary;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow-y: auto;
  font-family: 'JetBrains Mono', Consolas, Menlo, monospace;
}

.more-btn {
  display: block;
  margin: 8px auto;
  padding: 5px 16px;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  background: transparent;
  color: $text-secondary;
  font-size: $font-size-sm;
  cursor: pointer;

  &:hover {
    background: rgba(255, 255, 255, 0.06);
    color: $text-primary;
  }
}

.actions {
  display: flex;
  justify-content: flex-end;
  margin-top: $spacing-md;
}

.btn {
  padding: 6px 18px;
  border: 1px solid $border-color;
  border-radius: $radius-md;
  background: transparent;
  color: $text-primary;
  font-size: $font-size-sm;
  cursor: pointer;

  &:hover {
    background: rgba(255, 255, 255, 0.06);
  }
}
</style>
