import { computed, nextTick, onBeforeUnmount, ref, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue'
import type { Message } from '@/types'

/**
 * 提问导航条（DeepSeek 风格）：消息区右缘贴滚动条的刻度条，「我发出的提问」每条一个刻度。
 * 悬停任意刻度展开附近提问索引面板（卡片式）：只显示悬停项上下各几条的滑动窗口（不列全部），
 * 悬停行钉在其刻度旁使弹窗与刻度融合，沿刻度移动面板随之滑动；
 * 移入面板后同一套滚轮效果跟随鼠标：行悬停即滑窗、滚轮逐格滚动，内容从鼠标底下滚过
 * （卡片 top 钉死在进面板前的刻度位，不随行悬停移位，否则面板在鼠标下窜动会级联触发悬停）；
 * 点击刻度/面板行平滑跳转、视口覆盖高亮；12px 网格音浪式密排、整组上下居中。
 * 音乐律动开启时（fillersEnabled），中段真刻度之外的槽位由调用方渲染淡色辅助条，
 * 频段经 onSlots 交给律动、能量由律动画笔按 data-slot 回写。
 */
export function useQuestionNav(opts: {
  listRef: Ref<HTMLElement | null | undefined>
  /** 刻度预览文案取自此列表；任务页传过滤后的 visibleMessages 时用 getter/computed 皆可 */
  messages: MaybeRefOrGetter<Message[]>
  /** 会话切换/消息增删的响应源：变了全量重测（含延迟一拍兜底图片加载） */
  source: () => unknown
  fillersEnabled?: Ref<boolean>
  onSlots?: (n: number) => void
}) {
  const { listRef, messages, source, fillersEnabled, onSlots } = opts

  const navMarks = ref<{ id: string; off: number; slot: number; preview: string }[]>([])
  const danceFillers = ref<{ slot: number; off: number }[]>([])
  const navActiveIds = ref<string[]>([])
  const navHoverId = ref('')
  /** 索引面板开关：悬停任意刻度即展开附近提问预览，可移入面板点击跳转 */
  const navPanelOpen = ref(false)
  let navPanelLeaveTimer: ReturnType<typeof setTimeout> | undefined
  /** 鼠标在面板内的行号（null=不在面板内）：滚轮中心跟随此行，内容在鼠标底下滚动 */
  const navPanelSlot = ref<number | null>(null)
  /** 卡片定位钉：最后一次刻度悬停的（条内偏移, 悬停行窗口行号）。移入面板后行悬停只滑窗口内容、
   *  top 保持钉死，面板不在鼠标底下移位 */
  const navPanelPin = ref<{ off: number; h: number } | null>(null)

  /** 悬停刻度/移入面板时保持展开 */
  function openNavPanel() {
    clearTimeout(navPanelLeaveTimer)
    navPanelOpen.value = true
  }

  /** 悬停刻度：展开面板、窗口以该刻度为中心重排，并把卡片钉在该刻度旁 */
  function hoverNavMark(m: { id: string; off: number }) {
    clearTimeout(navPanelLeaveTimer)
    navPanelOpen.value = true
    navHoverId.value = m.id
    navPanelSlot.value = null
    navPanelPin.value = { off: m.off, h: Math.max(0, navPanelItems.value.findIndex(x => x.id === m.id)) }
  }

  /** 刻度与面板之间移动有 180ms 宽限，穿越空隙不闪关；期间窗口锚点（navHoverId）保留，
   *  面板内容不塌缩，移入面板即接管保持展开，宽限到期无人接手才连同高亮一并收起 */
  function scheduleNavPanelClose() {
    clearTimeout(navPanelLeaveTimer)
    navPanelSlot.value = null
    navPanelLeaveTimer = setTimeout(() => {
      navPanelOpen.value = false
      navHoverId.value = ''
      navPanelPin.value = null
    }, 180)
  }

  /** 点击面板行/刻度跳转后立即收起 */
  function closeNavPanelNow() {
    clearTimeout(navPanelLeaveTimer)
    navPanelOpen.value = false
    navPanelSlot.value = null
    navPanelPin.value = null
  }

  /** 面板窗口：悬停项上下各留几条；条数远超窗口时窗口随悬停刻度滑动 */
  const NAV_PANEL_SIDES = 5

  /** 悬停项附近的提问窗口（上下各 NAV_PANEL_SIDES 条、居中悬停项；两端钳制不越界）。
   *  面板行悬停也回写 navHoverId（同刻度滚轮），级联靠 top 钉死（navPanelPin）规避：
   *  窗口滑了但卡片不动，面板不在鼠标底下移位就不会连锁触发新悬停 */
  const navPanelItems = computed(() => {
    const marks = navMarks.value
    const idx = marks.findIndex(m => m.id === navHoverId.value)
    if (idx < 0) return []
    const size = NAV_PANEL_SIDES * 2 + 1
    const start = Math.max(0, Math.min(idx - NAV_PANEL_SIDES, marks.length - size))
    return marks.slice(start, start + size)
  })

  /** 悬停面板行：滚轮中心跟到该行，窗口随之滑动（同沿刻度移动的滚轮效果） */
  function hoverNavItem(slot: number, m: { id: string }) {
    navPanelSlot.value = slot
    if (navHoverId.value !== m.id) navHoverId.value = m.id
  }

  /** 面板上滚轮：逐格滑窗（deltaY>0 往后翻），滚轮中心（navPanelSlot）不动，内容从鼠标底下滚过 */
  function rollNavPanel(deltaY: number) {
    const marks = navMarks.value
    const idx = marks.findIndex(m => m.id === navHoverId.value)
    if (idx < 0) return
    const next = idx + (deltaY > 0 ? 1 : -1)
    if (next < 0 || next >= marks.length) return
    navHoverId.value = marks[next].id
  }

  /** 面板行悬停判定：鼠标在面板内跟随所在行，否则跟随窗口锚点行（钉在刻度旁的那行） */
  function navItemHovered(slot: number, id: string) {
    return navPanelSlot.value !== null ? navPanelSlot.value === slot : navHoverId.value === id
  }

  /** 滚轮效果：离中心（鼠标所在行，不在面板内时为锚点行）越远逐级轻微缩小、变淡
   *  （transform/opacity 不影响布局，滑动窗口时不跳动；落差刻意调缓，只留一点纵深感） */
  function navItemStyle(slot: number) {
    const anchor = navPanelItems.value.findIndex(x => x.id === navHoverId.value)
    const d = Math.abs(slot - (navPanelSlot.value ?? anchor))
    return {
      transform: `scale(${Math.max(0.92, 1 - d * 0.02)})`,
      opacity: `${Math.max(0.65, 1 - d * 0.07)}`,
    }
  }

  /** 面板行固定行高（px）：行中心 = r*26 + 4(padding) + 13 */
  const NAV_ROW_H = 26

  /** 面板定位：悬停行钉在其刻度旁（条内坐标 50%+off），面板上下越界时钳回条内。
   *  卡片因此与刻度融合：指到哪个刻度，卡片里正对它的就是那行文字。
   *  移入面板后用钉（navPanelPin）保持 top 不动，行悬停只滚内容不移卡片 */
  function navPanelStyle() {
    const items = navPanelItems.value
    if (items.length === 0) return {}
    const pin = navPanelPin.value
    const h = pin ? pin.h : Math.max(0, items.findIndex(x => x.id === navHoverId.value))
    const off = pin ? pin.off : (navMarks.value.find(m => m.id === navHoverId.value)?.off ?? 0)
    return {
      top: `clamp(4px, calc(50% + ${off}px - ${h * NAV_ROW_H + 17}px), calc(100% - ${items.length * NAV_ROW_H + 12}px))`,
    }
  }
  /** id → 内容内偏移缓存：滚动时只扫数组更新高亮，不逐个读 DOM */
  let navOffsets: { id: string; top: number }[] = []
  /** 上次测量时的 scrollHeight x clientHeight：变了说明内容布局变了（图片加载/流式增长），需重测 */
  let navLayoutHash = ''
  let navRaf = 0
  let navSettleTimer: ReturnType<typeof setTimeout> | undefined

  function navPreviewOf(msg: Message): string {
    const text = msg.content.replace(/\s+/g, ' ').trim()
    if (text) return text.length > 60 ? text.slice(0, 60) + '…' : text
    return msg.attachments?.length ? `附件 ×${msg.attachments.length}` : '（空消息）'
  }

  /** 元素沿 offsetParent 链到根的布局偏移和：链上都是定位布局量，与滚动位置无关
   *  （BoundingRect 相减在启动贴底滚动等竞态下会量出脏值且没有重测时机，弃用） */
  function chainTop(el: HTMLElement): number {
    let top = 0
    let cur: HTMLElement | null = el
    while (cur) {
      top += cur.offsetTop
      cur = cur.offsetParent as HTMLElement | null
    }
    return top
  }

  /** 全量重测刻度：偏移量只服务高亮与跳转，位置按槽位等距密排 */
  function computeNavMarks() {
    const el = listRef.value
    if (!el) return
    const maxScroll = el.scrollHeight - el.clientHeight
    const nodes = el.querySelectorAll<HTMLElement>('[data-nav-id]')
    navLayoutHash = `${el.scrollHeight}x${el.clientHeight}`
    if (nodes.length < 2 || maxScroll <= 0) {
      navMarks.value = []
      danceFillers.value = []
      navOffsets = []
      navActiveIds.value = []
      onSlots?.(0)
      return
    }
    const byId = new Map(toValue(messages).map(m => [m.id, m]))
    const offsets: { id: string; top: number }[] = []
    const previews = new Map<string, string>()
    nodes.forEach(node => {
      const id = node.dataset.navId
      if (!id) return
      // 消息列表不是定位元素，节点与列表的 offsetParent 链同根，做差即得内容内偏移
      offsets.push({ id, top: chainTop(node) - chainTop(el) })
      const msg = byId.get(id)
      if (msg) previews.set(id, navPreviewOf(msg))
    })
    navOffsets = offsets
    // 音浪式密排 + 律动补充条：先按 12px 网格算条内容纳的总槽数，真刻度占中间 n 槽。
    // 律动开启时上下剩余槽位补淡色辅助条（随频谱一起跳）；提问多到放不下时槽数=n，自动退化为纯刻度密排
    const n = offsets.length
    const stripH = Math.max(1, el.clientHeight - 48) // 条上下各留一个 $spacing-lg
    const slots = Math.max(n, Math.floor((stripH - 24) / 12))
    const step = Math.min(12, stripH / slots)
    onSlots?.(slots)
    const half = (slots - 1) / 2
    const fillerTop = Math.floor((slots - n) / 2)
    navMarks.value = offsets.map((o, i) => ({
      id: o.id,
      off: (fillerTop + i - half) * step,
      slot: fillerTop + i,
      preview: previews.get(o.id) ?? '',
    }))
    danceFillers.value = fillersEnabled?.value
      ? Array.from({ length: slots - n }, (_, k) => {
          const slot = k < fillerTop ? k : fillerTop + n + (k - fillerTop)
          return { slot, off: (slot - half) * step }
        })
      : []
    updateNavActive(el)
  }

  /** 视口覆盖到的提问刻度高亮：消息顶部落进 [scrollTop, scrollTop+clientHeight] 即视为可见 */
  function updateNavActive(el: HTMLElement) {
    const start = el.scrollTop
    const end = start + el.clientHeight
    const ids = navOffsets.filter(o => o.top >= start && o.top < end).map(o => o.id)
    if (ids.length !== navActiveIds.value.length || ids.some((v, i) => v !== navActiveIds.value[i])) {
      navActiveIds.value = ids
    }
  }

  /** 滚动跟随（rAF 节流）：布局尺寸变了先全量重测，否则只刷新高亮 */
  function navOnScroll() {
    const el = listRef.value
    if (!el || navRaf) return
    navRaf = requestAnimationFrame(() => {
      navRaf = 0
      if (!el) return
      if (`${el.scrollHeight}x${el.clientHeight}` !== navLayoutHash) computeNavMarks()
      else updateNavActive(el)
    })
  }

  /** 点击刻度：平滑滚到该提问并短暂描边高亮目标气泡 */
  function jumpToMsg(id: string) {
    const el = listRef.value
    const node = el?.querySelector<HTMLElement>(`[data-nav-id="${CSS.escape(id)}"]`)
    if (!el || !node) return
    node.scrollIntoView({ behavior: 'smooth', block: 'start' })
    node.classList.remove('nav-flash')
    // 强制 reflow：连击同一刻度时描边动画能重新启动
    void node.offsetWidth
    node.classList.add('nav-flash')
    setTimeout(() => node.classList.remove('nav-flash'), 1500)
  }

  // 消息增删或切换会话后重测；延迟一拍兜底图片等异步资源加载完引起的高度变化
  watch(
    source,
    () => {
      nextTick(computeNavMarks)
      clearTimeout(navSettleTimer)
      navSettleTimer = setTimeout(computeNavMarks, 800)
    },
    { immediate: true },
  )

  // 律动开关切换：辅助条的渲染随之增删，重算槽位分配
  if (fillersEnabled) {
    watch(fillersEnabled, () => nextTick(computeNavMarks))
  }

  onBeforeUnmount(() => {
    clearTimeout(navSettleTimer)
    clearTimeout(navPanelLeaveTimer)
    if (navRaf) cancelAnimationFrame(navRaf)
  })

  return {
    navMarks,
    danceFillers,
    navActiveIds,
    navHoverId,
    navPanelOpen,
    navPanelItems,
    navItemStyle,
    navItemHovered,
    navPanelStyle,
    hoverNavMark,
    hoverNavItem,
    rollNavPanel,
    openNavPanel,
    scheduleNavPanelClose,
    closeNavPanelNow,
    computeNavMarks,
    jumpToMsg,
    navOnScroll,
  }
}
