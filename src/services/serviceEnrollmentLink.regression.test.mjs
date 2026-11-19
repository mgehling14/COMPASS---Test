import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

for (const local of [false, true]) test(`${local ? 'local' : 'runtime'} Services saves both legal category labels with the same verified backend value on create and edit`, async () => {
  for (const create of [false, true]) {
    for (const category of ['Legal & Medical Advocacy', 'Legal Advocacy', '  legal & medical advocacy  ', '125570008']) {
      const h = harness((call) => local ? { ok: true, json: async () => saved }
        : { success: true, data: saved }, local)
      const api = h.load('./services.ts')
      const values = { ...seed, cmps_servicecategory: category, cmps_service: 'Legal Referrals' }
      if (create) await api.createServicesResponse(values)
      else await api.updateServicesResponse(serviceId, values)
      const call = h.calls.find((entry) => entry.operationName?.startsWith(create ? 'Create' : 'Update')
        || entry.init?.method === (create ? 'POST' : 'PATCH'))
      assert.ok(call)
      const payload = local ? JSON.parse(call.init.body) : call.parameters.item
      assert.equal(payload.cmps_servicecategory, 125570008)
      assert.equal(payload.cmps_service, 125570039, 'the service itself must retain its original backend mapping')
      assert.equal(api.SERVICE_CATEGORY_OPTIONS[8], 'Legal & Medical Advocacy')
      assert.ok(api.SERVICE_OPTIONS_BY_CATEGORY[api.SERVICE_CATEGORY_OPTIONS[8]].includes('Legal Referrals'))
    }
  }
})

for (const local of [false, true]) test(`${local ? 'local' : 'runtime'} legal category edit reloads the canonical UI label with old, new, or absent display annotations and round-trips`, async () => {
  for (const annotation of [undefined, 'Legal Advocacy', 'Legal & Medical Advocacy']) {
    const row = { ...saved, cmps_servicecategory: 125570008, cmps_service: 125570039,
      ...(annotation ? { 'cmps_servicecategory@OData.Community.Display.V1.FormattedValue': annotation } : {}) }
    const h = harness((call) => local ? { ok: true, json: async () => row }
      : { success: true, data: call.operationName.startsWith('Update') ? {} : { value: [row] } }, local)
    const api = h.load('./services.ts'), detail = await api.loadServicesDetailRecord(serviceId)
    assert.equal(detail.values.cmps_servicecategory, 'Legal & Medical Advocacy')
    assert.equal(detail.values.cmps_service, 'Legal Referrals')
    await api.updateServicesResponse(serviceId, detail.values)
    const call = h.calls.findLast((entry) => entry.operationName?.startsWith('Update') || entry.init?.method === 'PATCH')
    assert.equal((local ? JSON.parse(call.init.body) : call.parameters.item).cmps_servicecategory, 125570008)
  }
})

test('Services category rename does not shift other existing choice values or accept arbitrary labels', async () => {
  const h = harness(() => ({ success: true, data: {} })), api = h.load('./services.ts')
  const categories = ['Intake & Discharge', 'Assessment', 'FOCUS Meeting', 'Pet Services', 'Safety & Crisis Response', 'Housing & Stability',
    'Financial Stability', 'Employment & Career Development', 'Legal & Medical Advocacy', 'Emotional Wellness & Healing', 'Resource Navigation',
    'Family Support', 'Basic Needs', 'Empowerment & Self-Sufficiency', 'Education & Continued Learning', 'Other']
  assert.deepEqual(Array.from(api.SERVICE_CATEGORY_OPTIONS), categories)
  for (const [index, category] of categories.entries()) {
    await api.updateServicesResponse(serviceId, { cmps_servicecategory: category })
    assert.equal(h.calls.at(-1).parameters.item.cmps_servicecategory, 125570000 + index)
  }
  const count = h.calls.length
  await assert.rejects(api.updateServicesResponse(serviceId, { cmps_servicecategory: 'Unconfigured category' }), /Invalid choice value/)
  assert.equal(h.calls.length, count)
})


for (const local of [false, true]) test(`${local ? 'local' : 'runtime'} Program Enrollment edit preserves both raw dates through save`, async () => {
  const row = { cmps_programenrollment1id: enrollmentId, cmps_recordid: 'PE-04958',
    cmps_servicestartdate: '2026-10-07T00:00:00Z', cmps_serviceenddate: '2026-10-08T00:00:00Z',
    'cmps_servicestartdate@OData.Community.Display.V1.FormattedValue': '07/10/2026',
    'cmps_serviceenddate@OData.Community.Display.V1.FormattedValue': '08/10/2026' }
  const h = harness((call) => {
    const metadata = call.url ? call.url.includes('EntityDefinitions') : call.parameters.entityName.startsWith('EntityDefinitions')
    return local ? { ok: true, json: async () => metadata ? { value: [] } : row }
      : { success: true, data: metadata ? { value: [] } : { value: [row] } }
  }, local)
  const api = h.load('./programEnrollment.ts'), detail = await api.loadProgramEnrollmentDetailRecord(enrollmentId)
  assert.equal(detail.values.cmps_servicestartdate, '2026-10-07')
  assert.equal(detail.values.cmps_serviceenddate, '2026-10-08')
  await api.updateProgramEnrollmentResponse(enrollmentId, detail.values)
  const call = h.calls.findLast((entry) => entry.operationName?.startsWith('Update') || entry.init?.method === 'PATCH')
  const payload = local ? JSON.parse(call.init.body) : call.parameters.item
  assert.equal(payload.cmps_servicestartdate, '2026-10-07')
  assert.equal(payload.cmps_serviceenddate, '2026-10-08')
})

test('Program Enrollment leaves absent/sentinel end dates empty despite a formatted annotation', async () => {
  for (const end of [null, '', '0001-01-01T00:00:00Z', '2026-10-08']) {
    const h = harness(() => ({ success: true, data: { value: [{ cmps_programenrollment1id: enrollmentId,
      cmps_serviceenddate: end, 'cmps_serviceenddate@OData.Community.Display.V1.FormattedValue': '10/8/2026' }] } }))
    const detail = await h.load('./programEnrollment.ts').loadProgramEnrollmentDetailRecord(enrollmentId)
    assert.equal(detail.values.cmps_serviceenddate, end === '2026-10-08' ? end : '')
  }
})

