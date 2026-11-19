import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'

test('Home maintenance renders an accessible, static message with no search features', () => {
  const source = readFileSync(new URL('./HomeMaintenance.tsx', import.meta.url), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const require = createRequire(import.meta.url)
  const module = { exports: {} }
  vm.runInNewContext(js, { module, exports: module.exports, require: (name) => name.endsWith('.css') ? {} : require(name) })
  const markup = renderToStaticMarkup(createElement(module.exports.default))
  assert.match(markup, /More is on the horizon\./)
  assert.match(markup, /currently under maintenance/)
  assert.match(markup, /helpful features and information in the future/)
  assert.match(markup, /aria-labelledby="home-maintenance-title"/)
  assert.match(markup, /id="home-maintenance-title"/)
  assert.doesNotMatch(markup, /<(input|select|button|table)|Search Records|Search Results|Search Notes/)
})

test('Home messages are an exclusive top-level view so search, results, hub hero, and notes cannot render beneath them', () => {
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  assert.match(app, /<section className="hub-main">\s*\{selectedAppNav === 'home' \? <HomeMessages state=\{homeMessages\} \/> : selectedAppNav === 'reports' \? \(/)
  assert.match(app, /async function runHubSearch\(\) \{\s*if \(!selectedHub \|\| selectedAppNav === 'home'\) return/)
  assert.doesNotMatch(app, /Search any supported table from one place\./)
  assert.doesNotMatch(app, /Search across the available tables and open the record you need/)
  assert.match(app, /selectedAppNav === 'home'\) return/)
})

test('maintenance styling adapts to small screens and requires no external assets or animation', () => {
  const css = readFileSync(new URL('./HomeMaintenance.css', import.meta.url), 'utf8')
  assert.match(css, /@media \(max-width: 600px\)/)
  assert.match(css, /clamp\(/)
  assert.doesNotMatch(css, /https?:|animation:/)
})
