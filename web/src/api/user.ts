import type { User } from '@/types'
import { request } from './http'

export function getUser(): Promise<User> {
  return request('/user')
}

export function updateUser(name: string, signature: string): Promise<User> {
  return request('/user', { method: 'PUT', body: { name, signature } })
}
