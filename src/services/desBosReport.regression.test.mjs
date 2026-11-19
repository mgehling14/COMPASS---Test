import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import * as React from 'react'
import * as jsx from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'

function loader(dependencies = {}) {
  const cache = new Map()
  function load(name) {
    if (cache.has(name)) return cache.get(name)
    if (name in dependencies) return dependencies[name]
    const prefix = name === '../desDvReport' ? './desDvReport' : name.startsWith('../') ? name : './reporting/' + name
    let source
    try { source = readFileSync(new URL(prefix + '.ts', import.meta.url), 'utf8') } catch { source = readFileSync(new URL(prefix + '.tsx', import.meta.url), 'utf8') }
    const module = { exports: {} }; cache.set(name, module.exports)
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
      module, exports: module.exports, Date, Map, Set, Intl, AbortController, DOMException, setTimeout, clearTimeout,
      require(key) {
        if (key in dependencies) return dependencies[key]
        if (key === 'react') return React
        if (key === 'react/jsx-runtime') return jsx
        if (key.startsWith('./')) return load(key.slice(2))
        if (key === '../desDvReport') return load(key)
        throw new Error('Unexpected import ' + key)
      },
    }, { filename: name })
    cache.set(name, module.exports)
    return module.exports
  }
  return load
}

const load = loader({ './reportDataverse': { loadReportSnapshot() { throw new Error('not used by calculation tests') } } })
const plan = load('desBosPlan'), api = load('desBosReport'), View = load('DesBosReportView').default
const id = (number) => '33333333-3333-3333-3333-' + String(number).padStart(12, '0')
const plain = (value) => JSON.parse(JSON.stringify(value))

function fixture() {
  const snapshot = { tables: { Client_Profile: [], ProgramEnrollment: [], Services: [], ShelterScreening: [], documents: [], Links: [] }, unavailable: {}, displayIds: {}, warnings: [] }
  let next = 0
  function client(hmisId) { const value = id(++next); snapshot.tables.Client_Profile.push({ document_id: value, HMISID: hmisId }); snapshot.displayIds[value] = `CP-${next}`; return value }
  function enrollment(clientId, fields = {}) { const value = id(++next); snapshot.tables.ProgramEnrollment.push({ RecordID: value, Program: 'CAAFA Shelter', ...fields }); snapshot.tables.documents.push({ RecordId: value, ParentId: clientId }); snapshot.displayIds[value] = `PE-${next}`; return value }
  function service(enrollmentId, fields = {}) { const value = id(++next); snapshot.tables.Services.push({ RecordID: value, DateofService: '2026-08-15', ServiceCategory: 'Resource Navigation', Service: 'External Referral', Wheredidyourefer: 'Superstition Food Bank', ...fields }); snapshot.tables.Links.push({ LinkFromId: value, LinkToId: enrollmentId }); snapshot.displayIds[value] = `SV-${next}`; return value }
  function screening(clientId, fields = {}) { const value = id(++next); snapshot.tables.ShelterScreening.push({ RecordID: value, ScreenDate: '2026-09-15', ProgramScreening: 'CAAFA Shelter', PlacedInShelter: 'No', ShelterTurnawayReason: 'Caller Declined Shelter Space', ...fields }); snapshot.tables.documents.push({ RecordId: value, ParentId: clientId }); snapshot.displayIds[value] = `SS-${next}`; return value }
  const exhibitA = (month = '2026-09') => api.calculateDesBosExhibitA(snapshot, month, new AbortController().signal, () => {})
  const exhibitD = (month = '2026-08') => api.calculateDesBosExhibitD(snapshot, month, new AbortController().signal, () => {})
  return { snapshot, client, enrollment, service, screening, exhibitA, exhibitD }
}

test('DES BOS exposes Exhibit A and Exhibit D as two separate monthly test-app reports', () => {
  assert.deepEqual(Array.from(plan.DES_BOS_REPORTS, (report) => report.id), ['des-bos-exhibit-a', 'des-bos-exhibit-d'])
  assert.ok(plan.DES_BOS_REPORTS.every((report) => report.parameters.length === 1 && report.parameters[0].type === 'Month'))
  assert.deepEqual(Array.from(plan.DES_BOS_EXHIBIT_A_REQUIREMENTS.ShelterScreening), ['RecordID', 'ScreenDate', 'ProgramScreening', 'PlacedInShelter', 'ShelterTurnawayReason', 'ShelterTurnawayReasonOther'])
  assert.ok(plan.DES_BOS_EXHIBIT_D_REQUIREMENTS.Services.includes('ServiceOther'))
  assert.deepEqual(Array.from(plan.DES_BOS_EXHIBIT_D_REPORT.datasets[0].fields, (field) => field.name), ['TypeOfService', 'HMISNumber', 'NameOfAgency', 'DateReferred', 'CommentsFollowUp', 'Other'])
  assert.equal(plan.DES_BOS_EXHIBIT_A_REPORT.sourceFile, 'Exhibit A_SEP_2026.xlsx')
  assert.equal(plan.DES_BOS_EXHIBIT_D_REPORT.sourceFile, 'Exhibit D_ August 2026.xlsx')
})

