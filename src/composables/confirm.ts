import { reactive } from 'vue'

export interface ConfirmOptions {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  /** 确认按钮显示为红色危险样式 */
  danger?: boolean
}

interface ConfirmState {
  visible: boolean
  title: string
  message: string
  confirmText: string
  cancelText: string
  danger: boolean
}

const state = reactive<ConfirmState>({
  visible: false,
  title: '',
  message: '',
  confirmText: '确定',
  cancelText: '取消',
  danger: false,
})

let resolver: ((v: boolean) => void) | null = null

export function useConfirmState(): ConfirmState {
  return state
}

export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  if (resolver) resolver(false)
  state.title = options.title
  state.message = options.message
  state.confirmText = options.confirmText ?? '确定'
  state.cancelText = options.cancelText ?? '取消'
  state.danger = options.danger ?? false
  state.visible = true
  return new Promise((resolve) => {
    resolver = resolve
  })
}

export function settleConfirm(result: boolean) {
  if (!state.visible) return
  state.visible = false
  resolver?.(result)
  resolver = null
}

interface AlertState {
  visible: boolean
  message: string
  buttonText: string
}

const alertState = reactive<AlertState>({ visible: false, message: '', buttonText: '知道了' })
let alertResolver: (() => void) | null = null

export function useAlertState(): AlertState {
  return alertState
}

export function alertAction(message: string, buttonText = '知道了'): Promise<void> {
  if (alertResolver) alertResolver()
  alertState.message = message
  alertState.buttonText = buttonText
  alertState.visible = true
  return new Promise((resolve) => {
    alertResolver = resolve
  })
}

export function settleAlert() {
  if (!alertState.visible) return
  alertState.visible = false
  alertResolver?.()
  alertResolver = null
}
