import { driver, type DriveStep } from 'driver.js'
import 'driver.js/dist/driver.css'
import { t } from '@/i18n'

/** 看过引导的标记：看完、跳过都算看过，之后只在设置里手动重看 */
const TOUR_DONE_KEY = 'onboarding-tour-done'

export function isTourDone(): boolean {
  return localStorage.getItem(TOUR_DONE_KEY) === '1'
}

/** 重看引导前无需清标记（startTour 不检查标记），这里仅供测试用 */
export function resetTourDone() {
  localStorage.removeItem(TOUR_DONE_KEY)
}

interface TourStepDef {
  selector?: string
  title: string
  description: string
}

/** 组装引导步骤；带 selector 的步骤在元素不存在时自动剔除，页面结构变动不会卡死引导 */
function buildSteps(defs: TourStepDef[]): DriveStep[] {
  const steps: DriveStep[] = []
  for (const def of defs) {
    const el = def.selector ? document.querySelector(def.selector) : null
    if (def.selector && !el) continue
    steps.push({
      element: el ?? undefined,
      popover: { title: def.title, description: def.description, side: 'right', align: 'start' },
    })
  }
  return steps
}

let activeDriver: ReturnType<typeof driver> | null = null

/** 启动侧边栏聚光引导：欢迎页居中，其余步骤沿「模型 → 通讯录 → 消息 → 任务 → 设置」的推荐路线走 */
export function startTour() {
  if (activeDriver) return
  const steps = buildSteps([
    { title: t('tour.welcomeTitle'), description: t('tour.welcomeDesc') },
    { selector: '[data-tour="nav-models"]', title: t('tour.modelsTitle'), description: t('tour.modelsDesc') },
    { selector: '[data-tour="nav-contact"]', title: t('tour.contactTitle'), description: t('tour.contactDesc') },
    { selector: '[data-tour="nav-chat"]', title: t('tour.chatTitle'), description: t('tour.chatDesc') },
    { selector: '[data-tour="nav-tasks"]', title: t('tour.tasksTitle'), description: t('tour.tasksDesc') },
    { selector: '[data-tour="nav-settings"]', title: t('tour.settingsTitle'), description: t('tour.settingsDesc') },
  ])
  if (!steps.length) return
  activeDriver = driver({
    steps,
    showProgress: true,
    progressText: '{{current}} / {{total}}',
    nextBtnText: t('tour.next'),
    prevBtnText: t('tour.prev'),
    doneBtnText: t('tour.done'),
    allowClose: true,
    overlayOpacity: 0.6,
    // 看完与中途关闭都标记为已看，避免每次启动都打扰
    onDestroyed: () => {
      activeDriver = null
      localStorage.setItem(TOUR_DONE_KEY, '1')
    },
  })
  activeDriver.drive()
}
