import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import { useUserStore } from './stores/user'
import { useAgentStore } from './stores/agent'
import { useConversationStore } from './stores/conversation'
import { useModelPresetStore } from './stores/modelPreset'
import './styles/global.scss'

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
