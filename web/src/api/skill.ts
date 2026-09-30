import type { Skill, SkillDetail, SkillDraft } from '@/types'
import { request } from './http'

export function listSkills(): Promise<Skill[]> {
  return request('/skills')
}

export function getSkill(id: string): Promise<SkillDetail> {
  return request(`/skills/${encodeURIComponent(id)}`)
}

export function createSkill(draft: SkillDraft): Promise<SkillDetail> {
  return request('/skills', { method: 'POST', body: draft })
}

export function updateSkill(id: string, draft: Omit<SkillDraft, 'skillId'>): Promise<SkillDetail> {
  return request(`/skills/${encodeURIComponent(id)}`, { method: 'PUT', body: draft })
}

/** 使用范围：设为/取消全局（所有智能体可用） */
export function setSkillScope(id: string, global: boolean): Promise<void> {
  return request(`/skills/${encodeURIComponent(id)}/scope`, { method: 'PUT', body: { global } })
}

export function deleteSkill(id: string): Promise<void> {
  return request(`/skills/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
