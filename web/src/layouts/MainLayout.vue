<script setup lang="ts">
import { ref } from 'vue'
import { useUserStore } from '@/stores/user'
import { useConversationStore } from '@/stores/conversation'
import Avatar from '@/components/common/Avatar.vue'
import ConfirmHost from '@/components/common/ConfirmHost.vue'
import ToastHost from '@/components/common/ToastHost.vue'
import ProfilePopover from '@/views/profile/ProfilePopover.vue'
import SettingsModal from '@/views/profile/SettingsModal.vue'
import { showSettings } from '@/composables/settingsModal'
import { requestClose } from '@/composables/closeConfirm'
import { desktop } from '@/api/desktop'
import { APP_NAME, APP_VERSION } from '@/constants/app'
import { t } from '@/i18n'
import appIcon from '@/assets/app-icon.png'

const userStore = useUserStore()
const conversationStore = useConversationStore()
const showProfile = ref(false)
// macOS 桌面壳：标题栏已隐藏，原生红绿灯悬浮在侧边栏左上角，侧边栏顶部需让出一条拖拽区
const isMacDesktop = desktop?.platform === 'darwin'
// Windows 下原生标题栏被隐藏（main.js titleBarStyle: 'hidden'），由这里自绘弱化标题条
const isWindows = navigator.userAgent.includes('Windows')
</script>

<template>
  <div class="main-layout" :class="{ 'win-titlebar': isWindows }">
    <div v-if="isWindows" class="titlebar">
      <img class="titlebar-icon" :src="appIcon" alt="智群 AgentTeam" />
      <span class="titlebar-text">{{ APP_NAME }} v{{ APP_VERSION }}</span>
    </div>

    <aside class="sidebar">
      <!-- macOS 无标题栏：自绘红绿灯（整组 52px 居中于侧边栏，不越界），按钮间空白为窗口拖拽区 -->
      <div v-if="isMacDesktop" class="titlebar-lights">
        <button class="light close" :title="t('common.close')" @click="requestClose()">
          <svg viewBox="0 0 12 12" class="glyph"><path d="M3.3 3.3l5.4 5.4M8.7 3.3L3.3 8.7" /></svg>
        </button>
        <button class="light minimize" :title="t('common.minimize')" @click="desktop?.windowMinimize()">
          <svg viewBox="0 0 12 12" class="glyph"><path d="M2.8 6h6.4" /></svg>
        </button>
        <button class="light zoom" :title="t('common.zoom')" @click="desktop?.windowToggleMaximize()">
          <svg viewBox="0 0 12 12" class="glyph"><path d="M3.5 8.5V6.1M3.5 8.5h2.4M8.5 3.5v2.4M8.5 3.5H6.1" /></svg>
        </button>
      </div>
      <button class="avatar-link" :title="t('nav.me')" @click="showProfile = true">
        <Avatar :name="userStore.user?.name ?? t('profile.me')" :avatar="userStore.user?.avatar" :size="36" />
      </button>

      <nav class="nav">
        <router-link to="/chat" class="nav-item" active-class="active" :title="t('nav.messages')">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M12 3C6.48 3 2 6.94 2 11.75c0 2.66 1.4 5.04 3.62 6.65-.12.83-.5 2.1-1.12 3.1 0 0 2.3-.2 4.12-1.4.74.16 1.52.25 2.33.25h.05c5.52 0 10-3.94 10-8.75S17.52 3 12 3z"
            />
          </svg>
          <span v-if="conversationStore.totalUnread > 0" class="nav-badge">
            {{ conversationStore.totalUnread > 99 ? '99+' : conversationStore.totalUnread }}
          </span>
        </router-link>
        <router-link to="/contact" class="nav-item" active-class="active" :title="t('nav.contacts')">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"
            />
          </svg>
        </router-link>
        <router-link to="/models" class="nav-item" active-class="active" :title="t('nav.models')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="5" y="5" width="14" height="14" rx="2" />
            <rect x="10" y="10" width="4" height="4" />
            <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" />
          </svg>
        </router-link>
        <router-link to="/history" class="nav-item" active-class="active" :title="t('nav.history')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 12a9 9 0 1 0 3-6.7L3.5 7.5" />
            <path d="M3 3v5h5" />
            <path d="M12 7v5l3.5 2" />
          </svg>
        </router-link>
      </nav>

      <div class="sidebar-bottom">
        <button class="nav-item" :title="t('nav.settings')" @click="showSettings = true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path
              d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
            />
          </svg>
        </button>
      </div>
    </aside>

    <main class="module">
      <router-view />
    </main>

    <ConfirmHost />
    <ToastHost />
    <ProfilePopover v-if="showProfile" @close="showProfile = false" />
    <SettingsModal v-if="showSettings" @close="showSettings = false" />
  </div>
