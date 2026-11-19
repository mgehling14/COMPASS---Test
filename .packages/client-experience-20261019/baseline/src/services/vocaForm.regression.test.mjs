import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const schemaSource = readFileSync(new URL('../../.power/schemas/appschemas/dataSourcesInfo.ts', import.meta.url), 'utf8')
const schema = JSON.parse(schemaSource.slice(schemaSource.indexOf('{'), schemaSource.lastIndexOf('}') + 1))
const rowId = '11111111-1111-1111-1111-111111111111'
const enrollmentId = '22222222-2222-2222-2222-222222222222'
const victimizationField = 'cmps_vocavictimizationtype1'
const classificationField = 'cmps_specialclassificationofindividuals1'
const victimizationOptions = [
  'Adult Sexual Assault',
  'Adults Sexually Abused/Assaulted as Children',
  'Child Physical Abuse or Neglect',
  'Child Sexual Abuse/Assault',
  'Domestic and/or Family Violence',
  'Elder Abuse or Neglect',
  'Human Trafficking: Labor',
  'Human Trafficking: Sex',
]
const classificationOptions = [
  'Deaf/Hard of Hearing',
  'Homeless',
  'LGBTQ',
  'Veterans',
  'Victims with Disabilities: Cognitive/Physical/Mental',
  'Victims with Limited English Proficiency',
  'Immigrants/Refugees/Asylum Seekers',
  'Other',
]

function loadService(handler, { local = false } = {}) {
  const source = readFileSync(new URL('./vocaForm.ts', import.meta.url), 'utf8').replaceAll('import.meta.env', '({})')
  const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const service = { exports: {} }
  const calls = []
  vm.runInNewContext(javascript, {
    module: service,
    exports: service.exports,
    Headers,
    window: { location: { hostname: local ? 'localhost' : 'powerapps.example' } },
    fetch: async (url, init) => {
      calls.push({ url, init })
      return handler({ url, init })
    },
    require(name) {
      if (name === '@microsoft/power-apps/data') return {
        getClient: () => ({ executeAsync: async ({ connectorOperation: operation }) => {
          const api = schema.commondataserviceforapps.apis[operation.operationName]
          assert.ok(api, `Unsupported connector operation: ${operation.operationName}`)
          for (const parameter of api.parameters.filter((entry) => entry.required && entry.name !== 'connectionId')) {
            assert.notEqual(operation.parameters[parameter.name], undefined, `Missing ${parameter.name} for ${operation.operationName}`)
          }
          calls.push(operation)
          return handler(operation)
        } }),
      }
      if (name.includes('dataSourcesInfo')) return { dataSourcesInfo: schema }
      if (name === './auth') return { getAuthToken: () => 'test-token', ensureAuthToken: async () => 'test-token' }
      if (name === './archive') return { excludeArchived: (filter = '') => filter || 'cmps_isarchived ne 125570000' }
      throw new Error(`Unexpected dependency: ${name}`)
    },
  }, { filename: 'vocaForm.ts' })
  return { api: service.exports, calls }
}

test('both replacement columns retain their exact eight choice mappings on create and reload', async () => {
  let saved = {}
  const service = loadService(({ operationName, parameters }) => {
    if (operationName.startsWith('Create')) saved = { ...parameters.item }
    return { success: true, data: { ...saved, cmps_vocaformid: rowId, _cmps_peid_value: enrollmentId } }
  })
  assert.deepEqual(Array.from(service.api.VOCA_VICTIMIZATION_TYPE_OPTIONS), victimizationOptions)
  assert.deepEqual(Array.from(service.api.VOCA_SPECIAL_CLASSIFICATION_OPTIONS), classificationOptions)
  for (let index = 0; index < 8; index += 1) {
    await service.api.createVocaFormResponse({
      cmps_recordid: 'VOCA-001',
      cmps_peid: enrollmentId,
      [victimizationField]: victimizationOptions[index],
      [classificationField]: classificationOptions[index],
    })
    assert.equal(saved[victimizationField], String(125570000 + index))
    assert.equal(saved[classificationField], String(125570000 + index))
    assert.equal(saved['cmps_peid@odata.bind'], `/cmps_programenrollment1s(${enrollmentId})`)
    const detail = await service.api.loadVocaFormDetailRecord(rowId)
    assert.equal(detail.values[victimizationField], victimizationOptions[index])
    assert.equal(detail.values[classificationField], classificationOptions[index])
    assert.equal(detail.values.cmps_peid, enrollmentId)
  }
})

test('multiple selections are encoded as deduplicated numeric choice strings', async () => {
  const service = loadService(() => ({ success: true, data: {} }))
  await service.api.updateVocaFormResponse(rowId, {
    [victimizationField]: 'Adult Sexual Assault; Domestic and/or Family Violence; Adult Sexual Assault',
    [classificationField]: '125570001,125570007,125570001',
  })
  const payload = service.calls[0].parameters.item
  assert.equal(payload[victimizationField], '125570000,125570004')
  assert.equal(payload[classificationField], '125570001,125570007')
})

