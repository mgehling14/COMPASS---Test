import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './services/darkModeRadio.css'
import './services/serviceReferralLayout.css'
import CompassEntry from './services/CompassEntry'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CompassEntry />
  </StrictMode>,
)
