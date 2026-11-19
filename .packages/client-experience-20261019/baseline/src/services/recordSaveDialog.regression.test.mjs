import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import * as React from 'react'
import * as JSX from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'

function load(file, hooks = {}, document = {}) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const module = { exports: {} }
  vm.runInNewContext(js, { module, exports: module.exports, document, require(name) {
    if (name === 'react') return { ...React, ...hooks }
    if (name === 'react/jsx-runtime') return JSX
    if (name.endsWith('.css')) return {}
    if (name === './recordSaveResult') return load('./recordSaveResult.ts')
    throw Error(`Unexpected ${name}`)
  } })
  return module.exports
}
const result = (status = 'saved') => ({ status, formName: 'Services', recordId: 'SV-0479375', rowId: '11111111-1111-1111-1111-111111111111', isNew: true })
function elements(node, type) {
  const rows = []
  const visit = (item) => { if (Array.isArray(item)) item.forEach(visit); else if (React.isValidElement(item)) { if (item.type === type) rows.push(item); visit(item.props.children) } }
  visit(node); return rows
}
function renderer(props) {
  const slots = [], effects = [], cleanups = []; let index = 0, mounted = false, focus = 0, opens = 0, closes = 0
  const native = { open: false, showModal() { this.open = true; opens++ }, close() { this.open = false; closes++ } }
  const component = load('./RecordSaveDialog.tsx', {
    useState(initial) { const i = index++; if (!(i in slots)) slots[i] = initial; return [slots[i], (value) => { slots[i] = typeof value === 'function' ? value(slots[i]) : value }] },
    useRef(initial) { const i = index++; return slots[i] ||= { current: initial } },
    useEffect(effect) { index++; if (!mounted) effects.push(effect) },
  }, { activeElement: { isConnected: true, focus() { focus++ } } }).default
  return {
    render() { index = 0; const tree = component(props); tree.props.ref.current = native; while (effects.length) cleanups.push(effects.shift()()); mounted = true; return tree },
    unmount() { cleanups.forEach((cleanup) => cleanup?.()) },
    stats() { return { opens, closes, focus } }, native,
  }
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }

test('saved popup has the three requested choices and a standard form-name/Record-ID confirmation', () => {
  const Dialog = load('./RecordSaveDialog.tsx').default
  const html = renderToStaticMarkup(React.createElement(Dialog, { result: result(), canOpenClient: true, onChoose() {} }))
  assert.match(html, /Your new Services record has been saved with record id SV-0479375!/)
  assert.match(html, /Back to search/); assert.match(html, /Remain on current record/); assert.match(html, /Open Client Profile/)
  assert.match(html, /aria-labelledby="record-save-title"/); assert.match(html, /aria-describedby="record-save-message"/)
  assert.doesNotMatch(html, /disabled/)
})
test('native modal opens once, restores focus on closing, and Escape selects Remain without navigation', async () => {
  const choices = [], h = renderer({ result: result(), canOpenClient: true, onChoose: (choice) => choices.push(choice) })
  const tree = h.render(); h.render(); assert.equal(h.stats().opens, 1); assert.equal(h.native.open, true)
  let prevented = false; tree.props.onCancel({ preventDefault() { prevented = true } }); await flush()
  assert.equal(prevented, true); assert.deepEqual(choices, ['remain'])
  h.unmount(); assert.deepEqual(h.stats(), { opens: 1, closes: 1, focus: 1 })
})
test('all three saved action handlers pass their respective choices', async () => {
  for (const [index, choice] of ['search', 'remain', 'client'].entries()) {
    const chosen = [], h = renderer({ result: result(), canOpenClient: true, onChoose: (value) => chosen.push(value) })
    elements(h.render(), 'button')[index].props.onClick(); await flush(); assert.deepEqual(chosen, [choice]); h.unmount()
  }
})
for (const status of ['failed', 'partial', 'unconfirmed']) test(`${status} popup retains the form and disables navigation choices`, async () => {
  const chosen = [], h = renderer({ result: { ...result(status), details: 'Dataverse rejected the change' }, canOpenClient: true, onChoose: (value) => chosen.push(value) })
  const buttons = elements(h.render(), 'button')
  assert.deepEqual(buttons.map((button) => button.props.disabled), [true, false, true])
  buttons[0].props.onClick(); buttons[2].props.onClick(); await flush(); assert.equal(chosen.length, 0)
  buttons[1].props.onClick(); await flush(); assert.deepEqual(chosen, ['remain']); h.unmount()
})
test('missing client keeps Open Client Profile disabled and explains why', async () => {
  const h = renderer({ result: result(), onChoose() { throw Error('Should not be called') } }), tree = h.render()
  assert.equal(elements(tree, 'button')[2].props.disabled, true)
  elements(tree, 'button')[2].props.onClick(); await flush()
  const html = renderToStaticMarkup(React.createElement(load('./RecordSaveDialog.tsx').default, { result: result(), onChoose() {} }))
  assert.match(html, /does not have a linked Client Profile/); h.unmount()
})
test('destination failures remain visible and duplicate clicks are blocked while opening a destination', async () => {
  let reject, calls = 0
  const h = renderer({ result: result(), canOpenClient: true, onChoose: () => { calls++; return new Promise((_resolve, fail) => { reject = fail }) } })
  const buttons = elements(h.render(), 'button'); buttons[2].props.onClick(); buttons[0].props.onClick()
  assert.equal(calls, 1); assert.ok(elements(h.render(), 'button').every((button) => button.props.disabled))
  reject(Error('Client could not be opened')); await flush()
  const tree = h.render(), error = elements(tree, 'p').find((node) => node.props.role === 'alert')
  assert.equal(error.props.children, 'Client could not be opened'); assert.equal(h.native.open, true)
  assert.ok(elements(tree, 'button').every((button) => !button.props.disabled)); h.unmount()
})
test('confirmation/error text is escaped and partial/unconfirmed messages never claim a completed save', () => {
  const api = load('./recordSaveResult.ts')
  assert.equal(api.recordSaveMessage({ ...result(), isNew: false }), 'Your Services record has been saved with record id SV-0479375!')
  assert.match(api.recordSaveMessage(result('failed')), /could not be saved/)
  assert.match(api.recordSaveMessage(result('partial')), /related updates could not be completed/)
  assert.match(api.recordSaveMessage(result('unconfirmed')), /could not yet be confirmed/)
  const html = renderToStaticMarkup(React.createElement(load('./RecordSaveDialog.tsx').default, { result: { ...result('failed'), formName: '<script>attack</script>', details: '<img onerror=attack>' }, onChoose() {} }))
  assert.doesNotMatch(html, /<script>|<img/); assert.match(html, /&lt;script&gt;/)
  const css = readFileSync(new URL('./RecordSaveDialog.css', import.meta.url), 'utf8')
  assert.match(css, /::backdrop/); assert.match(css, /@media/); assert.match(css, /var\(--bg-panel\)/)
})
