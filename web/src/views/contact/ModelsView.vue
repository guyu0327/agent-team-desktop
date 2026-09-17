<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import type { ModelPreset } from '@/types'
import { useModelPresetStore } from '@/stores/modelPreset'
import SearchBar from '@/components/common/SearchBar.vue'
import ConsoleLinksPopover from './ConsoleLinksPopover.vue'

const route = useRoute()
const presetStore = useModelPresetStore()

const searchQuery = ref('')
const showConsole = ref(false)

const COLLAPSE_KEY = 'models-collapsed-groups'

function loadCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

const collapsed = ref<Set<string>>(loadCollapsed())

function toggleGroup(name: string) {
  const next = new Set(collapsed.value)
  if (next.has(name)) {
    next.delete(name)
  } else {
    next.add(name)
  }
  collapsed.value = next
  localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...next]))
}

const filteredPresets = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return presetStore.presets
  return presetStore.presets.filter((p) => {
    const remark = (p.remark ?? '').toLowerCase()
    return p.name.toLowerCase().includes(q) || p.baseUrl.toLowerCase().includes(q) || remark.includes(q)
  })
})

interface PresetGroup {
  name: string
  presets: ModelPreset[]
}

const groups = computed<PresetGroup[]>(() => {
  const chat = filteredPresets.value.filter((p) => p.protocol === 'openai-chat')
  const image = filteredPresets.value.filter((p) => p.protocol !== 'openai-chat')
  const result: PresetGroup[] = []
  if (chat.length > 0) result.push({ name: '对话预设', presets: chat })
  if (image.length > 0) result.push({ name: '文生图预设', presets: image })
  return result
})

const searching = computed(() => searchQuery.value.trim().length > 0)

const activeId = computed(() =>
  route.name === 'PresetDetail' || route.name === 'PresetEdit' ? (route.params.id as string) : null,
)
</script>

<template>
  <div class="models-module">
    <aside class="list-panel">
      <SearchBar v-model="searchQuery" placeholder="搜索模型预设" />
      <div class="preset-list">
        <router-link to="/models/add" class="add-link">
          <div class="add-row" :class="{ active: route.name === 'PresetAdd' }">
            <span class="add-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
            <span class="name">新建预设</span>
          </div>
        </router-link>

        <div v-for="group in groups" :key="group.name" class="group">
          <button
            type="button"
            class="group-header"
            :title="searching ? '搜索时不折叠' : undefined"
            @click="!searching && toggleGroup(group.name)"
          >
            <svg class="chevron" :class="{ expanded: searching || !collapsed.has(group.name) }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 6l6 6-6 6" />
            </svg>
            <span class="group-name">{{ group.name }}</span>
            <span class="group-count">{{ group.presets.length }}</span>
          </button>

          <template v-if="searching || !collapsed.has(group.name)">
            <router-link
              v-for="preset in group.presets"
              :key="preset.id"
              :to="`/models/${preset.id}`"
              class="preset-link"
            >
              <div class="preset-item" :class="{ active: preset.id === activeId }">
                <span class="preset-icon" :class="{ image: preset.protocol !== 'openai-chat' }">
                  <svg v-if="preset.protocol === 'openai-chat'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="3" />
                    <circle cx="9" cy="9" r="2" />
                    <path d="M21 15l-5-5L5 21" />
                  </svg>
                </span>
                <div class="preset-info">
                  <span class="name">{{ preset.name }}</span>
                  <span class="desc">{{ preset.remark || preset.baseUrl }}</span>
                </div>
              </div>
            </router-link>
          </template>
        </div>

        <div v-if="groups.length === 0" class="empty">无匹配的模型预设</div>
      </div>
      <div class="console-entry">
        <button type="button" class="console-btn" @click="showConsole = true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 17l6-6-6-6" />
            <path d="M12 19h8" />
          </svg>
          模型控制台
        </button>
      </div>
    </aside>
    <section class="content-area">
      <router-view />
    </section>

    <ConsoleLinksPopover v-if="showConsole" @close="showConsole = false" />
  </div>
</template>

<style scoped lang="scss">
.models-module {
  display: flex;
  height: 100%;
  width: 100%;
}

.list-panel {
  width: $panel-width;
  flex-shrink: 0;
  background: $bg-panel;
  border-right: 1px solid $border-color;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.preset-list {
  flex: 1;
  overflow-y: auto;
  padding-bottom: $spacing-sm;
}

.add-link {
  display: block;
  border-bottom: 1px solid $border-light;
  margin-bottom: $spacing-sm;
}

.add-row {
  display: flex;
  align-items: center;
  gap: $spacing-md;
  padding: $spacing-md;
  cursor: pointer;
  transition: background $transition-fast;

  &:hover {
    background: $bg-panel-hover;
  }

  &.active {
    background: $bg-panel-hover;
  }

  .add-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: $radius-sm;
    background: $primary-light;
    color: $primary-color;

    svg {
      width: 20px;
      height: 20px;
    }
  }

  .name {
    font-size: $font-size-base;
    color: $text-primary;
  }
}

.group-header {
  display: flex;
  align-items: center;
  gap: $spacing-xs;
  width: 100%;
  padding: $spacing-sm $spacing-md;
  background: transparent;
  cursor: pointer;
  user-select: none;
  transition: background $transition-fast;

  &:hover {
    background: $bg-panel-hover;
  }

  .chevron {
    width: 14px;
    height: 14px;
    color: $text-tertiary;
    transition: transform $transition-fast;
    flex-shrink: 0;

    &.expanded {
      transform: rotate(90deg);
    }
  }

  .group-name {
    font-size: $font-size-xs;
    color: $text-tertiary;
  }

  .group-count {
    font-size: $font-size-xs;
    color: $text-tertiary;
    margin-left: auto;
  }
}

.preset-link {
  display: block;
}

.preset-item {
  display: flex;
  align-items: center;
  gap: $spacing-md;
  padding: $spacing-sm $spacing-md;
  cursor: pointer;
  transition: background $transition-fast;

  &:hover {
    background: $bg-panel-hover;
  }

  &.active {
    background: $primary-color;

    .name,
    .desc {
      color: $text-white;
    }

    .preset-icon {
      background: rgba(255, 255, 255, 0.15);
      color: $text-white;
    }

    &:hover {
      background: $primary-color;
    }
  }

  .preset-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: $radius-sm;
    background: $bg-input;
    color: $text-secondary;
    flex-shrink: 0;

    svg {
      width: 18px;
      height: 18px;
    }

    &.image {
      color: $primary-color;
      background: rgba($primary-color, 0.12);
    }
  }

  .preset-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .name {
    font-size: $font-size-base;
    color: $text-primary;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .desc {
    font-size: $font-size-xs;
    color: $text-tertiary;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.empty {
  padding: $spacing-xxl;
  text-align: center;
  color: $text-tertiary;
  font-size: $font-size-sm;
}

.console-entry {
  flex-shrink: 0;
  border-top: 1px solid $border-color;
  padding: $spacing-sm;
}

.console-btn {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  width: 100%;
  padding: 8px $spacing-md;
  border-radius: $radius-sm;
  font-size: $font-size-sm;
  color: $text-secondary;
  cursor: pointer;
  transition: background $transition-fast, color $transition-fast;

  svg {
    width: 16px;
    height: 16px;
  }

  &:hover {
    background: $bg-panel-hover;
    color: $primary-color;
  }
}

.content-area {
  flex: 1;
  min-width: 0;
  background: $bg-content;
  display: flex;
  flex-direction: column;
}
</style>
