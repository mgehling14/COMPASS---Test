import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const catalog = JSON.parse(readFileSync(new URL('./reporting/legacyReportCatalog.json', import.meta.url), 'utf8'))
const compiled = JSON.parse(readFileSync(new URL('./reporting/nativeReportQueries.json', import.meta.url), 'utf8'))

function load(name) {
  const module = { exports: {} }
  const source = readFileSync(new URL('./reporting/' + name + '.ts', import.meta.url), 'utf8')
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, {
    module, exports: module.exports, Date, Map, Set, WeakMap, Intl, AbortController, setTimeout,
    require(key) { if (key.startsWith('./')) return load(key.slice(2)); throw Error(key) },
  })
  return module.exports
}

const { NativeReportEvaluator } = load('nativeReportEvaluator')

function service(RecordID, ServiceCategory, Service, extra = {}) {
  return {
    RecordID,
    ProgramEnrollment: 'DVSTOP | PE-001',
    DateofService: '2026-08-15',
    InHours: 1,
    ServiceCategory,
    Service,
    Funder: 'OVW-Late Life',
    ServiceCost: 0,
    ...extra,
  }
}

test('OVW Section F uses current COMPASS service and subcategory selections', async () => {
  const tables = Object.fromEntries(Object.keys(catalog.tables).map((name) => [name, []]))
  tables.Client_Profile.push({ document_id: 'client-1', first_name: 'Example', last_name: 'Client' })
  tables.ProgramEnrollment.push({ RecordID: 'pe-1', Program: 'DVSTOP', ProgramType: 'Residential' })
  tables.documents.push({ ParentId: 'client-1', RecordId: 'pe-1' })

  tables.Services.push(
    service('criminal', 'Legal & Medical Advocacy', 'Criminal Justice Advocacy/Accompaniment'),
    service('housing', 'Housing & Stability', 'Housing Advocacy'),
    service('language', 'Basic Needs', 'Interpretation'),
    service('transportation', 'Basic Needs', 'Transportation Assistance'),
    service('civil', 'Legal & Medical Advocacy', 'Other', { CriminalCivilJusticeAssistance: 'Civil Legal Assistance with Family Law Issues' }),
    service('counseling', 'Emotional Wellness & Healing', 'General Support (all general, non-goal interactions)', { EmotionalSupportorSafetyServices: 'Support Groups (facilitated or peer)' }),
    service('crisis', 'Safety & Crisis Response', 'General Support (all general, non-goal interactions)', { EmotionalSupportorSafetyServices: 'Hotline/crisis line counseling' }),
    service('cultural', 'Emotional Wellness & Healing', 'General Support (all general, non-goal interactions)', { AdditionalServiceDetail: 'Culturally Specific Healing' }),
    service('economic', 'Financial Stability', 'Financial Literacy'),
    service('forensic', 'Legal & Medical Advocacy', 'Other', { PersonalAdvocacyAccompaniment: 'Victim Advocacy/Accompaniment to Medical Forensic Exam' }),
    service('medical', 'Legal & Medical Advocacy', 'Other', { PersonalAdvocacyAccompaniment: 'Emergency Medical Care' }),
    service('shelter', 'Housing & Stability', 'Hotel Voucher'),
    service('housing-subcategory', 'Resource Navigation', 'General Resource Navigation', { ShelterHousingServices: 'Relocation assistance' }),
    service('advocacy-default', 'Resource Navigation', 'General Resource Navigation'),
    service('other', 'Other', 'Other'),
  )
  tables.Services.forEach((row) => tables.Links.push({ LinkFromId: row.RecordID, LinkToId: 'pe-1' }))

  const evaluator = new NativeReportEvaluator(catalog, compiled.queries, tables, {}, '2026-11-12', new AbortController().signal)
  const result = await evaluator.query(compiled.queries['view:ovw_03_svcs'])
  const categories = Object.fromEntries(result.rows.map((row) => [row.svcs_RecordID, row.OVW_Services]))

  assert.deepEqual(categories, {
    criminal: 'C-Criminal Justice Advocacy/court accompaniment',
    housing: 'M-Other housing support',
    language: 'I-Language services',
    transportation: 'J-Transportation',
    civil: 'A-Civil legal advocacy/court accompaniment',
    counseling: 'B-Counseling/support group',
    crisis: 'D-Crisis intervention',
    cultural: 'E-Culturally specific services',
    economic: 'F-Information provided on economic matters',
    forensic: 'G-Forensic exam',
    medical: 'H-Hospital/clinic/other medical response',
    shelter: 'L-Emergency shelter (hotel/motel)',
    'housing-subcategory': 'M-Other housing support',
    'advocacy-default': 'K-Victim/survivor advocacy',
    other: 'N-Other',
  })
})

test('OVW report catalog keeps the complete Section F category set and the compiled hash is current', () => {
  const source = readFileSync(new URL('./reporting/legacyReportCatalog.json', import.meta.url), 'utf8')
  const labels = [...source.matchAll(/'([A-N]-[^']+)'/g)].map((match) => match[1])
  for (const prefix of 'ABCDEFGHIJKLMN') assert.ok(labels.some((label) => label.startsWith(prefix + '-')), prefix)
  assert.equal(compiled.sourceSha256, createHash('sha256').update(source).digest('hex'))
})
