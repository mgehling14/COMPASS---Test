import { useEffect, type ReactNode } from 'react'
import { initializeAuthFromPower } from './services/auth'

interface PowerProviderProps {
  children: ReactNode
}

export default function PowerProvider({ children }: PowerProviderProps) {
  useEffect(() => {
    const initApp = async () => {
      const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      if (isLocalHost) {
        await initializeAuthFromPower()
        return
      }

      try {
        const beforeUser = window.localStorage.getItem('compass_auth_user')
        const syncedUser = await initializeAuthFromPower()
        const afterUser = window.localStorage.getItem('compass_auth_user')
        const syncMarker = 'compass_auth_sync_complete'

        if (syncedUser?.roleSource === 'power' && beforeUser !== afterUser && !window.sessionStorage.getItem(syncMarker)) {
          window.sessionStorage.setItem(syncMarker, '1')
          window.location.reload()
          return
        }
      } catch (error) {
        console.error('Error initializing Power context:', error)
      }
    }

    void initApp()
  }, [])

  return <>{children}</>
}