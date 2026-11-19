import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'
import { funderTestHarness } from './funderTestHarness.mjs'

const rowId = '11111111-1111-1111-1111-111111111111'
const funderId = '22222222-2222-2222-2222-222222222222'
const contractId = '33333333-3333-3333-3333-333333333333'
const valid = {
  funder: { cmps_name: 'Test Funder', cmps_activechoice: 'Yes', cmps_program: 'SV Helpline' },
  contract: { cmps_contractname: 'Test Contract', cmps_funder: funderId, cmps_contractamount: '2500.50', cmps_contractstartdate: '2026-10-02', cmps_contractenddate: '2027-10-01', cmps_contractstatus: 'Open for Disbursements' },
  transaction: { cmps_dateoftransaction: '2026-10-02', cmps_activecontract: contractId, cmps_amount: '-25.50', cmps_transactiontype: 'Fee Adjustment' },
}
const aliases = { funder: 'cmps_funders', contract: 'cmps_fundercontracts', transaction: 'cmps_fundertransactions' }

for (const local of [true, false]) test(`${local ? 'local' : 'runtime'} Funder Add returns the created row ID so Remain updates instead of inserting`, async () => {
  const h = harness(local)
  const saved = await h.api.saveFunderAdminRecord('funder', '', valid.funder)
  assert.match(saved.id, /^[a-f\d-]{36}$/i)
  await h.api.saveFunderAdminRecord('funder', saved.id, { ...valid.funder, cmps_name: 'Updated name' })
  assert.equal(h.state.cmps_funders.length, 1); assert.equal(h.state.cmps_funders[0].cmps_name, 'Updated name')
})

function harness(local = true, rowsByAlias = {}) {
  return funderTestHarness({ local, rowsByAlias: { cmps_fundertransactions: [{ cmps_fundertransactionid: rowId, _cmps_activecontract_value: contractId, cmps_amount: 0 }], ...rowsByAlias } })
}

test('new active funders and open contracts with future end dates remain available in app pickers', async () => {
  const { load, calls } = harness(true, {
    cmps_funders: [{ cmps_funderid: funderId, cmps_name: 'Test Funder', cmps_activechoice: 125570000 }],
    cmps_fundercontracts: [
      { cmps_actualcontractid: contractId, cmps_contractname: 'Open Contract', cmps_contractenddate: '9999-12-31T00:00:00Z', cmps_contractstatus: 125570000 },
      { cmps_actualcontractid: rowId, cmps_contractname: 'Expired', cmps_contractenddate: '2000-01-01T00:00:00Z', cmps_contractstatus: 125570000 },
      { cmps_actualcontractid: rowId, cmps_contractname: 'Suspended', cmps_contractenddate: '9999-12-31T00:00:00Z', cmps_contractstatus: 125570002 },
    ],
  })
  const funders = load('./funders.ts')
  assert.deepEqual(Array.from(await funders.loadActiveFunders(), (row) => row.id), [funderId])
  assert.ok(new URL(calls[0].url).searchParams.get('$select').includes('cmps_activechoice'))
  assert.deepEqual(Array.from(await funders.loadActiveFunderContracts(), (row) => row.id), [contractId])
})

test('edit drafts retain raw dates, amounts, names, and lookup IDs while decoding choice labels', () => {
  const { api } = harness()
  const funder = api.mapFunderAdminValues('funder', { cmps_name: 'Test Funder', cmps_startdate: '2026-10-02T00:00:00Z', cmps_activechoice: 125570001, cmps_program: 125570006 })
  assert.equal(funder.cmps_startdate, '2026-10-02')
  assert.equal(funder.cmps_activechoice, 'No')
  assert.equal(funder.cmps_program, 'SV Helpline')
  const contract = api.mapFunderAdminValues('contract', { cmps_contractname: 'Contract Name', _cmps_funder_value: funderId, cmps_contractamount: 0, cmps_contractenddate: '2027-10-01T00:00:00Z', cmps_contractstatus: 125570002 })
  assert.equal(contract.cmps_contractname, 'Contract Name')
  assert.equal(contract.cmps_funder, funderId)
  assert.equal(contract.cmps_contractamount, '0')
  assert.equal(contract.cmps_contractenddate, '2027-10-01')
  assert.equal(contract.cmps_contractstatus, 'Suspended')
  const transaction = api.mapFunderAdminValues('transaction', { _cmps_activecontract_value: contractId, cmps_amount: -25.50, cmps_transactiontype: 125570001 })
  assert.equal(transaction.cmps_activecontract, contractId)
  assert.equal(transaction.cmps_amount, '-25.5')
  assert.equal(transaction.cmps_transactiontype, 'Fee Adjustment')
})

