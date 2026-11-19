import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import * as React from 'react'
import * as JSX from 'react/jsx-runtime'

const schemaSource = readFileSync(new URL('../../.power/schemas/appschemas/dataSourcesInfo.ts', import.meta.url), 'utf8')
const schema = JSON.parse(schemaSource.slice(schemaSource.indexOf('{'), schemaSource.lastIndexOf('}') + 1))
const id = (n) => `11111111-1111-1111-1111-${n.toString(16).padStart(12, '0')}`
const signal = () => new AbortController().signal
const plain = (value) => JSON.parse(JSON.stringify(value))
function harness({ handler = () => { throw Error('Unexpected external request') }, local = false, hooks = {} } = {}) {
  const cache = new Map(), calls = []
  function load(file) {
    if (cache.has(file)) return cache.get(file)
    const source = readFileSync(new URL(file, import.meta.url), 'utf8').replaceAll('import.meta.env', '({})')
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
    const module = { exports: {} }; cache.set(file, module.exports)
    vm.runInNewContext(js, {
      module, exports: module.exports, URL, URLSearchParams, Headers, AbortController, console,
      window: { location: { hostname: local ? 'localhost' : 'powerapps.example' } },
      fetch: async (url, init) => { const call = { url, init }; calls.push(call); return handler(call) },
      require(name) {
        if (name === 'react') return { ...React, ...hooks }
        if (name === 'react/jsx-runtime') return JSX
        if (name === '@microsoft/power-apps/data') return { getClient: () => ({ executeAsync: async ({ connectorOperation: operation }) => {
          const api = schema.commondataserviceforapps.apis[operation.operationName]
          assert.ok(api, `Unsupported operation ${operation.operationName}`)
          for (const param of api.parameters.filter((p) => p.required && p.name !== 'connectionId')) assert.notEqual(operation.parameters[param.name], undefined, param.name)
          calls.push(operation); return handler(operation)
        } }) }
        if (name.includes('dataSourcesInfo')) return { dataSourcesInfo: schema }
        if (name === './auth') return { getAuthToken: () => 'test-token', ensureAuthToken: async () => 'test-token' }
        if (name === './funderContractIdentity') return { funderContractIdentity: {} }
        if (name.endsWith('.json')) return JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'))
        if (name.startsWith('./')) return load(`${name}${existsSync(new URL(`${name}.tsx`, import.meta.url)) ? '.tsx' : '.ts'}`)
        throw Error(`Unexpected dependency ${name}`)
      },
    }, { filename: file })
    return module.exports
  }
  return { load, calls }
}
function hookRenderer(file, props) {
  const slots = [], deps = [], effects = []; let index = 0, dirty = false, tree
  const h = harness({ hooks: {
    useState(initial) { const i = index++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], (value) => { const next = typeof value === 'function' ? value(slots[i]) : value; if (!Object.is(next, slots[i])) { slots[i] = next; dirty = true } }] },
    useRef(initial) { const i = index++; return slots[i] ||= { current: initial } },
    useId() { return `test-${index++}` },
    useMemo(factory) { return factory() },
    useCallback(callback) { return callback },
    useEffect(effect, next) { const i = index++; if (!deps[i] || !next || next.some((value, k) => !Object.is(value, deps[i][k]))) { deps[i] = next; effects.push(effect) } },
  } })
  const component = h.load(file).default
  return { render() { let count = 0; do { dirty = false; index = 0; tree = component(props); while (effects.length) effects.shift()(); assert.ok(++count < 15, 'Render must settle') } while (dirty); return tree } }
}
function descendants(node, type) {
  const rows = []; function visit(item) { if (Array.isArray(item)) item.forEach(visit); else if (React.isValidElement(item)) { if (!type || item.type === type) rows.push(item); visit(item.props.children) } }
  visit(node); return rows
}
const text = (node) => typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(text).join('') : React.isValidElement(node) ? text(node.props.children) : ''
const button = (tree, label) => descendants(tree, 'button').find((item) => text(item) === label)
const field = (field, kind = 'text') => ({ field, label: field, kind })
const criterion = (field, operator, value = '', valueTo) => ({ field, operator, value, ...(valueTo ? { valueTo } : {}) })

