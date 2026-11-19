import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const rowId = '11111111-1111-1111-1111-111111111111'
const housingField = 'cmps_shelterhousingservices'
const justiceField = 'cmps_criminalciviljusticeassistance'

test('Where Did You Refer - Other follows its parent in Service Details, not Main, and displays on the next row', () => {
  const fields = loadService().api.SERVICES_FIELD_DEFINITIONS
  const referralIndex = fields.findIndex((field) => field.field === 'cmps_wheredidyourefer')
  const other = fields[referralIndex + 1]
  assert.equal(other.field, 'cmps_wheredidyoureferother')
  assert.equal(fields[referralIndex].section, 'Service Details')
  assert.equal(other.section, 'Service Details')
  assert.equal(fields.filter((field) => field.section === 'Main').some((field) => field.field === other.field), false)
  const css = readFileSync(new URL('./serviceReferralLayout.css', import.meta.url), 'utf8')
  assert.match(css, /:has\(> #services-cmps_wheredidyourefer\)/)
  assert.match(css, /:has\(> #services-cmps_wheredidyoureferother\)/)
  assert.match(css, /grid-column:\s*1\s*\/\s*-1/)
  assert.match(readFileSync(new URL('../main.tsx', import.meta.url), 'utf8'), /import '\.\/services\/serviceReferralLayout\.css'/)
})

test('Where Did You Refer - Other remains conditional and round-trips through the same backend column', async () => {
  const service = loadService(), source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  const tree = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), snippets = []
  const names = new Set(['normalize', 'isServicesFieldVisible'])
  function visit(node) { if (ts.isFunctionDeclaration(node) && names.has(node.name?.text)) snippets.push(node.getText(tree)); ts.forEachChild(node, visit) }
  visit(tree)
  const context = { VOCA_DIRECT_CATEGORY_TO_FIELD: {} }
  vm.createContext(context)
  vm.runInContext(ts.transpileModule(snippets.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  for (const choice of ['Other', '  other  ', 'Housing', '']) assert.equal(context.isServicesFieldVisible('cmps_wheredidyoureferother', { cmps_service: 'External Referral', cmps_wheredidyourefer: choice }, []), choice.trim().toLowerCase() === 'other')
  await service.api.createServicesResponse({ cmps_recordid: 'SV-001', cmps_wheredidyoureferother: 'Local community partner' })
  assert.equal(service.payloads.at(-1).cmps_wheredidyoureferother, 'Local community partner')
  assert.equal((await service.api.loadServicesDetailRecord(rowId)).values.cmps_wheredidyoureferother, 'Local community partner')
  await service.api.updateServicesResponse(rowId, { cmps_wheredidyoureferother: 'Another partner' })
  assert.equal(service.payloads.at(-1).cmps_wheredidyoureferother, 'Another partner')
})

test('OVW-Late Life shows Direct Service Categories and the selected associated dropdown, optional on create/edit; VOCA still requires both', () => {
  const api = loadService().api
  const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  const tree = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const names = new Set(['normalize', 'normalizeGuidText', 'startsWithReachCenter', 'isReachCenterProgramEnrollment', 'isServicesFieldVisible', 'getServicesFieldLabel', 'getActiveRequiredFields', 'getRequiredServicesMessage'])
  const snippets = tree.statements.filter((node) => ts.isVariableStatement(node) && node.declarationList.declarations.some((declaration) => declaration.name.getText(tree) === 'VOCA_DIRECT_CATEGORY_TO_FIELD')).map((node) => node.getText(tree))
  function visit(node) { if (ts.isFunctionDeclaration(node) && names.has(node.name?.text)) snippets.push(node.getText(tree)); ts.forEachChild(node, visit) }
  visit(tree)
  const context = { SERVICES_FIELD_DEFINITIONS: api.SERVICES_FIELD_DEFINITIONS, programEnrollmentsForClient: [] }
  vm.createContext(context)
  vm.runInContext(ts.transpileModule(snippets.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  const categories = [
    ['Information and Referral', 'cmps_informationandreferral'],
    ['Personal Advocacy/Accompaniment', 'cmps_personaladvocacyaccompaniment'],
    ['Emotional Support or Safety Services', 'cmps_emotionalsupportorsafetyservices'],
    ['Shelter/Housing Services', 'cmps_shelterhousingservices'],
    ['Criminal Justice System Assistance', 'cmps_criminalciviljusticeassistance'],
  ]
  const base = { cmps_programenrollment: rowId, cmps_dateofservice: '2026-10-14', cmps_time: '12:00', cmps_servicecategory: 'Intake & Discharge', cmps_service: 'Intake', cmps_minutes: '15' }
  for (const existingId of ['', rowId]) for (const funder of ['OVW-Late Life', '  ovw-late life  ', 'VOCA']) {
    const session = { kind: 'services', rowId: existingId, values: { ...base, cmps_funder: funder } }, voca = funder === 'VOCA'
    assert.equal(context.isServicesFieldVisible('cmps_directservicecategories', session.values, []), true)
    assert.equal(context.getActiveRequiredFields(session).has('cmps_directservicecategories'), voca)
    assert.equal(context.getRequiredServicesMessage(session).includes('Direct Service Categories'), voca)
    for (const [category, selectedField] of categories) {
      const values = { ...session.values, cmps_directservicecategories: category }, selected = { ...session, values }
      for (const [, field] of categories) {
        assert.equal(context.isServicesFieldVisible(field, values, []), field === selectedField)
        assert.equal(context.getActiveRequiredFields(selected).has(field), voca && field === selectedField)
      }
      assert.equal(context.getRequiredServicesMessage(selected).includes(api.SERVICES_FIELD_DEFINITIONS.find((field) => field.field === selectedField).label), voca)
      const option = api.SERVICES_FIELD_DEFINITIONS.find((field) => field.field === selectedField).options[0]
      assert.equal(context.getRequiredServicesMessage({ ...selected, values: { ...values, [selectedField]: option } }), '')
    }
  }
  for (const [, field] of categories) assert.equal(context.isServicesFieldVisible(field, { ...base, cmps_funder: 'Other', cmps_directservicecategories: 'Information and Referral' }, []), false)
})

test('OVW-Late Life direct-service selections are saved/reloaded and empty optional selections can be saved', async () => {
  const service = loadService(), category = 'Shelter/Housing Services'
  await service.api.createServicesResponse({ cmps_recordid: 'SV-001', cmps_funder: 'OVW-Late Life', cmps_directservicecategories: category, [housingField]: 'Relocation assistance' })
  const detail = await service.api.loadServicesDetailRecord(rowId)
  assert.equal(detail.values.cmps_directservicecategories, category)
  assert.equal(detail.values[housingField], 'Relocation assistance')
  await service.api.updateServicesResponse(rowId, { cmps_funder: 'OVW-Late Life', cmps_directservicecategories: '', [housingField]: '' })
  assert.equal(service.payloads.at(-1).cmps_directservicecategories, undefined)
  assert.equal(service.payloads.at(-1)[housingField], undefined)
})

test('Additional Service Detail dropdown renames Somatic Series and places CARE directly above selectable Other, including stale configured labels', () => {
  const api = loadService().api
  assert.deepEqual(Array.from(api.SERVICE_ADDITIONAL_DETAIL_OPTIONS), ['Adult Community Meeting', 'Art of Healing Workshop', 'Child Group', 'Culturally Specific Healing', 'DV Support Group', 'Somatic Series', 'RISE', 'Secondary Survivor', 'Sound Healing', 'CARE', 'Other'])
  const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  const tree = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const functions = []
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && ['normalize', 'resolveServicesDependentOptions'].includes(node.name?.text)) functions.push(node.getText(tree))
    ts.forEachChild(node, visit)
  }
  visit(tree)
  const context = { resolveServiceAdditionalDetailOptions: api.resolveServiceAdditionalDetailOptions }
  vm.createContext(context)
  vm.runInContext(ts.transpileModule(functions.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  const old = ['Restorative Yoga', 'Somatic Series', 'Other', 'CARE', 'Sound Healing', 'care']
  const resolved = Array.from(context.resolveServicesDependentOptions('cmps_additionalservicedetail', old, {}))
  assert.deepEqual(resolved, ['Somatic Series', 'Sound Healing', 'CARE', 'Other'])
  assert.equal(context.resolveServicesDependentOptions('cmps_additionalservicedetail', [], {}).length, 0, 'inactive configurations remain inactive')
  const declaration = tree.statements.find((node) => ts.isVariableStatement(node) && node.declarationList.declarations.some((entry) => entry.name.getText(tree) === 'SERVICES_IMPORT_ONLY_OTHER_FIELDS'))
  assert.ok(declaration)
  assert.doesNotMatch(declaration.getText(tree), /cmps_additionalservicedetail/)
  assert.match(declaration.getText(tree), /cmps_servicecategory/)
})

test('all Additional Service Detail choices retain their assigned values despite CARE dropdown ordering', async () => {
  const service = loadService()
  for (const [label, value] of [['Adult Community Meeting', 125570000], ['Art of Healing Workshop', 125570001], ['Child Group', 125570002], ['Culturally Specific Healing', 125570003], ['DV Support Group', 125570004], ['Somatic Series', 125570005], ['RISE', 125570006], ['Secondary Survivor', 125570007], ['Sound Healing', 125570008], ['Other', 125570009], ['CARE', 125570010]]) {
    await service.api.updateServicesResponse(rowId, { cmps_additionalservicedetail: label })
    assert.equal(service.payloads.at(-1).cmps_additionalservicedetail, value, label)
    assert.equal((await service.api.loadServicesDetailRecord(rowId)).values.cmps_additionalservicedetail, label)
  }
})

test('Program Information Only is first for Resource Navigation in the actual Services dropdown resolver', () => {
  const api = loadService().api
  const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  const tree = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const names = new Set(['normalize', 'dedupeOptions', 'resolveServicesDependentOptions'])
  const snippets = []
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && names.has(node.name?.text)) snippets.push(node.getText(tree))
    ts.forEachChild(node, visit)
  }
  visit(tree)
  const context = { SERVICES_BY_CATEGORY_LOOKUP: Object.fromEntries(Object.entries(api.SERVICE_OPTIONS_BY_CATEGORY).map(([category, options]) => [category.toLowerCase(), options])) }
  vm.createContext(context)
  vm.runInContext(ts.transpileModule(snippets.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  for (const category of ['Resource Navigation', '  resource navigation  ']) {
    // Even a stale metadata option list must not hide or reorder the new choice.
    const options = Array.from(context.resolveServicesDependentOptions('cmps_service', ['Internal Referral'], { cmps_servicecategory: category }))
    assert.deepEqual(options, ['Program Information Only', 'Internal Referral', 'External Referral', 'General Resource Navigation', 'General Service Coordination', 'Other'])
  }
  for (const category of Object.keys(api.SERVICE_OPTIONS_BY_CATEGORY).filter((category) => category !== 'Resource Navigation')) {
    assert.equal(context.resolveServicesDependentOptions('cmps_service', api.SERVICE_OPTIONS, { cmps_servicecategory: category }).includes('Program Information Only'), false)
  }
})

test('adding Program Information Only preserves every existing mapped Service choice value', async () => {
  const service = loadService()
  for (const [index, label] of Array.from(service.api.SERVICE_OPTIONS).entries()) {
    if (label === 'Other' || label === 'Program Information Only') continue
    await service.api.updateServicesResponse(rowId, { cmps_service: label })
    assert.equal(service.payloads.at(-1).cmps_service, 125570000 + index + (index >= 6 ? 1 : 0), label)
  }
})

test('REACH Center enrollment requires Minutes, Meeting Mode and Helpful on new and edited Services; other program rules stay unchanged', () => {
  const api = loadService().api
  const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  const tree = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const names = new Set(['normalize', 'normalizeGuidText', 'startsWithReachCenter', 'isReachCenterProgramEnrollment', 'isServicesFieldVisible', 'getServicesFieldLabel', 'getActiveRequiredFields', 'getRequiredServicesMessage'])
  const snippets = tree.statements.filter((node) => ts.isVariableStatement(node) && node.declarationList.declarations.some((declaration) => declaration.name.getText(tree) === 'VOCA_DIRECT_CATEGORY_TO_FIELD')).map((node) => node.getText(tree))
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && names.has(node.name?.text)) snippets.push(node.getText(tree))
    ts.forEachChild(node, visit)
  }
  visit(tree)
  const reachId = '22222222-2222-2222-2222-222222222222', otherId = '33333333-3333-3333-3333-333333333333'
  const context = { SERVICES_FIELD_DEFINITIONS: api.SERVICES_FIELD_DEFINITIONS, programEnrollmentsForClient: [{ id: reachId, program: 'REACH Center' }, { id: otherId, program: 'Autumn House' }] }
  vm.createContext(context)
  vm.runInContext(ts.transpileModule(snippets.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  const values = { cmps_programenrollment: reachId, cmps_dateofservice: '2026-10-09', cmps_time: '00:00', cmps_servicecategory: 'Intake & Discharge', cmps_service: 'Intake', cmps_funder: 'Other', cmps_minutes: '15', cmps_meetingmode: 'In person', cmps_wasinformationservicereceivedhelpful: 'Yes' }
  for (const existingId of ['', rowId]) {
    const session = { kind: 'services', rowId: existingId, values }
    const required = context.getActiveRequiredFields(session)
    assert.equal(required.get('cmps_minutes'), 'Minutes'); assert.equal(required.get('cmps_meetingmode'), 'Meeting Mode')
    assert.equal(required.get('cmps_wasinformationservicereceivedhelpful'), 'Was Information/Service Received Helpful?')
    assert.equal(context.isServicesFieldVisible('cmps_wasinformationservicereceivedhelpful', values, context.programEnrollmentsForClient), true)
    assert.equal(context.getRequiredServicesMessage(session), '')
    for (const [field, label] of [['cmps_minutes', 'Minutes'], ['cmps_meetingmode', 'Meeting Mode'], ['cmps_wasinformationservicereceivedhelpful', 'Was Information/Service Received Helpful?']]) {
      for (const missing of ['', '   ', undefined]) assert.ok(context.getRequiredServicesMessage({ ...session, values: { ...values, [field]: missing } }).includes(label))
    }
    assert.equal(context.getRequiredServicesMessage({ ...session, values: { ...values, cmps_minutes: '0' } }), '')
    assert.equal(context.getRequiredServicesMessage({ ...session, values: { ...values, cmps_wasinformationservicereceivedhelpful: 'No' } }), '', 'No is a valid required answer')
    assert.equal(context.getRequiredServicesMessage({ ...session, values: { ...values, cmps_programenrollment: `{${reachId.toUpperCase()}}` } }), '')
    const other = { ...session, values: { ...values, cmps_programenrollment: otherId, cmps_servicesite: 'REACH Center', cmps_meetingmode: '' } }
    assert.equal(context.getActiveRequiredFields(other).has('cmps_meetingmode'), false)
    assert.equal(context.getActiveRequiredFields(other).has('cmps_minutes'), true)
    assert.equal(context.getActiveRequiredFields(other).has('cmps_wasinformationservicereceivedhelpful'), false)
    assert.equal(context.isServicesFieldVisible('cmps_wasinformationservicereceivedhelpful', other.values, context.programEnrollmentsForClient), false, 'A REACH service site must not override a different linked program')
    assert.equal(context.getRequiredServicesMessage(other), '')
    assert.equal(context.getActiveRequiredFields({ ...other, values: { ...other.values, cmps_programenrollment: '' } }).has('cmps_meetingmode'), false)
    for (const selected of ['', 'unresolved-enrollment']) assert.equal(context.isServicesFieldVisible('cmps_wasinformationservicereceivedhelpful', { ...values, cmps_programenrollment: selected }, context.programEnrollmentsForClient), false)
    const both = context.getRequiredServicesMessage({ ...session, values: { ...values, cmps_minutes: '', cmps_meetingmode: '' } })
    assert.ok(both.includes('Minutes')); assert.ok(both.includes('Meeting Mode'))
  }
  const start = source.indexOf("if (session.kind === 'services') {", source.indexOf('async function saveActiveForm'))
  const save = source.slice(start, source.indexOf("if (session.kind === 'bed-enrollment')", start))
  assert.ok(save.indexOf('getRequiredServicesMessage(') < save.indexOf('await updateServicesResponse('))
  assert.ok(save.indexOf('getRequiredServicesMessage(') < save.indexOf('await createServicesResponse('))
})

test('Helpful uses Yes/No radio buttons and preserves the exact backend column and values through create/edit/reload', async () => {
  const h = loadService(), helpful = 'cmps_wasinformationservicereceivedhelpful'
  const definition = h.api.SERVICES_FIELD_DEFINITIONS.find((field) => field.field === helpful)
  assert.equal(definition.input, 'radio')
  assert.equal(definition.required, true)
  assert.deepEqual(Array.from(definition.options), ['Yes', 'No'])
  for (const [index, label] of definition.options.entries()) {
    await h.api.createServicesResponse({ cmps_recordid: 'SV-001', [helpful]: label })
    assert.equal(Number(h.payloads.at(-1)[helpful]), 125570000 + index)
    assert.equal((await h.api.loadServicesDetailRecord(rowId)).values[helpful], label)
    await h.api.updateServicesResponse(rowId, { [helpful]: label })
    assert.equal(Number(h.payloads.at(-1)[helpful]), 125570000 + index)
    assert.equal((await h.api.loadServicesDetailRecord(rowId)).values[helpful], label)
  }
  const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  const tree = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const radioDefinition = tree.statements.find((node) => ts.isVariableStatement(node) && node.declarationList.declarations.some((entry) => entry.name.getText(tree) === 'SERVICES_RADIO_FIELD_NAMES'))
  assert.ok(radioDefinition.getText(tree).includes(helpful), 'Configured picklist type must not replace the required radio buttons')
})

function loadService(filename = './services.ts') {
  const source = readFileSync(new URL(filename, import.meta.url), 'utf8').replaceAll('import.meta.env', '({})')
  const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const service = { exports: {} }
  const payloads = []
  let saved = {}
  vm.runInNewContext(javascript, {
    module: service,
    exports: service.exports,
    Headers,
    URL, URLSearchParams,
    window: { location: { hostname: 'localhost' } },
    fetch: async (_url, init) => {
      if (init.body) {
        saved = JSON.parse(init.body)
        payloads.push(saved)
      }
      return { ok: true, json: async () => ({ ...saved, cmps_servicesid: rowId }) }
    },
    require(name) {
      if (name === './serviceSiteLabels') return loadService('./serviceSiteLabels.ts').api
      if (name === './dataverseRecordPages' || name === './dataverseContinuation') return loadService(`${name}.ts`).api
      if (name === '../../power.config.json') return JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'))
      if (name === '@microsoft/power-apps/data') return { getClient: () => ({ executeAsync: async () => { throw new Error('Unexpected runtime call') } }) }
      if (name.includes('dataSourcesInfo')) return { dataSourcesInfo: {} }
      if (name === './auth') return { getAuthToken: () => 'test-token', ensureAuthToken: async () => 'test-token' }
      if (name === './archive') return { excludeArchived: (filter = '') => filter || 'cmps_isarchived ne 125570000' }
      throw new Error(`Unexpected dependency: ${name}`)
    },
  }, { filename: 'services.ts' })
  return { api: service.exports, payloads }
}

test('housing dropdown saves and reloads exactly the two new mappings', async () => {
  const service = loadService()
  const options = ['Transitional housing', 'Relocation assistance']
  assert.deepEqual(Array.from(service.api.SHELTER_HOUSING_SERVICES_OPTIONS), options)
  for (let index = 0; index < options.length; index += 1) {
    const created = await service.api.createServicesResponse({ cmps_recordid: 'SV-001', [housingField]: options[index] })
    assert.equal(created.id, rowId)
    assert.equal(service.payloads.at(-1)[housingField], 125570000 + index)
    const detail = await service.api.loadServicesDetailRecord(rowId)
    assert.equal(detail.values[housingField], options[index])
  }
})

test('all ten remaining justice dropdown mappings are unchanged on save and reload', async () => {
  const service = loadService()
  const options = [
    'Notification of Criminal Justice Events',
    'Victim Impact Statement Assistance',
    'Assistance with Restitution',
    'Civil Legal Assistance in Obtaining Protection or Restraining Order',
    'Civil Legal Assistance with Family Law Issues',
    'Other Emergency Justice-Related Assistance',
    'Immigration Assistance',
    'Prosecution Interview Advocacy/Accompaniment',
    'Law Enforcement Interview Advocacy/Accompaniment',
    'Criminal Advocacy/Accompaniment',
  ]
  assert.deepEqual(Array.from(service.api.CRIMINAL_CIVIL_JUSTICE_ASSISTANCE_OPTIONS), options)
  for (let index = 0; index < options.length; index += 1) {
    await service.api.updateServicesResponse(rowId, { [justiceField]: options[index] })
    assert.equal(service.payloads.at(-1)[justiceField], 125570000 + index)
    const detail = await service.api.loadServicesDetailRecord(rowId)
    assert.equal(detail.values[justiceField], options[index])
  }
})

test('removed service labels are not selectable or accepted as new selections', async () => {
  const service = loadService()
  const housing = service.api.SERVICES_FIELD_DEF_BY_NAME.get(housingField)
  const justice = service.api.SERVICES_FIELD_DEF_BY_NAME.get(justiceField)
  assert.equal(housing.options.includes('Emergency shelter or safe house'), false)
  assert.equal(justice.options.includes('Other Legal Advice and/or Counsel'), false)
  await assert.rejects(service.api.updateServicesResponse(rowId, { [housingField]: 'Emergency shelter or safe house' }), /Invalid choice value/)
  await assert.rejects(service.api.updateServicesResponse(rowId, { [justiceField]: 'Other Legal Advice and/or Counsel' }), /Invalid choice value/)
  assert.equal(service.payloads.length, 0)
})
