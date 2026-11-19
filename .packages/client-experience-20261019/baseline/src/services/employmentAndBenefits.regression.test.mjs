import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const rowId = '11111111-1111-1111-1111-111111111111'
const clientId = '22222222-2222-2222-2222-222222222222'
const field = 'cmps_publicassistancetype1', retired = 'cmps_publicassistancetype'
const options = ['WIC', 'Low Income Housing', 'SSI', 'SSDI', 'Cash Assistance', 'Food Stamps', 'AHCCCS', 'CHIP']
const base = { cmps_recordid: 'EB-046', cmps_cpid: clientId, cmps_date: '2026-10-07', cmps_clienttype1: 'Adult', cmps_areyoureceivingpublicassistance: 'Yes' }
const schemaSource = readFileSync(new URL('../../.power/schemas/appschemas/dataSourcesInfo.ts', import.meta.url), 'utf8')
const schema = JSON.parse(schemaSource.slice(schemaSource.indexOf('{'), schemaSource.lastIndexOf('}') + 1))

function harness(local = false) {
  const source = readFileSync(new URL('./employmentAndBenefits.ts', import.meta.url), 'utf8').replaceAll('import.meta.env', '({})')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }, calls = []
  vm.runInNewContext(js, {
    module, exports: module.exports, Headers,
    window: { location: { hostname: local ? 'localhost' : 'apps.powerapps.com' } },
    fetch: async (url, init) => { calls.push({ url, init, item: JSON.parse(init.body) }); return { ok: true, json: async () => ({ cmps_employmentandbenefitsid: rowId }) } },
    require(name) {
      if (name === '@microsoft/power-apps/data') return { getClient: () => ({ executeAsync: async ({ connectorOperation: operation }) => {
        const api = schema.commondataserviceforapps.apis[operation.operationName]
        assert.ok(api, `Unsupported ${operation.operationName}`)
        for (const parameter of api.parameters.filter((p) => p.required && p.name !== 'connectionId')) assert.notEqual(operation.parameters[parameter.name], undefined, `Missing ${parameter.name}`)
        calls.push({ ...operation, item: operation.parameters.item })
        return { success: true, data: { cmps_employmentandbenefitsid: rowId } }
      } }) }
      if (name.includes('dataSourcesInfo')) return { dataSourcesInfo: schema }
      if (name === './auth') return { getAuthToken: () => 'test-token', ensureAuthToken: async () => 'test-token' }
      throw Error(`Unexpected ${name}`)
    },
  })
  return { api: module.exports, calls }
}

test('the replacement column keeps all eight options and controls each dependent amount field', () => {
  const { api } = harness(), fields = api.EMPLOYMENT_AND_BENEFITS_FIELDS
  const definition = fields.find((entry) => entry.field === field)
  assert.equal(definition.input, 'checkbox-group'); assert.deepEqual(Array.from(definition.options), options)
  assert.ok(!fields.some((entry) => entry.field === retired))
  for (const name of ['cmps_ssiamount', 'cmps_ssdiammount', 'cmps_cashassistanceamount', 'cmps_foodstampsamount', 'cmps_foodstampsdayreceived']) assert.equal(fields.find((entry) => entry.field === name).visibleWhen.field, field)
})

