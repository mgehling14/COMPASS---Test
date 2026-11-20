import { Suspense, lazy, useEffect, useState } from 'react'
import { IS_WAVE2_SANDBOX, isWave2PreviewLocation } from './wave2Boundary'
import { WAVE2_LOCATION_EVENT } from './wave2Navigation'

const Wave2Preview = lazy(() => import('./Wave2Preview'))
const StandardWorkspace = lazy(async () => {
  const [{ default: App }, { default: PowerProvider }] = await Promise.all([import('../App'), import('../PowerProvider')])
  return { default: function StandardWorkspace() { return <PowerProvider><App /></PowerProvider> } }
})

export default function CompassEntry() {
  const [previewRequested, setPreviewRequested] = useState(isWave2PreviewLocation)
  useEffect(() => {
    let disposed = false
    // Let the preview's dirty-draft guard handle back/hash navigation first.
    const syncLocation = () => queueMicrotask(() => {
      if (!disposed) setPreviewRequested(isWave2PreviewLocation())
    })
    window.addEventListener('hashchange', syncLocation)
    window.addEventListener('popstate', syncLocation)
    window.addEventListener(WAVE2_LOCATION_EVENT, syncLocation)
    syncLocation()
    return () => {
      disposed = true
      window.removeEventListener('hashchange', syncLocation)
      window.removeEventListener('popstate', syncLocation)
      window.removeEventListener(WAVE2_LOCATION_EVENT, syncLocation)
    }
  }, [])
  return <Suspense fallback={<main className="compass-app"><p role="status">Opening COMPASS…</p></main>}>
    {previewRequested ? IS_WAVE2_SANDBOX ? <Wave2Preview /> : <main className="compass-app"><h1>Preview unavailable</h1><p>This preview is limited to CMS Sandbox.</p></main> : <StandardWorkspace />}
  </Suspense>
}
