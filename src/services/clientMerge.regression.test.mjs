import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const ids = {
  primary: '11111111-1111-1111-1111-111111111111', secondary: '22222222-2222-2222-2222-222222222222',
  sourceEnrollment: '33333333-3333-3333-3333-333333333333', targetEnrollment: '44444444-4444-4444-4444-444444444444',
  service: '55555555-5555-5555-5555-555555555555', excludedService: '66666666-6666-6666-6666-666666666666',
  voca: '77777777-7777-7777-7777-777777777777', direct: '88888888-8888-8888-8888-888888888888',
  targetService: '99999999-9999-9999-9999-999999999999', targetDirect: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
}

function loadApi() {
  const source = readFileSync(new URL('./clientMerge.ts', import.meta.url), 'utf8').replaceAll('import.meta.env', '({})')
  const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  vm.runInNewContext(javascript, {
    module, exports: module.exports, Headers, URL, URLSearchParams,
    window: { location: { hostname: 'powerapps.example' } },
    fetch: async () => { throw new Error('Unexpected fetch') },
    require(name) {
      if (name === '@microsoft/power-apps/data') return { getClient: () => ({ executeAsync: async () => { throw new Error('Unexpected connector call') } }) }
      if (name.includes('dataSourcesInfo')) return { dataSourcesInfo: {} }
      if (name === './auth') return { getAuthToken: () => 'test', ensureAuthToken: async () => 'test' }
      if (name === './archive') return { ARCHIVE_TABLES: [], excludeArchived: (value = '') => value, setRecordArchived: async () => ({ updated: 1 }) }
      if (name === './clientProfile') return { loadClientProfileDetailRecord: async () => { throw new Error('Unexpected inventory load') } }
      if (name === './dataverseRecordPages') return { readDataverseRecordPages: async () => [] }
      if (name === './programEnrollment') return { listProgramEnrollmentsForClientRecord: async () => [] }
      throw new Error(`Unexpected dependency: ${name}`)
    },
  }, { filename: 'clientMerge.ts' })
  return module.exports
}

const enrollment = (id, recordId) => ({ id, recordId, program: 'Autumn House', funder: 'VOCA', startDate: '2026-01-01', endDate: '' })
const record = (id, tableAlias, tableLabel, parentEnrollmentId = '', linkedClientId = '', both = false) => ({
  id, recordId: id.slice(0, 8), tableKey: tableAlias, tableLabel, tableAlias, primaryIdField: `${tableAlias}id`, summary: '', createdOn: '', modifiedOn: '',
  clientLookupField: linkedClientId || both ? '_cmps_cpid_value' : '', enrollmentLookupField: parentEnrollmentId ? '_cmps_programenrollment_value' : '', linkedClientId, parentEnrollmentId,
})
const primary = {
  profile: { id: ids.primary, recordId: 'CP-001', name: 'Primary', hmisId: '', dateOfBirth: '' },
  enrollments: [enrollment(ids.targetEnrollment, 'PE-PRIMARY')],
  records: [record(ids.targetService, 'cmps_serviceses', 'Services', ids.targetEnrollment), record(ids.targetDirect, 'cmps_healths', 'Health', '', ids.primary)],
}
const secondary = {
  profile: { id: ids.secondary, recordId: 'CP-002', name: 'Secondary', hmisId: '', dateOfBirth: '' },
  enrollments: [enrollment(ids.sourceEnrollment, 'PE-SECONDARY')],
  records: [
    record(ids.service, 'cmps_serviceses', 'Services', ids.sourceEnrollment),
    record(ids.excludedService, 'cmps_serviceses', 'Services', ids.sourceEnrollment),
    record(ids.voca, 'cmps_vocaforms', 'VOCA Form', ids.sourceEnrollment, ids.secondary, true),
    record(ids.direct, 'cmps_healths', 'Health', '', ids.secondary),
  ],
}

test('moving an enrollment relinks the parent first, archives excluded descendants, carries selected descendants, then archives the secondary client last', () => {
  const api = loadApi()
  const operations = api.buildClientMergeOperations({
    primaryClientId: ids.primary, secondaryClientId: ids.secondary,
    enrollmentDecisions: [{ sourceId: ids.sourceEnrollment, action: 'move' }],
    recordDecisions: [
      { sourceId: ids.service, tableAlias: 'cmps_serviceses', action: 'move' },
      { sourceId: ids.excludedService, tableAlias: 'cmps_serviceses', action: 'exclude' },
      { sourceId: ids.voca, tableAlias: 'cmps_vocaforms', action: 'move' },
      { sourceId: ids.direct, tableAlias: 'cmps_healths', action: 'merge', targetId: ids.targetDirect },
    ],
  }, primary, secondary)
  assert.deepEqual(Array.from(operations.map((item) => [item.kind, item.tableAlias, item.rowId, item.lookupField || ''])), [
    ['relink', 'cmps_programenrollment1s', ids.sourceEnrollment, 'cmps_clientid'],
    ['archive', 'cmps_serviceses', ids.excludedService, ''],
    ['relink', 'cmps_vocaforms', ids.voca, 'cmps_cpid'],
    ['archive', 'cmps_healths', ids.direct, ''],
    ['archive', 'cmps_clientprofiles', ids.secondary, ''],
  ])
  assert.equal(operations.at(-1).cascade, true)
})

test('merging an enrollment relinks selected children before archiving the duplicate enrollment and secondary profile', () => {
  const api = loadApi()
  const operations = api.buildClientMergeOperations({
    primaryClientId: ids.primary, secondaryClientId: ids.secondary,
    enrollmentDecisions: [{ sourceId: ids.sourceEnrollment, action: 'merge', targetId: ids.targetEnrollment }],
    recordDecisions: [{ sourceId: ids.service, tableAlias: 'cmps_serviceses', action: 'move' }],
  }, primary, secondary)
  assert.deepEqual(Array.from(operations.map((item) => [item.kind, item.rowId, item.lookupField || '', item.targetId || ''])), [
    ['relink', ids.service, 'cmps_programenrollment', ids.targetEnrollment],
    ['archive', ids.sourceEnrollment, '', ''],
    ['archive', ids.secondary, '', ''],
  ])
})

test('a child cannot be carried while its source enrollment is excluded', () => {
  const api = loadApi()
  assert.throws(() => api.buildClientMergeOperations({
    primaryClientId: ids.primary, secondaryClientId: ids.secondary,
    enrollmentDecisions: [{ sourceId: ids.sourceEnrollment, action: 'exclude' }],
    recordDecisions: [{ sourceId: ids.service, tableAlias: 'cmps_serviceses', action: 'move' }],
  }, primary, secondary), /Select the parent Program Enrollment/)
})

test('execution fails closed without explicit IT Admin authorization', async () => {
  const api = loadApi()
  await assert.rejects(api.executeClientMergePlan({ primaryClientId: ids.primary, secondaryClientId: ids.secondary, enrollmentDecisions: [], recordDecisions: [] }, { canManage: false }), /IT Admin access is required/)
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  assert.match(app, /const canMergeClientProfiles = useMemo\(\(\) => !isUserPreview/)
  assert.match(app, /normalize\(user\.rawRole \|\| ''\) === 'it admin'/)
  assert.match(app, /canMergeClientProfiles && adminPage === 'client-merge'/)
})
