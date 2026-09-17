<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  name: string
  avatar?: string
  size?: number
}>()

const palette = ['#e8875b', '#5b9bd5', '#70ad47', '#9b6bc9', '#d56aa0', '#4db6ac', '#c9a44a']

const bg = computed(() => {
  let hash = 0
  for (const ch of props.name) hash = (hash * 31 + ch.charCodeAt(0)) | 0
  return palette[Math.abs(hash) % palette.length]
})

const isImage = computed(() => props.avatar?.startsWith('http') || props.avatar?.startsWith('data:'))
const isEmoji = computed(() => !!props.avatar && !isImage.value)
const emojiSize = computed(() => (props.size ?? 36) * 0.55 + 'px')
</script>

<template>
  <div
    class="avatar"
    :style="{
      width: (size ?? 36) + 'px',
      height: (size ?? 36) + 'px',
      fontSize: (size ?? 36) * 0.42 + 'px',
      background: avatar ? 'transparent' : bg,
    }"
  >
    <img v-if="isImage" :src="avatar" :alt="name" />
    <span v-else-if="isEmoji" class="emoji" :style="{ fontSize: emojiSize }">{{ avatar }}</span>
    <span v-else>{{ name.charAt(0) }}</span>
  </div>
</template>

<style scoped lang="scss">
.avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: $radius-sm;
  color: $text-white;
  font-weight: 600;
  flex-shrink: 0;
  overflow: hidden;
  user-select: none;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}
</style>
