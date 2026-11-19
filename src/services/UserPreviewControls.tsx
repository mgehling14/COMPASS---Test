import { useEffect, useRef, useState, type ReactNode } from 'react'
import { getCurrentUser } from './auth'
import { loadRolePermissionsForUser } from './rolePermissions'
import { hasItAdminPermission, loadPreviewUsers, loadUserPreviewSession, userIdentityKey, type PreviewDirectoryUser, type UserPreviewSession } from './userPreview'
import './UserPreview.css'

// Preview controls stay separate from the permission-loading service.
export function UserPreviewPicker({ onStart, busy = false }: { onStart: (key: string) => Promise<void>; busy?: boolean }) {
  const [users, setUsers] = useState<PreviewDirectoryUser[]>([])
  const [selectedKey, setSelectedKey] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    let disposed = false
    setLoading(true); setError('')
    void loadPreviewUsers().then((entries) => { if (!disposed) setUsers(entries) })
      .catch((failure) => { if (!disposed) { setUsers([]); setError(String(failure?.message || failure)) } })
      .finally(() => { if (!disposed) setLoading(false) })
    return () => { disposed = true }
  }, [refresh])
  const available = users.filter((user) => `${user.name} ${user.email}`.toLowerCase().includes(search.trim().toLowerCase()))
  return <section className="user-preview-picker" aria-label="View as User selection">
    <h3>View as User</h3>
    <p className="hint">Select a directory user to preview their COMPASS roles, program hubs, forms, search access, and My Work assignments. This preview cannot save or change records.</p>
    <p className="hint">This uses in-app permissions. Your sign-in and Dataverse connection remain unchanged; it does not impersonate the user's Dataverse security roles.</p>
    <div className="user-preview-selection">
      <label className="hub-form-field"><span>Find user</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or email" disabled={busy} /></label>
      <label className="hub-form-field"><span>User</span><select value={selectedKey} onChange={(event) => setSelectedKey(event.target.value)} disabled={loading || busy}>
        <option value="">Choose a user</option>
        {available.map((user) => <option key={userIdentityKey(user)} value={userIdentityKey(user)}>{user.name}{user.email ? ` (${user.email})` : ''}{user.active ? '' : ' — Inactive'}</option>)}
      </select></label>
    </div>
    {loading ? <p className="hint" role="status">Loading users from ithd_userses...</p> : null}
    {!loading && !users.length && !error ? <p className="hint">No directory users found.</p> : null}
    {!loading && users.length ? <p className="hint" role="status">{users.length.toLocaleString()} directory users loaded ({users.filter((user) => user.active).length.toLocaleString()} active).{search.trim() && !available.length ? ' No users match this search.' : ''}</p> : null}
    {error ? <p className="error" role="alert">{error}</p> : null}
    <div className="user-preview-actions">
      <button type="button" className="primary" disabled={loading || busy || !users.some((user) => userIdentityKey(user) === selectedKey)} onClick={() => {
        setError(''); void onStart(selectedKey).catch((failure) => setError(String(failure?.message || failure)))
      }}>{busy ? 'Loading permissions...' : 'View as selected user'}</button>
      <button type="button" className="secondary" disabled={loading || busy} onClick={() => setRefresh((value) => value + 1)}>Refresh users</button>
    </div>
  </section>
}

type PreviewWorkspace = { session: UserPreviewSession | null; initialAdminPage: boolean; onStart: (key: string) => Promise<void>; busy: boolean }

