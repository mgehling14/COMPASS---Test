import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import PowerProvider from './PowerProvider'
import './services/darkModeRadio.css'
import './services/serviceReferralLayout.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PowerProvider>
      <App />
    </PowerProvider>
  </StrictMode>,
)
