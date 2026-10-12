/** 关闭确认：桌面壳拦截关闭（原生关闭按钮或 macOS 自绘红绿灯）后弹应用内样式确认框；偏好可在设置页随时改回 */
import { ref } from 'vue'
import { desktop } from '@/api/desktop'

const CLOSE_PREF_KEY = 'at:close-action'

export type ClosePref = 'ask' | 'minimize' | 'quit'

/** 当前关闭偏好：'ask' 表示每次弹确认框，其余为记住的动作 */
export const closePref = ref<ClosePref>('ask')

export function loadClosePref(): ClosePref {
  const saved = localStorage.getItem(CLOSE_PREF_KEY)
  closePref.value = saved === 'minimize' || saved === 'quit' ? saved : 'ask'
  return closePref.value
}

/** 设置页与关闭确认框共用：改回 'ask' 即恢复每次询问 */
export function setClosePref(pref: ClosePref) {
  closePref.value = pref
  try {
    if (pref === 'ask') localStorage.removeItem(CLOSE_PREF_KEY)
    else localStorage.setItem(CLOSE_PREF_KEY, pref)
  } catch {
    /* 存储不可用时仅本次会话生效 */
  }
}

export const showCloseModal = ref(false)
export const dontAsk = ref(false)

export function chooseClose(choice: 'minimize' | 'quit') {
  setClosePref(dontAsk.value ? choice : 'ask')
  showCloseModal.value = false
  desktop?.closeChoice(choice)
}

/** 发起关闭：记住了偏好则直接执行，否则弹确认框 */
export function requestClose() {
  if (loadClosePref() !== 'ask') {
    desktop.closeChoice(closePref.value as 'minimize' | 'quit')
  } else {
    dontAsk.value = false
    showCloseModal.value = true
  }
}