for (const local of [false, true]) test(`${local ? 'local' : 'runtime'} Enrollment detail preserves the real Client Profile lookup while hydrating the CP display ID`, async () => {
  const row = { cmps_programenrollment1id: enrollmentId, cmps_recordid: 'PE-046', _cmps_clientid_value: clientId,
    '_cmps_clientid_value@OData.Community.Display.V1.FormattedValue': 'CP-046' }
  const h = harness((call) => {
    if (!local && call.url) throw Error('Direct browser transport unavailable in this runtime test')
    const entity = local ? new URL(call.url).pathname : call.parameters.entityName
    const isClient = entity.includes('cmps_clientprofiles')
    const data = isClient ? { cmps_clientprofileid: clientId, cmps_recordid: 'CP-046' } : row
    const listing = local ? !/\([^)]*\)$/.test(new URL(call.url).pathname) : call.operationName.startsWith('List')
    return local ? { ok: true, json: async () => listing ? { value: [data] } : data }
      : { success: true, data: listing ? { value: [data] } : data }
  }, local)
  const detail = await h.load('./programEnrollment.ts').loadProgramEnrollmentDetailRecord(enrollmentId)
  assert.equal(detail.clientRowId, clientId, 'never replace a lookup GUID with a CP display ID')
  assert.equal(detail.values.cmps_clientid, 'CP-046', 'keep the existing visible field unchanged')
  assert.ok(h.calls.some((call) => (call.url || call.parameters?.entityName || '').includes('cmps_clientprofiles')))
})

test('OVW Late-Life funder recognition resolves lookup IDs and accepts existing label punctuation', () => {
  const api = harness(() => { throw Error('No API needed') }).load('./programEnrollment.ts')
  const otherId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  for (const name of ['OVW-Late Life', 'OVW Late-Life', 'OVW Late Life', 'OVW - Late-Life', 'ovw late-life']) {
    const funders = [{ id: enrollmentId, name }, { id: otherId, name: 'VOCA' }]
    for (const value of [enrollmentId, '{' + enrollmentId.toUpperCase() + '}', name]) assert.equal(api.isOvwLateLifeEnrollmentFunder(value, funders), true)
    for (const value of [otherId, serviceId, 'VOCA', 'Other', 'OVW', '']) assert.equal(api.isOvwLateLifeEnrollmentFunder(value, funders), false)
  }
})

