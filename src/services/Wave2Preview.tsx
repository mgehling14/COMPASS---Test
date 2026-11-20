import { useEffect, useRef, useState } from 'react'
import { IS_WAVE2_SANDBOX } from './wave2Boundary'
import { closeWave2Preview } from './wave2Navigation'
import Wave2ClientProfile from './Wave2ClientProfile'
import { createProfileSession, profileSessionDirty } from './wave2ProfileModel'
import { WAVE2_PROGRAMS, WAVE2_FORMS, PERMISSION_FIXTURES, SYNTHETIC_CLIENTS, SYNTHETIC_ENROLLMENTS, blankPreviewDraft, examplePreviewDraft, parsePreviewRoute, previewAccess, previewFixture, previewPath, permissionJson, validatePreviewDraft, type FixtureId, type PreviewDraft, type Wave2Program } from './wave2PreviewModel'
import './wave2Preview.css'

function initialFixture(): FixtureId {
  const value = new URLSearchParams(window.location.search).get('wave2Fixture')
  return value === null ? 'authorized' : PERMISSION_FIXTURES.find(f => f.id === value)?.id || 'denied'
}
function draftForPath(hash: string) {
  const route = parsePreviewRoute(hash)
  return route.program && route.form && route.mode !== 'new' ? examplePreviewDraft(route.program) : blankPreviewDraft()
}
export default function Wave2Preview() {
  const [hash, setHash] = useState(window.location.hash)
  const [fixtureId, setFixtureId] = useState<FixtureId>(initialFixture)
  const [draft, setDraft] = useState<PreviewDraft>(() => draftForPath(window.location.hash))
  const [baseline, setBaseline] = useState<PreviewDraft>(() => draftForPath(window.location.hash))
  const [errors, setErrors] = useState<Partial<Record<keyof PreviewDraft, string>>>({})
  const [validated, setValidated] = useState(false)
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState<{ label: string; run: () => void } | null>(null)
  const [profileSession, setProfileSession] = useState(() => createProfileSession(parsePreviewRoute(window.location.hash).mode))
  const dialog = useRef<HTMLElement>(null)
  const errorSummary = useRef<HTMLDivElement>(null)
  const acceptedHash = useRef(hash)
  const dirty = parsePreviewRoute(hash).form === 'client-profile' ? profileSessionDirty(profileSession) : JSON.stringify(draft) !== JSON.stringify(baseline)
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const route = parsePreviewRoute(hash)
  const fixture = previewFixture(fixtureId)
  const program = WAVE2_PROGRAMS.find(p => p.id === route.program)
  const target = WAVE2_FORMS.find(f => f.id === route.form)
  const access = program && target ? previewAccess(fixture.entries, fixture.assigned, program.id, target) : null
  const canOpen = !!access?.view && (route.mode === 'new' ? !!access.create : route.mode === 'edit' ? !!access.edit : true)
  const editable = canOpen && route.mode !== 'view'
  const forms = program ? WAVE2_FORMS.filter(f => f.programs.includes(program.id)) : []
  const hubAccess = (id: Wave2Program) => WAVE2_FORMS.some(f => { const a = previewAccess(fixture.entries, fixture.assigned, id, f); return a.view || a.search })
  const searchable = program && forms.some(f => previewAccess(fixture.entries, fixture.assigned, program.id, f).search)
  const visibleForms = forms.filter(f => program && previewAccess(fixture.entries, fixture.assigned, program.id, f).view)

  function replaceDraft(next: PreviewDraft) { setDraft(next); setErrors({}); setValidated(false) }
  function acceptPath(next: string, push = true, preserveProfile = false) {
    if (push) window.history.pushState(null, '', next)
    acceptedHash.current = next
    setHash(next)
    const initial = draftForPath(next)
    setBaseline(initial); replaceDraft(initial); setQuery('')
    if (!preserveProfile) setProfileSession(createProfileSession(parsePreviewRoute(next).mode))
    window.scrollTo(0, 0)
  }
  function request(label: string, action: () => void) {
    if (dirtyRef.current) setPending({ label, run: action })
    else action()
  }
  function navigate(next: string) { request('leave this preview', () => acceptPath(next)) }
  useEffect(() => {
    const onLocation = () => {
      const next = window.location.hash
      if (next === acceptedHash.current) return
      if (dirtyRef.current) {
        window.history.replaceState(null, '', acceptedHash.current)
        setPending({ label: 'leave this preview', run: () => acceptPath(next) })
      } else acceptPath(next, false)
    }
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirtyRef.current) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('hashchange', onLocation)
    window.addEventListener('popstate', onLocation)
    window.addEventListener('beforeunload', beforeUnload)
    // A hash may change while the lazy workspace is mounting, before listeners attach.
    onLocation()
    return () => { window.removeEventListener('hashchange', onLocation); window.removeEventListener('popstate', onLocation); window.removeEventListener('beforeunload', beforeUnload) }
  }, [])
  useEffect(() => {
    if (!pending) return
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus()
    return () => previous?.isConnected ? previous.focus() : undefined
  }, [pending])
  function changeFixture(next: FixtureId) {
    request('change the permission fixture', () => {
      setFixtureId(next)
      const initial = draftForPath(acceptedHash.current)
      setBaseline(initial); replaceDraft(initial)
      setProfileSession(createProfileSession(parsePreviewRoute(acceptedHash.current).mode))
    })
  }
  function update(key: keyof PreviewDraft, value: string) {
    if (!editable) return
    if ((key === 'clientId' || key === 'enrollmentId') && draft[key] !== value && (draft.notes || draft.reviewDate)) {
      request('change the synthetic client or enrollment', () => replaceDraft({ ...blankPreviewDraft(), clientId: key === 'clientId' ? value : draft.clientId, enrollmentId: key === 'enrollmentId' ? value : '' }))
      return
    }
    replaceDraft({ ...draft, [key]: value, ...(key === 'clientId' ? { enrollmentId: '' } : {}) })
  }
  function validate() {
    if (!editable || !program) return
    const next = validatePreviewDraft(draft, program.id)
    setErrors(next); setValidated(true)
    if (Object.keys(next).length) window.setTimeout(() => errorSummary.current?.focus(), 0)
  }
  function fieldError(key: keyof PreviewDraft) { return errors[key] ? <span className="w2-field-error" id={`w2-error-${key}`}>{errors[key]}</span> : null }
  const fieldProps = (key: keyof PreviewDraft) => ({ id: `w2-${key}`, 'aria-invalid': !!errors[key], 'aria-describedby': errors[key] ? `w2-error-${key}` : undefined, disabled: !editable })

  if (!IS_WAVE2_SANDBOX) return <main className="compass-app"><section className="panel"><h1>Preview unavailable</h1><p>This workspace is limited to the CMS Sandbox app.</p></section></main>
  return <>
    <div className="compass-app w2-workspace" inert={pending ? true : undefined}>
      <header className="top-nav w2-header">
        <div><img className="w2-logo" src={`${import.meta.env.BASE_URL}compass-logo.png`} alt="COMPASS" /><p className="eyebrow">CMS Sandbox · Wave 2</p></div>
        <div className="actions"><span className="w2-badge">Synthetic data only</span><button type="button" className="secondary" onClick={() => request('exit the workspace', closeWave2Preview)}>Back to COMPASS</button></div>
      </header>
      <aside className="w2-banner" aria-label="Preview status"><strong>Preview — changes are not saved</strong><span>Drafts stay in this tab. No uploads, financial posting or automated workflows.</span></aside>
      <section className="panel w2-fixture" aria-label="Temporary permission controls">
        <label className="hub-form-field" htmlFor="w2-fixture"><span>Temporary permission fixture</span><select id="w2-fixture" value={fixtureId} onChange={e => changeFixture(e.target.value as FixtureId)}>{PERMISSION_FIXTURES.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}</select></label>
        <div><strong>Permission scenarios, not assigned roles</strong><p className="hint">These fixtures exercise the existing JSON permission model locally. Real role names and user assignments await the owner. Your sign-in is unchanged.</p></div>
      </section>
      <div className="w2-layout">
        <aside className="panel w2-sidebar"><p className="eyebrow">Preview programs</p><nav aria-label="Wave 2 programs"><button type="button" className={`hub-nav-item${!program ? ' active' : ''}`} onClick={() => navigate(previewPath())}>Workspace overview</button>{WAVE2_PROGRAMS.filter(p => hubAccess(p.id)).map(p => <button type="button" key={p.id} className={`hub-nav-item${p.id === program?.id ? ' active' : ''}`} aria-current={p.id === program?.id ? 'page' : undefined} onClick={() => navigate(previewPath(p.id))}>{p.label}</button>)}</nav><p className="hint">Client Profile is available for field review (prompts 03-05). Other forms remain preview shells for later prompts.</p></aside>
        <main className="w2-main" id="w2-main">
          {route.invalid ? <section className="panel" role="alert"><h1>Preview route unavailable</h1><p>The program, form or action is not in the local preview catalog.</p><button type="button" className="secondary" onClick={() => navigate(previewPath())}>Return to overview</button></section>
            : !program ? <>
              <div className="w2-page-head"><p className="eyebrow">New program development</p><h1>Wave 2 preview workspace</h1><p className="subtitle">Review Client Profile across five program contexts and explore the remaining form shells.</p></div>
              {!WAVE2_PROGRAMS.some(p => hubAccess(p.id)) ? <section className="panel" role="alert"><h2>Access denied</h2><p>The denied fixture has no program or form grants. Menu navigation and direct form routes are blocked.</p></section> : <div className="w2-program-grid">{WAVE2_PROGRAMS.map(p => <section className="panel w2-program-card" key={p.id}><h2>{p.label}</h2><p>{p.description}</p><button type="button" className="secondary" disabled={!hubAccess(p.id)} onClick={() => navigate(previewPath(p.id))}>{hubAccess(p.id) ? `Open ${p.label}` : 'Program access unavailable'}</button></section>)}</div>}
            </> : !hubAccess(program.id) || target && !canOpen ? <section className="panel" role="alert"><h1>Access denied</h1><p>This fixture cannot {route.mode === 'new' ? 'create a draft' : route.mode === 'edit' ? 'edit an example' : 'view this preview'} in {program.label}. No form data has been opened.</p><button type="button" className="secondary" onClick={() => navigate(previewPath())}>Return to overview</button></section>
              : !target ? <>
                <div className="w2-page-head"><p className="eyebrow">Program hub</p><h1>{program.label}</h1><p className="subtitle">Choose a shell or open a synthetic enrollment. Nothing in this workspace creates a real record.</p></div>
                {searchable ? <section className="panel"><h2>Synthetic clients and enrollments</h2><label className="hub-form-field" htmlFor="w2-roster-search"><span>Search synthetic clients</span><input id="w2-roster-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Name or DEMO reference" /></label><div className="w2-roster">{SYNTHETIC_CLIENTS.filter(c => `${c.name} ${c.reference}`.toLowerCase().includes(query.trim().toLowerCase())).map(c => <div key={c.id}><span><strong>{c.name}</strong><small>{c.reference} · {c.id === 'sample-alex' ? 'Active example' : 'Closed example'}</small></span><button type="button" className="secondary" disabled={!previewAccess(fixture.entries, fixture.assigned, program.id, WAVE2_FORMS[0]).view} onClick={() => request('open this synthetic person', () => { acceptPath(previewPath(program.id, 'client-profile', 'view')); setProfileSession({ ...createProfileSession('view'), selectedId: c.id }) })}>View example</button></div>)}</div>{!SYNTHETIC_CLIENTS.some(c => `${c.name} ${c.reference}`.toLowerCase().includes(query.trim().toLowerCase())) ? <p role="status">No synthetic clients match.</p> : null}</section> : <p className="hint">This fixture has no search permission.</p>}
                <section className="panel"><h2>Forms and preview shells</h2><p className="hint">Client Profile includes detailed fields and validation. Other forms link to later prompts.</p><div className="w2-form-list">{visibleForms.map(f => { const a = previewAccess(fixture.entries, fixture.assigned, program.id, f); return <article key={f.id}><div><h3>{f.label}</h3><p className="hint">Prompt {f.task} · {f.kind === 'shared' ? 'Extend shared form' : f.kind === 'history' ? 'History only' : 'Proposed form'}{f.note ? ` · ${f.note}` : ''}</p></div><div className="actions"><button type="button" className="secondary" onClick={() => navigate(previewPath(program.id, f.id, 'view'))}>View example</button><button type="button" className="secondary" disabled={!a.create} onClick={() => navigate(previewPath(program.id, f.id, 'new'))}>Blank draft</button><button type="button" className="secondary" disabled={!a.edit} onClick={() => navigate(previewPath(program.id, f.id, 'edit'))}>Edit example</button></div></article> })}</div>{!visibleForms.length ? <p role="status">No forms can be opened with this fixture. Search permission does not grant view, create or edit.</p> : null}</section>
              </> : target.id === 'client-profile' ? <Wave2ClientProfile key={program.id + route.mode} program={program.id} mode={route.mode!} editable={editable} session={profileSession} setSession={setProfileSession} allowedPrograms={WAVE2_PROGRAMS.filter(p => { const a = previewAccess(fixture.entries, fixture.assigned, p.id, target); return a.view && (route.mode === 'new' ? a.create : route.mode === 'edit' ? a.edit : true) }).map(p => p.id)} onProgramChange={next => acceptPath(previewPath(next, 'client-profile', route.mode), true, true)} onCancel={() => navigate(previewPath(program.id))} requestTransition={request} /> : <section className="panel w2-editor" aria-label={`${target.label} preview`}>
                <div className="w2-page-head"><p className="eyebrow">{program.label} · Prompt {target.task}</p><h1>{target.label}</h1><span className="w2-badge">{route.mode === 'view' ? 'Read-only example' : 'In-memory draft'}</span><p className="hint">Workspace controls only. The actual {target.label} fields are built in prompt {target.task}; this shell is not field sign-off.</p>{target.note ? <p className="w2-scope-note">{target.note}</p> : null}</div>
                <div className="w2-editor-actions"><span role="status">{dirty ? 'Unsaved draft changes' : 'No draft changes'}</span><div className="actions"><button type="button" className="secondary" disabled={!editable} onClick={() => request('replace the draft with a filled example', () => replaceDraft(examplePreviewDraft(program.id)))}>Load filled example</button><button type="button" className="secondary" disabled={!editable} onClick={() => request('reset this draft', () => { const next = blankPreviewDraft(); setBaseline(next); replaceDraft(next) })}>Reset to blank</button><button type="button" className="secondary" onClick={() => navigate(previewPath(program.id))}>Cancel</button><button type="button" className="primary" disabled={!editable} onClick={validate}>Validate draft</button></div></div>
                {validated && Object.keys(errors).length ? <div className="w2-validation w2-validation-error" role="alert" tabIndex={-1} ref={errorSummary}><strong>Check the highlighted fields</strong><ul>{Object.entries(errors).map(([key, error]) => <li key={key}><a href={`#w2-${key}`} onClick={e => { e.preventDefault(); document.getElementById(`w2-${key}`)?.focus() }}>{error}</a></li>)}</ul><p>No data was saved.</p></div> : validated ? <p className="w2-validation" role="status">Workspace draft is valid. Nothing was saved; full form validation comes in prompt {target.task}.</p> : null}
                <form noValidate onSubmit={e => { e.preventDefault(); validate() }}>
                  <div className="hub-form-grid w2-fields">
                    <label className="hub-form-field" htmlFor="w2-clientId"><span>Synthetic client <span aria-hidden="true">*</span></span><select {...fieldProps('clientId')} required value={draft.clientId} onChange={e => update('clientId', e.target.value)}><option value="">Choose a client</option>{SYNTHETIC_CLIENTS.map(c => <option key={c.id} value={c.id}>{c.name} · {c.reference}</option>)}</select>{fieldError('clientId')}</label>
                    <label className="hub-form-field" htmlFor="w2-enrollmentId"><span>Synthetic enrollment <span aria-hidden="true">*</span></span><select {...fieldProps('enrollmentId')} required value={draft.enrollmentId} onChange={e => update('enrollmentId', e.target.value)}><option value="">Choose an enrollment</option>{SYNTHETIC_ENROLLMENTS.filter(e => e.program === program.id && e.clientId === draft.clientId).map(e => <option key={e.id} value={e.id}>{e.label}</option>)}</select>{fieldError('enrollmentId')}</label>
                    <label className="hub-form-field" htmlFor="w2-reviewDate"><span>Example review date <span aria-hidden="true">*</span></span><input {...fieldProps('reviewDate')} required type="date" value={draft.reviewDate} onChange={e => update('reviewDate', e.target.value)} />{fieldError('reviewDate')}</label>
                    <label className="hub-form-field w2-notes" htmlFor="w2-notes"><span>Example workspace notes (optional)</span><textarea {...fieldProps('notes')} value={draft.notes} onChange={e => update('notes', e.target.value)} rows={4} /><small>{draft.notes.length}/500 characters · Synthetic notes only</small>{fieldError('notes')}</label>
                  </div><button type="submit" className="w2-hidden-submit" disabled={!editable} tabIndex={-1} aria-hidden="true">Validate</button>
                </form>
                <p className="hint w2-source">Source: {target.source}. Local permission key: <code>{target.permissionKey}</code>. No table or alias is created by this key.</p>
              </section>}
          <details className="panel w2-catalog"><summary>Permission catalog and proposed JSON entries</summary><p className="hint">Same five marker positions as the existing role JSON: view, search, create, edit, ignoreProgramAssignment. These examples are local only. New keys are proposals, not role assignments or table aliases.</p><pre>{JSON.stringify(permissionJson(fixture.markers), null, 2)}</pre></details>
        </main>
      </div>
    </div>
    {pending ? <div className="w2-dialog-backdrop"><section className="panel w2-dialog" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="w2-discard-title" onKeyDown={e => {
      if (e.key === 'Escape') { e.preventDefault(); setPending(null) }
      if (e.key === 'Tab') { const buttons = Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>('button') || []); const first = buttons[0], last = buttons[buttons.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() } }
    }}><h2 id="w2-discard-title">Discard unsaved draft?</h2><p>You have unsaved changes. Discard them to {pending.label}? Nothing will be saved.</p><div className="actions"><button type="button" className="secondary" onClick={() => setPending(null)}>Keep editing</button><button type="button" className="primary" onClick={() => { const action = pending.run; dirtyRef.current = false; setPending(null); action() }}>Discard draft</button></div></section></div> : null}
  </>
}
