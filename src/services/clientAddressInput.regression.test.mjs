import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const rowId = '11111111-1111-1111-1111-111111111111'
const parts = { line1: 'cmps_addressline1', line2: 'cmps_addressline2', city: 'cmps_city', state: 'cmps_state', county: 'cmps_county', zip: 'cmps_zip' }
const examples = { line1: "123 O'Neil & Sons Blvd., Bldg #4", line2: 'Suite "A/B" – North Wing', city: 'San Tan Valley', state: 'AZ', county: 'La Paz County', zip: '85140 1234' }
const empty = Object.fromEntries(Object.keys(parts).map((part) => [part, '']))
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const tree = ts.createSourceFile('App.tsx', app, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const functions = new Map()
function visit(node) { if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node.getText(tree)); ts.forEachChild(node, visit) }
visit(tree)
const schemaText = readFileSync(new URL('../../.power/schemas/appschemas/dataSourcesInfo.ts', import.meta.url), 'utf8')
const schema = JSON.parse(schemaText.slice(schemaText.indexOf('{'), schemaText.lastIndexOf('}') + 1))
const compilerOptions = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }

function service(runtime = false) {
  const calls = [], module = { exports: {} }
  let saved = { cmps_clientprofileid: rowId, cmps_recordid: 'CP-046' }
  const source = readFileSync(new URL('./clientProfile.ts', import.meta.url), 'utf8').replaceAll('import.meta.env', '({VITE_DATAVERSE_ORG_URL:"https://test.crm.dynamics.com"})')
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions }).outputText, {
    module, exports: module.exports, Headers,
    window: { location: { hostname: runtime ? 'powerapps.example' : 'localhost' } },
    fetch: async (url, init) => {
      assert.equal(runtime, false); calls.push({ url, init })
      if (init.method === 'POST' || init.method === 'PATCH') saved = { ...saved, ...JSON.parse(init.body) }
      return { ok: true, headers: new Headers(), json: async () => url.includes('?$select=') && !url.includes(`(${rowId})`) ? { value: [saved] } : saved }
    },
    require(name) {
      if (name === '@microsoft/power-apps/data') return { getClient: () => ({ executeAsync: async ({ connectorOperation: operation }) => {
        const definition = schema.commondataserviceforapps.apis[operation.operationName]; assert.ok(definition, `Unsupported connector operation ${operation.operationName}`)
        for (const param of definition.parameters.filter((entry) => entry.required && entry.in !== 'header' && entry.name !== 'connectionId')) assert.notEqual(operation.parameters[param.name], undefined, param.name)
        calls.push(operation)
        if (operation.operationName === 'CreateRecordWithOrganization' || operation.operationName === 'UpdateOnlyRecordWithOrganization') saved = { ...saved, ...operation.parameters.item }
        return { success: true, data: operation.operationName === 'ListRecordsWithOrganization' ? { value: [saved] } : saved }
      } }) }
      if (name.includes('dataSourcesInfo')) return { dataSourcesInfo: schema }
      if (name === './auth') return { ensureAuthToken: async () => runtime ? '' : 'token', getAuthToken: () => 'token' }
      if (name === './archive') return { excludeArchived: (filter) => filter }
      throw Error(name)
    },
  })
  return { api: module.exports, calls }
}
const api = service().api
function draft(editing, initial = {}) {
  const context = { activeFormSession: { kind: 'client-profile', rowId: editing ? rowId : '', recordId: 'CP-046', values: { cmps_name: 'Existing', cmps_recordid: 'CP-046', ...initial } },
    addressParts: { ...empty }, normalize: (s) => s.toLowerCase().trim(), updateClientProfileDraftValue: api.updateClientProfileDraftValue,
  }
  context.setAddressParts = (change) => { context.addressParts = typeof change === 'function' ? change(context.addressParts) : change }
  context.setActiveFormSession = (change) => { context.activeFormSession = change(context.activeFormSession) }
  vm.createContext(context)
  vm.runInContext(ts.transpileModule(['getClientProfileAddressParts', 'updateAddressValue', 'updateActiveFormValue', 'updateClientProfileValue'].map((name) => functions.get(name)).join('\n'), { compilerOptions }).outputText, context)
  context.rehydrate = () => { context.addressParts = context.getClientProfileAddressParts(context.activeFormSession.values) }
  context.rehydrate()
  return context
}

