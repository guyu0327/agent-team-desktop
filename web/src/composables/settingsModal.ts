import { ref } from 'vue'

/** 全局共享的设置弹窗开关：侧栏齿轮入口与聊天页麦克风引导共用 */
export const showSettings = ref(false)

/** 打开设置弹窗时要定位展开的分区 key（一次性：弹窗挂载后即清空，空串＝默认行为） */
export const settingsSection = ref('')

/** 打开设置弹窗，可带要定位展开的分区 key（如聊天页上下文指示跳转 'compression'） */
export const openSettings = (section = '') => {
  settingsSection.value = section
  showSettings.value = true
}
