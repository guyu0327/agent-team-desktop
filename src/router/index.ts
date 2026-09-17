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
          path: 'models',
          component: () => import('@/views/contact/ModelsView.vue'),
          children: [
            {
              path: '',
              name: 'ModelEmpty',
              component: () => import('@/views/contact/ModelsPlaceholder.vue'),
            },
            {
              path: 'add',
              name: 'PresetAdd',
              component: () => import('@/views/contact/PresetForm.vue'),
            },
            {
              path: ':id',
              name: 'PresetDetail',
              component: () => import('@/views/contact/PresetDetail.vue'),
              props: true,
            },
            {
              path: ':id/edit',
              name: 'PresetEdit',
              component: () => import('@/views/contact/PresetForm.vue'),
              props: true,
            },
          ],
        },
      ],
    },
  ],
})

export default router