for (const local of [true, false]) {
  test(`${local ? 'local' : 'runtime'} Add and Edit save to the correct table with numeric choices and proper links`, async () => {
    const { api, calls } = harness(local)
    for (const kind of ['funder', 'contract', 'transaction']) {
      await api.saveFunderAdminRecord(kind, '', { ...valid[kind], cmps_isarchived: '125570000' })
      await api.saveFunderAdminRecord(kind, rowId, valid[kind])
      const writes = calls.filter((call) => {
        const alias = call.parameters?.entityName || new URL(call.url).pathname.split('/').at(-1).split('(')[0]
        const item = call.parameters?.item || (call.init?.body ? JSON.parse(call.init.body) : null)
        return alias === aliases[kind] && item && (kind !== 'contract' || 'cmps_contractname' in item)
      })
      const [create, update] = writes.slice(-2)
      if (local) {
        assert.ok(create.url.endsWith(`/${aliases[kind]}`))
        assert.equal(create.init.method, 'POST')
        assert.ok(update.url.endsWith(`/${aliases[kind]}(${rowId})`))
        assert.equal(update.init.method, 'PATCH')
      } else {
        assert.equal(create.operationName, 'CreateRecordWithOrganization')
        assert.equal(update.operationName, 'UpdateRecordWithOrganization')
        assert.equal(update.parameters.recordId, rowId)
        assert.equal(create.parameters.entityName, aliases[kind])
        assert.equal(update.parameters.entityName, aliases[kind])
      }
      const payload = local ? JSON.parse(create.init.body) : create.parameters.item
      assert.equal(Object.hasOwn(payload, 'cmps_isarchived'), false)
      if (kind === 'funder') {
        assert.equal(payload.cmps_activechoice, 125570000)
        assert.equal(payload.cmps_program, 125570006)
      } else if (kind === 'contract') {
        assert.equal(payload.cmps_contractamount, 2500.50)
        assert.equal(payload.cmps_contractstatus, 125570000)
        assert.equal(payload['cmps_funder@odata.bind'], `/cmps_funders(${funderId})`)
      } else {
        assert.equal(payload.cmps_amount, -25.50)
        assert.equal(payload.cmps_transactiontype, 125570001)
        assert.equal(payload['cmps_activecontract@odata.bind'], `/cmps_fundercontracts(${contractId})`)
      }
    }
  })
}

test('editing can clear optional dates, notes, choices, and the funder relationship', async () => {
  const { api, calls } = harness()
  await api.saveFunderAdminRecord('funder', rowId, { ...valid.funder, cmps_enddate: '', cmps_program: '' })
  let payload = JSON.parse(calls.at(-1).init.body)
  assert.equal(payload.cmps_enddate, null)
  assert.equal(payload.cmps_program, null)
  await api.saveFunderAdminRecord('contract', rowId, { ...valid.contract, cmps_funder: '', cmps_notes: '', cmps_closedsuspendeddate: '' })
  payload = JSON.parse(calls.findLast((call) => call.init?.body && JSON.parse(call.init.body).cmps_contractname).init.body)
  assert.equal(payload.cmps_funder, null)
  assert.equal(payload.cmps_notes, '')
  assert.equal(payload.cmps_closedsuspendeddate, null)
})

test('missing required fields and invalid choices, amounts, dates, or IDs cannot trigger writes', async () => {
  const { api, calls } = harness()
  for (const [kind, values] of [
    ['funder', { ...valid.funder, cmps_name: '   ' }],
    ['funder', { ...valid.funder, cmps_activechoice: 'Maybe' }],
    ['contract', { ...valid.contract, cmps_contractamount: '-1' }],
    ['contract', { ...valid.contract, cmps_contractstartdate: '2026-02-31' }],
    ['contract', { ...valid.contract, cmps_funder: 'not-a-guid' }],
    ['transaction', { ...valid.transaction, cmps_activecontract: '' }],
    ['transaction', { ...valid.transaction, cmps_amount: '12 dollars' }],
  ]) await assert.rejects(api.saveFunderAdminRecord(kind, '', values))
  await assert.rejects(api.saveFunderAdminRecord('funder', 'not-a-guid', valid.funder), /record ID is invalid/)
  assert.equal(calls.length, 0)
})

test('the three admin sections have independent collapse controls and wired Add/Edit actions', () => {
  const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  const ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const collapseKeys = []
  const actionKinds = new Map()
  function visit(node) {
    if (ts.isJsxAttribute(node) && node.name.getText(ast) === 'aria-expanded' && node.initializer?.getText(ast).includes('funderAdminExpanded.')) {
      collapseKeys.push(node.initializer.getText(ast))
    }
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'openFunderAdminEditor') {
      const key = node.arguments[0].getText(ast)
      actionKinds.set(key, (actionKinds.get(key) || 0) + 1)
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  assert.equal(collapseKeys.length, 3)
  for (const kind of ['funder', 'contract', 'transaction']) {
    assert.ok(collapseKeys.some((value) => value.includes(`funderAdminExpanded.${kind}`)))
    assert.equal(actionKinds.get(`'${kind}'`), 2)
  }
})