test('Exhibit A counts one unable-to-serve household per eligible screening and groups workbook reasons', () => {
  const f = fixture(), client = f.client('12345')
  f.screening(client)
  f.screening(client, { ShelterTurnawayReason: 'Other', ShelterTurnawayReasonOther: 'Pet capacity' })
  f.screening(client, { ShelterTurnawayReason: '' })
  f.screening(client, { PlacedInShelter: 'Yes' })
  f.screening(client, { PlacedInShelter: '' })
  f.screening(client, { ProgramScreening: 'Faith House' })
  f.screening(client, { ScreenDate: '2026-10-01' })
  const result = f.exhibitA(), rows = result.datasets.DES_BOS_ExhibitA.rows
  assert.deepEqual(plain(rows), [
    { ReasonProgramWasUnableToServe: 'Caller Declined Shelter Space', HouseholdsAffected: 1 },
    { ReasonProgramWasUnableToServe: 'Other: Pet capacity', HouseholdsAffected: 1 },
    { ReasonProgramWasUnableToServe: 'Reason not recorded', HouseholdsAffected: 1 },
  ])
  assert.ok(result.warnings.some((warning) => /no clear placed-in-shelter outcome/.test(warning)))
  assert.ok(result.warnings.some((warning) => /incomplete turnaway reason/.test(warning)))
  assert.ok(result.warnings.some((warning) => /other programs were excluded/.test(warning)))
})

test('Exhibit A shows the workbook N/A zero row when no household was unable to serve', () => {
  const f = fixture(), client = f.client('12345')
  f.screening(client, { PlacedInShelter: 'Yes' })
  assert.deepEqual(plain(f.exhibitA().datasets.DES_BOS_ExhibitA.rows), [{ ReasonProgramWasUnableToServe: 'N/A', HouseholdsAffected: 0 }])
})

test('Exhibit D admits only referral/resource services and maps their workbook service types', () => {
  const cases = [
    ['Legal & Medical Advocacy', 'Legal Referrals', 'Legal Assistance'],
    ['Employment & Career Development', 'Employment Referrals', 'Employment'],
    ['Resource Navigation', 'Internal Referral', 'Internal Referral'],
    ['Resource Navigation', 'External Referral', 'External Referral'],
    ['Resource Navigation', 'General Resource Navigation', 'Resources'],
    ['Family Support', 'Child Education Referral', 'Education'],
    ['Family Support', 'McKinney Vento Referral/Coordination', 'Transportation Assistance'],
  ]
  for (const [category, service, expected] of cases) assert.equal(api.exhibitDServiceType(category, service, ''), expected)
  assert.equal(api.exhibitDServiceType('Resource Navigation', 'Other', 'Address Confidential Program'), 'Address Confidential Program')
  assert.equal(api.exhibitDServiceType('Basic Needs', 'Transportation Assistance', ''), '')
  assert.equal(api.exhibitDServiceType('Safety & Crisis Response', 'Emotional Safety Planning', ''), '')
  assert.equal(api.exhibitDServiceType('Other', 'Other', 'Housing referral'), 'Resources')
})

