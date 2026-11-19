// Bump this value for each release before building/publishing. It is bundled
// with the app: messages must never replace the version actually running.
export const APP_VERSION = '1.4.0'

export function normalizeAppVersion(value: unknown): string {
  return String(value ?? '').trim().replace(/^v(?=\d)/i, '').toLowerCase()
}

export function appVersionsMatch(running: unknown, target: unknown): boolean {
  const current = normalizeAppVersion(running), available = normalizeAppVersion(target)
  return !!current && !!available && current === available
}
