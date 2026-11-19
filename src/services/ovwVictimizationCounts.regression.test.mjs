import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import React from 'react'
import * as JSX from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'
const catalog = JSON.parse(readFileSync(new URL('./reporting/legacyReportCatalog.json', import.meta.url), 'utf8'))
const original = catalog.reports.find((report) => report.id === 'ovw-monthly-report-exhibit-j-v26-1')
function load(name) {
  const module = { exports: {} }
  let source
  try { source = readFileSync(new URL('./reporting/' + name + '.ts', import.meta.url), 'utf8') } catch { source = readFileSync(new URL('./reporting/' + name + '.tsx', import.meta.url), 'utf8') }
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    module, exports: module.exports, Date, Map, Set, WeakMap, Intl,
    require(key) { if (key === 'react') return React; if (key === 'react/jsx-runtime') return JSX; if (key.startsWith('./')) return load(key.slice(2)); throw Error(key) },
  })
  return module.exports
}
const { prepareOvwReportLayout } = load('ovwReportLayout')
const { evaluateRdl } = load('rdlExpressions')
function cells(report) {
  const output = new Map()
  function visit(items) { for (const item of items) if (item.kind === 'text') output.set(item.name, item.paragraphs.flat().map((run) => run.value)); else if (item.kind === 'table') for (const row of item.rows) for (const cell of row) visit(cell.items) }
  visit(report.items); return output
}
const expected = ['Textbox166', 'Textbox173', 'Textbox180', 'Textbox194', 'Textbox342', 'Textbox201', 'Textbox208', 'Textbox349', 'Textbox328', 'Textbox335']
test('OVW changes only the ten type rows; Section B, Section A, total expressions, source catalog and other reports remain unchanged', () => {
  const before = JSON.stringify(original), prepared = prepareOvwReportLayout(original), previous = cells(original), current = cells(prepared)
  assert.deepEqual([...previous.keys()].filter((key) => JSON.stringify(previous.get(key)) !== JSON.stringify(current.get(key))).sort(), [...expected].sort())
  assert.deepEqual(current.get('Textbox321'), previous.get('Textbox321'), 'Keep Section C total unchanged as requested')
  for (const cell of expected) assert.match(current.get(cell)[0], /^=CountDistinct\(/)
  assert.equal(JSON.stringify(original), before)
  assert.equal(JSON.stringify(prepareOvwReportLayout(prepared)), JSON.stringify(prepared))
  const other = { ...original, id: 'ovw-dq-report-v26-1' }
  assert.equal(prepareOvwReportLayout(other), other)
})
test('two multi-victimization clients with a shared type show two for that type, one for their other types, and the original total', () => {
  const a = { Client_ProfileID: 'client-a', OVWClientServedStatus: '1-Fully Served', VictimType: 'Domestic Violence|Elder Abuse/Neglect/Exploitation' }
  const b = { Client_ProfileID: 'client-b', OVWClientServedStatus: '1-Fully Served', VictimType: 'Domestic Violence|Adult Survivor of Child SA' }
  const rows = [a, b, { ...a }, { Client_ProfileID: 'single-only', OVWClientServedStatus: '1-Fully Served', VictimType: 'Sexual Assault' }]
  const context = { rows, row: rows[0], parameters: {}, scopes: { OVW_02_demographics: rows } }
  const raw = cells(original), prepared = cells(prepareOvwReportLayout(original))
  const value = (name) => evaluateRdl(prepared.get(name)[0], context)
  assert.equal(value('Textbox173'), 2)
  assert.equal(value('Textbox194'), 1); assert.equal(value('Textbox335'), 1)
  assert.equal(value('Textbox166'), 0, 'Single-victimization clients are not part of Section C')
  assert.equal(value('Textbox321'), evaluateRdl(raw.get('Textbox321')[0], context))
  const result = { datasets: Object.fromEntries(original.datasets.map((dataset) => [dataset.name, { rows: dataset.name === 'OVW_02_demographics' ? rows : [] }])), generatedAt: '2026-10-23', warnings: [], displayIds: {} }
  const View = load('LegacyReportView').default
  const html = renderToStaticMarkup(React.createElement(View, { report: original, parameters: {}, result }))
  const sectionC = html.slice(html.indexOf('Section C - Multiple Victimization Types'))
  assert.match(sectionC, /Domestic Violence[\s\S]*?>2<\/span>/)
  assert.doesNotMatch(html, /Report expression needs review/)
})
test('every type can display counts greater than one while duplicate rows do not inflate distinct-client counts', () => {
  const categories = ['Sexual Assault', 'Domestic Violence', 'Stalking', 'Adult Survivor of Child SA', 'Child SA', 'Sex Trafficked', 'Labor Trafficked', 'Sexual Harassment', 'Homeless', 'Elder Abuse/Neglect/Exploitation']
  const current = cells(prepareOvwReportLayout(original))
  categories.forEach((category, index) => {
    const other = category === 'Domestic Violence' ? 'Sexual Assault' : 'Domestic Violence'
    const row = { Client_ProfileID: 'a', VictimType: category + '|' + other }
    const rows = [row, { ...row }, { ...row, Client_ProfileID: 'b' }]
    assert.equal(evaluateRdl(current.get(expected[index])[0], { rows, row, parameters: {}, scopes: {} }), 2, category)
  })
})