</template>

<style scoped lang="scss">
.main-layout {
  display: flex;
  height: 100%;
  width: 100%;

  &.win-titlebar {
    padding-top: 32px;
  }
}

// 自绘标题条：整条可拖拽移动窗口，双击最大化；右侧系统绘制的窗口控制按钮（titleBarOverlay）浮在其上
.titlebar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 32px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding-left: 10px;
  background: $bg-sidebar;
  -webkit-app-region: drag;
  z-index: 50;

  .titlebar-icon {
    width: 16px;
    height: 16px;
  }

  .titlebar-text {
    font-size: $font-size-sm;
    color: var(--c-titlebar-text);
    user-select: none;
  }
}

.sidebar {
  width: $sidebar-width;
  background: $bg-sidebar;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: $spacing-lg 0 $spacing-md;
  flex-shrink: 0;

  .titlebar-lights {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    width: 100%;
    /* 整组 46px（12px 圆点 × 3 + 5px 间距 × 2）居中于 60px 侧边栏，两侧各留 7px；
       负 margin 抵消侧边栏部分顶部内边距，圆心落在距顶 18px（原生红绿灯高度） */
    margin-top: -8px;
    padding: 4px 0 8px;
    margin-bottom: 6px;
    flex-shrink: 0;
    -webkit-app-region: drag;
  }

  .light {
    /* svg 是 inline 内容、按基线对齐会偏下，用 flex 精确居中 */
    display: flex;
    align-items: center;
    justify-content: center;
    width: 12px;
    height: 12px;
    padding: 0;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    -webkit-app-region: no-drag;

    .glyph {
      width: 100%;
      height: 100%;
      opacity: 0;
      transition: opacity $transition-fast;
      stroke: rgba(0, 0, 0, 0.55);
      stroke-width: 1.2;
      stroke-linecap: round;
      fill: none;
    }

    &:hover .glyph {
      opacity: 1;
    }

    &.close {
      background: #ff5f57;
    }

    &.minimize {
      background: #febc2e;
    }

    &.zoom {
      background: #28c840;
    }
  }

  .avatar-link {
    padding: 0;
    border: none;
    background: none;
    border-radius: $radius-sm;
    outline: 2px solid transparent;
    outline-offset: 1px;
    cursor: pointer;
    transition: outline-color $transition-fast;

    &:hover {
      outline-color: $primary-light;
    }
  }

  .nav {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: $spacing-lg;
    margin-top: $spacing-xxl;
  }
}

.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: $radius-md;
  color: #8a8a8a;
  cursor: pointer;
  transition: color $transition-fast, background $transition-fast;

  .nav-badge {
    position: absolute;
    top: -4px;
    right: -8px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 8px;
    background: #fa5151;
    color: $text-white;
    font-size: 10px;
    line-height: 16px;
    text-align: center;
  }

  svg {
    width: 24px;
    height: 24px;
  }

  &:hover {
    color: #c8c8c8;
  }

  &.active {
    color: $primary-color;
  }
}

.module {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>
