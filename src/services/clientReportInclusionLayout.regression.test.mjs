import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'

const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
const controlSource = readFileSync(new URL('./reporting/ClientReportExclusionControl.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')
const tree = ts.createSourceFile('App.tsx', appSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const nodes = []
function visit(node) { if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(tree) === 'ClientReportExclusionControl') nodes.push(node); ts.forEachChild(node, visit) }
visit(tree)
function className(node) {
  if (!ts.isJsxElement(node)) return ''
  const attribute = node.openingElement.attributes.properties.find((attr) => ts.isJsxAttribute(attr) && attr.name.getText(tree) === 'className')
  return attribute?.initializer && ts.isStringLiteral(attribute.initializer) ? attribute.initializer.text : ''
}
test('both summary and full-record report controls live inside the existing profile action rows', () => {
  assert.equal(nodes.length, 2)
  const locations = nodes.map((node) => {
    let parent = node.parent
    while (parent && !className(parent).split(/\s+/).includes('hub-form-editor-actions')) parent = parent.parent
    assert.ok(parent, 'Report control must be nested in an existing action row, not a new profile grid child')
    return className(parent)
  })
  assert.ok(locations.includes('hub-form-editor-actions client-profile-primary-actions'))
  assert.ok(locations.includes('hub-form-editor-actions'))
  assert.match(css, /\.hub-card\s*\{[^}]*display:\s*grid/)
  assert.match(css, /\.panel\s*\{[^}]*grid-column:\s*span 6/)
})
function component() {
  const module = { exports: {} }
  vm.runInNewContext(ts.transpileModule(controlSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, { module, exports: module.exports, AbortController, require(name) { if (name === 'react') return React; if (name === 'react/jsx-runtime') return jsxRuntime; if (name === './clientReportExclusion') return { loadClientReportExclusion() { throw Error('Static rendering must not read Dataverse') }, saveClientReportExclusion() { throw Error('Static rendering must not write Dataverse') } }; throw Error(name) } })
  return module.exports.default
}
test('inline control renders compact buttons with no panel, section, or extra grid container', () => {
  const html = renderToStaticMarkup(React.createElement(component(), { profileId: 'profile', canManage: true, savedBy: 'Admin' }))
  assert.equal((html.match(/<button /g) || []).length, 2)
  assert.match(html, /Exclude from reports \(Yes\)/)
  assert.match(html, /Refresh inclusion/)
  assert.doesNotMatch(html, /<section|<article|<div|class="panel"|<h4|<p/)
  assert.match(html, /IT Admin only/)
})
test('layout change preserves the IT Admin and View as User permission boundaries', () => {
  assert.equal(renderToStaticMarkup(React.createElement(component(), { profileId: 'profile', canManage: false, savedBy: 'Staff' })), '')
  for (const node of nodes) assert.match(node.getText(tree), /canManage=\{canAccessRoleAdmin && !isUserPreview\}/)
  assert.match(controlSource, /request\.current\?\.abort\(\)/)
  assert.match(controlSource, /canManage: \(\) => permission.current/)
})