export function UserPreviewRoot({ children }: { children: (workspace: PreviewWorkspace) => ReactNode }) {
  const [session, setSession] = useState<UserPreviewSession | null>(null)
  const [epoch, setEpoch] = useState(0)
  const [initialAdminPage, setInitialAdminPage] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [error, setError] = useState('')
  const request = useRef(0)
  const sessionRef = useRef(session)
  const dialogRef = useRef<HTMLElement | null>(null)
  sessionRef.current = session
  function exitPreview(returnToAdmin = true) {
    request.current += 1
    setSession(null); setPickerOpen(false); setBusy(false); setError('')
    setInitialAdminPage(returnToAdmin); setEpoch((value) => value + 1)
  }
  useEffect(() => {
    let disposed = false
    const authChanged = () => exitPreview(false)
    const verifyOperator = async () => {
      const current = sessionRef.current
      if (!current) return
      try {
        const operator = getCurrentUser()
        const profiles = await loadRolePermissionsForUser(operator)
        if (!disposed && sessionRef.current === current && (userIdentityKey(operator) !== current.operatorKey || !hasItAdminPermission(operator, profiles))) exitPreview(false)
      } catch {
        if (!disposed && sessionRef.current === current) exitPreview(false)
      }
    }
    window.addEventListener('compass:authChanged', authChanged)
    window.addEventListener('focus', verifyOperator)
    const timer = window.setInterval(verifyOperator, 60000)
    return () => { disposed = true; request.current += 1; window.clearInterval(timer); window.removeEventListener('compass:authChanged', authChanged); window.removeEventListener('focus', verifyOperator) }
  }, [])
  useEffect(() => {
    if (!pickerOpen) return
    const previous = document.activeElement as HTMLElement | null
    dialogRef.current?.querySelector<HTMLElement>('input, select, button')?.focus()
    return () => { if (previous?.isConnected) previous.focus() }
  }, [pickerOpen])
  async function startPreview(key: string) {
    const attempt = ++request.current
    const operator = getCurrentUser()
    setBusy(true); setError('')
    try {
      const next = await loadUserPreviewSession(operator, key)
      if (attempt !== request.current) return
      if (userIdentityKey(getCurrentUser()) !== next.operatorKey) throw new Error('Your sign-in changed. Start the preview again.')
      setSession(next); setPickerOpen(false); setEpoch((value) => value + 1)
    } catch (failure) {
      // A failed refresh/switch must not leave stale permission grants active.
      if (attempt === request.current && sessionRef.current) {
        exitPreview(false)
        setError(String((failure as Error)?.message || failure))
      }
      throw failure
    } finally {
      if (attempt === request.current) setBusy(false)
    }
  }
  return <>
    {!session && error ? <p className="error user-preview-error" role="alert">{error}</p> : null}
    {session ? <aside className="user-preview-banner" aria-label="User permission preview" role="status">
      <div><strong>Viewing as {session.user.name}</strong><span>{session.user.email}</span><span>Roles: {session.profiles.map((profile) => profile.roleName).join(', ') || 'No assigned COMPASS roles'}</span>
        <small>Read-only preview · Your administrator sign-in is unchanged{session.user.active ? '' : ' · Directory user is inactive'}</small></div>
      <div className="user-preview-actions">
        <button type="button" className="secondary" disabled={busy} onClick={() => setPickerOpen(true)}>Change user</button>
        <button type="button" className="secondary" disabled={busy} onClick={() => { void startPreview(userIdentityKey(session.user)).catch((failure) => setError(String(failure?.message || failure))) }}>{busy ? 'Refreshing...' : 'Refresh permissions'}</button>
        <button type="button" className="primary" onClick={() => exitPreview()}>Exit View as User</button>
      </div>
      {error ? <p className="error" role="alert">{error}</p> : null}
    </aside> : null}
    {pickerOpen && session ? <div className="user-preview-dialog-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setPickerOpen(false) }}><section ref={dialogRef} className="panel user-preview-dialog" role="dialog" aria-modal="true" aria-label="Change preview user" onKeyDown={(event) => {
      if (event.key === 'Escape') { event.preventDefault(); setPickerOpen(false); return }
      if (event.key !== 'Tab') return
      const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('input:not(:disabled), select:not(:disabled), button:not(:disabled), [tabindex="0"]') || [])
      const first = controls[0], last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }}>
      <UserPreviewPicker onStart={startPreview} busy={busy} />
      <button type="button" className="secondary" onClick={() => setPickerOpen(false)}>Cancel</button>
    </section></div> : null}
    <div inert={pickerOpen || undefined} key={`${session ? userIdentityKey(session.user) : 'signed-in'}:${epoch}`}>
      {children({ session, initialAdminPage, onStart: startPreview, busy })}
    </div>
  </>
}
