import { onBeforeUnmount, onMounted, type Ref } from 'vue'

/**
 * 弹层「点外关闭」：仅当按下与松开鼠标都发生在根元素之外才触发 close。
 * click 事件的 target 是按下/松开位置的公共祖先，单看 target 判不准，
 * 按住从层内拖到层外松手会被误判为外部点击导致误关。
 */
export function useOutsideClose(rootEl: Ref<HTMLElement | undefined>, close: () => void) {
  let downOutside = false
  let upOutside = false

  const isOutside = (e: Event) => {
    const target = e.target as Node | null
    return !!target && !!rootEl.value && !rootEl.value.contains(target)
  }

  const onDocPointerDown = (e: PointerEvent) => {
    downOutside = isOutside(e)
    upOutside = false
  }
  const onDocPointerUp = (e: PointerEvent) => {
    upOutside = isOutside(e)
  }
  const onDocClick = () => {
    if (downOutside && upOutside) close()
  }

  onMounted(() => {
    // 延迟到开层的那次点击结束后再监听，防止打开动作立即触发关闭
    setTimeout(() => {
      document.addEventListener('pointerdown', onDocPointerDown)
      document.addEventListener('pointerup', onDocPointerUp)
      document.addEventListener('click', onDocClick)
    }, 0)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onDocPointerDown)
    document.removeEventListener('pointerup', onDocPointerUp)
    document.removeEventListener('click', onDocClick)
  })
}
