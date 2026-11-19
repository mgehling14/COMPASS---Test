import { useEffect, useState } from 'react'
import { loadMessages, MESSAGE_TYPES, messageRefreshPreview, nextMessageBoundaryDelay, refreshBannerMessages, visibleHomeMessages, type MessageRecord } from './messages'
import { APP_VERSION } from './appVersion'
import './Messages.css'

export function HomeMessageSections({ messages, now = Date.now() }: { messages: MessageRecord[]; now?: number }) {
  const visible = visibleHomeMessages(messages, now)
  return <div className="home-message-sections">
    {MESSAGE_TYPES.map((type) => {
      const entries = visible.filter((message) => message.cmps_type === String(type.value))
      return <section className="panel home-message-section" key={type.value} aria-labelledby={`home-message-${type.value}`}>
        <p className="eyebrow">{type.value === 125570000 ? 'Latest updates' : 'Looking ahead'}</p>
        <h2 id={`home-message-${type.value}`}>{type.label}</h2>
        {entries.length ? <ul className="home-message-list">{entries.map((message) => <li key={message.id}><p>{message.cmps_message}</p></li>)}</ul>
          : <p className="hint">{type.value === 125570000 ? 'No new updates right now. Check back soon.' : 'More is on the horizon. Check back for upcoming updates.'}</p>}
      </section>
    })}
  </div>
}

// Owned by the workspace, so Home and the header share one snapshot and one poller.
export function useHomeMessages() {
  const [messages, setMessages] = useState<MessageRecord[]>([])
  const [now, setNow] = useState(Date.now)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let disposed = false, busy = false
    const controller = new AbortController()
    const refresh = async () => {
      if (disposed || busy) return
      busy = true
      try {
        const records = await loadMessages('home', Date.now(), controller.signal)
        if (!disposed) { setMessages(records); setNow(Date.now()); setError('') }
      } catch (failure) {
        if (!disposed) setError(String((failure as Error)?.message || failure))
      } finally { busy = false; if (!disposed) setLoading(false) }
    }
    const onVisible = () => { if (document.visibilityState === 'visible') { setNow(Date.now()); void refresh() } }
    void refresh()
    const interval = window.setInterval(() => { void refresh() }, 60000)
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    return () => { disposed = true; controller.abort(); window.clearInterval(interval); window.removeEventListener('focus', onVisible); document.removeEventListener('visibilitychange', onVisible) }
  }, [])
  useEffect(() => {
    const timer = window.setTimeout(() => setNow(Date.now()), nextMessageBoundaryDelay(messages, now))
    return () => window.clearTimeout(timer)
  }, [messages, now])
  return { messages, now, loading, error }
}

export function AppVersionBadge() {
  return <span className="app-version-badge" title="Version of COMPASS currently running in this tab"><span>App version</span><strong>{APP_VERSION}</strong></span>
}

export function MessageRefreshBanner({ messages, now = Date.now() }: { messages: MessageRecord[]; now?: number }) {
  const updates = refreshBannerMessages(messages, now)
  if (!updates.length) return null
  return <aside className="message-refresh-banner" aria-label="App refresh required">
    <svg className="message-refresh-icon" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.8 3h15.6a2 2 0 0 0 1.8-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4m0 4h.01" /></svg>
    <div className="message-refresh-copy" role="status" aria-live="polite" aria-atomic="true">
      <strong>Refresh required</strong>
      {updates[0].cmps_versionnumber?.trim() ? <p className="message-refresh-versions">Running: {APP_VERSION} <span aria-hidden="true">→</span> Available: {updates[0].cmps_versionnumber.trim()}</p> : null}
      <p>Save your work, then refresh the browser tab or close and reopen COMPASS to load the latest version.</p>
      <p className="message-refresh-preview">{messageRefreshPreview(updates[0].cmps_message)}{updates.length > 1 ? ' (+' + (updates.length - 1) + ' more)' : ''}</p>
    </div>
  </aside>
}

export default function HomeMessages({ state }: { state: ReturnType<typeof useHomeMessages> }) {
  const { messages, now, loading, error } = state
  return <div className="home-messages">
    <section className="panel spotlight home-message-welcome"><p className="eyebrow">COMPASS Home</p><h1>Welcome to COMPASS</h1><p className="hint">Your space for the latest updates and what’s coming next.</p></section>
    {loading ? <p className="hint" role="status">Loading updates...</p> : null}
    {error ? <p className="error" role="alert">Home updates could not be refreshed. Your other workspaces are still available. {error}</p> : null}
    <HomeMessageSections messages={messages} now={now} />
  </div>
}
