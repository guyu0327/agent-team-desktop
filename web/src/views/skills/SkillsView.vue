<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { Skill } from '@/types'
import { useSkillStore } from '@/stores/skill'
import { alertAction, confirmAction } from '@/composables/confirm'
import SearchBar from '@/components/common/SearchBar.vue'
import ContextMenu from '@/components/common/ContextMenu.vue'
import { t } from '@/i18n'

const route = useRoute()
const router = useRouter()
const skillStore = useSkillStore()

const searchQuery = ref('')

onMounted(() => {
  skillStore.loadSkills().catch(() => {})
})

const filteredSkills = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return skillStore.skills
  return skillStore.skills.filter(
    (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
  )
})

const activeId = computed(() =>
  route.name === 'SkillDetail' || route.name === 'SkillEdit' ? (route.params.id as string) : null,
)

const ctx = ref<{ x: number; y: number; skill: Skill } | null>(null)

const ctxItems = computed(() => [
  { key: 'edit', label: t('common.edit') },
  { key: 'delete', label: t('common.delete'), danger: true },
])

async function onCtxSelect(key: string) {
  const skill = ctx.value?.skill
  if (!skill) return
  if (key === 'edit') {
    router.push(`/skills/${skill.skillId}/edit`)
    return
  }
  if (key === 'delete') {
    const ok = await confirmAction({
      title: t('common.delete'),
      message: t('skills.deleteMsg', { name: skill.name }),
      confirmText: t('common.delete'),
      danger: true,
    })
    if (!ok) return
    try {
      await skillStore.removeSkill(skill.skillId)
      if (route.params.id === skill.skillId) router.push('/skills')
    } catch (e) {
      alertAction(e instanceof Error ? e.message : t('skills.deleteFailed'))
    }
  }
}
</script>

<template>
  <div class="skills-module">
    <aside class="list-panel">
      <SearchBar v-model="searchQuery" :placeholder="t('skills.searchPlaceholder')" />
      <div class="skill-list">
        <router-link to="/skills/add" class="add-link">
          <div class="add-row" :class="{ active: route.name === 'SkillAdd' }">
            <span class="add-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
            <span class="name">{{ t('skills.add') }}</span>
          </div>
        </router-link>

        <router-link
          v-for="skill in filteredSkills"
          :key="skill.skillId"
          :to="`/skills/${skill.skillId}`"
          class="skill-link"
          @contextmenu.prevent="ctx = { x: $event.clientX, y: $event.clientY, skill }"
        >
          <div class="skill-item" :class="{ active: skill.skillId === activeId }">
            <span class="skill-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
            </span>
            <div class="skill-info">
              <span class="name">{{ skill.name }}</span>
              <span class="desc">{{ skill.description || skill.skillId }}</span>
            </div>
            <span v-if="skill.global" class="bind-count global">{{ t('skills.globalChip') }}</span>
            <span v-else-if="skill.agentCount > 0" class="bind-count">{{ skill.agentCount }}</span>
          </div>
        </router-link>

        <div v-if="filteredSkills.length === 0" class="empty">{{ t('skills.empty') }}</div>
        <ContextMenu
          v-if="ctx"
          :x="ctx.x"
          :y="ctx.y"
          :items="ctxItems"
          @select="onCtxSelect"
          @close="ctx = null"
        />
      </div>
    </aside>
    <section class="content-area">
      <router-view />
    </section>
  </div>
</template>

<style scoped lang="scss">
.skills-module {
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

.skill-list {
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

.skill-link {
  display: block;
}

.skill-item {
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

    .skill-icon {
      background: rgba(255, 255, 255, 0.15);
      color: $text-white;
    }

    .bind-count {
      background: rgba(255, 255, 255, 0.25);
      color: $text-white;
    }

    &:hover {
      background: $primary-color;
    }
  }

  .skill-icon {
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
  }

  .skill-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
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

  .bind-count {
    flex-shrink: 0;
    min-width: 20px;
    text-align: center;
    font-size: $font-size-xs;
    line-height: 1;
    padding: 4px 6px;
    border-radius: $radius-sm;
    background: $bg-input;
    color: $text-tertiary;

    &.global {
      background: rgba(52, 211, 153, 0.12);
      color: #34d399;
      border: 1px solid rgba(52, 211, 153, 0.35);
    }
  }
}

.empty {
  padding: $spacing-xxl;
  text-align: center;
  color: $text-tertiary;
  font-size: $font-size-sm;
}

.content-area {
  flex: 1;
  min-width: 0;
  background: $bg-content;
  display: flex;
  flex-direction: column;
}
</style>
