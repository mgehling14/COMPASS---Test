import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const css = readFileSync(new URL('./darkModeRadio.css', import.meta.url), 'utf8')
const normal = css.slice(0, css.indexOf('@media'))
const forced = css.slice(css.indexOf('@media'))
const main = readFileSync(new URL('../main.tsx', import.meta.url), 'utf8')

test('dark radio styles load after the main stylesheet and stay scoped away from light mode/checkboxes', () => {
  assert.ok(main.indexOf("import './services/darkModeRadio.css'") > main.indexOf("import './index.css'"))
  const rules = normal.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)
  let count = 0
  for (const [, selectors] of rules) for (const selector of selectors.split(',')) {
    count++
    assert.ok(selector.trim().startsWith('.theme-dark '), selector)
    assert.ok(selector.includes("input[type='radio']"), selector)
  }
  assert.ok(count >= 5)
  assert.doesNotMatch(normal, /checkbox|pointer-events|display:\s*none/)
})

test('selected radios have a distinct high-contrast marker even in disabled record views', () => {
  assert.match(normal, /appearance:\s*none/)
  assert.match(normal, /width:\s*16px/)
  assert.match(normal, /padding:\s*0/)
  assert.match(normal, /input\[type='radio'\]:checked[\s\S]*?background:\s*radial-gradient\(circle, #183321 0 3px, #d8f2ca 3\.5px\)/)
  assert.match(normal, /input\[type='radio'\]:disabled\s*\{[^}]*opacity:\s*1/)
  assert.doesNotMatch(normal, /:not\(:disabled\)|:enabled/)
  assert.match(normal, /input\[type='radio'\]:focus-visible\s*\{[^}]*outline:\s*2px solid/)
  assert.match(normal, /:has\(> input\[type='radio'\]:checked\) > span\s*\{[^}]*font-weight:\s*700/)
})

function contrast(a, b) {
  const luminance = (hex) => {
    const rgb = hex.replace('#', '').match(/../g).map((part) => parseInt(part, 16) / 255).map((n) => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4)
    return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2]
  }
  const values = [luminance(a), luminance(b)].sort((a, b) => b - a)
  return (values[0] + .05) / (values[1] + .05)
}

test('radio outlines, checked fill, center dot and selected text have strong contrast on existing dark form backgrounds', () => {
  for (const background of ['#203d2a', '#31563c', '#3b6548', '#2f543b']) {
    assert.ok(contrast('#c1dfb7', background) >= 3, 'Unchecked outline against ' + background)
    assert.ok(contrast('#d8f2ca', background) >= 3, 'Checked fill against ' + background)
    assert.ok(contrast('#f0ffe6', background) >= 4.5, 'Selected label against ' + background)
  }
  assert.ok(contrast('#183321', '#d8f2ca') >= 7, 'Center dot against checked fill')
})

test('Windows High Contrast keeps native radio states and system colors', () => {
  assert.match(forced, /@media \(forced-colors: active\)/)
  assert.match(forced, /appearance:\s*auto/)
  assert.match(forced, /forced-color-adjust:\s*auto/)
  assert.match(forced, /input\[type='radio'\]:checked[\s\S]*?background:\s*Canvas/)
  assert.match(forced, /outline-color:\s*Highlight/)
})

test('package baseline preserves pre-package main source for selective promotion without reporting changes', () => {
  const packageRoot = new URL('../../.packages/client-experience-20261019/', import.meta.url)
  const manifest = JSON.parse(readFileSync(new URL('package.json', packageRoot), 'utf8'))
  const baseline = readFileSync(new URL('baseline/src/main.tsx', packageRoot), 'utf8').replace(/\r\n/g, '\n')
  assert.equal(createHash('sha256').update(baseline).digest('hex'), manifest.baselineMainSha256)
  assert.ok(manifest.modifiedFiles.includes('src/main.tsx'))
  assert.ok(manifest.addedFiles.includes('src/services/darkModeRadio.css'))
  assert.doesNotMatch(baseline.toString(), /darkModeRadio/)
  assert.match(manifest.promotionPolicy, /explicit user approval/)
  assert.match(manifest.promotionPolicy, /Do not replace live source wholesale/)
})
