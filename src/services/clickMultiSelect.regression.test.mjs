import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const source = readFileSync(new URL('./MultiSelectDropdown.tsx', import.meta.url), 'utf8')
const module = { exports: {} }
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText, {
  module, exports: module.exports, React,
  require: (name) => { assert.equal(name, './MultiSelectDropdown.css'); return {} },
})
const MultiSelectDropdown = module.exports.default
const ids = ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222']
const labels = { [ids[0]]: 'Unit A - Bed 1 (Single)', [ids[1]]: 'Unit A - Bed 2 (Single)' }
function descendants(tree, type) {
  if (Array.isArray(tree)) return tree.flatMap((child) => descendants(child, type))
  if (!tree || typeof tree !== 'object') return []
  return [...(tree.type === type ? [tree] : []), ...descendants(tree.props?.children, type)]
}
function controlled(extras = {}) {
  let values = [...(extras.value || [])], changes = []
  const props = { id: 'beds', label: 'Beds', options: ids, optionLabels: labels, ...extras }
  return {
    render: () => MultiSelectDropdown({ ...props, value: values, onChange: (next) => { values = Array.from(next); changes.push(values) } }),
    values: () => values, changes,
  }
}
test('plain clicks select additional records, deselect only the clicked record, and clear without modifier keys', () => {
  const h = controlled()
  let tree = h.render()
  descendants(tree, 'input')[0].props.onChange({ target: { checked: true } })
  assert.deepEqual(h.values(), [ids[0]])
  tree = h.render()
  descendants(tree, 'input')[1].props.onChange({ target: { checked: true } })
  assert.deepEqual(h.values(), ids)
  tree = h.render()
  assert.ok(descendants(tree, 'input').every((input) => input.props.checked))
  descendants(tree, 'input')[0].props.onChange({ target: { checked: false } })
  assert.deepEqual(h.values(), [ids[1]])
  tree = h.render()
  descendants(tree, 'button')[0].props.onClick()
  assert.deepEqual(h.values(), [])
})
test('stored IDs reload checked, while both summary and options show names instead of GUIDs', () => {
  const h = controlled({ value: ids })
  const tree = h.render(), html = renderToStaticMarkup(tree)
  assert.equal(descendants(tree, 'input').filter((input) => input.props.checked).length, 2)
  for (const label of Object.values(labels)) assert.ok(html.includes(label))
  for (const id of ids) assert.ok(!html.includes(id), 'GUIDs must remain internal selection values')
  assert.match(html, /role="group"/)
  assert.match(html, /aria-labelledby="beds-label beds-selection"/)
})
test('disabled/read-only/saving controls cannot toggle or clear selections, including direct callbacks', () => {
  const h = controlled({ disabled: true, value: [ids[0]] })
  const tree = h.render()
  for (const input of descendants(tree, 'input')) {
    assert.equal(input.props.disabled, true)
    input.props.onChange({ target: { checked: !input.props.checked } })
  }
  descendants(tree, 'button')[0].props.onClick()
  let prevented = false
  descendants(tree, 'details')[0].props.onClick({ preventDefault: () => { prevented = true } })
  assert.equal(prevented, true)
  assert.equal(descendants(tree, 'summary')[0].props['aria-disabled'], true)
  assert.deepEqual(h.values(), [ids[0]])
  assert.equal(h.changes.length, 0)
})
test('string choice fields retain their choice labels and unknown hidden IDs are not lost', () => {
  const choices = controlled({ options: ['Advocacy Provided', 'Provided Referral'], optionLabels: undefined, value: ['Advocacy Provided'] })
  const html = renderToStaticMarkup(choices.render())
  assert.match(html, /Advocacy Provided/)
  const h = controlled({ value: ['33333333-3333-3333-3333-333333333333'] })
  let tree = h.render()
  assert.match(renderToStaticMarkup(tree), /Saved selection unavailable/)
  assert.doesNotMatch(renderToStaticMarkup(tree), /33333333-3333-3333-3333-333333333333/)
  descendants(tree, 'input')[0].props.onChange({ target: { checked: true } })
  assert.deepEqual(h.values(), ['33333333-3333-3333-3333-333333333333', ids[0]])
})
test('empty options remain usable without requiring a selection', () => {
  const h = controlled({ options: [], optionLabels: {}, hint: 'No available beds.' })
  const tree = h.render()
  assert.equal(descendants(tree, 'input').length, 0)
  assert.equal(descendants(tree, 'button')[0].props.disabled, true)
  assert.match(renderToStaticMarkup(tree), /No available beds/)
})
test('household and beds use the shared click selector while preserving IDs, display labels and bed validation rules', () => {
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  assert.match(app, /id="household-members-select"[\s\S]*?options=\{householdVisibleMemberDrafts.map\(\(member\) => member.clientRowId\)\}/)
  assert.match(app, /onChange=\{updateHouseholdSelectedMembers\}/)
  assert.match(app, /id="bed-enrollment-selected-beds"[\s\S]*?isBedSelectionRequired\(String\(selectedBedEnrollmentProgram\?\.program \|\| ''\), availableBedsForEnrollment, String\(activeFormSession.values.cmps_checkoutdate \|\| ''\)\)/)
  assert.match(app, /onChange=\{\(selected\) => updateBedEnrollmentValue\('cmps_selectedbeds', selected.join\(', '\)\)\}/)
  assert.match(app, /disabled=\{isUserPreview \|\| activeFormSaving \|\| bedsLoading\}/)
  assert.match(app, /Beds are optional when a valid Check Out Date is entered/)
  assert.match(app, /You may save without selecting a bed/)
  assert.doesNotMatch(app, /Hold Ctrl|Ctrl\/Cmd-click|selectedOptions/)
})
test('no application JSX select requires Ctrl/Command for multiple selection', () => {
  function scan(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory)
      if (entry.isDirectory()) { scan(path); continue }
      if (!entry.name.endsWith('.tsx')) continue
      const content = readFileSync(path, 'utf8')
      const file = ts.createSourceFile(entry.name, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
      function visit(node) {
        if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(file) === 'select') {
          assert.equal(node.attributes.properties.some((attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText(file) === 'multiple'), false, path.pathname)
        }
        ts.forEachChild(node, visit)
      }
      visit(file)
    }
  }
  scan(new URL('../', import.meta.url))
})
