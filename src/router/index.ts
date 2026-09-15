import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router'

// Electron 桌面壳从 file:// 加载，history 模式不可用，自动切换 hash 模式；网页部署不受影响
const isFileProtocol = typeof location !== 'undefined' && location.protocol === 'file:'

const router = createRouter({
  history: isFileProtocol ? createWebHashHistory() : createWebHistory(),
  routes: [
    {
      path: '/',
      component: () => import('@/layouts/MainLayout.vue'),
      children: [
        { path: '', redirect: '/chat' },
        {
          path: 'chat',
          component: () => import('@/views/message/MessageView.vue'),
          children: [
            {
              path: '',
              name: 'ChatEmpty',
              component: () => import('@/views/message/ChatPlaceholder.vue'),
            },
            {
              path: ':id',
              name: 'Chat',
              component: () => import('@/views/chat/ChatView.vue'),
              props: true,
            },
          ],
        },
        {
          path: 'contact',
          component: () => import('@/views/contact/ContactView.vue'),
          children: [
            {
              path: '',
              name: 'ContactEmpty',
              component: () => import('@/views/contact/ContactPlaceholder.vue'),
            },
            {
              path: 'add',
              name: 'AgentAdd',
              component: () => import('@/views/contact/AgentForm.vue'),
            },
            {
              path: ':id',
              name: 'ContactDetail',
              component: () => import('@/views/contact/ContactDetail.vue'),
              props: true,
            },
            {
              path: ':id/edit',
              name: 'AgentEdit',
              component: () => import('@/views/contact/AgentForm.vue'),
              props: true,
            },
          ],
        },
        {
          path: 'profile',
          name: 'Profile',
          component: () => import('@/views/profile/ProfileView.vue'),
        },
        {
          path: 'settings',
          name: 'Settings',
          component: () => import('@/views/profile/SettingsView.vue'),
        },
        {
          path: 'models',
          name: 'ModelPresets',
          component: () => import('@/views/contact/ModelsView.vue'),
        },
      ],
    },
  ],
})

export default router
