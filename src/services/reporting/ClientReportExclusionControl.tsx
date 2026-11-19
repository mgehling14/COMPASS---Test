import { useEffect, useRef, useState } from 'react'
import { loadClientReportExclusion, saveClientReportExclusion, type ClientReportExclusion } from './clientReportExclusion'

export default function ClientReportExclusionControl({ profileId, canManage, savedBy }: { profileId: string; canManage: boolean; savedBy: string }) {
  const [profile, setProfile] = useState<ClientReportExclusion | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState('')
  const request = useRef<AbortController | null>(null), permission = useRef(canManage)
  permission.current = canManage
  async function run(excluded?: boolean, automatic = false) {
    if (!permission.current || (!automatic && busy)) return
    const controller = new AbortController(); request.current?.abort(); request.current = controller
    setBusy(true); setError(''); setStatus('')
    try {
      const access = { canManage: () => permission.current, savedBy }
      const value = excluded === undefined ? await loadClientReportExclusion(profileId, access, controller.signal) : await saveClientReportExclusion(profileId, excluded, access, controller.signal)
      if (request.current !== controller || controller.signal.aborted) return
      setProfile(value)
      if (excluded !== undefined) setStatus(`${value.recordId || 'Client Profile'} ${excluded ? 'and all linked records are excluded from reports' : 'is included in reports again (archived records remain excluded)'}. Rerun existing reports to refresh totals.`)
    } catch (failure) { if (request.current === controller && !controller.signal.aborted) setError(String((failure as Error)?.message || failure)) }
    finally { if (request.current === controller) { request.current = null; setBusy(false) } }
  }
  useEffect(() => {
    request.current?.abort(); setProfile(null); setError(''); setStatus(''); setBusy(false)
    if (canManage && profileId) void run(undefined, true)
    return () => request.current?.abort()
    // Permission/record changes must abort the old record's request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, canManage])
  if (!canManage) return null
  // Inline children of the existing profile action row. A nested .panel would
  // inherit grid-column: span 6 and create implicit columns in the profile grid.
  return <>
    <button type="button" className="secondary" disabled={busy || !profile} title="IT Admin only. Exclude this Client Profile and its directly linked or program-enrollment-linked records from reports without archiving or hiding them elsewhere in the app." onClick={() => void run(!profile!.excluded)}>{busy ? 'Working…' : profile?.excluded ? 'Include in reports (No)' : 'Exclude from reports (Yes)'}</button>
    <button type="button" className="secondary" disabled={busy} title="Refresh this Client Profile’s report-inclusion setting." onClick={() => void run()}>Refresh inclusion</button>
    {profile ? <span className="hint">Exclude from reports: {profile.excluded ? 'Yes' : 'No / not set'}</span> : null}
    {error ? <span className="error" role="alert">{error}</span> : null}{status ? <span className="hint" role="status">{status}</span> : null}
  </>
}