test('Exhibit D keeps every CAAFA Shelter referral/resource record without requiring HMIS, agency, or uniqueness', () => {
  const f = fixture(), eligible = f.client('126233'), missingHmis = f.client('')
  const caafa = f.enrollment(eligible), otherProgram = f.enrollment(eligible, { Program: 'Faith House' }), missing = f.enrollment(missingHmis)
  f.service(caafa)
  f.service(caafa)
  f.service(caafa, { ServiceCategory: 'Legal & Medical Advocacy', Service: 'Legal Referrals', Wheredidyourefer: 'Other', Wheredidyoureferother: 'CAAFA Outreach', DateofService: '2026-08-14' })
  f.service(caafa, { ServiceCategory: 'Family Support', Service: 'McKinney Vento Referral/Coordination', Wheredidyourefer: 'Other', Wheredidyoureferother: 'School District', DateofService: '2026-08-18' })
  f.service(caafa, { Service: 'Internal Referral', Wheredidyourefer: 'CAAFA Outreach', DateofService: '2026-08-19' })
  f.service(caafa, { Service: 'External Referral', Wheredidyourefer: '', Wheredidyoureferother: '', DateofService: '2026-08-20' })
  f.service(caafa, { ServiceCategory: 'Basic Needs', Service: 'Transportation Assistance', Wheredidyourefer: 'Other' })
  f.service(caafa, { ServiceCategory: 'Safety & Crisis Response', Service: 'Emotional Safety Planning', Wheredidyourefer: 'Other' })
  f.service(otherProgram)
  f.service(missing)
  f.service(caafa, { DateofService: '2026-09-01' })
  const result = f.exhibitD(), rows = result.datasets.DES_BOS_ExhibitD.rows
  assert.equal(rows.length, 7)
  assert.equal(rows.filter((row) => row.TypeOfService === 'External Referral' && row.HMISNumber === '126233' && row.NameOfAgency === 'Superstition Food Bank').length, 2)
  assert.ok(rows.some((row) => row.TypeOfService === 'Internal Referral' && row.NameOfAgency === 'CAAFA Outreach'))
  assert.ok(rows.some((row) => row.TypeOfService === 'Legal Assistance' && row.Other === 'CAAFA Outreach'))
  assert.ok(rows.some((row) => row.TypeOfService === 'Transportation Assistance' && row.Other === 'School District'))
  assert.ok(rows.some((row) => row.HMISNumber === '' && row.TypeOfService === 'External Referral'))
  assert.ok(rows.some((row) => row.NameOfAgency === '' && row.TypeOfService === 'External Referral'))
  assert.ok(rows.every((row) => !Object.hasOwn(row, 'SubmittedOnApricot')))
  assert.ok(result.warnings.some((warning) => /blank HMIS Number/.test(warning)))
  assert.ok(result.warnings.some((warning) => /other programs were excluded/.test(warning)))
  assert.ok(result.warnings.some((warning) => /not recorded as Resource Navigation/.test(warning)))
  assert.ok(result.warnings.some((warning) => /blank agency/.test(warning)))
  assert.ok(result.warnings.some((warning) => /Exact duplicate source records are retained/.test(warning)))
  assert.ok(result.warnings.every((warning) => !/Submitted on Apricot/.test(warning)))
})

test('invalid months and unavailable source tables fail visibly instead of producing zeros', () => {
  assert.equal(api.desBosMonth('2024-02').end, '2024-02-29')
  assert.throws(() => api.desBosMonth('2026-13'), /valid DES BOS report month/)
  const f = fixture(); f.snapshot.unavailable.ShelterScreening = 'Shelter Screening metadata denied.'
  assert.match(f.exhibitA().datasets.DES_BOS_ExhibitA.unavailable, /metadata denied/)
  f.snapshot.unavailable.Services = 'Services metadata denied.'
  assert.match(f.exhibitD().datasets.DES_BOS_ExhibitD.unavailable, /metadata denied/)
})

test('each report view matches its supplied exhibit heading and column layout', () => {
  const f = fixture(), client = f.client('126233'), enrollment = f.enrollment(client)
  f.screening(client)
  f.service(enrollment)
  const exhibitA = renderToStaticMarkup(React.createElement(View, { report: plan.DES_BOS_EXHIBIT_A_REPORT, result: f.exhibitA(), parameters: { ReportMonth: '2026-09' } }))
  const exhibitD = renderToStaticMarkup(React.createElement(View, { report: plan.DES_BOS_EXHIBIT_D_REPORT, result: f.exhibitD(), parameters: { ReportMonth: '2026-08' } }))
  assert.match(exhibitA, /Exhibit A/) ; assert.match(exhibitA, /Unable to Serve Summary/) ; assert.match(exhibitA, /September 2026/) ; assert.match(exhibitA, /# of Households Unable to Serve:/)
  assert.match(exhibitD, /Exhibit D/) ; assert.match(exhibitD, /Mainstream Service Referral Log/) ; assert.match(exhibitD, /Type of Service/) ; assert.doesNotMatch(exhibitD, /Submitted on Apricot/)
})

test('both reports are wired only into CMS Sandbox and use current exact Dataverse columns', () => {
  const panel = readFileSync(new URL('./reporting/LegacyReportsPanel.tsx', import.meta.url), 'utf8')
  const mappings = readFileSync(new URL('./reporting/reportMappings.ts', import.meta.url), 'utf8')
  const power = JSON.parse(readFileSync(new URL('../../power.config.json', import.meta.url), 'utf8'))
  assert.equal(power.appDisplayName, 'CMS Sandbox')
  assert.equal(power.appId, '77b2c86e-31b0-4dcf-a2e0-b4efd9d8ad26')
  assert.match(panel, /DES_BOS_REPORTS/)
  assert.match(panel, /runDesBosReport\(report, parameters/)
  assert.match(panel, /field\.type === 'Month' \? 'month'/)
  for (const field of ['cmps_hmisid', 'cmps_serviceother', 'cmps_wheredidyoureferother', 'cmps_shelterturnawayreasonother']) assert.match(mappings, new RegExp(field))
})
