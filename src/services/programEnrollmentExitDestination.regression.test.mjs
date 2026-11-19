import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const rowId = '11111111-1111-1111-1111-111111111111'
const labels = [
  ['Place not meant for habitation (vehicle, abandoned building, station, airport, or anywhere outside)', 'Place not meant for habitation (e.g., a vehicle, an abandonded building, bus/train/subway-station/airport or anywhere outside)', 125570000],
  ['Place not meant for habitation (e.g., a vehicle, an abandoned building, bus/train/subway-station/airport or anywhere outside)', 'Place not meant for habitation (e.g., a vehicle, an abandonded building, bus/train/subway-station/airport or anywhere outside)', 125570000],
  ['Hotel or motel paid for without emergency shelter voucher', 'Hotel/motel without emergency shelter voucher', 125570008],
  ['Rental by client without RRH or equivalent subsidy', 'Rental by client without RRH/equivalent subsidy', 125570013],
  ['Rental by client with RRH or equivalent subsidy', 'Rental by client with RRH/equivalent subsidy', 125570014],
]
function service() {
  const state = { saved: {}, formatted: '' }, calls = [], module = { exports: {} }
  const source = readFileSync(new URL('./programEnrollment.ts', import.meta.url), 'utf8').replaceAll('import.meta.env', '({})')
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    module, exports: module.exports, Headers, URL, URLSearchParams,
    window: { location: { hostname: 'localhost' } },
    fetch: async (url, init = {}) => {
      calls.push({ url, init })
      if (init.body) state.saved = JSON.parse(init.body)
      const row = { ...state.saved, cmps_programenrollment1id: rowId, ...(state.formatted ? { 'cmps_exitdestination@OData.Community.Display.V1.FormattedValue': state.formatted } : {}) }
      return { ok: true, json: async () => url.includes('EntityDefinitions') ? { value: [] } : { ...row, value: [row] } }
    },
    require(name) {
      if (name === '@microsoft/power-apps/data') return { getClient: () => ({ executeAsync: async () => { throw Error('Unexpected connector operation') } }) }
      if (name.includes('dataSourcesInfo')) return { dataSourcesInfo: {} }
      if (name === './auth') return { getAuthToken: () => 'test-token', ensureAuthToken: async () => 'test-token' }
      if (name === './archive') return { excludeArchived: (filter) => filter || 'cmps_isarchived ne 125570000' }
      if (name === './serviceSiteLabels') return { formatServiceSiteLabel: (value) => String(value || '') }
      if (name === './dataverseRecordPages') return { readDataverseRecordPages: () => { throw Error('Unexpected paged query') } }
      throw Error('Unexpected import ' + name)
    },
  })
  return { api: module.exports, state, calls }
}
test('updated labels retain their original choice positions and field mapping', () => {
  const { api } = service()
  const field = api.PROGRAM_ENROLLMENT_FIELDS.find((field) => field.field === 'cmps_exitdestination')
  assert.equal(field.section, 'Discharge Summary')
  const options = field.options.filter((label) => label !== '--Please Select--')
  assert.equal(options.length, 19)
  for (const [oldLabel, newLabel, value] of labels) {
    assert.equal(options[value - 125570000], newLabel)
    assert.equal(options.includes(oldLabel), false)
  }
})
for (const [oldLabel, newLabel, value] of labels) test(newLabel + ': create/edit keep the same backend value and old records display the new wording', async () => {
  const { api, state } = service()
  await api.createProgramEnrollmentResponse({ cmps_recordid: 'PE-046', cmps_exitdestination: newLabel })
  assert.equal(Number(state.saved.cmps_exitdestination), value)
  assert.equal((await api.loadProgramEnrollmentDetailRecord(rowId)).values.cmps_exitdestination, newLabel)
  state.formatted = oldLabel
  assert.equal((await api.loadProgramEnrollmentDetailRecord(rowId)).values.cmps_exitdestination, newLabel)
  state.formatted = newLabel
  assert.equal((await api.loadProgramEnrollmentDetailRecord(rowId)).values.cmps_exitdestination, newLabel)
  await api.updateProgramEnrollmentResponse(rowId, { cmps_exitdestination: newLabel })
  assert.equal(Number(state.saved.cmps_exitdestination), value)
  await api.updateProgramEnrollmentResponse(rowId, { cmps_exitdestination: oldLabel })
  assert.equal(Number(state.saved.cmps_exitdestination), value)
})
