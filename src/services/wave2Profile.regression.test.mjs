import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

function load(name, imports = {}) {
  const source = readFileSync(new URL(name, import.meta.url), 'utf8')
  const module = { exports: {} }
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  vm.runInNewContext(code, { module, exports: module.exports, structuredClone, require: id => { if (!(id in imports)) throw Error('Unexpected import: ' + id); return imports[id] } })
  return module.exports
}
const sources = load('wave2ProfileSources.ts')
const api = load('wave2ProfileModel.ts', { './wave2ProfileSources': sources })
const plain = value => JSON.parse(JSON.stringify(value))
const errors = (values, program) => plain(api.validateProfile(values, program, '2026-11-20'))
const visible = (values, program) => api.visibleProfileFields(program, values).map(f => f.key)

test('source inventory has 149 distinct field IDs; all collecting controls have a source', () => {
  assert.equal(sources.PROFILE_SOURCES.length, 149)
  assert.equal(new Set(sources.PROFILE_SOURCES.map(s => s.id)).size, 149)
  for (const id of ['8346', '8347']) assert.equal(sources.PROFILE_SOURCES.find(s => s.id === id).reviewStatus, 'Deactivated')
  assert.equal(new Set(api.PROFILE_FIELDS.map(f => f.key)).size, api.PROFILE_FIELDS.length)
  for (const field of api.PROFILE_FIELDS) assert.ok(field.source.includes(':') || sources.PROFILE_SOURCES.some(s => s.id === field.source), field.key)
  const unflagged = new Set(sources.PROFILE_SOURCES.filter(s => s.programs.length === 0).map(s => s.id))
  for (const field of api.PROFILE_FIELDS) assert.equal(unflagged.has(field.source), false, 'Unflagged collection: ' + field.source)
})
test('filled CAP, ATO, Workforce, GED and Financial Wellness examples validate without emergency or banking answers', () => {
  for (const program of api.ALL_PROFILE_PROGRAMS) assert.deepEqual(errors(api.exampleProfile(), program), {}, program)
})
test('ATO requires the four evidenced answers; GED residency, insurance, education and full address stay optional', () => {
  const ato = api.exampleProfile()
  for (const key of ['atoReporting', 'workingSchool', 'studentStatus', 'education']) delete ato[key]
  assert.deepEqual(Object.keys(errors(ato, 'ato')).sort(), ['atoReporting', 'education', 'studentStatus', 'workingSchool'])
  const ged = api.exampleProfile()
  for (const key of ['residency', 'insurance', 'education', 'addressLine1', 'addressLine2', 'addressState', 'addressCounty', 'countyDate']) delete ged[key]
  assert.deepEqual(errors(ged, 'ged'), {})
  assert.ok(errors({ ...ged, addressCity: '', addressZip: '' }, 'ged').addressCity)
  assert.ok(errors({ ...ged, addressCity: '', addressZip: '' }, 'ged').addressZip)
  const atoOptional = { ...api.exampleProfile(), residency: '', insurance: '', race: [], ethnicity: '', gender: '', lgbtq: '', disability: '', addressCity: '', addressZip: '' }
  assert.deepEqual(errors(atoOptional, 'ato'), {})
})
test('known, approximate, refused and uncollected SSN/DOB states stay distinct', () => {
  const base = api.exampleProfile()
  for (const ssnKnown of api.MISSING_RESPONSES) assert.deepEqual(errors({ ...base, ssnKnown, ssn: 'hidden invalid value' }, 'workforce'), {})
  assert.ok(errors({ ...base, ssnKnown: 'Full SSN', ssn: '1234' }, 'workforce').ssn)
  assert.equal(errors({ ...base, ssnKnown: 'Approximate or partial SSN reported', ssn: 'XXX-XX-1234' }, 'workforce').ssn, undefined)
  assert.equal(errors({ ...base, ssnKnown: 'Approximate or partial SSN reported', ssn: '' }, 'workforce').ssn, undefined)
  assert.ok(errors({ ...base, dobKnown: 'Full DOB', birthDate: '' }, 'ged').birthDate)
  assert.ok(errors({ ...base, dobKnown: 'Full DOB', birthDate: '2026-02-30' }, 'ged').birthDate)
  assert.ok(errors({ ...base, dobKnown: 'Full DOB', birthDate: '2027-01-01' }, 'ged').birthDate)
  assert.deepEqual(errors({ ...base, dobKnown: 'Approximate or partial DOB reported', birthYear: '1995' }, 'ged'), {})
  assert.ok(errors({ ...base, dobKnown: 'Approximate or partial DOB reported', birthYear: '1995', birthDate: '1994-03-04' }, 'ged').birthYear)
  assert.deepEqual(errors({ ...base, dobKnown: 'Client Refused', birthDate: '2026-02-30', birthYear: 'bad' }, 'ged'), {})
})
test('explicit name quality and mutually exclusive missing-response states do not fabricate answers', () => {
  const base = api.exampleProfile()
  assert.ok(errors({ ...base, firstName: '' }, 'cap').firstName)
  assert.deepEqual(errors({ ...base, firstName: '', lastName: '', nameQuality: 'Anonymous Profile' }, 'cap'), {})
  assert.deepEqual(errors({ ...base, firstName: '', lastName: '', nameQuality: 'Unknown/Not Reported' }, 'cap'), {})
  assert.ok(errors({ ...base, firstName: '', lastName: '', nameQuality: 'Partial, street name, or code name reported' }, 'cap').firstName)
  assert.ok(errors({ ...base, race: ['White', 'Client Refused'] }, 'ged').race)
  assert.equal(api.multiRacial({ race: ['Asian', 'White'] }), 'Yes')
  assert.equal(api.multiRacial({ race: ['Client Refused'] }), 'Not calculated')
})
test('Workforce required justice branches release when hidden and preserve their values', () => {
  const base = api.exampleProfile()
  assert.deepEqual(Object.keys(errors({ ...base, residency: '', education: '', felony: '', misdemeanor: '' }, 'workforce')).sort(), ['education', 'felony', 'misdemeanor', 'residency'])
  assert.ok(errors({ ...base, reentry: 'Yes' }, 'workforce').releaseDate)
  assert.ok(errors({ ...base, probation: 'Yes' }, 'workforce').lifetimeProbation)
  assert.ok(errors({ ...base, probation: 'Yes', lifetimeProbation: 'No' }, 'workforce').probationEnd)
  assert.ok(errors({ ...base, parole: 'Yes' }, 'workforce').paroleEnd)
  assert.deepEqual(errors({ ...base, probation: 'Yes', lifetimeProbation: 'Yes', probationEnd: 'bad' }, 'workforce'), {})
  const hidden = { ...base, reentry: 'No', releaseDate: 'bad', probation: 'No', lifetimeProbation: 'No', probationEnd: 'bad', probationPhone: 'x', parole: 'No', paroleEnd: 'bad' }
  const before = JSON.stringify(hidden)
  assert.deepEqual(errors(hidden, 'workforce'), {})
  assert.equal(JSON.stringify(hidden), before)
  assert.ok(!visible(hidden, 'workforce').includes('probationEnd'))
  assert.ok(visible({ ...hidden, probation: 'Yes' }, 'workforce').includes('probationEnd'))
  assert.deepEqual(errors({ ...base, felony: 'Yes', misdemeanor: 'Yes', convictions: '' }, 'workforce'), {})
})
test('program contexts keep one shared profile without validating hidden program values', () => {
  const session = api.createProfileSession('edit')
  session.values['sample-alex'].major = 'Synthetic astronomy'
  session.values['sample-alex'].schoolPhone = 'bad ATO-only phone'
  session.values['sample-alex'].probation = 'Yes'
  assert.ok(errors(session.values['sample-alex'], 'ato').schoolPhone)
  assert.equal(errors(session.values['sample-alex'], 'ged').schoolPhone, undefined)
  assert.equal(errors(session.values['sample-alex'], 'ged').lifetimeProbation, undefined)
  assert.equal(session.values['sample-alex'].major, 'Synthetic astronomy')
  assert.equal(session.values['sample-jordan'].major, undefined)
  assert.equal(api.profileSessionDirty(session), true)
  assert.equal(api.profileSessionDirty(api.createProfileSession('new')), false)
})
test('optional banking and contact values validate only in their applicable visible branch', () => {
  const base = api.exampleProfile()
  assert.ok(errors({ ...base, banked: 'Yes', accounts: ['None', 'Checking'] }, 'financial-wellness').accounts)
  assert.deepEqual(errors({ ...base, banked: 'No', accounts: ['None', 'Checking'] }, 'financial-wellness'), {})
  assert.deepEqual(errors({ ...base, banked: 'Yes', accounts: ['None', 'Checking'] }, 'ged'), {})
  assert.ok(errors({ ...base, email: 'not-an-email' }, 'cap').email)
  assert.ok(errors({ ...base, emergency1Phone: 'short' }, 'cap').emergency1Phone)
  assert.ok(errors({ ...base, addressZip: 'AZ85201' }, 'ged').addressZip)
  assert.ok(errors({ ...base, education: 'invented option' }, 'ged').education)
})
test('sensitive unconfirmed fields are excluded or disabled, IMC has no editable control', () => {
  assert.equal(api.PROFILE_FIELDS.some(f => f.source === '7612'), false)
  for (const source of api.UNCONFIRMED_WORKFORCE_FIELDS) assert.ok(!api.PROFILE_FIELDS.some(f => f.source === source && !f.disabled))
  const detail = api.PROFILE_FIELDS.find(f => f.source === '8344')
  assert.equal(detail.disabled, true)
  assert.equal(api.requiredProfileField(detail, 'workforce', { disability: 'Yes' }), false)
})
