import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
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