test('client-profile quick-view tables render matching sortable funder/time/minutes and call-notes headers and cells', () => {
  const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8'), tree = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const tables = []
  function visit(node) {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === 'SortableRecordTable') tables.push(node.getText(tree))
    ts.forEachChild(node, visit)
  }
  visit(tree)
  for (const list of ['servicesForClient', 'servicesForProgramEnrollment']) {
    const table = tables.find((value) => value.includes(`${list}.map`)); assert.ok(table)
    for (const [label, field] of [['Funder', 'funder'], ['Minutes', 'minutes'], ['Service Time', 'serviceTime']]) {
      assert.ok(table.includes(`<th>${label}</th>`)); assert.ok(table.includes(`<td>{row.${field} || '-'}</td>`))
    }
  }
  const helpline = tables.find((value) => value.includes('helplinesForClient.map'))
  assert.ok(helpline.includes('<th>Call Notes</th>')); assert.ok(helpline.includes('<td className="record-quick-notes">{row.callNotes || \'-\'}</td>'))
  assert.doesNotMatch(helpline, /dangerouslySetInnerHTML/)
  const main = readFileSync(new URL('../main.tsx', import.meta.url), 'utf8'), css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')
  assert.match(main, /import '\.\/index.css'/)
  for (const selector of ['.record-quick-notes', '.advanced-search-condition', '.record-sort-button']) assert.ok(css.includes(selector), `The loaded stylesheet must include ${selector}`)
})

test('advanced fields expose only the requested columns for the four supported forms, in the requested order', () => {
  const api = harness().load('./advancedSearch.ts')
  const expected = {
    'client-profile': ['cmps_recordid', 'cmps_name', 'cmps_dateofbirth', 'cmps_race', 'cmps_gender'],
    'program-enrollment': ['cmps_servicestartdate', 'cmps_serviceenddate', 'cmps_program'],
    services: ['cmps_dateofservice', 'cmps_servicecategory', 'cmps_service'],
    'bed-enrollment': ['cmps_checkindate'],
  }
  const columns = [...Object.values(expected).flat(), 'cmps_hmisid', 'cmps_minutes', 'cmps_funder', 'cmps_funder1', 'createdon', 'modifiedon']
  const developed = columns.map((field) => ({ field, label: field }))
  const metadata = { Attributes: columns.map((LogicalName) => ({ LogicalName, AttributeType: /date/.test(LogicalName) ? 'DateTime' : ['cmps_gender', 'cmps_program', 'cmps_servicecategory', 'cmps_service'].includes(LogicalName) ? 'Picklist' : LogicalName === 'cmps_race' ? 'Virtual' : 'String', ...(LogicalName === 'cmps_race' ? { AttributeTypeName: { Value: 'MultiSelectPicklistType' } } : {}) })) }
  for (const [table, fields] of Object.entries(expected)) {
    assert.equal(api.supportsAdvancedSearch(table), true)
    assert.deepEqual(Array.from(api.advancedFieldsFromMetadata(metadata, developed, table), (f) => f.field), fields)
  }
  assert.deepEqual(Array.from(api.advancedFieldsFromMetadata(metadata, developed, 'client-profile'), (f) => f.kind), ['text', 'text', 'date', 'multi-choice', 'choice'])
  for (const table of ['event', 'helpline', 'household', 'voca-form', 'shelter-screening', 'adult-assessment', 'messages', '', 'toString']) {
    assert.equal(api.supportsAdvancedSearch(table), false)
    assert.deepEqual(plain(api.advancedFieldsFromMetadata(metadata, developed, table)), [])
  }
  metadata.Attributes.find((f) => f.LogicalName === 'cmps_dateofbirth').IsValidForRead = false
  assert.deepEqual(Array.from(api.advancedFieldsFromMetadata(metadata, developed, 'client-profile'), (f) => f.field), expected['client-profile'].filter((f) => f !== 'cmps_dateofbirth'))
  assert.deepEqual(plain(api.advancedFieldsFromMetadata(metadata, [], 'client-profile')), [])
})

