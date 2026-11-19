import assert from 'node:assert/strict'
import test from 'node:test'
import { auditHarness, id, org, wrapped } from './auditHarness.mjs'
for (const local of [false, true]) for (const wrap of [false, true]) test(`${local ? 'local' : 'runtime'} complete ledger handles ${wrap ? 'wrapped' : 'direct'} continuations`, async () => {
  let balance = 100, second = 0
  const h = auditHarness((call) => {
    if (call.write) { balance = call.parameters.item.cmps_remainingpoolofmoney; return {} }
    if (call.alias === 'cmps_fundercontracts') return { cmps_contractamount: 100, cmps_remainingpoolofmoney: balance }
    if (call.parameters.next || call.parameters.$skiptoken) { second++; return { value: [{ cmps_amount: 30 }] } }
    const next = `api/data/v9.2/cmps_fundertransactions?$skiptoken=${encodeURIComponent('page+2 %3C')}`
    return { value: [{ cmps_amount: 20 }], '@odata.nextLink': wrap ? wrapped(next) : `${org}/${next}` }
  }, local)
  await h.load('./funderBalance.ts').synchronizeContractBalance(id(1))
  assert.equal(balance, 50); assert.equal(second, 2, 'Read full ledger both before and after writing')
})
for (const mode of ['repeated', 'unsafe', 'failed']) test(`${mode} ledger continuation prevents balance updates`, async () => {
  const next = mode === 'unsafe' ? 'https://evil.example/api/data/v9.2/cmps_fundertransactions?$skiptoken=bad' : wrapped('api/data/v9.2/cmps_fundertransactions?$skiptoken=next')
  const h = auditHarness((call) => {
    if (call.alias === 'cmps_fundercontracts') return { cmps_contractamount: 100 }
    if (mode === 'failed' && call.parameters.next) throw Error('Second page failed')
    return { value: [{ cmps_amount: 20 }], '@odata.nextLink': next }
  })
  await assert.rejects(h.load('./funderBalance.ts').synchronizeContractBalance(id(1)))
  assert.equal(h.calls.filter((call) => call.write).length, 0)
})
