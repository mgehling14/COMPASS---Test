import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const schemaSource = readFileSync(new URL('../../.power/schemas/appschemas/dataSourcesInfo.ts', import.meta.url), 'utf8')
const schema = JSON.parse(schemaSource.slice(schemaSource.indexOf('{'), schemaSource.lastIndexOf('}') + 1))
const apis = schema.commondataserviceforapps.apis
const enrollmentId = '11111111-1111-1111-1111-111111111111'
const clientId = '22222222-2222-2222-2222-222222222222'

function loadService(filename, handler) {
  const source = readFileSync(new URL(filename, import.meta.url), 'utf8').replaceAll('import.meta.env', '({})')
  const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const service = { exports: {} }
  const calls = []
  const context = {
    module: service,
    exports: service.exports,
    Headers,
    window: { location: { hostname: 'powerapps.example' } },
    require(name) {
      if (name === './serviceSiteLabels') return loadService('./serviceSiteLabels.ts', handler).api
      if (name === '@microsoft/power-apps/data') return {
        getClient: () => ({ executeAsync: async ({ connectorOperation: operation }) => {
          const api = apis[operation.operationName]
          assert.ok(api, `Unsupported connector operation: ${operation.operationName}`)
          for (const parameter of api.parameters.filter((entry) => entry.required && entry.name !== 'connectionId')) {
            assert.notEqual(operation.parameters[parameter.name], undefined, `Missing ${parameter.name} for ${operation.operationName}`)
          }
          calls.push(operation)
          return handler(operation)
        } }),
      }
      if (name.includes('dataSourcesInfo')) return { dataSourcesInfo: schema }
      if (name === './auth') return { getAuthToken: () => '', ensureAuthToken: async () => '' }
      if (name === './archive') return { ARCHIVED_NO_VALUE: 125570001, excludeArchived: (filter = '') => filter || 'cmps_isarchived ne 125570000' }
      throw new Error(`Unexpected dependency: ${name}`)
    },
  }
  vm.runInNewContext(javascript, context, { filename })
  return { api: service.exports, calls }
}

test('date verification uses a supported connector operation and loads editable ISO dates', async () => {
  const record = {
    cmps_bedenrollmentid: enrollmentId,
    cmps_recordid: 'BE-043',
    cmps_checkindate: '2026-09-22T00:00:00Z',
    cmps_checkoutdate: '2026-10-02T00:00:00Z',
    'cmps_checkindate@OData.Community.Display.V1.FormattedValue': '9/22/2026',
    'cmps_checkoutdate@OData.Community.Display.V1.FormattedValue': '10/2/2026',
  }
  const service = loadService('./bedEnrollment.ts', ({ operationName }) => ({ success: true, data: operationName.startsWith('Update') ? {} : record }))
  const detail = await service.api.loadBedEnrollmentDetailRecord(enrollmentId)
  assert.equal(detail.values.cmps_checkindate, '2026-09-22')
  assert.equal(detail.values.cmps_checkoutdate, '2026-10-02')
  await service.api.updateBedEnrollmentResponse(enrollmentId, { cmps_checkindate: '2026-09-22', cmps_checkoutdate: '2026-10-02' })
  assert.ok(service.calls.some((call) => call.operationName === 'GetItemWithOrganization'))
  assert.ok(!service.calls.some((call) => call.operationName.includes('GetRecord')))
})

test('create resolves the row ID when the connector returns no create body', async () => {
  const service = loadService('./bedEnrollment.ts', ({ operationName }) => ({
    success: true,
    data: operationName.startsWith('List') ? { value: [{ cmps_bedenrollmentid: enrollmentId, cmps_recordid: 'BE-044' }] } : {},
  }))
  const created = await service.api.createBedEnrollmentResponse({ cmps_recordid: 'BE-044', cmps_checkindate: '2026-09-22' })
  assert.equal(created.id, enrollmentId)
})

function bed(id, program, statusValue, statusLabel, assigned = '') {
  return {
    cmps_bedsid: id,
    cmps_bedname: id,
    cmps_unit: '1',
    cmps_program: 125570004,
    'cmps_program@OData.Community.Display.V1.FormattedValue': program,
    cmps_status: statusValue,
    'cmps_status@OData.Community.Display.V1.FormattedValue': statusLabel,
    _cmps_beid_value: assigned,
  }
}

test('picker offers available beds for the program and this enrollment only', async () => {
  const records = [
    bed('available', 'CAAFA Shelter', 125570000, 'Available'),
    bed('taken', 'CAAFA Shelter', 125570001, 'Taken'),
    bed('mine', 'CAAFA Shelter', 125570001, 'Taken', enrollmentId),
    bed('other-enrollment', 'CAAFA Shelter', 125570000, 'Available', 'another-enrollment'),
    { ...bed('other-client', 'CAAFA Shelter', 125570000, 'Available'), _cmps_cpid_value: 'another-client' },
    bed('other-program', 'Faith House', 125570000, 'Available'),
    bed('mine-other-program', 'Faith House', 125570001, 'Taken', enrollmentId),
  ]
  const service = loadService('./beds.ts', () => ({ success: true, data: { value: records } }))
  const result = await service.api.listSelectableBedsForEnrollment('CAAFA Shelter', enrollmentId)
  assert.deepEqual(Array.from(result.beds, (row) => row.id).sort(), ['available', 'mine'])
  assert.deepEqual(Array.from(result.assignedBedIds), ['mine'])
  const newEnrollment = await service.api.listSelectableBedsForEnrollment('CAAFA Shelter')
  assert.deepEqual(Array.from(newEnrollment.beds, (row) => row.id), ['available'])
  assert.match(service.calls[0].parameters.prefer, /FormattedValue/)
})

test('assignment writes the actual Taken choice and both lookup links', async () => {
  const selectedId = '33333333-3333-3333-3333-333333333333'
  const selected = bed(selectedId, 'CAAFA Shelter', 125570000, 'Available')
  const records = [selected, bed('already-taken', 'CAAFA Shelter', 125570001, 'Taken')]
  const service = loadService('./beds.ts', (operation) => {
    if (operation.operationName.startsWith('Update')) {
      assert.equal(operation.parameters.item.cmps_status, 125570001)
      assert.equal(operation.parameters.item['cmps_beid@odata.bind'], `/cmps_bedenrollments(${enrollmentId})`)
      assert.equal(operation.parameters.item['cmps_cpid@odata.bind'], `/cmps_clientprofiles(${clientId})`)
      selected.cmps_status = 125570001
      selected['cmps_status@OData.Community.Display.V1.FormattedValue'] = 'Taken'
      selected._cmps_beid_value = enrollmentId
      selected._cmps_cpid_value = clientId
    }
    return { success: true, data: { value: records } }
  })
  await service.api.assignBedsToEnrollment([selectedId], enrollmentId, clientId)
  assert.equal(service.calls.filter((call) => call.operationName.startsWith('Update')).length, 1)
})

test('assignment rejects a bed that another enrollment took after the picker loaded', async () => {
  const records = [bed('occupied', 'CAAFA Shelter', 125570001, 'Taken', 'other-enrollment')]
  const service = loadService('./beds.ts', () => ({ success: true, data: { value: records } }))
  await assert.rejects(service.api.assignBedsToEnrollment(['occupied'], enrollmentId, clientId), /already assigned to another enrollment/)
  assert.equal(service.calls.filter((call) => call.operationName.startsWith('Update')).length, 0)
})
