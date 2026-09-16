<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{
  x: number
  y: number
  items: { key: string; label: string; danger?: boolean }[]
}>()

const emit = defineEmits<{ select: [key: string]; close: [] }>()

const rootEl = ref<HTMLElement>()
const pos = ref({ x: props.x, y: props.y })

onMounted(async () => {
  await nextTick()
  const el = rootEl.value
  if (el) {
    const rect = el.getBoundingClientRect()
    pos.value = {
      x: Math.max(4, Math.min(props.x, window.innerWidth - rect.width - 4)),
      y: Math.max(4, Math.min(props.y, window.innerHeight - rect.height - 4)),
    }
  }
  setTimeout(() => {
    document.addEventListener('click', onOutside, true)
    document.addEventListener('contextmenu', onOutside, true)
    document.addEventListener('keydown', onKeydown, true)
    window.addEventListener('scroll', requestClose, true)
  }, 0)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onOutside, true)
  document.removeEventListener('contextmenu', onOutside, true)
  document.removeEventListener('keydown', onKeydown, true)
  window.removeEventListener('scroll', requestClose, true)
})

function onOutside(e: MouseEvent) {
  const target = e.target as Node | null
  if (rootEl.value && target && rootEl.value.contains(target)) return
  emit('close')
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

function requestClose() {
  emit('close')
}

function pick(key: string) {
  emit('select', key)
  emit('close')
}
</script>

<template>
  <div ref="rootEl" class="context-menu" :style="{ left: pos.x + 'px', top: pos.y + 'px' }">
    <button
      v-for="it in items"
      :key="it.key"
      class="item"
      :class="{ danger: it.danger }"
      @click="pick(it.key)"
    >
      {{ it.label }}
    </button>
  </div>
</template>

<style scoped lang="scss">
.context-menu {
  position: fixed;
  min-width: 140px;
  padding: $spacing-xs;
  background: $bg-panel;
  border: 1px solid $border-color;
  border-radius: $radius-md;
  box-shadow: $shadow-md;
  z-index: 1000;
}

.item {
  display: block;
  width: 100%;
  padding: 8px $spacing-md;
  border-radius: $radius-sm;
  font-size: $font-size-sm;
  color: $text-primary;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
  transition: background $transition-fast;

  &:hover {
    background: $bg-panel-hover;
  }

  &.danger {
    color: #fa5151;

    &:hover {
      background: rgba(250, 81, 81, 0.08);
    }
  }
}
</style>
