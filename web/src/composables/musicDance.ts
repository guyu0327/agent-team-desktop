import { ref, onBeforeUnmount } from 'vue'

/**
 * 音乐律动：经 getDisplayMedia 系统回环采集电脑正在播放的声音（Windows loopback，
 * 主进程 setDisplayMediaRequestHandler 自动放行，无弹窗、不经麦克风）。
 * AnalyserNode 出频谱，rAF 把每根刻度频段的能量经 painter 回调交给导航条驱动 CSS 变量。
 */
export function useMusicDance() {
  const active = ref(false)
  let stream: MediaStream | null = null
  let ctx: AudioContext | null = null
  let analyser: AnalyserNode | null = null
  let freq: Uint8Array<ArrayBuffer> | null = null
  let raf = 0
  /** 各刻度包络值（0~1，快起慢落），长度由 setCount 跟随导航条刻度数 */
  const envelopes: number[] = []
  let painter: ((amps: number[]) => void) | null = null
  /** 开关意图持久化：重启后自动恢复；采集必须由用户手势触发，恢复失败则挂到窗口第一次点击 */
  const STORE_KEY = 'chat-music-dance'
  let gestureHooked = false

  function hookFirstGesture() {
    if (gestureHooked || active.value) return
    gestureHooked = true
    const onFirst = () => {
      window.removeEventListener('pointerdown', onFirst)
      gestureHooked = false
      if (localStorage.getItem(STORE_KEY) === '1' && !active.value) {
        start().catch(() => hookFirstGesture())
      }
    }
    window.addEventListener('pointerdown', onFirst)
  }

  function setCount(n: number) {
    while (envelopes.length < n) envelopes.push(0)
    envelopes.length = n
  }

  function setPainter(cb: ((amps: number[]) => void) | null) {
    painter = cb
  }

  function tick() {
    if (!analyser || !freq || !ctx) return
    analyser.getByteFrequencyData(freq)
    const n = envelopes.length
    if (n > 0) {
      const bins = freq.length
      const nyquist = ctx.sampleRate / 2
      // 60Hz~8kHz 按刻度数对数分桶：音乐能量集中在中低频，对数分布观感更均衡
      const a = Math.log2(60)
      const b = Math.log2(Math.min(8000, nyquist))
      for (let i = 0; i < n; i++) {
        const lo = Math.min(bins - 1, Math.floor((Math.pow(2, a + ((b - a) * i) / n) / nyquist) * bins))
        const hi = Math.min(bins, Math.max(lo + 1, Math.floor((Math.pow(2, a + ((b - a) * (i + 1)) / n) / nyquist) * bins)))
        let peak = 0
        for (let k = lo; k < hi; k++) if (freq[k] > peak) peak = freq[k]
        const v = Math.min(1, peak / 255)
        envelopes[i] = Math.max(v, envelopes[i] * 0.88)
      }
    }
    painter?.(envelopes)
    raf = requestAnimationFrame(tick)
  }

  async function start() {
    if (active.value) return
    try {
      // Chromium 要求 getDisplayMedia 必须带 video；视频轨拿到即停，只留系统声音
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
      stream.getVideoTracks().forEach((t) => t.stop())
      const tracks = stream.getAudioTracks()
      if (!tracks.length) throw new Error('系统回环音轨不可用')
      ctx = new AudioContext()
      if (ctx.state === 'suspended') await ctx.resume().catch(() => {})
      analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      analyser.smoothingTimeConstant = 0.6
      ctx.createMediaStreamSource(new MediaStream(tracks)).connect(analyser)
      freq = new Uint8Array(analyser.frequencyBinCount)
      active.value = true
      localStorage.setItem(STORE_KEY, '1')
      // 采集被系统外因掐断（如输出设备切换）时保持意图，等下一次手势重试
      tracks[0].onended = () => {
        teardown()
        if (localStorage.getItem(STORE_KEY) === '1') hookFirstGesture()
      }
      raf = requestAnimationFrame(tick)
    } catch (e) {
      teardown()
      throw e
    }
  }

  /** 重启/重进会话后恢复：立即尝试（导航点击自带手势），失败挂到窗口第一次点击 */
  function resumeIfNeeded() {
    if (localStorage.getItem(STORE_KEY) !== '1' || active.value) return
    start().then(
      () => {},
      () => hookFirstGesture(),
    )
  }

  function teardown() {
    if (raf) {
      cancelAnimationFrame(raf)
      raf = 0
    }
    try {
      analyser?.disconnect()
    } catch {
      /* 已断 */
    }
    analyser = null
    if (ctx) {
      const c = ctx
      ctx = null
      c.close().catch(() => {})
    }
    stream?.getTracks().forEach((t) => t.stop())
    stream = null
    freq = null
    envelopes.fill(0)
    if (active.value) {
      active.value = false
      painter?.(envelopes) // 归零通知，刻度复位
    }
  }

  function stop() {
    localStorage.removeItem(STORE_KEY)
    teardown()
  }

  onBeforeUnmount(() => teardown())

  return { active, start, stop, resumeIfNeeded, setCount, setPainter }
}