test('advanced validation rejects invalid fields, operators, dates, numeric ranges, lookup IDs and oversized filters', () => {
  const { validateAdvancedSearch: validate } = harness().load('./advancedSearch.ts'), fields = [field('cmps_name'), field('cmps_date', 'date'), field('cmps_amount', 'number'), field('cmps_parent', 'lookup'), field('cmps_choice', 'choice'), field('cmps_yes', 'boolean')]
  for (const filter of [criterion('cmps_secret', 'contains', 'x'), criterion('cmps_date', 'contains', 'x'), criterion('cmps_date', 'eq', '2026-02-30'), criterion('cmps_date', 'eq', '0001-01-01'), criterion('cmps_date', 'between', '2026-10-09', '2026-01-01'), criterion('cmps_amount', 'eq', 'NaN'), criterion('cmps_amount', 'between', '100', '1'), criterion('cmps_parent', 'eq', 'CP-046'), criterion('cmps_choice', 'eq', 'a label'), criterion('cmps_yes', 'eq', 'Yes'), criterion('cmps_name', 'eq', ''), criterion('cmps_name', 'contains', 'x'.repeat(251))]) assert.throws(() => validate([filter], fields, true))
  assert.throws(() => validate(Array(11).fill(criterion('cmps_name', 'empty')), fields), /at most 10/)
  validate([criterion('cmps_date', 'between', '2024-02-29', '2026-10-09'), criterion('cmps_amount', 'eq', '-1.25'), criterion('cmps_parent', 'eq', id(1)), criterion('cmps_choice', 'eq', '125570008'), criterion('cmps_yes', 'eq', '0')], fields, true)
})

test('Dataverse advanced controls are absent for other forms without issuing metadata or record requests', () => {
  for (const tableKey of ['helpline', 'event', 'household', 'voca-form', 'shelter-screening', 'adult-assessment']) {
    const renderer = hookRenderer('./DataverseAdvancedSearch.tsx', { tableKey, developedFields: [{ field: 'cmps_recordid', label: 'Record ID' }], applied: [], onApply() {} })
    assert.equal(renderer.render(), null)
  }
})

test('each supported advanced-search dropdown displays only its requested fields, never audit fields', () => {
  const api = harness().load('./advancedSearch.ts')
  for (const [tableKey, definitions] of Object.entries(api.ADVANCED_SEARCH_FIELDS)) {
    const developedFields = [...definitions, { field: 'createdon', label: 'Created Time' }, { field: 'cmps_notes', label: 'Notes' }]
    const metadata = { Attributes: developedFields.map(({ field }) => ({ LogicalName: field, AttributeType: /date/.test(field) ? 'DateTime' : 'String' })) }
    const wrapper = hookRenderer('./DataverseAdvancedSearch.tsx', { tableKey, developedFields, metadata, applied: [], onApply() {} }).render()
    assert.deepEqual(Array.from(wrapper.props.fields, (f) => f.field), Array.from(definitions, (f) => f.field))
    const controls = hookRenderer('./AdvancedSearchControls.tsx', wrapper.props)
    let tree = controls.render(); button(tree, 'Advanced Search').props.onClick(); tree = controls.render()
    button(tree, 'Add Condition').props.onClick(); tree = controls.render()
    assert.deepEqual(descendants(descendants(tree, 'select')[0], 'option').map((option) => option.props.value), Array.from(definitions, (f) => f.field))
  }
})

test('all existing string and date conditions remain available after reducing fields', () => {
  const { advancedSearchOperators } = harness().load('./advancedSearch.ts')
  assert.deepEqual(Array.from(advancedSearchOperators('text'), (op) => op.value), ['contains', 'eq', 'begins-with', 'empty', 'not-empty'])
  assert.deepEqual(Array.from(advancedSearchOperators('date'), (op) => op.value), ['eq', 'before', 'after', 'ge', 'le', 'between', 'empty', 'not-empty'])
})

