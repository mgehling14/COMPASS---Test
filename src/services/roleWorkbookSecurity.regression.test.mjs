import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
const require = createRequire(import.meta.url), XLSX = require('xlsx')
function parser() {
  const source = readFileSync(new URL('./roleImport.ts', import.meta.url), 'utf8').replaceAll('import.meta.env', '({})')
  const module = { exports: {} }
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    module, exports: module.exports,
    require(name) {
      if (name === 'xlsx') return XLSX
      if (name === '@microsoft/power-apps/data') return { getClient: () => ({ executeAsync: () => { throw Error('Parsing must never access Dataverse') } }) }
      if (name.includes('dataSourcesInfo')) return { dataSourcesInfo: {} }
      if (name === './auth') return {}
      throw Error(`Unexpected dependency ${name}`)
    },
  })
  return module.exports.parseRoleWorkbook
}
function workbook(rows, bookType = 'xlsx') {
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Roles')
  return XLSX.write(wb, { type: 'array', bookType })
}
test('installed parser is the pinned official patched distribution, not vulnerable npm xlsx 0.18.5', () => {
  assert.equal(XLSX.version, '0.20.3')
  const lock = JSON.parse(readFileSync(new URL('../../package-lock.json', import.meta.url), 'utf8'))
  assert.equal(lock.packages['node_modules/xlsx'].version, '0.20.3')
  assert.match(lock.packages['node_modules/xlsx'].resolved, /^https:\/\/cdn\.sheetjs\.com\/xlsx-0\.20\.3\//)
  assert.ok(lock.packages['node_modules/xlsx'].integrity)
})
for (const format of ['xlsx', 'xls', 'xlsm', 'csv']) test(`${format} retains role headers, merged-style blank headers, aliases and permission order`, async () => {
  const rows = [['Form', 'Staff', '', '', '', '', 'Supervisor', '', '', '', ''], ['', 'Visibility', 'Search', 'Create', 'Edit', 'Ignore Assignment', 'View', 'Search', 'Create', 'Edit', 'Ignore Program Assignment'], ['Client Profile', 'yes', 'x', '', 'true', '1', 'x', '', 'x', '', ''], ['Services', '', '', 'x', 'x', '', 'x', 'x', '', '', '']]
  const roles = await parser()(workbook(rows, format))
  assert.equal(roles.length, 2)
  assert.equal(roles[0].roleName, 'Staff')
  assert.deepEqual(JSON.parse(roles[0].jsonData)['Client Profile'], ['x', 'x', '', 'x', 'x'])
  assert.deepEqual(JSON.parse(roles[1].jsonData).Services, ['x', 'x', '', '', ''])
})
test('prototype-shaped form names remain own JSON data and cannot modify prototypes', async () => {
  const roles = await parser()(workbook([['Form', 'Staff'], ['', 'Create'], ['__proto__', 'x'], ['constructor', 'x']]))
  const data = JSON.parse(roles[0].jsonData)
  assert.ok(Object.hasOwn(data, '__proto__')); assert.ok(Object.hasOwn(data, 'constructor'))
  assert.equal({}.polluted, undefined)
})
test('empty, malformed, invalid-header and oversized workbooks reject without accessing Dataverse', async () => {
  for (const data of [new ArrayBuffer(0), new ArrayBuffer(10 * 1024 * 1024 + 1), new TextEncoder().encode('PK\x03\x04broken zip').buffer, workbook([['not role headers'], ['garbage'], ['Services']])]) await assert.rejects(parser()(data))
})