test('explicitly deselecting all choices clears columns; omitted fields are not changed', async () => {
  const service = loadService(() => ({ success: true, data: {} }))
  await service.api.updateVocaFormResponse(rowId, { [victimizationField]: '', [classificationField]: '' })
  assert.equal(service.calls[0].parameters.item[victimizationField], null)
  assert.equal(service.calls[0].parameters.item[classificationField], null)
  await service.api.updateVocaFormResponse(rowId, { cmps_recordid: 'VOCA-001' })
  assert.equal(Object.hasOwn(service.calls[1].parameters.item, victimizationField), false)
  assert.equal(Object.hasOwn(service.calls[1].parameters.item, classificationField), false)
})

test('retired columns and unmapped choices cannot be sent to Dataverse', async () => {
  const service = loadService(() => ({ success: true, data: {} }))
  await service.api.updateVocaFormResponse(rowId, {
    cmps_vocavictimizationtype: 'Adult Sexual Assault',
    cmps_specialclassificationofindividuals: 'Homeless',
    [victimizationField]: 'Adult Sexual Assault',
  })
  const payload = service.calls[0].parameters.item
  assert.equal(Object.hasOwn(payload, 'cmps_vocavictimizationtype'), false)
  assert.equal(Object.hasOwn(payload, 'cmps_specialclassificationofindividuals'), false)
  await assert.rejects(service.api.updateVocaFormResponse(rowId, { [victimizationField]: 'Stalking/Harassment' }), /Invalid VOCA multi-select choice/)
  await assert.rejects(service.api.updateVocaFormResponse(rowId, { [classificationField]: '125570008' }), /Invalid VOCA multi-select choice/)
  assert.equal(service.calls.length, 1)
})

test('runtime detail queries use only the replacement columns and request formatted multi-select labels', async () => {
  const service = loadService(() => ({ success: true, data: {
    cmps_vocaformid: rowId,
    cmps_recordid: 'VOCA-001',
    [victimizationField]: '125570000,125570007',
    [classificationField]: '125570001,125570007',
    [`${victimizationField}@OData.Community.Display.V1.FormattedValue`]: 'Adult Sexual Assault; Human Trafficking: Sex',
    [`${classificationField}@OData.Community.Display.V1.FormattedValue`]: 'Homeless; Other',
  } }))
  const detail = await service.api.loadVocaFormDetailRecord(rowId)
  assert.equal(detail.values[victimizationField], 'Adult Sexual Assault, Human Trafficking: Sex')
  assert.equal(detail.values[classificationField], 'Homeless, Other')
  const call = service.calls[0]
  assert.equal(call.operationName, 'GetItemWithOrganization')
  const fields = call.parameters.$select.split(',')
  assert.ok(fields.includes(victimizationField) && fields.includes(classificationField))
  assert.ok(fields.includes('_cmps_peid_value'))
  assert.ok(!fields.includes('cmps_vocavictimizationtype') && !fields.includes('cmps_specialclassificationofindividuals'))
  assert.match(call.parameters.prefer, /FormattedValue/)
  const other = service.api.VOCA_FORM_FIELD_DEFINITIONS.find((field) => field.field === 'cmps_specialclassificationofindividualsother')
  assert.equal(other.visibleWhen[0].field, classificationField)
})

test('record-ID-only loading uses the list operation, not a GUID lookup', async () => {
  const service = loadService(() => ({ success: true, data: { value: [{ cmps_vocaformid: rowId, [victimizationField]: '125570004,125570005' }] } }))
  const detail = await service.api.loadVocaFormDetailRecord('', 'VOCA-001')
  assert.equal(service.calls[0].operationName, 'ListRecordsWithOrganization')
  assert.equal(detail.values[victimizationField], 'Domestic and/or Family Violence, Elder Abuse or Neglect')
})

test('local Web API save and load use the same multi-select encoding and new query columns', async () => {
  let saved = {}
  const service = loadService(({ init }) => {
    if (init.method === 'PATCH') saved = JSON.parse(init.body)
    return { ok: true, json: async () => ({ ...saved, cmps_vocaformid: rowId }) }
  }, { local: true })
  await service.api.updateVocaFormResponse(rowId, {
    [victimizationField]: 'Child Sexual Abuse/Assault, Elder Abuse or Neglect',
    [classificationField]: 'Homeless, Veterans',
  })
  assert.equal(saved[victimizationField], '125570003,125570005')
  assert.equal(saved[classificationField], '125570001,125570003')
  const detail = await service.api.loadVocaFormDetailRecord(rowId)
  assert.equal(detail.values[victimizationField], 'Child Sexual Abuse/Assault, Elder Abuse or Neglect')
  assert.equal(detail.values[classificationField], 'Homeless, Veterans')
  const fields = new URL(service.calls[1].url).searchParams.get('$select').split(',')
  assert.ok(fields.includes(victimizationField) && fields.includes(classificationField))
})
