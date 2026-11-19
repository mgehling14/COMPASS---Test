import type { ExpressionContext, ReportFilter, ReportRow, ReportSort } from './reportTypes'

type Node = { kind: 'literal'; value: unknown } | { kind: 'reference'; area: string; field: string } | { kind: 'call'; name: string; args: Node[] } | { kind: 'binary'; op: string; left: Node; right: Node } | { kind: 'unary'; op: string; value: Node }
type Token = { value: string; literal?: unknown; isLiteral?: boolean }
const cache = new Map<string, Node>()
function tokens(expression: string): Token[] {
  const output: Token[] = []
  const source = expression.replace(/^=/, '')
  let offset = 0
  while (offset < source.length) {
    if (/\s/.test(source[offset])) { offset++; continue }
    const rest = source.slice(offset)
    const string = rest.match(/^"(?:""|[^"])*"/)
    if (string) { output.push({ value: string[0], literal: string[0].slice(1, -1).replace(/""/g, '"'), isLiteral: true }); offset += string[0].length; continue }
    const number = rest.match(/^\d+(?:\.\d+)?/)
    if (number) { output.push({ value: number[0], literal: Number(number[0]), isLiteral: true }); offset += number[0].length; continue }
    const token = rest.match(/^(?:[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*|<>|<=|>=|[!(),&+*/\\^=<>-])/)
    if (!token) throw new Error(`Unsupported RDL expression near ${rest.slice(0, 35)}.`)
    output.push({ value: token[0] }); offset += token[0].length
  }
  return output
}
export function parseRdlExpression(expression: string): Node {
  if (cache.has(expression)) return cache.get(expression)!
  const input = tokens(expression)
  let cursor = 0
  const peek = () => input[cursor]?.value.toLowerCase() || ''
  const take = () => input[cursor++]
  function primary(): Node {
    const token = take()
    if (!token) throw new Error('Incomplete RDL expression.')
    const value = token.value.toLowerCase()
    if (token.isLiteral) return { kind: 'literal', value: token.literal }
    if (['not', '-', '+'].includes(value)) return { kind: 'unary', op: value, value: parse(value === 'not' ? 3 : 8) }
    if (value === '(') { const node = parse(0); if (take()?.value !== ')') throw new Error('Unbalanced RDL expression.'); return node }
    if (['nothing', 'true', 'false'].includes(value)) return { kind: 'literal', value: value === 'nothing' ? null : value === 'true' }
    if (value.endsWith('vbcrlf') || value === 'vbnewline') return { kind: 'literal', value: '\n' }
    if (['fields', 'parameters', 'globals'].includes(value) && peek() === '!') {
      take(); const field = take()?.value || ''
      const suffix = field.match(/^(.*?)\.(?:Value|Label)$/i)
      if (!suffix) throw new Error(`Unsupported RDL reference ${field}.`)
      return { kind: 'reference', area: value, field: suffix[1] }
    }
    if (peek() === '(') {
      take(); const args: Node[] = []
      if (peek() !== ')') { args.push(parse(0)); while (peek() === ',') { take(); args.push(parse(0)) } }
      if (take()?.value !== ')') throw new Error(`Unbalanced ${token.value} call.`)
      return { kind: 'call', name: value, args }
    }
    throw new Error(`Unsupported RDL identifier ${token.value}.`)
  }
  const precedence: Record<string, number> = { or: 1, orelse: 1, and: 2, andalso: 2, '=': 4, '<>': 4, '<': 4, '>': 4, '<=': 4, '>=': 4, is: 4, like: 4, '&': 5, '+': 6, '-': 6, '*': 7, '/': 7, '\\': 7, mod: 7, '^': 9 }
  function parse(min: number): Node {
    let left = primary()
    while ((precedence[peek()] || 0) >= min && precedence[peek()]) {
      let op = take()!.value.toLowerCase(), rank = precedence[op]
      if (op === 'is' && peek() === 'not') { take(); op = 'is not' }
      left = { kind: 'binary', op, left, right: parse(rank + 1) }
    }
    return left
  }
  const parsed = parse(0)
  if (cursor !== input.length) throw new Error(`Unexpected RDL token ${input[cursor].value}.`)
  if (cache.size > 10000) cache.clear()
  cache.set(expression, parsed)
  return parsed
}
const text = (value: unknown) => value === null || value === undefined ? '' : String(value)
export function rowValue(row: ReportRow | undefined, field: string): unknown {
  if (!row) return null
  const key = Object.keys(row).find((candidate) => candidate.toLowerCase() === field.toLowerCase())
  return key ? row[key] ?? null : null
}
function date(value: unknown): number {
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return value
  const result = Date.parse(text(value))
  if (!Number.isFinite(result)) throw new Error(`Invalid date in report expression: ${text(value)}`)
  return result
}
function compare(left: unknown, right: unknown): number {
  if (left === null || left === undefined) return right === null || right === undefined ? 0 : -1
  if (right === null || right === undefined) return 1
  if (typeof left === 'number' && typeof right === 'number') return left - right
  return text(left).localeCompare(text(right), undefined, { numeric: true })
}
function run(node: Node, context: ExpressionContext): unknown {
  if (node.kind === 'literal') return node.value
  if (node.kind === 'reference') return node.area === 'fields' ? rowValue(context.row || context.rows[0], node.field) : node.area === 'parameters' ? rowValue(context.parameters, node.field) : rowValue(context.globals, node.field)
  if (node.kind === 'unary') { const value = run(node.value, context); return node.op === 'not' ? !value : node.op === '-' ? -Number(value) : Number(value) }
  if (node.kind === 'binary') {
    const left = run(node.left, context), right = run(node.right, context)
    switch (node.op) {
      case 'or': case 'orelse': return !!left || !!right
      case 'and': case 'andalso': return !!left && !!right
      case 'is': return left === right
      case 'is not': return left !== right
      case '=': return compare(left, right) === 0
      case '<>': return compare(left, right) !== 0
      case '<': return compare(left, right) < 0
      case '>': return compare(left, right) > 0
      case '<=': return compare(left, right) <= 0
      case '>=': return compare(left, right) >= 0
      case '&': return text(left) + text(right)
      case '+': return typeof left === 'string' || typeof right === 'string' ? text(left) + text(right) : Number(left) + Number(right)
      case '-': return Number(left) - Number(right)
      case '*': return Number(left) * Number(right)
      case '/': { if (Number(right) === 0) throw new Error('Division by zero in report calculation.'); return Number(left) / Number(right) }
      case '\\': return Math.trunc(Number(left) / Number(right))
      case '^': return Number(left) ** Number(right)
      case 'mod': return Number(left) % Number(right)
      case 'like': return wildcard(text(left), text(right))
      default: throw new Error(`Unsupported RDL operator ${node.op}.`)
    }
  }
  const arg = (index: number) => node.args[index] ? run(node.args[index], context) : null
  if (node.name === 'iif') return arg(0) ? arg(1) : arg(2)
  if (node.name === 'switch') { for (let index = 0; index < node.args.length; index += 2) if (arg(index)) return arg(index + 1); return null }
  if (['sum', 'count', 'countdistinct', 'max', 'min', 'avg', 'first', 'last'].includes(node.name)) {
    const scope = node.args[1] ? text(arg(1)) : ''
    const scoped = scope ? context.scopes[scope] : context.rows
    if (!scoped) throw new Error(`Unknown report aggregate scope ${scope}.`)
    const values = scoped.map((row) => run(node.args[0], { ...context, row })).filter((value) => value !== null && value !== undefined)
    if (node.name === 'count') return values.length
    if (node.name === 'countdistinct') return new Set(values.map((value) => JSON.stringify(value))).size
    if (!values.length) return node.name === 'sum' ? 0 : null
    if (node.name === 'sum' || node.name === 'avg') { const sum = values.reduce<number>((total, value) => total + Number(value), 0); return node.name === 'avg' ? sum / values.length : sum }
    if (node.name === 'first') return values[0]
    if (node.name === 'last') return values.at(-1)
    return values.reduce((selected, value) => (node.name === 'max' ? compare(value, selected) > 0 : compare(value, selected) < 0) ? value : selected)
  }
  switch (node.name) {
    case 'isnothing': return arg(0) === null || arg(0) === undefined
    case 'trim': return text(arg(0)).trim()
    case 'lcase': return text(arg(0)).toLowerCase()
    case 'ucase': return text(arg(0)).toUpperCase()
    case 'len': return text(arg(0)).length
    case 'right': return text(arg(0)).slice(-Number(arg(1)))
    case 'left': return text(arg(0)).slice(0, Number(arg(1)))
    case 'mid': return node.args.length > 2 ? text(arg(0)).slice(Number(arg(1)) - 1, Number(arg(1)) - 1 + Number(arg(2))) : text(arg(0)).slice(Number(arg(1)) - 1)
    case 'cstr': return text(arg(0))
    case 'chr': return String.fromCharCode(Number(arg(0)))
    case 'round': { const scale = 10 ** Number(arg(1) ?? 0), value = Number(arg(0)) * scale, lower = Math.floor(value); return (Math.abs(value - lower - .5) < 1e-10 ? lower % 2 === 0 ? lower : lower + 1 : Math.round(value)) / scale }
    case 'format': return formatReportValue(arg(0), text(arg(1)))
    case 'datediff': {
      if (arg(1) === null || arg(2) === null) return null
      const interval = text(arg(0)).toLowerCase(), first = new Date(date(arg(1))), last = new Date(date(arg(2)))
      if (interval === 'd' || interval === 'day') return Math.floor(last.getTime() / 86400000) - Math.floor(first.getTime() / 86400000)
      if (interval === 'yyyy' || interval === 'year') return last.getUTCFullYear() - first.getUTCFullYear()
      if (interval === 'm' || interval === 'month') return (last.getUTCFullYear() - first.getUTCFullYear()) * 12 + last.getUTCMonth() - first.getUTCMonth()
      throw new Error(`Unsupported DateDiff interval ${interval}.`)
    }
    case 'dateadd': {
      if (arg(2) === null) return null
      const interval = text(arg(0)).toLowerCase(), result = new Date(date(arg(2))), count = Number(arg(1))
      if (interval === 'd' || interval === 'day') result.setUTCDate(result.getUTCDate() + count)
      else if (interval === 'yyyy' || interval === 'year') result.setUTCFullYear(result.getUTCFullYear() + count)
      else if (interval === 'm' || interval === 'month') result.setUTCMonth(result.getUTCMonth() + count)
      else throw new Error(`Unsupported DateAdd interval ${interval}.`)
      return result.toISOString().slice(0, 10)
    }
    case 'instr': {
      const hasStart = node.args.length >= 3 && typeof arg(0) === 'number'
      const offset = hasStart ? Number(arg(0)) - 1 : 0
      const first = hasStart ? text(arg(1)) : text(arg(0)), second = hasStart ? text(arg(2)) : text(arg(1))
      return first.indexOf(second, offset) + 1
    }
    case 'code.getuniqueid': return rowValue(context.row, '__reportRowId')
    default: throw new Error(`Unsupported report function ${node.name}.`)
  }
}
export function evaluateRdl(value: string, context: ExpressionContext): unknown { return value.startsWith('=') ? run(parseRdlExpression(value), context) : value }
function wildcard(value: string, pattern: string): boolean { return new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i').test(value) }
export function applyReportFilters(rows: ReportRow[], filters: ReportFilter[], context: ExpressionContext): ReportRow[] {
  return rows.filter((row) => filters.every((filter) => {
    const current = { ...context, row, rows }, actual = evaluateRdl(filter.expression, current), values = filter.values.map((value) => evaluateRdl(value, current)), rank = compare(actual, values[0])
    switch (filter.operator.toLowerCase()) {
      case 'equal': return rank === 0
      case 'notequal': return rank !== 0
      case 'in': return values.some((value) => compare(actual, value) === 0)
      case 'like': return wildcard(text(actual), text(values[0]))
      case 'greaterthan': return rank > 0
      case 'greaterthanorequal': return rank >= 0
      case 'lessthan': return rank < 0
      case 'lessthanorequal': return rank <= 0
      case 'between': return rank >= 0 && compare(actual, values[1]) <= 0
      default: throw new Error(`Unsupported report filter ${filter.operator}.`)
    }
  }))
}
export function sortReportRows(rows: ReportRow[], sorts: ReportSort[], context: ExpressionContext): ReportRow[] {
  return [...rows].sort((left, right) => { for (const sort of sorts) { const rank = compare(evaluateRdl(sort.expression, { ...context, row: left }), evaluateRdl(sort.expression, { ...context, row: right })); if (rank) return sort.direction === 'Descending' ? -rank : rank } return 0 })
}
export function formatReportValue(value: unknown, format = ''): string {
  if (value === null || value === undefined) return ''
  if (format.toLowerCase() === 'yyyy-mm-dd') return new Date(date(value)).toISOString().slice(0, 10)
  if (format.toLowerCase() === 'd' && /^\d{4}-\d{2}-\d{2}/.test(text(value))) return text(value).slice(0, 10)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Non-finite report calculation.')
    const match = format.match(/^([NFPC])([0-9]+)?$/i)
    if (match) return new Intl.NumberFormat('en-US', { style: match[1].toUpperCase() === 'P' ? 'percent' : match[1].toUpperCase() === 'C' ? 'currency' : 'decimal', ...(match[1].toUpperCase() === 'C' ? { currency: 'USD' } : {}), minimumFractionDigits: Number(match[2] || 0), maximumFractionDigits: Number(match[2] || 0) }).format(value)
  }
  return text(value).replaceAll('CAAFA Outreach', 'DV Outreach').replaceAll('Restorative Yoga', 'Somatic Series')
}
