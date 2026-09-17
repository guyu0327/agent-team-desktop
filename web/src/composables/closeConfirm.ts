/** 关闭确认：桌面壳拦截关闭（原生关闭按钮或 macOS 自绘红绿灯）后弹应用内样式确认框；勾选「不再询问」后记住本次动作 */
import { ref } from 'vue'
import { desktop } from '@/api/desktop'

const CLOSE_PREF_KEY = 'at:close-action'

export const showCloseModal = ref(false)
export const dontAsk = ref(false)

export function chooseClose(choice: 'minimize' | 'quit') {
  if (dontAsk.value) localStorage.setItem(CLOSE_PREF_KEY, choice)
  else localStorage.removeItem(CLOSE_PREF_KEY)
  showCloseModal.value = false
  desktop?.closeChoice(choice)
}

/** 发起关闭：记住了偏好则直接执行，否则弹确认框 */
export function requestClose() {
  const saved = localStorage.getItem(CLOSE_PREF_KEY)
  if (saved === 'minimize' || saved === 'quit') {
    desktop.closeChoice(saved)
  } else {
    dontAsk.value = false
    showCloseModal.value = true
  }
}
