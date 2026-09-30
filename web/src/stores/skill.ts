import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Skill, SkillDetail, SkillDraft } from '@/types'
import { createSkill, deleteSkill, getSkill, listSkills, setSkillScope, updateSkill } from '@/api/skill'

export const useSkillStore = defineStore('skill', () => {
  const skills = ref<Skill[]>([])

  async function loadSkills() {
    skills.value = await listSkills()
  }

  function findById(id: string): Skill | undefined {
    return skills.value.find((s) => s.skillId === id)
  }

  async function fetchDetail(id: string): Promise<SkillDetail> {
    return getSkill(id)
  }

  async function addSkill(draft: SkillDraft): Promise<SkillDetail> {
    const detail = await createSkill(draft)
    await loadSkills()
    return detail
  }

  async function updateSkillById(id: string, draft: Omit<SkillDraft, 'skillId'>): Promise<SkillDetail> {
    const detail = await updateSkill(id, draft)
    await loadSkills()
    return detail
  }

  async function removeSkill(id: string) {
    await deleteSkill(id)
    skills.value = skills.value.filter((s) => s.skillId !== id)
  }

  async function changeScope(id: string, global: boolean) {
    await setSkillScope(id, global)
    skills.value = skills.value.map((s) => (s.skillId === id ? { ...s, global } : s))
  }

  return { skills, findById, loadSkills, fetchDetail, addSkill, updateSkillById, removeSkill, changeScope }
})
