import type { ModelPreset, ModelPresetDraft } from '@/types'
import { request } from './http'

export function listModelPresets(): Promise<ModelPreset[]> {
  return request('/model-presets')
}

export function createModelPreset(draft: ModelPresetDraft): Promise<ModelPreset> {
  return request('/model-presets', { method: 'POST', body: draft })
}

export function updateModelPreset(id: string, draft: ModelPresetDraft): Promise<ModelPreset> {
  return request(`/model-presets/${id}`, { method: 'PUT', body: draft })
}

export function deleteModelPreset(id: string): Promise<void> {
  return request(`/model-presets/${id}`, { method: 'DELETE' })
}