for (const local of [false, true]) {
  const mode = local ? 'local' : 'runtime'
  test(`${mode}: create and edit retain all eight choice values and never write the retired column`, async () => {
    const { api, calls } = harness(local)
    for (let index = 0; index < options.length; index++) {
      const created = await api.createEmploymentAndBenefitsResponse({ ...base, [field]: options[index], [retired]: 'CHIP', cmps_createdby: 'Creator', cmps_modifiedby: 'Creator' })
      assert.equal(created.id, rowId); assert.equal(created.recordId, base.cmps_recordid)
      const item = calls.at(-1).item
      assert.equal(item[field], String(125570000 + index)); assert.ok(!(retired in item))
      assert.equal(item['cmps_cpid@odata.bind'], `/cmps_clientprofiles(${clientId})`)
      assert.equal(item.cmps_createdby, 'Creator'); assert.equal(item.cmps_modifiedby, 'Creator')
      const selections = api.parsePublicAssistanceTypes(item[field])
      assert.deepEqual(Array.from(selections), [options[index]])
      await api.updateEmploymentAndBenefitsResponse(rowId, { ...base, [field]: selections.join(', '), cmps_modifiedby: 'Editor' })
      assert.equal(calls.at(-1).item[field], String(125570000 + index)); assert.equal(calls.at(-1).item.cmps_modifiedby, 'Editor')
    }
  })
  test(`${mode}: multiple types save as deduplicated backend values and keep every selected benefit's amount`, async () => {
    const { api, calls } = harness(local)
    await api.updateEmploymentAndBenefitsResponse(rowId, { ...base, [field]: 'SSI;125570003;Cash Assistance;Food Stamps;ssi', cmps_ssiamount: '125', cmps_ssdiammount: '250', cmps_cashassistanceamount: '375', cmps_foodstampsamount: '500', cmps_foodstampsdayreceived: '7' })
    const item = calls.at(-1).item
    assert.equal(item[field], '125570002,125570003,125570004,125570005')
    for (const [name, value] of Object.entries({ cmps_ssiamount: 125, cmps_ssdiammount: 250, cmps_cashassistanceamount: 375, cmps_foodstampsamount: 500, cmps_foodstampsdayreceived: 7 })) assert.equal(item[name], value)
    assert.deepEqual(Array.from(api.parsePublicAssistanceTypes(item[field])), ['SSI', 'SSDI', 'Cash Assistance', 'Food Stamps'])
    await api.updateEmploymentAndBenefitsResponse(rowId, { ...base, [field]: 'WIC', cmps_ssiamount: '125', cmps_ssdiammount: '250', cmps_cashassistanceamount: '375', cmps_foodstampsamount: '500', cmps_foodstampsdayreceived: '7' })
    for (const name of ['cmps_ssiamount', 'cmps_ssdiammount', 'cmps_cashassistanceamount', 'cmps_foodstampsamount', 'cmps_foodstampsdayreceived']) assert.ok(!(name in calls.at(-1).item))
  })
  test(`${mode}: unchecking all writes null; omitted selections are untouched; invalid selections fail before writing`, async () => {
    const { api, calls } = harness(local)
    await api.updateEmploymentAndBenefitsResponse(rowId, { ...base, [field]: '' })
    assert.equal(calls.at(-1).item[field], null)
    await api.updateEmploymentAndBenefitsResponse(rowId, base)
    assert.ok(!(field in calls.at(-1).item))
    await api.updateEmploymentAndBenefitsResponse(rowId, { ...base, cmps_areyoureceivingpublicassistance: 'No', [field]: 'SSI' })
    assert.ok(!(field in calls.at(-1).item))
    for (const value of ['Unknown Benefit', '125570008', '125569999', 'SSI,Typo']) {
      const count = calls.length
      await assert.rejects(api.createEmploymentAndBenefitsResponse({ ...base, [field]: value }), /Invalid choice for Public Assistance Type/)
      assert.equal(calls.length, count)
    }
  })
}

test('the actual editor renders independent checkboxes, supports deselection, and displays all selected benefit fields', () => {
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  const tree = ts.createSourceFile('App.tsx', app, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let renderer
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(tree).startsWith('EMPLOYMENT_AND_BENEFITS_FIELDS.filter') && node.expression.getText(tree).endsWith('.map')) renderer = node.arguments[0].getText(tree)
    ts.forEachChild(node, visit)
  }
  visit(tree); assert.ok(renderer)
  const { api } = harness(), context = {
    React: { createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity).filter(Boolean) }) },
    activeFormSession: { kind: 'employment-and-benefits', values: { ...base, [field]: '125570002;125570003;Cash Assistance;Food Stamps' } },
    normalize: (value) => String(value || '').toLowerCase().trim(), parseMultiValue: (value) => String(value).split(',').map((s) => s.trim()).filter(Boolean),
    parsePublicAssistanceTypes: api.parsePublicAssistanceTypes, isUserPreview: false, activeFormSaving: false, FormInput: 'form-input',
  }
  context.setActiveFormSession = (update) => { context.activeFormSession = update(context.activeFormSession) }
  vm.createContext(context)
  vm.runInContext(ts.transpileModule(`var render = ${renderer}`, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText, context)
  const definition = api.EMPLOYMENT_AND_BENEFITS_FIELDS.find((entry) => entry.field === field)
  const inputs = (node) => !node || typeof node !== 'object' ? [] : [node, ...(node.children || []).flatMap(inputs)].filter((item) => item.type === 'input')
  let checks = inputs(context.render(definition))
  assert.equal(checks.length, 8); assert.ok(checks.every((input) => input.props.type === 'checkbox'))
  assert.deepEqual(checks.map((input) => input.props.checked), [false, false, true, true, true, true, false, false])
  for (const name of ['cmps_ssiamount', 'cmps_ssdiammount', 'cmps_cashassistanceamount', 'cmps_foodstampsamount', 'cmps_foodstampsdayreceived']) assert.ok(context.render(api.EMPLOYMENT_AND_BENEFITS_FIELDS.find((entry) => entry.field === name)))
  checks[0].props.onChange({ target: { checked: true } })
  assert.ok(api.parsePublicAssistanceTypes(context.activeFormSession.values[field]).includes('WIC'))
  checks = inputs(context.render(definition)); checks[2].props.onChange({ target: { checked: false } })
  assert.ok(!api.parsePublicAssistanceTypes(context.activeFormSession.values[field]).includes('SSI'))
  assert.equal(context.render(api.EMPLOYMENT_AND_BENEFITS_FIELDS.find((entry) => entry.field === 'cmps_ssiamount')), null)
  assert.ok(context.render(api.EMPLOYMENT_AND_BENEFITS_FIELDS.find((entry) => entry.field === 'cmps_ssdiammount')))
  context.isUserPreview = true
  assert.ok(inputs(context.render(definition)).every((input) => input.props.disabled))
})