test('Enrollment Details shows OVW Client Served Status for the selected funder lookup in view/edit and uses the same validation rule', () => {
  const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  const tree = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const names = ['getActiveRequiredFields', 'validateProgramEnrollment', 'isProgramEnrollmentFieldVisible'], declarations = []
  function visit(node) { if (ts.isFunctionDeclaration(node) && names.includes(node.name?.text)) declarations.push(node.getText(tree)); ts.forEachChild(node, visit) }
  visit(tree); assert.equal(declarations.length, 3)
  const api = harness(() => { throw Error('No API needed') }).load('./programEnrollment.ts')
  const fields = api.PROGRAM_ENROLLMENT_FIELDS, status = fields.find((field) => field.field === 'cmps_ovwclientservedstatus')
  assert.equal(status.section, 'Enrollment Details')
  assert.deepEqual(Array.from(status.options), ['Client Fully Served', 'Client Partially Served'])
  const context = { PROGRAM_ENROLLMENT_FIELDS: fields, normalize: (value) => String(value || '').trim().toLowerCase(),
    isOvwLateLifeEnrollmentFunder: api.isOvwLateLifeEnrollmentFunder, activeFunderOptions: [{ id: enrollmentId, name: 'OVW Late-Life' }, { id: serviceId, name: 'VOCA' }],
    getProgramEnrollmentDischargeRules: api.getProgramEnrollmentDischargeRules, isFieldVisible: () => true, parseMultiValue: () => [],
    PROGRAMS_WITH_SHELTER_QUESTIONS: new Set(), PROGRAMS_FOR_SV_HEAR_ABOUT_US: new Set(), SPECIAL_CLASSIFICATION_DISABILITY_TAGS: new Set(),
    DISCHARGE_SUMMARY_FIELDS: new Set(fields.filter((field) => field.section === 'Discharge Summary').map((field) => field.field)) }
  vm.createContext(context)
  vm.runInContext(ts.transpileModule(declarations.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  for (const rowId of ['', enrollmentId]) for (const funder of [enrollmentId, serviceId, 'OVW-Late Life', 'Other']) {
    const values = { ...Object.fromEntries(fields.filter((field) => field.required).map((field) => [field.field, 'filled'])),
      cmps_program: 'DVSTOP', cmps_funder: funder, cmps_serviceenddate: '', cmps_ovwclientservedstatus: '' }
    const expected = funder === enrollmentId || funder === 'OVW-Late Life'
    assert.equal(context.isProgramEnrollmentFieldVisible(status, values), expected)
    assert.equal(context.getActiveRequiredFields({ kind: 'program-enrollment', rowId, values }).has(status.field), expected)
    assert.equal(context.validateProgramEnrollment(values).includes(status.label), expected)
    values.cmps_ovwclientservedstatus = 'Client Fully Served'
    assert.equal(context.validateProgramEnrollment(values), '')
  }
})

for (const local of [false, true]) test((local ? 'local' : 'runtime') + ' OVW Client Served Status retains its backend column and choice values on create/edit/reload', async () => {
  for (const [index, label] of ['Client Fully Served', 'Client Partially Served'].entries()) {
    const row = { cmps_programenrollment1id: enrollmentId, cmps_recordid: 'PE-046', _cmps_funder1_value: enrollmentId, cmps_ovwclientservedstatus: 125570000 + index }
    const h = harness(() => local ? { ok: true, json: async () => row } : { success: true, data: { value: [row] } }, local)
    const api = h.load('./programEnrollment.ts')
    const detail = await api.loadProgramEnrollmentDetailRecord(enrollmentId)
    assert.equal(detail.values.cmps_ovwclientservedstatus, label)
    for (const create of [true, false]) {
      if (create) await api.createProgramEnrollmentResponse({ cmps_recordid: 'PE-046', cmps_funder: enrollmentId, cmps_ovwclientservedstatus: label })
      else await api.updateProgramEnrollmentResponse(enrollmentId, detail.values)
      const call = h.calls.findLast((entry) => entry.operationName?.startsWith(create ? 'Create' : 'Update') || entry.init?.method === (create ? 'POST' : 'PATCH'))
      const payload = local ? JSON.parse(call.init.body) : call.parameters.item
      assert.equal(Number(payload.cmps_ovwclientservedstatus), 125570000 + index)
      assert.equal(payload['cmps_funder1@odata.bind'], '/cmps_funders(' + enrollmentId + ')')
    }
  }
})

test('referral label uses the original optional Enrollment Details field and visibility; duplicate and empty SV section are removed', () => {
  const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  const tree = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let declaration
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'isProgramEnrollmentFieldVisible') declaration = node.getText(tree)
    ts.forEachChild(node, visit)
  }
  visit(tree); assert.ok(declaration)
  const api = harness(() => { throw Error('No API needed') }).load('./programEnrollment.ts')
  const field = api.PROGRAM_ENROLLMENT_FIELDS.find((entry) => entry.field === 'cmps_howdidsvclienthearaboutusreferredby')
  assert.equal(field.label, 'Where was client referred from?')
  assert.equal(field.input, 'select'); assert.equal(field.section, 'Enrollment Details'); assert.notEqual(field.required, true)
  assert.equal(field.options.length, 20)
  assert.equal(field.options[0], '--Please Select--'); assert.equal(field.options[9], 'Agency Website')
  assert.equal(api.PROGRAM_ENROLLMENT_FIELDS.filter((entry) => entry.label === field.label).length, 1)
  assert.equal(api.PROGRAM_ENROLLMENT_FIELDS.some((entry) => entry.field === 'cmps_wherewasclientreferredfrom'), false)
  const context = { normalize: (value) => String(value || '').trim().toLowerCase(), parseMultiValue: () => [],
    PROGRAMS_FOR_SV_HEAR_ABOUT_US: new Set(['reach center', 'sv helpline']),
    DISCHARGE_SUMMARY_FIELDS: new Set(), SPECIAL_CLASSIFICATION_DISABILITY_TAGS: new Set() }
  vm.createContext(context)
  vm.runInContext(ts.transpileModule(declaration, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  for (const program of ['', 'Autumn House', 'DV Outreach', 'CAAFA Shelter', 'DVSTOP', 'Faith House', 'SV Helpline', 'REACH Center', ' reach center ']) {
    assert.equal(context.isProgramEnrollmentFieldVisible(field, { cmps_program: program }), ['reach center', 'sv helpline'].includes(program.trim().toLowerCase()), program)
  }
  assert.doesNotMatch(source, /SV Specific|cmps_wherewasclientreferredfrom/)
})

for (const local of [false, true]) test(`${local ? 'local' : 'runtime'} renamed referral preserves every original choice mapping and never reads/writes the retired duplicate`, async () => {
  const labels = ['Court Advocate', 'Family/Friend', 'Media', 'Medical', 'Medical Advocacy', 'Mental Health', 'Minister/Clergy',
    'Other Shelter', 'Agency Website', 'Police Department', 'Previous Client', 'Prosecutor/Attorney',
    'Self-Referral', 'Social Services', 'Fire Department', 'Family Advocacy Center', 'Social Media', 'RAINN', 'Outreach']
  let row = { cmps_programenrollment1id: enrollmentId, cmps_recordid: 'PE-046', cmps_program: 125570005 }
  const h = harness((call) => {
    const item = local ? (call.init.body ? JSON.parse(call.init.body) : null) : call.parameters.item
    if (item) {
      assert.equal(Object.hasOwn(item, 'cmps_wherewasclientreferredfrom'), false)
      row = { ...row, ...item }
    }
    const select = local ? new URL(call.url).searchParams.get('$select') : call.parameters.$select
    if (select) assert.equal(select.split(',').includes('cmps_wherewasclientreferredfrom'), false)
    const metadata = local ? call.url.includes('EntityDefinitions') : call.parameters.entityName.startsWith('EntityDefinitions')
    const data = metadata ? { value: [] } : !local && call.operationName.startsWith('List') ? { value: [row] } : row
    return local ? { ok: true, json: async () => data } : { success: true, data }
  }, local)
  const api = h.load('./programEnrollment.ts')
  assert.deepEqual(Array.from(api.PROGRAM_ENROLLMENT_FIELDS.find((entry) => entry.field === 'cmps_howdidsvclienthearaboutusreferredby').options).slice(1), labels)
  for (const [index, label] of labels.entries()) {
    await api.createProgramEnrollmentResponse({ cmps_recordid: 'PE-046', cmps_program: 'REACH Center', cmps_howdidsvclienthearaboutusreferredby: label, cmps_wherewasclientreferredfrom: 'Outreach' })
    assert.equal(Number(row.cmps_howdidsvclienthearaboutusreferredby), 125570000 + index)
    const detail = await api.loadProgramEnrollmentDetailRecord(enrollmentId)
    assert.equal(detail.values.cmps_howdidsvclienthearaboutusreferredby, label)
    assert.equal(detail.values.cmps_wherewasclientreferredfrom, undefined)
    assert.equal(detail.values.cmps_program, 'REACH Center')
    await api.updateProgramEnrollmentResponse(enrollmentId, { ...detail.values, cmps_wherewasclientreferredfrom: 'Outreach' })
    assert.equal(Number(row.cmps_howdidsvclienthearaboutusreferredby), 125570000 + index)
    assert.equal((await api.loadProgramEnrollmentDetailRecord(enrollmentId)).values.cmps_howdidsvclienthearaboutusreferredby, label)
  }
})

test('Discharge Summary visibility and its three requirements depend on shelter program and a valid end date', () => {
  const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  const tree = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const names = ['getActiveRequiredFields', 'validateProgramEnrollment', 'isProgramEnrollmentFieldVisible'], declarations = []
  function visit(node) { if (ts.isFunctionDeclaration(node) && names.includes(node.name?.text)) declarations.push(node.getText(tree)); ts.forEachChild(node, visit) }
  visit(tree); assert.equal(declarations.length, 3)
  const api = harness(() => { throw new Error('No API needed') }).load('./programEnrollment.ts')
  const fields = api.PROGRAM_ENROLLMENT_FIELDS
  const discharge = fields.filter((field) => field.section === 'Discharge Summary').map((field) => field.field)
  const expectedRequired = ['cmps_dischargestatus', 'cmps_exitdestination', 'cmps_isthisasafepermanentortransitionalhousin1']
  assert.deepEqual(Array.from(fields.filter((field) => field.section === 'Discharge Summary' && field.required).map((field) => field.field)), expectedRequired)
  const context = { PROGRAM_ENROLLMENT_FIELDS: fields, normalize: (value) => String(value).toLowerCase(),
    getProgramEnrollmentDischargeRules: api.getProgramEnrollmentDischargeRules, isOvwLateLifeEnrollmentFunder: api.isOvwLateLifeEnrollmentFunder, activeFunderOptions: [], isFieldVisible: () => true, parseMultiValue: () => [],
    PROGRAMS_WITH_SHELTER_QUESTIONS: new Set(), PROGRAMS_FOR_SV_HEAR_ABOUT_US: new Set(), SPECIAL_CLASSIFICATION_DISABILITY_TAGS: new Set(),
    DISCHARGE_SUMMARY_FIELDS: new Set(discharge) }
  vm.createContext(context)
  vm.runInContext(ts.transpileModule(declarations.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  for (const program of ['DVSTOP', 'CAAFA Shelter', 'Faith House', 'Autumn House', 'DV Outreach', 'REACH Center', 'REACH', 'DVHEART', 'Other']) {
    for (const endDate of ['', '2026-10-08', '0001-01-01T00:00:00Z', 'invalid', '2026-02-30']) {
      const values = Object.fromEntries(fields.filter((field) => field.required).map((field) => [field.field, 'filled']))
      values.cmps_program = program; values.cmps_serviceenddate = endDate
      for (const field of discharge) values[field] = ''
      const show = ['DVSTOP', 'CAAFA Shelter', 'Faith House', 'Autumn House'].includes(program) && endDate === '2026-10-08'
      for (const field of discharge) assert.equal(context.isProgramEnrollmentFieldVisible({ field }, values), show, `${program} ${endDate} ${field}`)
      const required = context.getActiveRequiredFields({ kind: 'program-enrollment', values })
      for (const field of discharge) assert.equal(required.has(field), show && expectedRequired.includes(field), field)
      const message = context.validateProgramEnrollment(values)
      if (show) {
        for (const field of expectedRequired) assert.ok(message.includes(fields.find((entry) => entry.field === field).label))
        for (const field of expectedRequired) values[field] = 'filled'
      } else assert.equal(message, '')
      assert.equal(context.validateProgramEnrollment(values), '')
      values.cmps_servicestartdate = ''
      assert.match(context.validateProgramEnrollment(values), /Service Start Date/)
    }
  }
})

test('discharge rules recognize encoded programs and real dates, not missing/minimum/invalid dates', () => {
  const api = harness(() => { throw new Error('No API needed') }).load('./programEnrollment.ts')
  for (const [program, showSummary, defaultUnknown] of [
    ['125570000', true, false], ['125570001', false, true], ['125570002', true, false],
    ['125570003', true, false], ['125570004', true, false], ['125570005', false, true],
    ['CAAFA Outreach', false, true], ['REACH', false, true], ['REACH SV', false, true],
  ]) {
    const rules = api.getProgramEnrollmentDischargeRules({ cmps_program: program, cmps_serviceenddate: '2026-10-08T00:00:00Z' })
    assert.equal(rules.showSummary, showSummary, program); assert.equal(rules.defaultUnknown, defaultUnknown, program)
  }
  for (const date of ['', '0001-01-01T00:00:00Z', '1/1/0001', '2026-02-30', '2026-13-01', 'not-a-date']) {
    for (const program of ['DVSTOP', 'DV Outreach', 'REACH Center']) {
      const rules = api.getProgramEnrollmentDischargeRules({ cmps_program: program, cmps_serviceenddate: date })
      assert.equal(rules.showSummary, false); assert.equal(rules.defaultUnknown, false)
    }
  }
})

for (const local of [false, true]) test(`${local ? 'local' : 'runtime'} new and edited ended outreach enrollments save Unknown; shelters and open outreach keep their status`, async () => {
  for (const create of [false, true]) {
    for (const program of ['DV Outreach', 'REACH Center', 'Autumn House', 'CAAFA Shelter', 'Faith House', 'DVSTOP']) {
      for (const endDate of ['', '2026-10-08']) {
        const h = harness((call) => {
          const metadata = call.url ? call.url.includes('EntityDefinitions') : call.parameters.entityName.startsWith('EntityDefinitions')
          const row = { cmps_programenrollment1id: enrollmentId, cmps_recordid: 'PE-04958' }
          return local ? { ok: true, json: async () => metadata ? { value: [] } : row }
            : { success: true, data: metadata ? { value: [] } : row }
        }, local)
        const api = h.load('./programEnrollment.ts'), values = { cmps_recordid: 'PE-04958', cmps_program: program,
          cmps_serviceenddate: endDate, cmps_dischargestatus: 'Positive', cmps_dischargenotes: 'Preserve existing notes' }
        if (create) await api.createProgramEnrollmentResponse(values)
        else await api.updateProgramEnrollmentResponse(enrollmentId, values)
        const call = h.calls.findLast((entry) => entry.operationName?.startsWith(create ? 'Create' : 'Update') || entry.init?.method === (create ? 'POST' : 'PATCH'))
        const payload = local ? JSON.parse(call.init.body) : call.parameters.item
        const unknown = !!endDate && ['DV Outreach', 'REACH Center'].includes(program)
        assert.equal(Number(payload.cmps_dischargestatus), unknown ? 125570002 : 125570000, `${create} ${program} ${endDate}`)
        assert.equal(payload.cmps_dischargenotes, 'Preserve existing notes')
        assert.equal(values.cmps_dischargestatus, 'Positive', 'save must not mutate the caller draft')
      }
    }
  }
})

for (const local of [false, true]) test(`${local ? 'local' : 'runtime'} ended outreach gets Unknown even when hidden status is absent`, async () => {
  const h = harness((call) => {
    const metadata = call.url ? call.url.includes('EntityDefinitions') : call.parameters.entityName.startsWith('EntityDefinitions')
    return local ? { ok: true, json: async () => metadata ? { value: [] } : {} } : { success: true, data: metadata ? { value: [] } : {} }
  }, local)
  const api = h.load('./programEnrollment.ts')
  await api.updateProgramEnrollmentResponse(enrollmentId, { cmps_program: 'REACH Center', cmps_serviceenddate: '2026-10-08' })
  const call = h.calls.findLast((entry) => entry.operationName?.startsWith('Update') || entry.init?.method === 'PATCH')
  const payload = local ? JSON.parse(call.init.body) : call.parameters.item
  assert.equal(Number(payload.cmps_dischargestatus), 125570002)
})


for (const local of [false, true]) test(`${local ? 'local' : 'runtime'} edit reloads raw dates, Intake, decimal amounts and time instead of display formatting`, async () => {
  const row = { ...saved, cmps_dateofservice: '2026-10-07T00:00:00Z', cmps_service: 125570000,
    cmps_servicecategory: 125570000, cmps_minutes: 15, cmps_servicecost: 0, cmps_time: '12:11',
    'cmps_dateofservice@OData.Community.Display.V1.FormattedValue': '10/7/2026',
    'cmps_service@OData.Community.Display.V1.FormattedValue': 'Other',
    'cmps_servicecost@OData.Community.Display.V1.FormattedValue': '$0.00',
    'cmps_time@OData.Community.Display.V1.FormattedValue': '12:11 PM' }
  const h = harness((call) => local ? { ok: true, json: async () => row }
    : { success: true, data: call.operationName.startsWith('Update') ? {} : { value: [row] } }, local)
  const api = h.load('./services.ts'), detail = await api.loadServicesDetailRecord(serviceId)
  assert.equal(detail.values.cmps_dateofservice, '2026-10-07')
  assert.equal(detail.values.cmps_service, 'Intake')
  assert.equal(detail.values.cmps_minutes, '15')
  assert.equal(detail.values.cmps_servicecost, '0')
  assert.equal(detail.values.cmps_time, '12:11')
  await api.updateServicesResponse(serviceId, { ...detail.values, cmps_servicecost: '' })
  const write = local ? JSON.parse(h.calls.at(-1).init.body) : h.calls.at(-1).parameters.item
  assert.equal(write.cmps_dateofservice, '2026-10-07')
  assert.equal(write.cmps_service, 125570000)
  assert.equal(write.cmps_minutes, 15)
  assert.equal(write.cmps_servicecost, null)
})

test('service choices retain the backend duplicate Discharge slot and all later offsets', async () => {
  const h = harness((call) => ({ success: true, data: call.operationName.startsWith('Update') ? {} : { value: [{ ...saved, cmps_service: 125570007 }] } }))
  const api = h.load('./services.ts')
  assert.equal((await api.loadServicesDetailRecord(serviceId)).values.cmps_service, 'Pet Support')
  for (const [label, category, value] of [['Intake', 'Intake & Discharge', 125570000], ['Discharge', 'Intake & Discharge', 125570001], ['Discharge', 'FOCUS Meeting', 125570006], ['Pet Support', 'Pet Services', 125570007], ['Life Skills Development', 'Empowerment & Self-Sufficiency', 125570056]]) {
    await api.updateServicesResponse(serviceId, { cmps_service: label, cmps_servicecategory: category })
    assert.equal(h.calls.at(-1).parameters.item.cmps_service, value)
    assert.equal('cmps_servicecost' in h.calls.at(-1).parameters.item, false, 'partial updates must not clear absent numbers')
  }
  await api.updateServicesResponse(serviceId, { cmps_servicecost: '12.50', cmps_minutes: '0' })
  assert.equal(h.calls.at(-1).parameters.item.cmps_servicecost, 12.5)
  assert.equal(h.calls.at(-1).parameters.item.cmps_minutes, 0)
  const count = h.calls.length
  await assert.rejects(api.updateServicesResponse(serviceId, { cmps_servicecost: '$12.50' }), /Invalid number/)
  await assert.rejects(api.updateServicesResponse(serviceId, { cmps_service: 'Other' }), /no configured Dataverse/)
  assert.equal(h.calls.length, count)
})

function servicesDraftHarness() {
  const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  const tree = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let declaration
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'startServicesFromClientDetail') declaration = node
    ts.forEachChild(node, visit)
  }
  visit(tree); assert.ok(declaration)
  let session, resolve, reject
  const pending = new Promise((yes, no) => { resolve = yes; reject = no })
  const context = { selectedHub: { id: 'autumn-house' }, selectedDetailRecord: { id: clientId }, programEnrollmentsForClient: [{ serviceEndDate: '' }],
    requireFormCreateAccess: () => true,
    SERVICES_TABLE_ALIAS: 'cmps_serviceses', rememberFormReturnState() {}, setActiveFormError() {}, setSelectedHubPages() {}, setHubActionStatus() {}, scrollToTopOfPage() {},
    setActiveFormSession(value) { session = typeof value === 'function' ? value(session) : value },
    generateAppRecordId() { return pending } }
  vm.createContext(context)
  vm.runInContext(ts.transpileModule(declaration.getText(tree), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  return { start: context.startServicesFromClientDetail, resolve, reject, get session() { return session }, set session(value) { session = value } }
}
test('Services opens before the ID scan finishes and preserves draft input', async () => {
  const h = servicesDraftHarness(), pending = h.start()
  assert.equal(h.session.kind, 'services'); assert.equal(h.session.recordId, '')
  h.session.values.cmps_minutes = '15'
  h.resolve('SV-0479376'); await pending
  assert.equal(h.session.recordId, 'SV-0479376')
  assert.equal(h.session.values.cmps_minutes, '15')
})
test('late Services ID scans cannot reopen a closed form or overwrite another draft', async () => {
  const h = servicesDraftHarness(), pending = h.start()
  h.session = { kind: 'services', draftKey: Symbol('another draft'), recordId: 'SV-0500000' }
  h.resolve('SV-0479376'); await pending
  assert.equal(h.session.recordId, 'SV-0500000')
  const closed = servicesDraftHarness(), running = closed.start()
  closed.session = null; closed.reject(new Error('Scan failed')); await running
  assert.equal(closed.session, null)
})
test('Services ID scan failure is visible and save remains disabled until an ID exists', async () => {
  const h = servicesDraftHarness(), pending = h.start()
  h.reject(new Error('Scan failed')); await pending
  assert.match(h.session.recordIdError, /Scan failed/)
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  const editor = app.slice(app.indexOf('key={`${selectedHub.id}-services-editor`}'))
  assert.match(editor.slice(0, 2400), /disabled=\{isUserPreview \|\| activeFormSaving \|\| \(!activeFormSession.rowId && !activeFormSession.recordId\)\}/)
  assert.match(app, /if \(!session.rowId && !String\(session.recordId \|\| ''\).trim\(\)\)/)
})


const organization = 'https://org1f466e4e.crm.dynamics.com'
const enrollmentId = '11111111-1111-1111-1111-111111111111'
const clientId = '22222222-2222-2222-2222-222222222222'
const serviceId = '33333333-3333-3333-3333-333333333333'
const config = JSON.parse(readFileSync(new URL('../../power.config.json', import.meta.url), 'utf8'))
const schemaText = readFileSync(new URL('../../.power/schemas/appschemas/dataSourcesInfo.ts', import.meta.url), 'utf8')
const schema = JSON.parse(schemaText.slice(schemaText.indexOf('{'), schemaText.lastIndexOf('}') + 1))
const saved = { cmps_servicesid: serviceId, cmps_recordid: 'SV-0479341', _cmps_programenrollment_value: enrollmentId, cmps_isarchived: 125570001 }
const seed = { cmps_recordid: saved.cmps_recordid, cmps_programenrollment: `{${enrollmentId.toUpperCase()}}`, cmps_dateofservice: '2026-10-06' }

for (const local of [false, true]) test(`${local ? 'local' : 'runtime'} Services quick views load Funder, Minutes and Service Time without extra per-record reads`, async () => {
  const h = harness((call) => {
    const query = local ? Object.fromEntries(new URL(call.url).searchParams) : call.parameters
    for (const field of ['cmps_funder', 'cmps_minutes', 'cmps_time']) assert.ok(query.$select.split(',').includes(field))
    assert.match(query.$filter, new RegExp(`_cmps_programenrollment_value eq ${enrollmentId}`)); assert.match(query.$filter, /cmps_isarchived ne 125570000/)
    const data = { value: [
      { ...saved, cmps_funder: 125570000, cmps_minutes: 0, cmps_time: '00:00' },
      { ...saved, cmps_servicesid: clientId, cmps_funder: 125570001, 'cmps_funder@OData.Community.Display.V1.FormattedValue': 'Configured Funder', cmps_minutes: 15.5, cmps_time: '13:45' },
      { ...saved, cmps_servicesid: enrollmentId, cmps_funder: null, cmps_minutes: null, cmps_time: null },
    ] }
    return local ? { ok: true, json: async () => data } : { success: true, data }
  }, local)
  const api = h.load('./services.ts'), result = await api.listServicesForProgramEnrollmentRecord(enrollmentId)
  assert.equal(result[0].funder, api.FUNDER_OPTIONS[0]); assert.equal(result[0].minutes, '0'); assert.equal(result[0].serviceTime, '00:00')
  assert.equal(result[1].funder, 'Configured Funder'); assert.equal(result[1].minutes, '15.5'); assert.equal(result[1].serviceTime, '13:45')
  assert.equal(result[2].funder, ''); assert.equal(result[2].minutes, ''); assert.equal(result[2].serviceTime, '')
  assert.equal(h.calls.length, 1)
})

function harness(handler, local = false) {
  const calls = [], cache = new Map()
  function load(file) {
    if (cache.has(file)) return cache.get(file)
    const source = readFileSync(new URL(file, import.meta.url), 'utf8').replaceAll('import.meta.env', '({})')
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    const module = { exports: {} }; cache.set(file, module.exports)
    vm.runInNewContext(js, {
      module, exports: module.exports, URL, URLSearchParams, Headers,
      window: { location: { hostname: local ? 'localhost' : 'powerapps.example' } },
      fetch: async (url, init = {}) => { const call = { url, init }; calls.push(call); return handler(call) },
      require(name) {
        if (name === '@microsoft/power-apps/data') return { getClient: () => ({ executeAsync: async ({ connectorOperation: call }) => {
          const api = schema.commondataserviceforapps.apis[call.operationName]
          assert.ok(api, `Unsupported operation: ${call.operationName}`)
          for (const parameter of api.parameters.filter((entry) => entry.required && entry.name !== 'connectionId')) assert.notEqual(call.parameters[parameter.name], undefined, `Missing ${parameter.name}`)
          calls.push(call); return handler(call)
        } }) }
        if (name.includes('dataSourcesInfo')) return { dataSourcesInfo: schema }
        if (name === '../../power.config.json') return config
        if (name === './auth') return { getAuthToken: () => 'test-token', ensureAuthToken: async () => 'test-token' }
        if (name === './archive') return { excludeArchived: (filter = '') => `${filter ? `(${filter}) and ` : ''}(cmps_isarchived ne 125570000 or cmps_isarchived eq null)` }
        if (name.startsWith('./')) return load(`${name}.ts`)
        throw new Error(`Unexpected dependency: ${name}`)
      },
    }, { filename: file })
    return module.exports
  }
  return { load, calls }
}

for (const local of [false, true]) test(`${local ? 'local' : 'runtime'} Program Information Only saves, edits and displays as choice 125570071`, async () => {
  let row = { ...saved }
  const h = harness((call) => {
    const payload = local ? (call.init.body ? JSON.parse(call.init.body) : null) : call.parameters.item
    if (payload) row = { ...row, ...payload }
    const listing = local ? new URL(call.url).pathname.endsWith('/cmps_serviceses') && !payload : call.operationName.startsWith('List')
    const data = listing ? { value: [row] } : row
    return local ? { ok: true, json: async () => data } : { success: true, data }
  }, local)
  const api = h.load('./services.ts')
  await api.createServicesResponse({ ...seed, cmps_servicecategory: 'Resource Navigation', cmps_service: 'Program Information Only' })
  assert.equal(row.cmps_service, 125570071)
  assert.equal(row.cmps_servicecategory, 125570010)
  assert.equal((await api.loadServicesDetailRecord(serviceId)).values.cmps_service, 'Program Information Only')
  row['cmps_service@OData.Community.Display.V1.FormattedValue'] = 'Other'
  const detail = await api.loadServicesDetailRecord(serviceId)
  assert.equal(detail.values.cmps_service, 'Program Information Only')
  await api.updateServicesResponse(serviceId, detail.values)
  assert.equal(row.cmps_service, 125570071)
  await api.updateServicesResponse(serviceId, { cmps_service: ' program information only ' })
  assert.equal(row.cmps_service, 125570071)
  const records = await api.listServicesForProgramEnrollmentRecord(enrollmentId)
  assert.equal(records[0].service, 'Program Information Only')
})

for (const local of [false, true]) test(`${local ? 'local' : 'runtime'} Additional Service Detail creates/edits CARE and Somatic Series without shifting Other or trusting stale formatted labels`, async () => {
  let row = { ...saved }
  const h = harness((call) => {
    const item = local ? (call.init.body ? JSON.parse(call.init.body) : null) : call.parameters.item
    if (item) row = { ...row, ...item }
    const data = !local && call.operationName.startsWith('List') ? { value: [row] } : row
    return local ? { ok: true, json: async () => data } : { success: true, data }
  }, local)
  const api = h.load('./services.ts')
  for (const [label, value] of [['CARE', 125570010], ['Somatic Series', 125570005], ['Other', 125570009]]) {
    await api.createServicesResponse({ ...seed, cmps_additionalservicedetail: label })
    assert.equal(row.cmps_additionalservicedetail, value)
    row['cmps_additionalservicedetail@OData.Community.Display.V1.FormattedValue'] = 'Restorative Yoga'
    const detail = await api.loadServicesDetailRecord(serviceId)
    assert.equal(detail.values.cmps_additionalservicedetail, label)
    await api.updateServicesResponse(serviceId, detail.values)
    assert.equal(row.cmps_additionalservicedetail, value)
  }
  await api.updateServicesResponse(serviceId, { cmps_additionalservicedetail: 'Restorative Yoga' })
  assert.equal(row.cmps_additionalservicedetail, 125570005)
  assert.equal((await api.loadServicesDetailRecord(serviceId)).values.cmps_additionalservicedetail, 'Somatic Series')
  row.cmps_additionalservicedetail = null
  assert.equal((await api.loadServicesDetailRecord(serviceId)).values.cmps_additionalservicedetail, 'Somatic Series')
})

test('service creation requests a representation and binds an imported enrollment by GUID, not legacy/display ID', async () => {
  const h = harness(() => ({ success: true, data: saved }))
  const created = await h.load('./services.ts').createServicesResponse(seed)
  assert.equal(created.id, serviceId)
  const item = h.calls[0].parameters.item
  assert.equal(item['cmps_programenrollment@odata.bind'], `/cmps_programenrollment1s(${enrollmentId})`)
  assert.equal(item.cmps_programenrollment, undefined)
  assert.equal(item.cmps_dateofservice, '2026-10-06')
  assert.equal(h.calls[0].parameters.prefer, 'return=representation')
  assert.equal(h.calls[0].parameters.accept, 'application/json')
  await assert.rejects(h.load('./services.ts').createServicesResponse({ ...seed, cmps_programenrollment: '19071' }), /legacy or display ID/)
  assert.equal(h.calls.length, 1)
})

test('successful runtime create without a body is resolved by exact app ID and enrollment linkage', async () => {
  const h = harness((call) => ({ success: true, data: call.operationName.startsWith('Create') ? {} : { value: [saved] } }))
  const created = await h.load('./services.ts').createServicesResponse(seed)
  assert.equal(created.id, serviceId)
  const read = h.calls[1].parameters
  assert.equal(read.$filter, "cmps_recordid eq 'SV-0479341'")
  assert.equal(read.$top, 2)
  assert.equal(read.$select.split(',').includes('cmps_programenrollment'), false)
})

test('pending save retries confirm the same service, never submit another create', async () => {
  let readable = false
  const h = harness((call) => call.operationName.startsWith('Create') ? { success: true, data: {} } : readable ? { success: true, data: { value: [saved] } } : { success: false, error: { message: 'Read unavailable' } })
  const api = h.load('./services.ts')
  await assert.rejects(api.createServicesResponse(seed), /confirmation is still pending.*same record/)
  readable = true
  assert.equal((await api.createServicesResponse(seed)).id, serviceId)
  assert.equal(h.calls.filter((call) => call.operationName.startsWith('Create')).length, 1)
})

for (const rows of [[{ ...saved, _cmps_programenrollment_value: clientId }], [saved, saved]]) test(`ambiguous or differently linked service confirmation is not treated as success (${rows.length} rows)`, async () => {
  const h = harness((call) => ({ success: true, data: call.operationName.startsWith('Create') ? {} : { value: rows } }))
  await assert.rejects(h.load('./services.ts').createServicesResponse(seed), /confirmation is still pending/)
})

test('local 204 create uses OData-EntityId rather than incorrectly declaring a failed save', async () => {
  const h = harness(() => ({ ok: true, headers: new Headers({ 'OData-EntityId': `${organization}/api/data/v9.2/cmps_serviceses(${serviceId})` }), json: async () => { throw new Error('No body') } }), true)
  assert.equal((await h.load('./services.ts').createServicesResponse(seed)).id, serviceId)
  assert.equal(h.calls.length, 1)
})

for (const local of [false, true]) test(`${local ? 'local' : 'runtime'} services remain enrollment-scoped across pages, including records beyond the old caps`, async () => {
  const first = Array.from({ length: 1000 }, (_, index) => ({ ...saved, cmps_servicesid: `33333333-3333-3333-3333-${String(index).padStart(12, '0')}` }))
  const h = harness((call) => {
    const query = local ? Object.fromEntries(new URL(call.url).searchParams) : call.parameters
    assert.equal(query.$select.split(',').includes('cmps_programenrollment'), false)
    assert.equal(query.$top, undefined)
    assert.match(query.$filter, new RegExp(`_cmps_programenrollment_value eq ${enrollmentId}`))
    const data = query.$skiptoken ? { value: [saved, { ...saved, cmps_servicesid: clientId, _cmps_programenrollment_value: clientId }, { ...saved, cmps_servicesid: enrollmentId, cmps_isarchived: 125570000 }] } : { value: first, '@odata.nextLink': `${organization}/api/data/v9.2/cmps_serviceses?${new URLSearchParams({ '$skiptoken': 'page-2', '$filter': query.$filter, '$select': query.$select })}` }
    return local ? { ok: true, json: async () => data } : { success: true, data }
  }, local)
  const records = await h.load('./services.ts').listServicesForProgramEnrollmentRecord(enrollmentId)
  assert.equal(records.length, 1001); assert.equal(records.at(-1).id, serviceId)
  assert.equal(h.calls.length, 2)
})

test('connector-wrapped service continuations use the next-page endpoint and retain enrollment scope', async () => {
  const environment = config.environmentId.replaceAll('-', '').toLowerCase()
  const connection = Object.values(config.connectionReferences).find((entry) => entry.id === '/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps').sharedConnectionId.split('/').pop()
  let route
  const h = harness((call) => {
    if (call.operationName === 'GetNextPageWithOrganization') {
      assert.equal(call.parameters.next, route)
      assert.equal(call.parameters.organization, organization)
      assert.deepEqual(Object.keys(call.parameters).sort(), ['next', 'organization'])
      const nested = new URL(call.parameters.next, organization)
      assert.match(nested.searchParams.get('$filter'), new RegExp(`_cmps_programenrollment_value eq ${enrollmentId}`))
      assert.equal(nested.searchParams.get('$skiptoken'), '<cookie last="A&B+%25" />')
      return { success: true, data: { value: [saved] } }
    }
    assert.equal(call.operationName, 'ListRecordsWithOrganization')
    route = `/api/data/v9.1.0/cmps_serviceses?${new URLSearchParams({ ...call.parameters, '$skiptoken': '<cookie last="A&B+%25" />' })}`
    const wrapper = new URL(`https://${environment.slice(0, -2)}.${environment.slice(-2)}.environment.api.powerplatform.com/connectors/runtime/invoke/scalegroups/usa/shards/00/apis/commondataserviceforapps/connections/${connection}/nextLink`)
    wrapper.searchParams.set('organization', organization); wrapper.searchParams.set('next', route)
    return { success: true, data: { value: [], '@odata.nextLink': wrapper.href } }
  })
  const records = await h.load('./services.ts').listServicesForProgramEnrollmentRecord(enrollmentId)
  assert.equal(records.length, 1); assert.equal(records[0].id, serviceId)
  assert.equal(h.calls.length, 2)
})

test('service list failures are visible errors, not empty lists or unfiltered table scans', async () => {
  const h = harness(() => ({ success: false, error: { message: 'Permission denied' } }))
  await assert.rejects(h.load('./services.ts').listServicesForProgramEnrollmentRecord(enrollmentId), /Permission denied/)
  assert.equal(h.calls.length, 1)
})

test('opening an imported enrollment and service uses supported list operations and GUID lookup columns', async () => {
  const h = harness((call) => {
    if (call.url) throw new Error('Use the runtime connector in this test')
    const p = call.parameters
    assert.equal(call.operationName, 'ListRecordsWithOrganization')
    const navigationColumns = p.entityName === 'cmps_serviceses' ? ['cmps_programenrollment'] : ['cmps_clientid', 'cmps_funder', 'cmps_funder1']
    assert.equal(p.$select.split(',').some((column) => navigationColumns.includes(column)), false)
    return { success: true, data: { value: [p.entityName === 'cmps_serviceses' ? saved : { cmps_programenrollment1id: enrollmentId, cmps_programenrollmentid: '19071', cmps_recordid: 'PE-04958', _cmps_clientid_value: null }] } }
  })
  const enrollment = await h.load('./programEnrollment.ts').loadProgramEnrollmentDetailRecord(enrollmentId, '19071')
  assert.equal(enrollment.id, enrollmentId)
  assert.match(h.calls.find((call) => call.operationName === 'ListRecordsWithOrganization').parameters.$filter, new RegExp(`cmps_programenrollment1id eq ${enrollmentId}`))
  assert.equal((await h.load('./services.ts').loadServicesDetailRecord(serviceId, 'old-id')).values.cmps_programenrollment, enrollmentId)
})

test('client enrollment roster uses GUID lookup columns so imported enrollment-linked records can be found', async () => {
  const h = harness((call) => {
    assert.equal(call.operationName, 'ListRecordsWithOrganization')
    assert.match(call.parameters.$filter, new RegExp(`_cmps_clientid_value eq ${clientId}`))
    assert.equal(call.parameters.$select.split(',').some((column) => ['cmps_clientid', 'cmps_funder1'].includes(column)), false)
    return { success: true, data: { value: [{ cmps_programenrollment1id: enrollmentId, cmps_programenrollmentid: '19071', cmps_recordid: 'PE-04958', _cmps_clientid_value: clientId }] } }
  })
  const rows = await h.load('./programEnrollment.ts').listProgramEnrollmentsForClientRecord(clientId)
  assert.equal(rows[0].id, enrollmentId); assert.equal(rows[0].clientRowId, clientId)
})

test('other enrollment-linked forms satisfy actual connector-required create headers and retain GUID bindings', async () => {
  for (const [file, create, field] of [
    ['financialAssistance', 'createFinancialAssistanceResponse', 'cmps_peid'], ['focusPlan', 'createFocusPlanResponse', 'cmps_peid'],
    ['goals', 'createGoalResponse', 'cmps_peid'], ['medicalConsentForm', 'createMedicalConsentFormResponse', 'cmps_peid'],
    ['shelterProgramGuidelines', 'createShelterProgramGuidelinesResponse', 'cmps_peid'], ['childAssessment', 'createChildAssessmentResponse', 'cmps_peid'],
    ['childSafetyPlan', 'createChildSafetyPlanResponse', 'cmps_peid'], ['childShelterIntake', 'createChildShelterIntakeResponse', 'cmps_peid'],
    ['initialSafetyPlan', 'createInitialSafetyPlanResponse', 'cmps_peid'], ['vocaForm', 'createVocaFormResponse', 'cmps_peid'],
  ]) {
    const h = harness(() => ({ success: true, data: { id: serviceId } }))
    await h.load(`./${file}.ts`)[create]({ cmps_recordid: 'TEST-046', [field]: enrollmentId })
    const call = h.calls.find((entry) => entry.operationName?.startsWith('Create'))
    assert.ok(call, file)
    assert.equal(call.parameters.item[`${field}@odata.bind`], `/cmps_programenrollment1s(${enrollmentId})`, file)
  }
})

test('all statically configured create calls supply required representation and JSON headers', () => {
  let count = 0
  for (const file of readdirSync(new URL('.', import.meta.url)).filter((name) => name.endsWith('.ts'))) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8'), tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
    const objects = new Set()
    function visit(node) {
      if (ts.isObjectLiteralExpression(node)) {
        const op = node.properties.find((entry) => ts.isPropertyAssignment(entry) && entry.name.getText(tree) === 'operationName')
        const params = node.properties.find((entry) => ts.isPropertyAssignment(entry) && entry.name.getText(tree) === 'parameters')
        if (op && params && /['"]CreateRecord(?:WithOrganization)?['"]/.test(op.initializer.getText(tree)) && ts.isObjectLiteralExpression(params.initializer)) objects.add(params.initializer)
      }
      if (ts.isCallExpression(node) && node.arguments.length > 1 && /['"]CreateRecord(?:WithOrganization)?['"]/.test(node.arguments[0].getText(tree))) for (const arg of Array.from(node.arguments).slice(1)) if (ts.isObjectLiteralExpression(arg)) objects.add(arg)
      ts.forEachChild(node, visit)
    }
    visit(tree)
    for (const object of objects) {
      const names = object.properties.map((entry) => entry.name?.getText(tree))
      assert.equal(names.includes('prefer'), true, file); assert.equal(names.includes('accept'), true, file); count++
    }
  }
  assert.ok(count >= 30)
})
