import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const rowId = '11111111-1111-1111-1111-111111111111'
const labels = ['CAAFA - Crisis Response', 'CAAFA - Legal', 'CAAFA - DV', 'CAAFA - SV', 'CAAFA - Thrive']
const forms = [
  ['./services.ts', 'SERVICES_FIELD_DEFINITIONS', 'updateServicesResponse', 'loadServicesDetailRecord'],
  ['./bedEnrollment.ts', 'BED_ENROLLMENT_FIELD_DEFINITIONS', 'updateBedEnrollmentResponse', 'loadBedEnrollmentDetailRecord'],
  ['./programEnrollment.ts', 'PROGRAM_ENROLLMENT_FIELDS', 'updateProgramEnrollmentResponse', 'loadProgramEnrollmentDetailRecord'],
  ['./electronicDocument.ts', 'ELECTRONIC_DOCUMENT_FIELDS', 'updateElectronicDocumentResponse', 'loadElectronicDocumentDetailRecord'],
  ['./financialAssistance.ts', 'FINANCIAL_ASSISTANCE_FIELDS', 'updateFinancialAssistanceResponse', null],
  ['./goals.ts', 'GOAL_FIELDS', 'updateGoalResponse', 'loadGoalDetailRecord'],
]

function loadService(filename, state = { saved: {}, formatted: '' }) {
  const source = readFileSync(new URL(filename, import.meta.url), 'utf8').replaceAll('import.meta.env', '({})')
  const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const service = { exports: {} }
  vm.runInNewContext(javascript, {
    module: service,
    exports: service.exports,
    Headers,
    URL, URLSearchParams,
    window: { location: { hostname: 'localhost' } },
    fetch: async (url, init = {}) => {
      if (init.body) state.saved = JSON.parse(init.body)
      const row = {
        ...state.saved,
        cmps_servicesid: rowId,
        cmps_bedenrollmentid: rowId,
        cmps_programenrollment1id: rowId,
        cmps_electronicdocumentid: rowId,
        cmps_goalsid: rowId,
        ...(state.formatted ? { 'cmps_servicesite@OData.Community.Display.V1.FormattedValue': state.formatted } : {}),
      }
      return { ok: true, json: async () => url.includes('EntityDefinitions') ? { value: [] } : { ...row, value: [row] } }
    },
    require(name) {
      if (name === './serviceSiteLabels') return loadService('./serviceSiteLabels.ts', state).api
      if (name === './dataverseRecordPages' || name === './dataverseContinuation') return loadService(`${name}.ts`, state).api
      if (name === '../../power.config.json') return JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'))
      if (name === '@microsoft/power-apps/data') return { getClient: () => ({ executeAsync: async () => { throw new Error('Unexpected runtime call') } }) }
      if (name.includes('dataSourcesInfo')) return { dataSourcesInfo: {} }
      if (name === './auth') return { getAuthToken: () => 'test-token', ensureAuthToken: async () => 'test-token' }
      if (name === './archive') return { excludeArchived: (filter = '') => filter || 'cmps_isarchived ne 125570000' }
      throw new Error(`Unexpected dependency: ${name}`)
    },
  }, { filename })
  return { api: service.exports, state }
}

test('service-site formatter normalizes only the five requested CAAFA labels', () => {
  const { api } = loadService('./serviceSiteLabels.ts')
  for (const label of labels) {
    assert.equal(api.formatServiceSiteLabel(label.replace(' - ', '-')), label)
    assert.equal(api.formatServiceSiteLabel(label), label)
  }
  assert.equal(api.formatServiceSiteLabel('DV Outreach'), 'DV Outreach')
  assert.equal(api.formatServiceSiteLabel('Other'), 'Other')
  assert.equal(api.formatServiceSiteLabel('125570004'), '125570004')
})

for (const [filename, fieldsExport, saveName, loadName] of forms) {
  test(`${filename}: spaced dropdown labels keep existing choice mappings and accept compact legacy labels`, async () => {
    const { api, state } = loadService(filename)
    const site = api[fieldsExport].find((field) => field.field === 'cmps_servicesite')
    const choices = site.options.filter((option) => option !== '--Please Select--')
    assert.deepEqual(Array.from(choices.slice(2, 7)), labels)
    for (let index = 0; index < labels.length; index += 1) {
      state.formatted = ''
      const label = labels[index]
      const compact = label.replace(' - ', '-')
      await api[saveName](rowId, { cmps_servicesite: label })
      assert.equal(Number(state.saved.cmps_servicesite), 125570002 + index)
      if (loadName) {
        const rawDetail = await api[loadName](rowId)
        assert.equal(rawDetail.values.cmps_servicesite, label)
        state.formatted = compact
        const formattedDetail = await api[loadName](rowId)
        assert.equal(formattedDetail.values.cmps_servicesite, label)
      }
      await api[saveName](rowId, { cmps_servicesite: compact })
      assert.equal(Number(state.saved.cmps_servicesite), 125570002 + index)
    }
  })
}
