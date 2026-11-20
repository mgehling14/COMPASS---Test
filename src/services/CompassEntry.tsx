import { Suspense, lazy } from 'react'
import { IS_WAVE2_SANDBOX, isWave2PreviewLocation } from './wave2Boundary'

const Wave2Preview = lazy(() => import('./Wave2Preview'))
const StandardWorkspace = lazy(async () => {
  const [{ default: App }, { default: PowerProvider }] = await Promise.all([import('../App'), import('../PowerProvider')])
  return { default: function StandardWorkspace() { return <PowerProvider><App /></PowerProvider> } }
})

export default function CompassEntry() {
  const previewRequested = isWave2PreviewLocation()
  return <Suspense fallback={<main className="compass-app"><p role="status">Opening COMPASS…</p></main>}>
    {previewRequested ? IS_WAVE2_SANDBOX ? <Wave2Preview /> : <main className="compass-app"><h1>Preview unavailable</h1><p>This preview is limited to CMS Sandbox.</p></main> : <StandardWorkspace />}
  </Suspense>
}
