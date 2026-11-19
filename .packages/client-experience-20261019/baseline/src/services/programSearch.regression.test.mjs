import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

test('REACH Center roles receive only their assigned REACH SV search and view permissions', async () => {
  const h = harness(), f = fixtures(h)
  const program = { id: 'sv', title: 'REACH Center', displayTitle: 'REACH SV', roleMatchers: ['reach center'] }
  for (const role of ['REACH Center Manager', 'REACH Center', 'REACH Center Staff', 'REACH Center Supervisor', 'REACH Center (Both Staff and Supervisor)']) {
    const c = context([permission('Client Profile'), permission('Services', { search: false }), permission('Event', { view: false }), permission('Abuser Profile')], role, program)
    c.profiles.push({ roleName: 'Autumn House Manager', entries: [permission('Services', { ignoreProgramAssignment: true })] })
    const grants = h.catalog.programSearchGrants(c.profiles, program)
    assert.deepEqual(Array.from(grants, (grant) => grant.table.key), ['client-profile', 'event'])
    assert.equal(grants.find((grant) => grant.table.key === 'event').view, false)
    assert.equal(grants[0].ignoreProgramAssignment, false)
    const plan = await h.api.inspectProgramSearch(c, 'client-profile', [], f.gateway, signal())
    assert.match(plan.scope, /value="987008"/)
    assert.doesNotMatch(plan.scope, /value="987000"/)
  }
  for (const role of ['REACH', 'Center', 'SV Staff', 'SV Supervisor', 'DV & SV Services Director', 'REACH SV Manager', 'REACH Centerpiece Manager']) {
    assert.equal(h.catalog.programSearchGrants(context([permission('Client Profile')], role, program).profiles, program).length, 0)
  }
})