test('server filters AND conditions with escaped text, inclusive whole-day ranges and backend multi-choice values', () => {
  const api = harness().load('./advancedSearch.ts'), fields = [field('cmps_name'), field('cmps_date', 'date'), field('cmps_multi', 'multi-choice'), field('cmps_amount', 'number')]
  const xml = api.advancedSearchFetchXml([criterion('cmps_name', 'contains', 'A&_%["'), criterion('cmps_date', 'between', '2026-10-01', '2026-10-09'), criterion('cmps_multi', 'includes', '125570008'), criterion('cmps_amount', 'between', '0', '12.5')], fields)
  assert.match(xml, /^<filter type="and">/); assert.match(xml, /value="%A&amp;\[_\]\[%\]\[\[\]&quot;%"/)
  assert.match(xml, /operator="ge" value="2026-10-01T00:00:00.000Z"/); assert.match(xml, /operator="lt" value="2026-10-10T00:00:00.000Z"/)
  assert.match(xml, /operator="contain-values"><value>125570008<\/value>/)
  assert.match(api.advancedSearchFetchXml([criterion('cmps_name', 'begins-with', 'A_%')], fields), /value="A\[_\]\[%\]"/)
  assert.match(api.advancedSearchFetchXml([criterion('cmps_date', 'after', '2026-10-09')], fields), /operator="ge" value="2026-10-10/)
  assert.match(api.advancedSearchFetchXml([criterion('cmps_name', 'empty')], fields), /operator="null"/)
})

const profile = { id: id(1), recordId: 'CP-046', values: { cmps_name: 'John', cmps_middlename: 'M', cmps_lastname: 'Smith' } }
test('client form banner uses the captured/current linked client and never a stale or unrelated profile', () => {
  const { getFormClientContext: get } = harness().load('./formClientContext.ts'), session = { kind: 'services', values: {} }
  assert.deepEqual(plain(get(session, profile, profile, [])), { recordId: 'CP-046', name: 'John M Smith' })
  assert.equal(get(session, profile, null, []), null)
  assert.equal(get({ ...session, values: { cmps_cpid: id(2) } }, profile, profile, []), null)
  assert.equal(get({ ...session, values: { cmps_programenrollment: id(3) } }, profile, profile, []), null)
  assert.equal(get({ ...session, values: { cmps_programenrollment: id(3) } }, profile, profile, [{ id: id(3), clientRowId: id(2) }]), null)
  assert.equal(get({ ...session, values: { cmps_programenrollment: id(3) } }, profile, profile, [{ id: id(3), clientRowId: id(1) }]).name, 'John M Smith')
  assert.equal(get({ ...session, values: { cmps_cpid: `{${id(1)}}` } }, profile, null, []).recordId, 'CP-046')
  for (const kind of ['client-profile', 'event', 'household', 'contract', 'funder-transaction']) assert.equal(get({ ...session, kind }, profile, profile, []), null)
  assert.equal(get(session, { ...profile, id: id(2) }, profile, []).recordId, 'CP-046')
})

const workRecord = (n, name = 'John Smith') => ({ name, recordId: `CP-${n}`, hmisId: `HMIS-${n}`, dateOfBirth: '1980-01-01', primaryLanguage: 'English', gender: 'Male', searchValues: { cmps_zip: '85001', cmps_race: 'Asian' }, enrollments: [
  { enrollmentId: id(n), program: 'Autumn House', startDate: '2026-10-01', endDate: '', recordId: 'PE-044479 | Autumn House', staffAssigned: 'Assigned Staff' },
  { enrollmentId: id(n + 100), program: 'Faith House', startDate: '2025-01-01', endDate: '2025-10-01', recordId: 'PE-003 | Faith House' },
] })
test('My Work quick/advanced search only narrows supplied assignments and requires related conditions on the same enrollment', () => {
  const api = harness().load('./workSearch.ts'), rows = [workRecord(1), workRecord(2, 'John Jones')], fields = api.workSearchFields(true)
  const search = (query = '', filters = []) => api.filterWorkRecords(rows, (row) => row, query, filters, fields)
  assert.equal(search(' John   Smith ').length, 1); assert.equal(search('HMIS-2')[0], rows[1]); assert.equal(search('Assigned Staff').length, 2)
  assert.equal(search('Jane').length, 0)
  assert.equal(search('', [criterion('cmps_race', 'includes', 'Asian')]).length, 2)
  assert.equal(search('', [criterion('cmps_gender', 'eq', 'Male')]).length, 2)
  assert.equal(search('', [criterion('date_of_birth', 'before', '1990-01-01')]).length, 2)
  assert.equal(search('', [criterion('work_program', 'eq', 'Autumn House'), criterion('work_startdate', 'before', '2026-01-01')]).length, 0)
  assert.equal(search('', [criterion('work_program', 'eq', 'Autumn House'), criterion('work_startdate', 'ge', '2026-10-01')]).length, 2)
  assert.equal(search('', [criterion('work_program', 'eq', 'Faith House'), criterion('work_enddate', 'between', '2025-09-01', '2025-10-01')]).length, 2)
  for (const column of ['cmps_zip', 'hmis_id', 'primary_language', 'work_staff', 'work_recordid']) assert.throws(() => search('', [criterion(column, 'eq', 'x')]), /unavailable/)
  for (const full of [false, true]) assert.deepEqual(Array.from(api.workSearchFields(full), (f) => f.field), ['client_recordid', 'client_name', 'date_of_birth', 'cmps_race', 'cmps_gender', 'work_program', 'work_startdate', 'work_enddate'])
})

test('My Work client hydration preserves order and keeps at most four reads in flight', async () => {
  const { mapWorkRecords } = harness().load('./workSearch.ts'); let active = 0, maximum = 0
  const results = await mapWorkRecords(Array.from({ length: 17 }, (_, n) => n), async (n) => { maximum = Math.max(maximum, ++active); await new Promise((done) => setTimeout(done, (n % 3) + 1)); active--; return n * 2 })
  assert.equal(maximum, 4); assert.deepEqual(Array.from(results), Array.from({ length: 17 }, (_, n) => n * 2))
})

test('sorting handles text, real dates, numeric currency, empty values and stable ties without mutating records', () => {
  const api = harness().load('./recordSorting.ts'), sort = (rows, kind, direction = 'ascending') => Array.from(api.sortRecordRows(rows, (row) => row, kind, direction))
  assert.deepEqual(sort(['CP-10', 'CP-2', 'CP-1'], 'text'), ['CP-1', 'CP-2', 'CP-10'])
  assert.deepEqual(sort(['12/1/2025', '2/1/2026', '1/1/2025'], 'date'), ['1/1/2025', '12/1/2025', '2/1/2026'])
  assert.deepEqual(sort(['$1,000', '2', '10', '0', '-'], 'number'), ['0', '2', '10', '$1,000', '-'])
  assert.deepEqual(sort(['$1,000', '2', '10', '0', '-'], 'number', 'descending'), ['$1,000', '10', '2', '0', '-'])
  assert.equal(api.recordSortKind('Primary Language'), 'text'); assert.equal(api.recordSortKind('Minutes'), 'number'); assert.equal(api.recordSortKind('Start Date'), 'date')
  const rows = [{ v: 'A', id: 1 }, { v: 'a', id: 2 }, { v: 'B', id: 3 }], before = plain(rows)
  assert.deepEqual(Array.from(api.sortRecordRows(rows, (row) => row.v, 'text', 'descending'), (row) => row.id), [3, 1, 2]); assert.deepEqual(rows, before)
})

test('clicking sortable headers toggles arrows/aria-sort and keeps actions attached to their original records', () => {
  const actions = [], props = { children: [JSX.jsx('thead', { children: JSX.jsxs('tr', { children: [JSX.jsx('th', { children: 'Open' }), JSX.jsx('th', { children: 'Minutes' })] }) }), JSX.jsx('tbody', { children: [10, 2].map((n) => JSX.jsxs('tr', { children: [JSX.jsx('td', { children: JSX.jsx('button', { onClick: () => actions.push(n), children: 'Open' }) }), JSX.jsx('td', { children: n })] }, n)) })] }
  const renderer = hookRenderer('./SortableRecordTable.tsx', props)
  let tree = renderer.render(); assert.equal(descendants(tree, 'th')[0].props['aria-sort'], undefined)
  descendants(tree, 'th')[1].props.children.props.onClick(); tree = renderer.render()
  assert.equal(descendants(tree, 'th')[1].props['aria-sort'], 'ascending'); assert.ok(text(descendants(tree, 'th')[1]).includes('↑'))
  assert.deepEqual(descendants(descendants(tree, 'tbody')[0], 'tr').map((r) => Number(text(descendants(r, 'td')[1]))), [2, 10])
  button(descendants(tree, 'tbody')[0], 'Open').props.onClick(); assert.deepEqual(actions, [2])
  descendants(tree, 'th')[1].props.children.props.onClick(); tree = renderer.render()
  assert.equal(descendants(tree, 'th')[1].props['aria-sort'], 'descending'); assert.ok(text(descendants(tree, 'th')[1]).includes('↓'))
})

test('advanced controls validate, apply and clear conditions through their actual handlers', () => {
  const applied = [], props = { fields: [field('cmps_name')], applied: [], onApply: (value) => applied.push(plain(value)), identity: 'client-profile' }
  const renderer = hookRenderer('./AdvancedSearchControls.tsx', props)
  let tree = renderer.render(); button(tree, 'Advanced Search').props.onClick(); tree = renderer.render()
  button(tree, 'Add Condition').props.onClick(); tree = renderer.render(); button(tree, 'Apply Filters').props.onClick(); tree = renderer.render()
  assert.equal(applied.length, 0); assert.match(text(tree), /Complete each/)
  descendants(tree, 'input')[0].props.onChange({ target: { value: 'John' } }); tree = renderer.render(); button(tree, 'Apply Filters').props.onClick()
  assert.deepEqual(applied[0], [criterion('cmps_name', 'contains', 'John')])
  button(tree, 'Clear Filters').props.onClick(); assert.deepEqual(applied[1], [])
})

test('My Work search renders synchronized top/bottom paging and resets to page one when searching', () => {
  const seen = [], props = { records: Array.from({ length: 112 }, (_, n) => workRecord(n)), getRecord: (row) => row, identity: 'case-load', children: (rows) => { seen.push(rows.map((r) => r.recordId)); return null } }
  const renderer = hookRenderer('./WorkRecordSearch.tsx', props)
  let tree = renderer.render(); assert.equal(descendants(tree, 'nav').length, 2); assert.equal(seen.at(-1).length, 50)
  button(tree, 'Next Page').props.onClick(); tree = renderer.render(); assert.equal(seen.at(-1)[0], 'CP-50')
  descendants(tree, 'input')[0].props.onChange({ target: { value: 'HMIS-111' } }); tree = renderer.render()
  assert.deepEqual(seen.at(-1), ['CP-111']); assert.equal(descendants(tree, 'nav').length, 0)
  button(tree, 'Clear Search').props.onClick(); renderer.render(); assert.equal(seen.at(-1)[0], 'CP-0')
})

function clientMetadata() { return { LogicalName: 'cmps_clientprofile', EntitySetName: 'cmps_clientprofiles', PrimaryIdAttribute: 'cmps_clientprofileid', Attributes: [
  ...['cmps_recordid', 'cmps_name', 'cmps_lastname', 'cmps_middlename', 'cmps_hmisid'].map((LogicalName) => ({ LogicalName, AttributeType: 'String' })),
  { LogicalName: 'cmps_dateofbirth', AttributeType: 'DateTime' }, { LogicalName: 'cmps_isarchived', AttributeType: 'Picklist' },
], ManyToOneRelationships: [] } }
const pagingCookie = (page) => `<cookie pagingcookie="${encodeURIComponent(encodeURIComponent(`<cookie page="${page}"><row last="${page}"/></cookie>`))}" />`
test('advanced client searches page beyond 5,000 rows using server cookies without widening name/date/archive filters', async () => {
  const queries = [], gateway = { metadata: async () => clientMetadata(), query: async (meta, xml) => {
    queries.push(xml); const page = Number(xml.match(/page="(\d+)"/)[1]), start = (page - 1) * 100, count = Math.min(100, 5301 - start), more = start + count < 5301
    return { value: Array.from({ length: count }, (_, i) => ({ cmps_clientprofileid: id(start + i), cmps_recordid: `CP-${start + i}`, cmps_name: 'John', cmps_lastname: 'Smith' })), '@Microsoft.Dynamics.CRM.morerecords': more, ...(more ? { '@Microsoft.Dynamics.CRM.fetchxmlpagingcookie': pagingCookie(page) } : {}) }
  } }
  const api = harness().load('./clientAdvancedSearch.ts').createClientAdvancedSearch(gateway), filters = [criterion('cmps_dateofbirth', 'before', '1990-01-01')]
  const result = await api.search('John Smith', 54, 100, filters, signal())
  assert.equal(result.rows.length, 1); assert.equal(result.rows[0].recordId, 'CP-5300'); assert.equal(result.hasNext, false); assert.equal(queries.length, 54)
  for (const xml of queries) { assert.match(xml, /cmps_isarchived" operator="ne" value="125570000"/); assert.match(xml, /value="%John%"/); assert.match(xml, /value="%Smith%"/); assert.match(xml, /cmps_dateofbirth" operator="lt" value="1990-01-01/); assert.doesNotMatch(xml, /\$skip|top="/) }
  assert.match(queries.at(-1), /paging-cookie=/)
  await api.search('John Smith', 1, 100, filters, signal()); assert.equal(queries.length, 55)
})

test('advanced client search stops on bad/repeated continuation cookies, unreadable archive flags and aborted reads', async () => {
  const factory = harness().load('./clientAdvancedSearch.ts').createClientAdvancedSearch
  for (const payload of [{ value: [], '@Microsoft.Dynamics.CRM.morerecords': true, '@Microsoft.Dynamics.CRM.fetchxmlpagingcookie': pagingCookie(1) }, { value: [{ cmps_clientprofileid: id(1) }], '@Microsoft.Dynamics.CRM.morerecords': true, '@Microsoft.Dynamics.CRM.fetchxmlpagingcookie': pagingCookie(1) }]) {
    const api = factory({ metadata: async () => clientMetadata(), query: async () => payload })
    await assert.rejects(api.search('', 2, 50, [], signal()), /invalid or repeated/)
  }
  const meta = clientMetadata(); meta.Attributes.find((a) => a.LogicalName === 'cmps_isarchived').IsValidForRead = false
  await assert.rejects(factory({ metadata: async () => meta }).search('', 1, 50, [], signal()), /archive filter/)
  const controller = new AbortController(); controller.abort()
  await assert.rejects(factory({}).search('', 1, 50, [], controller.signal), /abort/i)
})

test('client searches reject previously exposed HMIS filters before querying records', async () => {
  let reads = 0
  const api = harness().load('./clientAdvancedSearch.ts').createClientAdvancedSearch({ metadata: async () => clientMetadata(), query: async () => { reads++; return { value: [] } } })
  await assert.rejects(api.search('', 1, 50, [criterion('cmps_hmisid', 'eq', 'HMIS-1')], signal()), /unavailable/)
  assert.equal(reads, 0)
})

for (const local of [false, true]) test(`${local ? 'local' : 'runtime'}: active assigned enrollments read all scoped pages without a 5,000-row cap`, async () => {
  let page = 0
  const h = harness({ local, handler(call) {
    const parameters = local ? Object.fromEntries(new URL(call.url).searchParams) : call.parameters
    assert.match(parameters.$filter, /cmps_serviceenddate eq null/); assert.match(parameters.$filter, /cmps_isarchived ne 125570000/)
    assert.match(parameters.$filter, /cmps_staffassigned eq 'o''neil@example.test'/); assert.match(parameters.$filter, /cmps_program eq 125570000/)
    assert.equal(parameters.$top, undefined)
    if (page) assert.equal(parameters.$skiptoken, `page${page + 1}`)
    const value = Array.from({ length: page === 5 ? 201 : 1000 }, (_, i) => ({ cmps_programenrollment1id: id(page * 1000 + i), _cmps_clientid_value: id(1), cmps_program: 125570000, cmps_serviceenddate: null, cmps_staffassigned: "o'neil@example.test" }))
    const data = { value, ...(page < 5 ? { '@odata.nextLink': `https://org1f466e4e.crm.dynamics.com/api/data/v9.2/cmps_programenrollment1s?$skiptoken=page${page + 2}` } : {}) }; page++
    return local ? { ok: true, json: async () => data } : { success: true, data }
  } })
  const api = h.load('./programEnrollment.ts'), result = await api.listActiveProgramEnrollments({ staffIdentities: ["o'neil@example.test"], programs: ['Autumn House'] })
  assert.equal(result.length, 5201); assert.equal(h.calls.length, 6)
  assert.equal((await api.listActiveProgramEnrollments({ staffIdentities: [] })).length, 0); assert.equal(h.calls.length, 6)
})

test('package wiring stays test-only and adds filters/banner/sort to the requested workspaces', () => {
  const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  assert.equal((source.match(/<WorkRecordSearch key=/g) || []).length, 3)
  assert.equal((source.match(/<h3>\{activeFormSession.formName\}<\/h3>\{activeFormClientContext/g) || []).length, 30)
  assert.equal((source.match(/<SortableRecordTable /g) || []).length, 17)
  assert.match(source, /selectedAdvancedClientFilters, selectedSearchForm/)
  assert.match(source, /clientAdvancedSearch.current.search\(query, page, SEARCH_PAGE_SIZE, selectedAdvancedClientFilters, abort.signal\)/)
  assert.match(source, /listActiveProgramEnrollments\(\{ staffIdentities: Array.from\(staffNames\), programs: userPrograms \}\)/)
  assert.match(source, /if \(selectedAppNav === 'my-work'\) return/)
})
