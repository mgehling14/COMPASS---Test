import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { funderTestHarness } from './funderTestHarness.mjs'

const contractId = '33333333-3333-3333-3333-333333333333'
const otherId = '11111111-1111-1111-1111-111111111111'
const transactionId = '22222222-2222-2222-2222-222222222222'
const transaction = { cmps_dateoftransaction: '2026-10-02', cmps_activecontract: contractId, cmps_amount: '100.25', cmps_transactiontype: 'Charge' }
const contract = { cmps_contractname: 'Test Contract', cmps_contractamount: '1000.10', cmps_contractstartdate: '2026-10-02', cmps_contractenddate: '2027-10-02', cmps_contractstatus: 'Open for Disbursements' }
function pool(h, id = contractId) { return h.state.cmps_fundercontracts.find((row) => row.cmps_actualcontractid === id).cmps_remainingpoolofmoney }

test('currency arithmetic is exact through four decimal places and allows credits or negative balances', () => {
  const api = funderTestHarness().load('./funderBalance.ts')
  assert.equal(api.calculateRemainingPool(1, [0.1, 0.2]), 0.7)
  assert.equal(api.calculateRemainingPool('1000.0001', ['0.0001', '0.0002']), 999.9998)
  assert.equal(api.calculateRemainingPool(0, [-25.50]), 25.5)
  assert.equal(api.calculateRemainingPool(10, [25]), -15)
  assert.throws(() => api.calculateRemainingPool(null, []), /missing/)
  assert.throws(() => api.calculateRemainingPool(10, ['invalid']), /invalid/)
})