test('full client names match all name parts across readable name columns on the same profile', async () => {
  const h = harness(), f = fixtures(h), c = context([permission('Client Profile')])
  f.metadata.get('client-profile').Attributes.push({ LogicalName: 'cmps_lastname', AttributeType: 'String' }, { LogicalName: 'cmps_middlename', AttributeType: 'String' })
  const plan = await h.api.inspectProgramSearch(c, 'client-profile', [], f.gateway, signal())
  for (const [query, parts] of [['John Smith', ['John', 'Smith']], ['  John   Michael\tSmith  ', ['John', 'Michael', 'Smith']], ["Anne-Marie O'Neil", ['Anne-Marie', 'O&apos;Neil']], ['John Smith Jones', ['John', 'Smith', 'Jones']]]) {
    await h.api.searchProgramTable(c, plan, query, f.gateway, signal())
    const xml = f.queries.at(-1).xml
    const fragment = xml.match(/<filter type="and">((?:<filter type="or">(?:<condition attribute="cmps_(?:name|middlename|lastname)" operator="like" value="[^"]*"\/>)+<\/filter>)+)<\/filter>/)?.[1]
    assert.ok(fragment, 'every name part must be required by a single AND group')
    assert.equal((fragment.match(/<filter type="or">/g) || []).length, parts.length)
    for (const part of parts) for (const field of ['name', 'middlename', 'lastname']) assert.ok(fragment.includes(`attribute="cmps_${field}" operator="like" value="%${part}%"`))
    assert.doesNotMatch(fragment, /cmps_notes|cmps_recordid/)
    assert.match(xml, /125570000/); assert.match(xml, /987000/)
  }
  await h.api.searchProgramTable(c, plan, 'John', f.gateway, signal())
  assert.doesNotMatch(f.queries.at(-1).xml, /<filter type="and"><filter type="or"><condition attribute="cmps_name" operator="like"/)
  f.metadata.get('client-profile').Attributes.find((field) => field.LogicalName === 'cmps_lastname').IsValidForRead = false
  await h.api.searchProgramTable(c, plan, 'John Smith', f.gateway, signal())
  assert.doesNotMatch(f.queries.at(-1).xml, /cmps_lastname/)
})

test('full-name matching escapes wildcard characters and does not change other table text searches', async () => {
  const h = harness(), f = fixtures(h)
  f.metadata.get('client-profile').Attributes.push({ LogicalName: 'cmps_lastname', AttributeType: 'String' })
  const c = context([permission('Client Profile')]), plan = await h.api.inspectProgramSearch(c, 'client-profile', [], f.gateway, signal())
  await h.api.searchProgramTable(c, plan, 'Jo%n S_mi[th&', f.gateway, signal())
  assert.ok(f.queries.at(-1).xml.includes('value="%Jo[%]n%"'))
  assert.ok(f.queries.at(-1).xml.includes('value="%S[_]mi[[]th&amp;%"'))
  const events = context([permission('Event')]), eventPlan = await h.api.inspectProgramSearch(events, 'event', [], f.gateway, signal())
  await h.api.searchProgramTable(events, eventPlan, 'John Smith', f.gateway, signal())
  assert.doesNotMatch(f.queries.at(-1).xml, /value="%John%"|value="%Smith%"/)
  assert.match(f.queries.at(-1).xml, /value="%John Smith%"/)
})


test('record ID prefixes and GUIDs use narrow queries without dropping archive or program scope', async () => {
  const h = harness(), f = fixtures(h), c = context([permission('Services')])
  const plan = await h.api.inspectProgramSearch(c, 'services', [], f.gateway, signal())
  await h.api.searchProgramTable(c, plan, 'SV-0479375', f.gateway, signal())
  assert.match(f.queries.at(-1).xml, /attribute="cmps_recordid" operator="begins-with" value="SV-0479375"/)
  assert.doesNotMatch(f.queries.at(-1).xml, /operator="like"/)
  assert.match(f.queries.at(-1).xml, /125570000/); assert.match(f.queries.at(-1).xml, /987000/)
  await h.api.searchProgramTable(c, plan, id(1), f.gateway, signal())
  assert.match(f.queries.at(-1).xml, /attribute="cmps_servicesid" operator="eq"/)
  assert.doesNotMatch(f.queries.at(-1).xml, /operator="like"/)
  await h.api.searchProgramTable(c, plan, 'support', f.gateway, signal())
  assert.match(f.queries.at(-1).xml, /operator="like" value="%support%"/)
})

test('gateway caches structural metadata only; record queries and abort checks remain live', async () => {
  const seed = harness(), f = fixtures(seed)
  const h = harness((call) => ({ success: true, data: call.parameters.entityName === 'EntityDefinitions'
    ? { value: [f.metadata.get('event')] }
    : call.parameters.entityName.includes('PicklistAttributeMetadata')
      ? { OptionSet: { Options: [{ Value: 123, Label: { UserLocalizedLabel: { Label: 'Autumn House' } } }] } }
      : { value: [] } }))
  const gateway = h.api.createProgramSearchGateway()
  const meta = await gateway.metadata('event', signal())
  await gateway.metadata('event', signal())
  await gateway.choices(meta, 'cmps_program', signal())
  await gateway.choices(meta, 'cmps_program', signal())
  assert.equal(h.calls.length, 2)
  await gateway.query(meta, '<fetch />', signal()); await gateway.query(meta, '<fetch />', signal())
  assert.equal(h.calls.length, 4)
  const controller = new AbortController(); controller.abort()
  await assert.rejects(gateway.metadata('event', controller.signal), /abort/i)
  await assert.rejects(gateway.choices(meta, 'cmps_program', controller.signal), /abort/i)
  assert.equal(h.calls.length, 4)
})


const schemaSource = readFileSync(new URL('../../.power/schemas/appschemas/dataSourcesInfo.ts', import.meta.url), 'utf8')
const schema = JSON.parse(schemaSource.slice(schemaSource.indexOf('{'), schemaSource.lastIndexOf('}') + 1))
const id = (value) => `11111111-1111-1111-1111-${value.toString(16).padStart(12, '0')}`
const hub = { id: 'autumn-house', title: 'Autumn House', roleMatchers: ['autumn house'] }
const permission = (formName, flags = {}) => ({ formName, permissions: { view: true, search: true, create: false, edit: false, ignoreProgramAssignment: false, ...flags } })
const context = (entries, roleName = 'Autumn House Manager', program = hub) => ({ hub: program, profiles: [{ roleName, entries }] })
const signal = () => new AbortController().signal

test('program advanced filters preserve archive/program joins and require a fresh cursor when filters change', async () => {
  const h = harness(), f = fixtures(h), c = context([permission('Services')])
  f.metadata.get('services').Attributes.push({ LogicalName: 'cmps_dateofservice', AttributeType: 'DateTime' }, { LogicalName: 'cmps_servicecategory', AttributeType: 'Picklist' }, { LogicalName: 'cmps_service', AttributeType: 'Picklist' }, { LogicalName: 'cmps_minutes', AttributeType: 'Decimal' })
  const plan = await h.api.inspectProgramSearch(c, 'services', ['cmps_dateofservice', 'cmps_servicecategory', 'cmps_service', 'cmps_minutes'].map((field) => ({ field, label: field })), f.gateway, signal())
  const filters = [{ field: 'cmps_dateofservice', operator: 'eq', value: '2026-10-09' }, { field: 'cmps_servicecategory', operator: 'eq', value: '125570000' }, { field: 'cmps_service', operator: 'eq', value: '125570071' }]
  f.gateway.query = async (meta, xml) => { f.queries.push({ meta, xml }); return { value: [{ cmps_servicesid: id(1) }], '@Microsoft.Dynamics.CRM.morerecords': true, '@Microsoft.Dynamics.CRM.fetchxmlpagingcookie': `<cookie pagingcookie="${encodeURIComponent(encodeURIComponent('<cookie page="1"><row last="1"/></cookie>'))}"/>` } }
  const page = await h.api.searchProgramTable(c, plan, 'intake', f.gateway, signal(), undefined, filters)
  const xml = f.queries.at(-1).xml
  assert.match(xml, /cmps_isarchived" operator="ne" value="125570000"/); assert.match(xml, /value="987000"/); assert.match(xml, /link-entity name="cmps_programenrollment1"/)
  assert.match(xml, /cmps_dateofservice" operator="ge" value="2026-10-09T00:00:00.000Z"/); assert.match(xml, /cmps_dateofservice" operator="lt" value="2026-10-10T00:00:00.000Z"/)
  assert.match(xml, /cmps_servicecategory" operator="eq" value="125570000"/); assert.match(xml, /cmps_service" operator="eq" value="125570071"/)
  await assert.rejects(h.api.searchProgramTable(c, plan, '', f.gateway, signal(), undefined, [{ field: 'cmps_minutes', operator: 'ge', value: '15' }]), /unavailable/)
  await assert.rejects(h.api.searchProgramTable(c, plan, 'intake', f.gateway, signal(), page.next, filters.slice(1)), /does not match/)
  await assert.rejects(h.api.searchProgramTable(c, plan, '', f.gateway, signal(), undefined, [{ field: 'cmps_notes', operator: 'contains', value: 'x' }]), /unavailable/)
  c.profiles[0].entries[0].permissions.search = false
  await assert.rejects(h.api.searchProgramTable(c, plan, '', f.gateway, signal(), undefined, filters), /does not allow searching/)
})

test('choice gateway uses multi-select, state and status metadata types instead of a single-choice cast', async () => {
  const h = harness((call) => ({ success: true, data: { OptionSet: { Options: [{ Value: 125570008, Label: { UserLocalizedLabel: { Label: 'Advocacy Provided' } } }] } } }))
  const gateway = h.api.createProgramSearchGateway(), meta = { LogicalName: 'cmps_helpline', Attributes: [{ LogicalName: 'cmps_calloutcome1', AttributeType: 'Virtual', AttributeTypeName: { Value: 'MultiSelectPicklistType' } }, { LogicalName: 'statecode', AttributeType: 'State' }, { LogicalName: 'statuscode', AttributeType: 'Status' }] }
  for (const [field, type] of [['cmps_calloutcome1', 'MultiSelectPicklist'], ['statecode', 'State'], ['statuscode', 'Status']]) {
    const options = await gateway.choices(meta, field, signal())
    assert.equal(options[0].value, 125570008); assert.ok(h.calls.at(-1).parameters.entityName.endsWith(`Microsoft.Dynamics.CRM.${type}AttributeMetadata`))
  }
})

test('unsupported forms retain normal search but reject advanced filters before reading records', async () => {
  const h = harness(), f = fixtures(h), c = context([permission('Event')])
  const plan = await h.api.inspectProgramSearch(c, 'event', [{ field: 'cmps_recordid', label: 'Record ID' }], f.gateway, signal())
  await assert.rejects(h.api.searchProgramTable(c, plan, '', f.gateway, signal(), undefined, [{ field: 'cmps_recordid', operator: 'contains', value: 'EV-' }]), /unavailable/)
  assert.equal(f.queries.length, 0)
  await h.api.searchProgramTable(c, plan, 'event text', f.gateway, signal())
  assert.equal(f.queries.length, 1); assert.match(f.queries[0].xml, /value="%event text%"/)
})

function harness(handler = () => { throw new Error('Unexpected external request') }, local = false) {
  const cache = new Map(), calls = []
  function load(file) {
    if (cache.has(file)) return cache.get(file)
    const source = readFileSync(new URL(file, import.meta.url), 'utf8').replaceAll('import.meta.env', '({})')
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    const module = { exports: {} }; cache.set(file, module.exports)
    vm.runInNewContext(js, {
      module, exports: module.exports, URL, URLSearchParams, Headers,
      window: { location: { hostname: local ? 'localhost' : 'powerapps.example' } },
      fetch: async (url, init) => { calls.push({ url, init }); return handler({ url, init }) },
      require(name) {
        if (name === '@microsoft/power-apps/data') return { getClient: () => ({ executeAsync: async ({ connectorOperation: operation }) => {
          const api = schema.commondataserviceforapps.apis[operation.operationName]
          assert.ok(api, `Unsupported operation: ${operation.operationName}`)
          for (const parameter of api.parameters.filter((entry) => entry.required && entry.name !== 'connectionId')) assert.notEqual(operation.parameters[parameter.name], undefined, `Missing parameter: ${parameter.name}`)
          calls.push(operation); return handler(operation)
        } }) }
        if (name.includes('dataSourcesInfo')) return { dataSourcesInfo: schema }
        if (name === './auth') return { getAuthToken: () => 'test-token', ensureAuthToken: async () => 'test-token' }
        if (name === './funderContractIdentity') return { funderContractIdentity: {} }
        if (name.startsWith('./')) return load(`${name}.ts`)
        throw new Error(`Unexpected dependency: ${name}`)
      },
    }, { filename: file })
    return module.exports
  }
  return { catalog: load('./programSearchCatalog.ts'), api: load('./programTableSearch.ts'), tables: load('./archive.ts').ARCHIVE_TABLES, calls }
}

function fixtures(h) {
  const metadata = new Map(h.tables.map((table) => [table.key, {
    LogicalName: table.key === 'funder-contract' ? 'cmps_fundercontract' : table.primaryIdField.replace(/id$/, ''),
    EntitySetName: table.tableAlias, PrimaryIdAttribute: table.primaryIdField || 'cmps_actualcontractid', PrimaryNameAttribute: 'cmps_name',
    Attributes: [
      { LogicalName: table.primaryIdField || 'cmps_actualcontractid', AttributeType: 'Uniqueidentifier' },
      { LogicalName: 'cmps_recordid', AttributeType: 'String' }, { LogicalName: 'cmps_name', AttributeType: 'String' },
      { LogicalName: 'cmps_notes', AttributeType: 'Memo' }, { LogicalName: 'modifiedon', AttributeType: 'DateTime' },
      { LogicalName: 'cmps_isarchived', AttributeType: 'Picklist' },
    ], ManyToOneRelationships: [],
  }]))
  const choices = [{ value: 987000, label: 'Autumn House' }, { value: 987004, label: 'CAAFA Shelter' }, { value: 987007, label: 'DV Outreach' }, { value: 987008, label: 'REACH Center' }]
  function link(key, field, parent) {
    metadata.get(key).Attributes.push({ LogicalName: field, AttributeType: 'Lookup' })
    metadata.get(key).ManyToOneRelationships.push({ ReferencingAttribute: field, ReferencedEntity: metadata.get(parent).LogicalName })
  }
  function program(key, type = 'Picklist') { metadata.get(key).Attributes.push({ LogicalName: 'cmps_program', AttributeType: type }) }
  program('program-enrollment'); link('program-enrollment', 'cmps_clientid', 'client-profile')
  program('bed'); program('helpline'); program('event'); program('funder')
  link('voca-form', 'cmps_peid', 'program-enrollment'); link('voca-form', 'cmps_cpid', 'client-profile')
  link('services', 'cmps_programenrollment', 'program-enrollment'); link('services', 'cmps_cpid', 'client-profile')
  link('household-history', 'cmps_clientid', 'client-profile'); link('household-history', 'cmps_householdid', 'household')
  link('funder-contract', 'cmps_funder', 'funder'); link('funder-transaction', 'cmps_activecontract', 'funder-contract')
  for (const key of ['release-of-information', 'acknowledgement-consent', 'pet-companion-intake', 'compass-file']) link(key, 'cmps_cpid', 'client-profile')
  const queries = []
  const gateway = { metadata: async (key) => metadata.get(key), choices: async () => choices, query: async (meta, xml) => { queries.push({ meta, xml }); return { value: [] } } }
  return { metadata, choices, queries, gateway, link, program }
}

test('each implemented table maps exactly; undeveloped legacy forms are never mapped', () => {
  const h = harness()
  for (const table of h.tables) assert.equal(h.catalog.resolveProgramSearchTable(table.label)?.key, table.adminOnly ? undefined : table.key)
  for (const name of ['Abuser Profile', 'Acknowledgement of Receipt of Privacy Notice', 'Acknowledgement of Receipt of Important Forms', "A New Leaf's Program Permission Release Form", 'Client Profile extra']) assert.equal(h.catalog.resolveProgramSearchTable(name), undefined)
  for (const [name, key] of [['A New Leaf Limited Release of Information', 'release-of-information'], ['Acknowledgement & Consent Form', 'acknowledgement-consent'], ['Employment and Benefits', 'employment-benefits'], ['Terms and Conditions of Service Animals', 'service-animal-terms'], ['Contract', 'funder-contract'], ['VOCA', 'voca-form']]) assert.equal(h.catalog.resolveProgramSearchTable(name)?.key, key)
})

test('only assigned roles for the selected program with explicit Search permission grant tables', () => {
  const h = harness(), c = context([permission('Services'), permission('Client Profile', { search: false }), permission('Event', { view: false, search: false, create: true, edit: true }), permission('Abuser Profile')])
  c.profiles.push({ roleName: 'Faith House Manager', entries: [permission('Event')] })
  assert.deepEqual(Array.from(h.catalog.programSearchGrants(c.profiles, c.hub), (grant) => grant.table.key), ['services'])
  assert.equal(h.catalog.programSearchGrants([], hub).length, 0)
  assert.equal(h.catalog.programSearchGrants(context([permission('Event', { search: false })], 'IT Admin').profiles, hub).length, 0)
  assert.equal(h.catalog.programSearchGrants(context([permission('Event')], 'IT Admin').profiles, hub)[0].table.key, 'event')
})

test('aliases deduplicate; View is separate; Ignore Program must belong to a Search grant', () => {
  const h = harness(), c = context([permission('VOCA', { view: false }), permission('VOCA Form', { search: false, ignoreProgramAssignment: true })])
  let grants = h.catalog.programSearchGrants(c.profiles, hub)
  assert.equal(grants.length, 1); assert.equal(grants[0].view, true); assert.equal(grants[0].ignoreProgramAssignment, false)
  c.profiles[0].entries.push(permission('VOCA Form', { ignoreProgramAssignment: true }))
  grants = h.catalog.programSearchGrants(c.profiles, hub)
  assert.equal(grants.length, 1); assert.equal(grants[0].ignoreProgramAssignment, true)
})

test('direct program choices use actual metadata values; active filter and query are server-side', async () => {
  const h = harness(), f = fixtures(h), c = context([permission('Event')])
  const plan = await h.api.inspectProgramSearch(c, 'event', [], f.gateway, signal())
  assert.match(plan.scope, /value="987000"/); assert.doesNotMatch(plan.scope, /125570001|987004/); assert.equal(plan.links, '')
  await h.api.searchProgramTable(c, plan, '<test&"_%[', f.gateway, signal())
  const xml = f.queries[0].xml
  assert.match(xml, /count="50" page="1"/); assert.match(xml, /cmps_isarchived" operator="ne" value="125570000"/)
  assert.match(xml, /&lt;test&amp;&quot;\[_\]\[%\]\[\[\]/)
  assert.match(xml, /cmps_notes" operator="like"/); assert.match(xml, /distinct="true"/)
})

test('clients, consent and services use verified program relationships, not whole-table browser filtering', async () => {
  const h = harness(), f = fixtures(h)
  f.link('program-enrollment', 'cmps_unrelatedclient', 'client-profile')
  f.link('services', 'cmps_unrelatedenrollment', 'program-enrollment')
  for (const [key, form] of [['client-profile', 'Client Profile'], ['release-of-information', 'Release of Information'], ['acknowledgement-consent', 'Acknowledgement & Consent Form'], ['services', 'Services']]) {
    const plan = await h.api.inspectProgramSearch(context([permission(form)]), key, [], f.gateway, signal())
    assert.match(plan.links, /name="cmps_programenrollment1"/)
    assert.match(plan.scope, /entityname="p\d+" attribute="cmps_program"/)
    assert.doesNotMatch(plan.links, /cmps_unrelatedclient|cmps_unrelatedenrollment/)
    if (key === 'services') assert.match(plan.scope, /attribute="cmps_programenrollment" operator="null"/)
  }
})

test('VOCA client-only fallback is scoped to the client program only when its enrollment link is blank', async () => {
  const h = harness(), f = fixtures(h)
  const plan = await h.api.inspectProgramSearch(context([permission('VOCA')]), 'voca-form', [{ field: 'cmps_recordid', label: 'Record ID' }], f.gateway, signal())
  assert.match(plan.links, /to="cmps_peid"/); assert.match(plan.links, /to="cmps_cpid"/)
  assert.match(plan.scope, /attribute="cmps_peid" operator="null"/)
  assert.equal(plan.fields.some((field) => field.field === 'cmps_cpid'), false)
  assert.match(plan.scope, /entityname="p\d+" attribute="cmps_isarchived"/)
})

test('household and financial tables resolve through metadata-verified history and funder links', async () => {
  const h = harness(), f = fixtures(h)
  const household = await h.api.inspectProgramSearch(context([permission('Household')]), 'household', [], f.gateway, signal())
  assert.match(household.links, /from="cmps_householdid" to="cmps_householdid"/)
  assert.match(household.links, /name="cmps_householdhistory"/); assert.match(household.scope, /987000/)
  const contract = await h.api.inspectProgramSearch(context([permission('Contract')]), 'funder-contract', [], f.gateway, signal())
  assert.equal(contract.metadata.PrimaryIdAttribute, 'cmps_actualcontractid'); assert.match(contract.links, /to="cmps_funder"/)
  const transaction = await h.api.inspectProgramSearch(context([permission('Funder Transactions')]), 'funder-transaction', [], f.gateway, signal())
  assert.match(transaction.links, /to="cmps_activecontract"/); assert.match(transaction.links, /to="cmps_funder"/)
})

test('unknown program mappings or absent relationships fail closed; Ignore Program explicitly permits unscoped search', async () => {
  const h = harness(), f = fixtures(h)
  await assert.rejects(() => h.api.inspectProgramSearch(context([permission('Animal Agreement')]), 'animal-agreement', [], f.gateway, signal()), /No verified program association/)
  f.choices.splice(0)
  await assert.rejects(() => h.api.inspectProgramSearch(context([permission('Event')]), 'event', [], f.gateway, signal()), /No verified program association/)
  const plan = await h.api.inspectProgramSearch(context([permission('Animal Agreement', { ignoreProgramAssignment: true })]), 'animal-agreement', [], f.gateway, signal())
  assert.equal(plan.links, ''); assert.equal(plan.scope, '')
})

test('DV Outreach and REACH SV resolve their existing Dataverse program labels', async () => {
  const h = harness(), f = fixtures(h)
  f.choices.push({ value: 987009, label: 'SV Helpline' })
  for (const [program, role, value] of [[{ id: 'dv-outreach', title: 'DV Outreach', roleMatchers: ['dv outreach'] }, 'DV Outreach Staff', 987007], [{ id: 'sv', title: 'REACH Center', displayTitle: 'REACH SV', roleMatchers: ['reach center'] }, 'REACH Center', 987008]]) {
    const plan = await h.api.inspectProgramSearch(context([permission('Event')], role, program), 'event', [], f.gateway, signal())
    assert.match(plan.scope, new RegExp(`value="${value}"`))
    if (program.id === 'sv') assert.match(plan.scope, /value="987009"/)
  }
})

test('DV Outreach grants use renamed roles; old program data labels are compatible but never grant access', async () => {
  const h = harness(), f = fixtures(h)
  const program = { id: 'dv-outreach', title: 'DV Outreach', roleMatchers: ['dv outreach'] }
  const allowed = context([permission('Event')], 'DV Outreach Manager', program)
  assert.equal(h.catalog.programSearchGrants(allowed.profiles, program).length, 1)
  assert.equal(h.catalog.programSearchGrants(context([permission('Event')], 'CAAFA Outreach Manager', program).profiles, program).length, 0)
  f.choices.find((choice) => choice.value === 987007).label = 'CAAFA Outreach'
  const plan = await h.api.inspectProgramSearch(allowed, 'event', [], f.gateway, signal())
  assert.match(plan.scope, /value="987007"/)
})

test('search and detail recheck role grants; changing program/query invalidates continuation cursors', async () => {
  const h = harness(), f = fixtures(h), c = context([permission('Event', { ignoreProgramAssignment: true })])
  const plan = await h.api.inspectProgramSearch(c, 'event', [], f.gateway, signal())
  c.profiles[0].entries[0].permissions.view = false
  await assert.rejects(() => h.api.loadProgramSearchRecord(c, plan, id(1), f.gateway, signal()), /does not allow viewing/)
  c.profiles[0].entries[0].permissions.search = false
  await assert.rejects(() => h.api.searchProgramTable(c, plan, '', f.gateway, signal()), /does not allow searching/)
  c.profiles[0].entries[0].permissions.search = true
  await assert.rejects(() => h.api.searchProgramTable(c, plan, 'changed', f.gateway, signal(), { page: 2, cookie: '<cookie></cookie>', fingerprint: 'stale' }), /does not match/)
  await assert.rejects(() => h.api.searchProgramTable({ ...c, hub: { ...hub, id: 'different' } }, plan, '', f.gateway, signal()), /program changed/)
})

test('paged search reads beyond 50,000 using escaped Dataverse cookies without a truncation cap', async () => {
  const h = harness(), f = fixtures(h), c = context([permission('Event', { ignoreProgramAssignment: true })])
  const plan = await h.api.inspectProgramSearch(c, 'event', [], f.gateway, signal())
  const total = 50003
  let calls = 0, cursor, read = 0
  f.gateway.query = async (meta, xml) => {
    const page = Number(xml.match(/page="(\d+)"/)[1]); assert.equal(page, ++calls)
    if (page > 1) assert.match(xml, /paging-cookie="&lt;cookie/)
    const offset = (page - 1) * 50
    const value = Array.from({ length: Math.min(50, total - offset) }, (_, index) => ({ [meta.PrimaryIdAttribute]: id(offset + index + 1), cmps_recordid: `EV-${offset + index + 1}` }))
    const cookie = `<cookie page="${page}"><cmps_eventid last="${id(offset + value.length)}" first="${id(offset + 1)}" /></cookie>`
    return offset + value.length === total ? { value } : { value, '@Microsoft.Dynamics.CRM.morerecords': true, '@Microsoft.Dynamics.CRM.fetchxmlpagingcookie': `<cookie pagenumber="${page + 1}" pagingcookie="${encodeURIComponent(encodeURIComponent(cookie))}" />` }
  }
  do { const page = await h.api.searchProgramTable(c, plan, '', f.gateway, signal(), cursor); read += page.rows.length; cursor = page.next } while (cursor)
  assert.equal(read, total); assert.equal(calls, 1001)
})

test('invalid or repeating continuation stops; a full final page without annotations is valid', async () => {
  const h = harness(), f = fixtures(h), c = context([permission('Event', { ignoreProgramAssignment: true })])
  const plan = await h.api.inspectProgramSearch(c, 'event', [], f.gateway, signal())
  f.gateway.query = async () => ({ value: [{ cmps_eventid: id(1) }], '@Microsoft.Dynamics.CRM.morerecords': true })
  await assert.rejects(() => h.api.searchProgramTable(c, plan, '', f.gateway, signal()), /invalid search paging cookie/)
  assert.throws(() => h.api.decodeProgramSearchCookie('<cookie pagingcookie="%XX" />'), /encoding/)
  assert.throws(() => h.api.decodeProgramSearchCookie(`<cookie pagingcookie="${encodeURIComponent(encodeURIComponent('<cookie><!DOCTYPE bad></cookie>'))}" />`), /contents/)
  const cookie = '<cookie page="1"></cookie>'
  f.gateway.query = async () => ({ value: [{ cmps_eventid: id(1) }], '@Microsoft.Dynamics.CRM.morerecords': true, '@Microsoft.Dynamics.CRM.fetchxmlpagingcookie': `<cookie pagingcookie="${encodeURIComponent(encodeURIComponent(cookie))}" />` })
  const first = await h.api.searchProgramTable(c, plan, '', f.gateway, signal())
  await assert.rejects(() => h.api.searchProgramTable(c, plan, '', f.gateway, signal(), first.next), /repeated/)
  f.gateway.query = async () => ({ value: Array.from({ length: 50 }, (_, index) => ({ cmps_eventid: id(index + 1) })) })
  const last = await h.api.searchProgramTable(c, plan, '', f.gateway, signal())
  assert.equal(last.rows.length, 50); assert.equal(last.next, null)
})

test('detail uses developed form fields only, formatted lookups/choices, active and program scope', async () => {
  const h = harness(), f = fixtures(h), c = context([permission('VOCA')])
  f.metadata.get('voca-form').Attributes.push({ LogicalName: 'cmps_file', AttributeType: 'File' }, { LogicalName: 'cmps_secret', AttributeType: 'String', IsValidForRead: false })
  const plan = await h.api.inspectProgramSearch(c, 'voca-form', [{ field: 'cmps_recordid', label: 'Record ID' }, { field: 'cmps_peid', label: 'Program Enrollment' }, { field: 'cmps_secret', label: 'Not Readable' }, { field: 'cmps_file', label: 'File' }], f.gateway, signal())
  f.gateway.query = async (_, xml) => {
    assert.match(xml, /987000/); assert.match(xml, /125570000/); assert.doesNotMatch(xml, /attribute name="cmps_(cpid|secret|file)"/)
    return { value: [{ cmps_vocaformid: id(1), cmps_recordid: 'VOCA-001', _cmps_peid_value: id(2), '_cmps_peid_value@OData.Community.Display.V1.FormattedValue': 'PE-042' }] }
  }
  const fields = await h.api.loadProgramSearchRecord(c, plan, id(1), f.gateway, signal())
  assert.equal(fields.length, 2); assert.equal(fields[1].value, 'PE-042')
  f.gateway.query = async () => ({ value: [{ cmps_vocaformid: id(1), cmps_isarchived: 125570000 }] })
  await assert.rejects(() => h.api.loadProgramSearchRecord(c, plan, id(1), f.gateway, signal()), /archived/)
})

for (const local of [true, false]) test(`${local ? 'local' : 'runtime'} gateway verifies metadata, choice values, and FetchXML with required connector parameters`, async () => {
  const seed = harness(), f = fixtures(seed)
  const h = harness((call) => {
    const entity = local ? new URL(call.url).pathname.split('/api/data/v9.2/')[1] : call.parameters.entityName
    const data = entity === 'EntityDefinitions' ? { value: [f.metadata.get('event')] } : entity.includes('PicklistAttributeMetadata') ? { OptionSet: { Options: [{ Value: 123, Label: { UserLocalizedLabel: { Label: 'Autumn House' } } }] } } : { value: [{ cmps_eventid: id(1), cmps_recordid: 'EV-001' }] }
    return local ? { ok: true, json: async () => data } : { success: true, data }
  }, local)
  const gateway = h.api.createProgramSearchGateway(), meta = await gateway.metadata('event', signal())
  assert.equal((await gateway.choices(meta, 'cmps_program', signal()))[0].value, 123)
  await gateway.query(meta, '<fetch />', signal())
  assert.equal(h.calls.length, 3)
  for (const call of h.calls) {
    if (local) { assert.equal(call.init.headers.Authorization, 'Bearer test-token'); assert.equal(call.init.headers.Prefer, 'odata.include-annotations="*"'); assert.equal(call.init.method, undefined) }
    else { assert.equal(call.operationName, 'ListRecordsWithOrganization'); assert.equal(call.parameters.prefer, 'odata.include-annotations="*"') }
  }
  const query = local ? new URL(h.calls[2].url).searchParams.get('fetchXml') : h.calls[2].parameters.fetchXml
  assert.equal(query, '<fetch />')
  await assert.rejects(() => gateway.metadata('unknown-table', signal()), /not been implemented/)
})

test('App uses assigned role profiles for Programs Search, retaining the existing client profile workflow', () => {
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  const panel = readFileSync(new URL('./ProgramTableSearchPanel.tsx', import.meta.url), 'utf8')
  assert.match(app, /selectedAppNav === 'programs' \? \(\s*<ProgramTableSearchPanel/)
  assert.match(app, /profiles=\{roleProfiles\}/); assert.match(app, /rolesLoading=\{roleProfilesLoading\}/)
  assert.match(app, /onOpenClientProfile=\{async \(row\) => !!await openClientProfileDetail\(row.id, row.recordId\)/)
  assert.match(app, /renderArchiveButton=\{renderArchiveRecordButton\}/)
  assert.match(app, /function renderArchiveRecordButton[\s\S]*?if \(!canAccessRoleAdmin \|\| !rowId\) return null/)
  assert.match(panel, /renderArchiveButton\(permission.table.tableAlias, row.id, row.recordId\)/)
  assert.match(app, /async function runHubSearch\(\) \{\s*if \(!selectedHub \|\| selectedAppNav === 'home'\) return\s*if \(selectedAppNav === 'programs'\) return/)
  assert.match(panel, /rolesLoading \|\| rolesError \? \[\] : programSearchGrants/)
  assert.match(panel, /controller.current\?\.abort\(\); \+\+requestNumber.current/)
  assert.match(panel, /loadProgramSearchRecord[\s\S]*if \(key === 'client-profile'\)[\s\S]*await onOpenClientProfile/)
  const keys = [...app.slice(app.indexOf('const PROGRAM_SEARCH_FIELDS'), app.indexOf('const CLIENT_PROFILE_FORM_CATALOG')).matchAll(/^  (?:'([^']+)'|([\w-]+)):/gm)].map((match) => match[1] || match[2])
  assert.deepEqual(new Set(keys), new Set(harness().tables.filter((table) => !table.adminOnly).map((table) => table.key)))
})

test('Home Messages stays IT Admin-only and cannot be granted through ordinary program search permissions', () => {
  const h = harness()
  assert.equal(h.tables.find((table) => table.key === 'message')?.adminOnly, true)
  assert.equal(h.catalog.resolveProgramSearchTable('Home Messages'), undefined)
  for (const role of ['Autumn House Manager', 'IT Admin']) assert.equal(h.catalog.programSearchGrants(context([permission('Home Messages')], role).profiles, hub).length, 0)
})
