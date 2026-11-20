import { useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { WAVE2_PROGRAMS, type PreviewMode, type Wave2Program } from './wave2PreviewModel'
import { PROFILE_FIELDS, UNCONFIRMED_WORKFORCE_FIELDS, blankProfile, exampleProfile, multiRacial, profileList, profileSessionDirty, profileSourceLabel, profileText, requiredProfileField, validateProfile, visibleProfileFields, type ProfileField, type ProfileSession } from './wave2ProfileModel'
import { PROFILE_SOURCES } from './wave2ProfileSources'

type Props = {
  program: Wave2Program; mode: PreviewMode; editable: boolean; session: ProfileSession
  setSession: Dispatch<SetStateAction<ProfileSession>>; allowedPrograms: Wave2Program[]
  onProgramChange: (program: Wave2Program) => void; onCancel: () => void
  requestTransition: (label: string, run: () => void) => void
}

export default function Wave2ClientProfile({ program, mode, editable, session, setSession, allowedPrograms, onProgramChange, onCancel, requestTransition }: Props) {
  const [validated, setValidated] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const summary = useRef<HTMLDivElement>(null)
  const form = useRef<HTMLFormElement>(null)
  const values = session.values[session.selectedId]
  const fields = visibleProfileFields(program, values)
  const sections = [...new Set(fields.map(f => f.section))]
  const label = WAVE2_PROGRAMS.find(p => p.id === program)!.label
  const dirty = profileSessionDirty(session)
  const reviewSources = PROFILE_SOURCES.filter(s => !PROFILE_FIELDS.some(f => f.source === s.id) && (s.programs.length === 0 || s.programs.some(p => ({ CAP: 'cap', ATO: 'ato', Workforce: 'workforce', GED: 'ged', 'Financial Wellness': 'financial-wellness' })[p] === program)))

  function update(key: string, value: string | string[]) {
    if (!editable) return
    setSession(previous => ({ ...previous, values: { ...previous.values, [previous.selectedId]: { ...previous.values[previous.selectedId], [key]: value } } }))
    setValidated(false); setErrors({})
  }
  function validate() {
    if (!editable) return
    const next = validateProfile(values, program)
    setErrors(next); setValidated(true)
    window.setTimeout(() => {
      form.current?.querySelectorAll<HTMLDetailsElement>('details').forEach(details => {
        if ([...details.querySelectorAll<HTMLElement>('[data-profile-key]')].some(el => !!next[el.dataset.profileKey!])) details.open = true
      })
      summary.current?.focus()
    }, 0)
  }
  function replaceCurrent(blank: boolean) {
    requestTransition(blank ? 'reset this person’s draft' : 'load a filled example for this person', () => {
      const next = blank ? blankProfile() : exampleProfile(session.selectedId)
      setSession(previous => ({ ...previous, values: { ...previous.values, [previous.selectedId]: next }, ...(blank ? { baseline: { ...previous.baseline, [previous.selectedId]: next } } : {}) }))
      setValidated(false); setErrors({})
    })
  }
  function focusField(key: string) {
    const element = document.getElementById(`profile-${key}`)
    const details = element?.closest('details')
    if (details) details.open = true
    element?.focus()
  }
  function renderField(field: ProfileField) {
    const id = `profile-${field.key}`, error = errors[field.key]
    const required = requiredProfileField(field, program, values)
    const describedBy = [field.note ? id + '-note' : '', error ? id + '-error' : ''].filter(Boolean).join(' ') || undefined
    const common = { id, disabled: !editable || field.disabled, required, 'aria-invalid': !!error, 'aria-describedby': describedBy, 'data-source-id': profileSourceLabel(field.source) }
    const title = <>{field.label}{required ? <span aria-hidden="true"> *</span> : <small className="w2-optional"> (optional)</small>}{field.provisional ? <span className="w2-provisional">Provisional</span> : null}</>
    const notes = <>{field.note ? <small id={id + '-note'}>{field.note}</small> : null}{error ? <span className="w2-field-error" id={id + '-error'}>{error}</span> : null}</>
    if (field.input === 'checks') return <fieldset className="w2-profile-checks" data-profile-key={field.key} key={field.key} disabled={!editable || field.disabled} aria-describedby={describedBy} aria-invalid={!!error}>
      <legend id={id + '-label'}>{title}</legend><div className="w2-check-options">{field.options?.map((option, index) => <label key={option}><input id={index === 0 ? id : `${id}-${index}`} type="checkbox" data-source-id={profileSourceLabel(field.source)} checked={profileList(values, field.key).includes(option)} onChange={e => update(field.key, e.target.checked ? [...profileList(values, field.key), option] : profileList(values, field.key).filter(v => v !== option))} />{option}</label>)}</div>{notes}
    </fieldset>
    return <div className="hub-form-field" data-profile-key={field.key} key={field.key}>
      <label htmlFor={id}>{title}</label>
      {field.input === 'select' ? <select {...common} value={profileText(values, field.key)} onChange={e => update(field.key, e.target.value)}><option value="">Choose an answer</option>{field.options?.map(option => <option key={option}>{option}</option>)}</select>
        : field.input === 'textarea' ? <textarea {...common} rows={3} maxLength={1000} value={profileText(values, field.key)} onChange={e => update(field.key, e.target.value)} />
          : <input {...common} type={field.input} autoComplete="off" maxLength={field.input === 'date' ? undefined : 1000} value={profileText(values, field.key)} onChange={e => update(field.key, e.target.value)} />}
      {field.key === 'atoReporting' && profileText(values, field.key) ? <small className="w2-reported-answer">Selected answer: {profileText(values, field.key)}</small> : null}{notes}
    </div>
  }

  return <section className="panel w2-editor w2-profile" aria-label="Client Profile preview">
    <div className="w2-page-head"><p className="eyebrow">{label} · Prompts 03–05</p><h1>Client Profile</h1><span className="w2-badge">{mode === 'view' ? 'Read-only example' : 'In-memory draft'}</span><p>One person, one shared profile. Switching program context keeps that person’s answers and applies the current program’s visible fields and validation.</p><p className="w2-scope-note">Frontend preview for review. Provisional fields and choices need owner confirmation. No profile is saved, no files are uploaded, and no eligibility decisions are calculated.</p></div>
    <div className="hub-form-grid w2-fields w2-profile-context">
      <label className="hub-form-field" htmlFor="profile-person"><span>Synthetic person</span><select id="profile-person" value={session.selectedId} onChange={e => { setSession(previous => ({ ...previous, selectedId: e.target.value })); setValidated(false); setErrors({}) }}><option value="new-profile">New synthetic person · DEMO-NEW</option><option value="sample-alex">Alex Sample · DEMO-001</option><option value="sample-jordan">Jordan Example · DEMO-002</option></select><small>Separate people keep separate drafts; program contexts share the same person.</small></label>
      <label className="hub-form-field" htmlFor="profile-program"><span>Program context</span><select id="profile-program" value={program} onChange={e => onProgramChange(e.target.value as Wave2Program)}>{WAVE2_PROGRAMS.filter(p => allowedPrograms.includes(p.id)).map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select><small>Changing context keeps entered values, including fields hidden in this program.</small></label>
    </div>
    <div className="w2-editor-actions"><span role="status">{dirty ? 'Unsaved profile changes' : 'No profile changes'}</span><div className="actions"><button type="button" className="secondary" disabled={!editable} onClick={() => replaceCurrent(false)}>Load filled example</button><button type="button" className="secondary" disabled={!editable} onClick={() => replaceCurrent(true)}>Reset to blank</button><button type="button" className="secondary" onClick={onCancel}>Cancel</button><button type="button" className="primary" disabled={!editable} onClick={validate}>Validate profile</button></div></div>
    {validated ? <div ref={summary} tabIndex={-1} className={`w2-validation${Object.keys(errors).length ? ' w2-validation-error' : ''}`} role={Object.keys(errors).length ? 'alert' : 'status'}><strong>{Object.keys(errors).length ? 'Check the highlighted fields' : 'Profile draft is valid for this program context.'}</strong>{Object.keys(errors).length ? <ul>{Object.entries(errors).map(([key, error]) => <li key={key}><button className="w2-error-link" type="button" onClick={() => focusField(key)}>{PROFILE_FIELDS.find(f => f.key === key)?.label}: {error}</button></li>)}</ul> : null}<p>Nothing was saved. Provisional choices still require review.</p></div> : null}
    <form ref={form} noValidate onSubmit={e => { e.preventDefault(); validate() }}>
      {sections.map(section => <details className="w2-profile-section" key={section} open={['Identity', 'Contact', 'Address', 'Demographics', 'Education', 'Justice screening'].includes(section) || fields.some(f => f.section === section && requiredProfileField(f, program, values))}>
        <summary>{section}<small>{fields.filter(f => f.section === section).some(f => requiredProfileField(f, program, values)) ? 'Includes required fields' : 'Optional details'}</small></summary>
        <div className="hub-form-grid w2-fields">{fields.filter(f => f.section === section).map(renderField)}{section === 'Demographics' ? <p className="w2-derived">Multi-racial? <output data-source-id="107:5426">{multiRacial(values)}</output><small>Calculated from selected race choices; missing-response states are excluded.</small></p> : null}</div>
      </details>)}
      {program === 'ato' ? <section className="w2-profile-section"><h2>School documents</h2><p className="hint">Class schedule and school-document attachments remain metadata-only preview scope. Uploading, storage and download actions are deferred; no file picker is connected.</p></section> : null}
      {program === 'workforce' ? <section className="w2-profile-section"><h2>History and items awaiting confirmation</h2><dl><dt>IMC number (107:7612)</dt><dd>{session.selectedId === 'new-profile' ? 'Not collected on new profiles' : `DEMO-IMC-${session.selectedId === 'sample-alex' ? '001' : '002'} · synthetic legacy display only`}</dd><dt>Transportation, addiction and domestic-violence questions</dt><dd>New collection is disabled until scope and sensitive-data choices are confirmed. These are not required for validation.</dd></dl><p className="hint">Holland Code and the detailed Job Match assessment are deferred to prompt 27.</p></section> : null}
      <button type="submit" className="w2-hidden-submit" disabled={!editable} tabIndex={-1} aria-hidden="true">Validate</button>
    </form>
    <details className="w2-profile-section w2-provenance"><summary>Source references and open review items</summary><p className="hint">Source form 107. Field IDs identify discovery evidence, not table columns or aliases. Provisional annotations identify inferred widgets, adapted choices or missing approvals.</p><dl><dt>Source record ID (document_id)</dt><dd>{session.selectedId === 'new-profile' ? 'No record ID: unsaved preview' : 'DEMO reference only; no real record loaded'}</dd><dt>Source emergency-contact group headings</dt><dd>7652 Emergency Contact 1 · 7653 Emergency Contact 2 · 7654 Emergency Contact 3 (structure only)</dd></dl>
      <ul>{fields.map(field => <li key={field.key}><code>{profileSourceLabel(field.source)}</code> · {field.label}{field.provisional ? ' · provisional' : ''}</li>)}<li><code>107:5426</code> · Multi-racial? · derived</li></ul>
      <h3>Deferred / inactive / no program flags</h3><p className="hint">These source fields are accounted for without adding unapproved collection. V2 deactivated fields and fields with no program flag remain excluded. Detailed inactive history and unverified mappings are deferred.</p><ul>{reviewSources.map(source => <li key={source.id}><code>107:{source.id}</code> · {source.label} · {source.reviewStatus || 'No approved collection rule'}{UNCONFIRMED_WORKFORCE_FIELDS.includes(source.id) ? ' · sensitive scope / choices awaiting confirmation' : ''}</li>)}</ul>
    </details>
  </section>
}
