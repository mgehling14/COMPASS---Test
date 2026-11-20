import { IS_WAVE2_SANDBOX, isWave2PreviewLocation } from './wave2Boundary'

export const WAVE2_LOCATION_EVENT = 'compass:wave2-location-changed'
let returnHash = ''

function navigateWithinDocument(hash: string) {
  // The hosted entry URL can carry app-blob context. Never resolve a directory
  // URL or start a new document request when entering/leaving this workspace.
  const next = `${window.location.pathname}${window.location.search}${hash}`
  window.history.pushState(null, '', next)
  window.dispatchEvent(new Event(WAVE2_LOCATION_EVENT))
}

export function openWave2Preview() {
  if (!IS_WAVE2_SANDBOX || isWave2PreviewLocation()) return
  returnHash = window.location.hash
  navigateWithinDocument('#/wave2')
}

export function closeWave2Preview() {
  if (!IS_WAVE2_SANDBOX) return
  navigateWithinDocument(returnHash)
}