for (const editing of [false, true]) test(`${editing ? 'existing' : 'new'} Client Profile preserves separator spaces through every keystroke and session rehydration for all address inputs`, () => {
  const c = draft(editing)
  for (const [part, value] of Object.entries(examples)) {
    let typed = ''
    for (const character of value) {
      typed = c.addressParts[part] + character
      c.updateAddressValue(part, typed)
      c.rehydrate() // Mirrors the existing useEffect([activeFormSession]) after a render.
      assert.equal(c.addressParts[part], typed, `${part}: a separator space must survive before typing the next word`)
      assert.equal(c.activeFormSession.values[parts[part]], typed)
    }
    assert.equal(c.addressParts[part], value)
  }
  c.updateClientProfileValue('cmps_aliases', 'Another field changed'); c.rehydrate()
  for (const [part, value] of Object.entries(examples)) assert.equal(c.addressParts[part], value)
  assert.equal(c.activeFormSession.values.cmps_name, 'Existing')
})

test('spaces-only intermediate drafts, multiple spaces, punctuation and backspacing are not reformatted while typing', () => {
  const c = draft(true)
  for (const value of [' ', '  ', 'San ', 'San  ', 'San  Tan ', 'San  Tan Valley', 'San  Tan ', 'San ', '']) {
    c.updateAddressValue('city', value); c.rehydrate(); assert.equal(c.addressParts.city, value)
  }
})

test('legacy Previous Address labels still hydrate separate plain fields; editing one field preserves all other legacy address parts', () => {
  const c = draft(true, { cmps_previousaddress: Object.entries(examples).map(([part, value]) => `${({ line1: 'Address line 1', line2: 'Address line 2', city: 'City', state: 'State', county: 'County', zip: 'Zip' })[part]}: ${value}`).join('\n') })
  for (const [part, value] of Object.entries(examples)) assert.equal(c.addressParts[part], value)
  c.updateAddressValue('city', 'Apache Junction'); c.rehydrate()
  for (const [part, value] of Object.entries(examples)) assert.equal(c.addressParts[part], part === 'city' ? 'Apache Junction' : value)
})

test('actual address editor displays plain values and sends a typed separator space unchanged to the input handler', () => {
  const start = app.indexOf("if (fieldDef.field === 'cmps_addressline1') {")
  const end = app.indexOf("if (\n                              fieldDef.field === 'cmps_addressline2'", start)
  assert.ok(start >= 0 && end > start)
  const calls = [], module = { exports: {} }, context = { module, exports: module.exports, require,
    fieldDef: { field: 'cmps_addressline1' }, fieldId: 'address', addressParts: examples, meta: null, US_STATE_OPTIONS: ['AZ'],
    updateAddressValue: (...args) => calls.push(args),
  }
  vm.createContext(context)
  vm.runInContext(ts.transpileModule(`function render() { ${app.slice(start, end)} }\nglobalThis.element = render()`, { compilerOptions }).outputText, context)
  const inputs = []
  function walk(element) { if (Array.isArray(element)) element.forEach(walk); else if (React.isValidElement(element)) { if (element.type === 'input') inputs.push(element); walk(element.props.children) } }
  walk(context.element)
  assert.equal(inputs.length, 5)
  for (const input of inputs) {
    const part = input.props.id.slice('address-'.length)
    assert.equal(input.props.value, examples[part]); input.props.onChange({ target: { value: examples[part] + ' ' } })
  }
  assert.equal(calls.length, 5); assert.ok(calls.every(([part, value]) => value === examples[part] + ' '))
  const html = renderToStaticMarkup(context.element)
  assert.ok(html.includes('San Tan Valley')); assert.ok(!html.includes('\\&quot;')); assert.ok(!html.includes('[&quot;'))
})

for (const runtime of [false, true]) for (const editing of [false, true]) test(`${runtime ? 'connector' : 'Web API'} ${editing ? 'update' : 'create'} saves and reloads spaces and punctuation as plain address columns without serialization wrappers`, async () => {
  const h = service(runtime), values = { cmps_recordid: 'CP-046', ...Object.fromEntries(Object.entries(examples).map(([part, value]) => [parts[part], value])) }
  if (editing) await h.api.updateClientProfileResponse(rowId, values)
  else await h.api.createClientProfileResponse(values)
  const write = h.calls.find((call) => runtime ? call.parameters.item : call.init.method === 'POST' || call.init.method === 'PATCH')
  const payload = runtime ? write.parameters.item : JSON.parse(write.init.body)
  for (const [part, value] of Object.entries(examples)) assert.equal(payload[parts[part]], value)
  // Record-ID lookup uses the same hydration routine as opening an existing profile.
  const detail = await h.api.loadClientProfileDetailRecord('', 'CP-046')
  for (const [part, value] of Object.entries(examples)) assert.equal(detail.values[parts[part]], value)
  assert.equal(Object.hasOwn(payload, 'cmps_previousaddress'), false)
})