for (const local of [true, false]) {
  const mode = local ? 'local' : 'runtime'
  for (const admin of [true, false]) {
    test(`${mode} ${admin ? 'admin editor' : 'standard form'} initializes a new contract pool, including zero`, async () => {
      const h = funderTestHarness({ local })
      for (const amount of ['1000.10', '0']) {
        if (admin) await h.api.saveFunderAdminRecord('contract', '', { ...contract, cmps_contractamount: amount, cmps_remainingpoolofmoney: '99999' })
        else await h.load('./contract.ts').createContractResponse({ ...contract, cmps_contractamount: amount, cmps_remainingpoolofmoney: '99999' })
        assert.equal(h.state.cmps_fundercontracts.at(-1).cmps_remainingpoolofmoney, Number(amount))
      }
    })

    test(`${mode} ${admin ? 'admin editor' : 'standard form'} subtracts transactions and reconciles edits/moved links without double counting`, async () => {
      const h = funderTestHarness({ local })
      const save = async (id, values) => admin
        ? h.api.saveFunderAdminRecord('transaction', id, values)
        : id ? h.load('./funderTransaction.ts').updateFunderTransactionResponse(id, values) : h.load('./funderTransaction.ts').createFunderTransactionResponse(values)
      await save('', transaction)
      const id = h.state.cmps_fundertransactions[0].cmps_fundertransactionid
      assert.equal(pool(h), 2400.25)
      await save(id, { ...transaction, cmps_amount: '200.50' })
      assert.equal(pool(h), 2300)
      await save(id, { ...transaction, cmps_amount: '200.50' })
      assert.equal(pool(h), 2300)
      assert.equal(h.state.cmps_fundertransactions.length, 1)
      await save(id, { ...transaction, cmps_activecontract: otherId, cmps_amount: '-25.50', cmps_transactiontype: 'Fee Adjustment' })
      assert.equal(pool(h), 2500.5)
      assert.equal(pool(h, otherId), 2526)
    })
  }

  test(`${mode} recomputes a missing pool using all linked transactions, including archived and paginated records`, async () => {
    const h = funderTestHarness({ local, pageSize: 2, rowsByAlias: {
      cmps_fundercontracts: [{ cmps_actualcontractid: contractId, cmps_contractamount: 1000, cmps_remainingpoolofmoney: null }],
      cmps_fundertransactions: [
        { cmps_fundertransactionid: transactionId, _cmps_activecontract_value: contractId, cmps_amount: 100, cmps_isarchived: 125570000 },
        { cmps_fundertransactionid: otherId, _cmps_activecontract_value: contractId, cmps_amount: 10 },
        { cmps_fundertransactionid: contractId, _cmps_activecontract_value: contractId, cmps_amount: 0.2 },
      ],
    } })
    await h.api.saveFunderAdminRecord('transaction', '', { ...transaction, cmps_amount: '0.10' })
    assert.equal(pool(h), 889.7)
    const listCalls = h.calls.filter((call) => call.operationName === 'ListRecordsWithOrganization' || call.url?.includes('/cmps_fundertransactions?'))
    assert.ok(listCalls.some((call) => call.parameters ? call.parameters.$skiptoken : new URL(call.url).searchParams.get('$skiptoken')))
    for (const call of listCalls) assert.doesNotMatch(call.parameters?.$filter || new URL(call.url).searchParams.get('$filter'), /isarchived/)
  })

  test(`${mode} contract amount edits preserve money already spent`, async () => {
    const h = funderTestHarness({ local, rowsByAlias: { cmps_fundertransactions: [{ cmps_fundertransactionid: transactionId, _cmps_activecontract_value: contractId, cmps_amount: 100 }] } })
    await h.api.saveFunderAdminRecord('contract', contractId, { ...contract, cmps_contractamount: '3000' })
    assert.equal(pool(h), 2900)
    await h.load('./contract.ts').updateContractResponse(contractId, { cmps_contractamount: '2000' })
    assert.equal(pool(h), 1900)
  })

  test(`${mode} a partial save retains its transaction ID and retries without duplicate records`, async () => {
    const h = funderTestHarness({ local })
    h.failBalanceWrites()
    let savedId
    await assert.rejects(h.api.saveFunderAdminRecord('transaction', '', transaction), (error) => {
      assert.equal(error.name, 'FunderBalanceSyncError')
      savedId = error.savedRecordId
      assert.match(error.message, /record was saved/)
      return true
    })
    assert.equal(h.state.cmps_fundertransactions.length, 1)
    assert.equal(h.state.cmps_fundertransactions[0].cmps_fundertransactionid, savedId)
    await h.api.saveFunderAdminRecord('transaction', savedId, transaction)
    assert.equal(h.state.cmps_fundertransactions.length, 1)
    assert.equal(pool(h), 2400.25)
  })

  test(`${mode} retry repairs both contracts after a failed transaction move`, async () => {
    const h = funderTestHarness({ local })
    const created = await h.load('./funderTransaction.ts').createFunderTransactionResponse(transaction)
    h.failBalanceWrites()
    const moved = { ...transaction, cmps_activecontract: otherId }
    await assert.rejects(h.load('./funderTransaction.ts').updateFunderTransactionResponse(created.id, moved), /record was saved/)
    await h.load('./funderTransaction.ts').updateFunderTransactionResponse(created.id, moved)
    assert.equal(pool(h), 2500.5)
    assert.equal(pool(h, otherId), 2400.25)
  })

  test(`${mode} synchronization retries when another transaction arrives during the balance write`, async () => {
    const h = funderTestHarness({ local })
    h.afterNextBalanceWrite((state) => state.cmps_fundertransactions.push({ cmps_fundertransactionid: transactionId, _cmps_activecontract_value: contractId, cmps_amount: 10 }))
    await h.api.saveFunderAdminRecord('transaction', '', transaction)
    assert.equal(pool(h), 2390.25)
  })

  test(`${mode} manage funders reads the stored pool alongside contract and individual transaction amounts`, async () => {
    const h = funderTestHarness({ local })
    await h.api.saveFunderAdminRecord('transaction', '', transaction)
    const data = await h.load('./funders.ts').loadFunderAdminData()
    const row = data.contracts.find((row) => row.id === contractId)
    assert.equal(row.amount, '2500.5')
    assert.equal(row.remainingPool, '2400.25')
    assert.equal(row.values.cmps_remainingpoolofmoney, '2400.25')
    assert.equal(data.transactions[0].amount, '100.25')
  })
}

test('both editor save-error handlers retain the saved ID and the pool is displayed read-only', () => {
  const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  assert.match(source, /setFunderAdminEditor\(\(current\).*rowId: error.savedRecordId/)
  assert.match(source, /session.rowId = err.savedRecordId\s+retainValues\(session.values\)/)
  assert.match(source, /<th>Remaining Pool of Money<\/th>/)
  assert.match(source, /<input readOnly value=.*cmps_remainingpoolofmoney/)
})
