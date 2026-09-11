import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ModelPreset, ModelPresetDraft } from '@/types'
import {
  createModelPreset,
  deleteModelPreset,
  listModelPresets,
  updateModelPreset,
} from '@/api/modelPreset'

export const useModelPresetStore = defineStore('modelPreset', () => {
  const presets = ref<ModelPreset[]>([])

  async function loadPresets() {
    presets.value = await listModelPresets()
  }

  function findById(id: string): ModelPreset | undefined {
    return presets.value.find((p) => p.id === id)
  }

  async function addPreset(draft: ModelPresetDraft): Promise<ModelPreset> {
    const preset = await createModelPreset(draft)
    presets.value.push(preset)
    return preset
  }

  async function updatePresetById(id: string, draft: ModelPresetDraft): Promise<ModelPreset> {
    const preset = await updateModelPreset(id, draft)
    const idx = presets.value.findIndex((p) => p.id === id)
    if (idx !== -1) presets.value[idx] = preset
    return preset
  }

  async function removePreset(id: string) {
    await deleteModelPreset(id)
    presets.value = presets.value.filter((p) => p.id !== id)
  }

  return { presets, findById, loadPresets, addPreset, updatePresetById, removePreset }
})
