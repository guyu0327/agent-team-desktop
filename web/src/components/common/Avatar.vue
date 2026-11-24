<script setup lang="ts">
import { computed } from 'vue'
import { hashColor, parseAvatar } from '@/utils/avatar'

const props = defineProps<{
  name: string
  avatar?: string
  size?: number
}>()

const spec = computed(() => parseAvatar(props.avatar))
const isImage = computed(() => spec.value?.kind === 'image')
const imgSrc = computed(() => (spec.value?.kind === 'image' ? spec.value.src : ''))
const textSpec = computed(() => (spec.value?.kind === 'text' ? spec.value : null))

// 旧表情等未识别头像值（建群选的表情、一句话生成的 emoji 等）：按表情渲染，底色与其他头像一致
const emoji = computed(() => (!spec.value && props.avatar ? props.avatar : ''))

// 展示文字：自定义文字优先，否则名称首字
const text = computed(() => (emoji.value ? '' : textSpec.value?.text || props.name.charAt(0)))
const bg = computed(() => textSpec.value?.color || hashColor(props.name))

// 文字越长字号越小，配合 break-all 自动换行
const fontSize = computed(() => {
  const n = [...text.value].length
  const box = props.size ?? 36
  const factor = n <= 1 ? 0.42 : n === 2 ? 0.3 : n <= 4 ? 0.22 : 0.16
  return box * factor
})

// 表情按旧版口径取 0.55 倍框高
const emojiSize = computed(() => (props.size ?? 36) * 0.55 + 'px')
</script>

<template>
  <div
    class="avatar"
    :style="{
      width: (size ?? 36) + 'px',
      height: (size ?? 36) + 'px',
      fontSize: (emoji ? emojiSize : fontSize) + 'px',
      background: isImage ? 'transparent' : bg,
    }"
  >
    <img v-if="isImage" :src="imgSrc" :alt="name" />
    <span v-else-if="emoji" class="emoji">{{ emoji }}</span>
    <span v-else class="text">{{ text }}</span>
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

  .text {
    line-height: 1.15;
    word-break: break-all;
    text-align: center;
    max-height: 100%;
    padding: 0 2px;
    overflow: hidden;
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}
</style>
