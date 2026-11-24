<script setup lang="ts">
import { computed } from 'vue'
import Avatar from './Avatar.vue'

const props = withDefaults(
  defineProps<{
    /** 群成员头像单元（按展示顺序，超出 9 人取前 9） */
    members: Array<{ name: string; avatar?: string }>
    size?: number
    /** 成员不足 2 人时回退为单头像 */
    fallbackName?: string
    fallbackAvatar?: string
  }>(),
  { size: 36, fallbackName: '', fallbackAvatar: '' },
)

const box = computed(() => props.size)
const shown = computed(() => props.members.slice(0, 9))

// 微信群头像口径：2/3 人一行排开，4 人田字格，5 人及以上九宫格
const cols = computed(() => (shown.value.length === 4 ? 2 : Math.min(3, shown.value.length)))
const GAP = 1
const PAD = 1
const cell = computed(() => Math.floor((box.value - PAD * 2 - GAP * (cols.value - 1)) / cols.value))

const style = computed(() => ({
  width: box.value + 'px',
  height: box.value + 'px',
  padding: PAD + 'px',
  gap: GAP + 'px',
  gridTemplateColumns: `repeat(${cols.value}, ${cell.value}px)`,
  gridAutoRows: cell.value + 'px',
}))
</script>

<template>
  <div v-if="shown.length >= 2" class="group-avatar" :style="style">
    <Avatar v-for="(m, i) in shown" :key="i" :name="m.name" :avatar="m.avatar" :size="cell" />
  </div>
  <Avatar v-else :name="fallbackName" :avatar="fallbackAvatar" :size="box" />
</template>

<style scoped lang="scss">
.group-avatar {
  display: grid;
  align-content: start;
  justify-content: start;
  overflow: hidden;
  border-radius: $radius-sm;
  background: $bg-input;
  flex-shrink: 0;

  :deep(.avatar) {
    border-radius: 0;
  }
}
</style>
