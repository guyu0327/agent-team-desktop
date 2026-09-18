import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import { useUserStore } from './stores/user'
import { useAgentStore } from './stores/agent'
import { useConversationStore } from './stores/conversation'
import { useModelPresetStore } from './stores/modelPreset'
import { APP_NAME, APP_VERSION } from './constants/app'
import './styles/global.scss'
import { desktop } from './api/desktop'
import { currentLang, currentTheme } from './composables/appearance'
import { setLocale } from './i18n'

// macOS 桌面壳：在根元素标记平台类，供顶部区域拖拽移动窗口等平台样式使用
if (desktop?.platform === 'darwin') document.documentElement.classList.add('mac')

// 应用上次选择的主题外观与语言（默认深色/中文）
document.documentElement.dataset.theme = currentTheme()
document.documentElement.lang = currentLang() === 'en' ? 'en' : 'zh-CN'
setLocale(currentLang())

document.title = `${APP_NAME} v${APP_VERSION}`

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')

function report(err: unknown) {
  console.error('初始化加载失败，请确认后端服务已启动（localhost:8080）', err)
}

useUserStore()
  .loadUser()
  .catch(report)
useAgentStore()
  .loadAgents()
  .catch(report)
useConversationStore()
  .loadConversations()
  .catch(report)
useModelPresetStore()
  .loadPresets()
  .catch(report)
