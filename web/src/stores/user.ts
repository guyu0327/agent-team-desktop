import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { User } from '@/types'
import { getUser, updateUser } from '@/api/user'

export const useUserStore = defineStore('user', () => {
  const user = ref<User | null>(null)

  async function loadUser() {
    user.value = await getUser()
  }

  async function updateProfile(name: string, signature: string) {
    user.value = await updateUser(name, signature)
  }

  return { user, loadUser, updateProfile }
})
