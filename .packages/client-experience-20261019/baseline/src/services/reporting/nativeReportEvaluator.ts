import { rowValue } from './rdlExpressions'
import type { ReportCatalog, ReportRow } from './reportTypes'

// Static, offline-compiled SELECT plans only. This is an interpreter for the
// allowlisted report operations, not an executable SQL/code generation engine.
export type QueryNode = { k: string; a: Record<string, any> }
export type QueryTable = { rows: ReportRow[]; columns: string[] }
type Frame = { sources: Record<string, ReportRow>; ordinal: number; projected?: ReportRow }
type Context = { frame: Frame; group?: Frame[]; windows?: Map<QueryNode, Map<Frame, unknown>> }
type Environment = Map<string, QueryTable>
const node = (value: unknown): value is QueryNode => !!value && typeof value === 'object' && 'k' in value
const id = (value: QueryNode | undefined): string => String(value?.a.this ?? '').toLowerCase()
const nil = (value: unknown) => value === null || value === undefined
const key = (values: unknown[]) => JSON.stringify(values.map((value) => nil(value) ? null : typeof value === 'string' ? value.toLowerCase() : value))
const truth = (value: unknown): boolean | null => nil(value) ? null : Boolean(value)
const compare = (a: unknown, b: unknown) => typeof a === 'string' && typeof b === 'string' ? a.toLowerCase().localeCompare(b.toLowerCase(), 'en') : a! < b! ? -1 : a! > b! ? 1 : 0
const aggregateKinds = new Set(['Min', 'Max', 'Sum', 'Count'])
function children(value: unknown, callback: (value: QueryNode) => void) {
  if (!node(value)) return
  callback(value)
  for (const child of Object.values(value.a)) if (Array.isArray(child)) child.forEach((entry) => children(entry, callback)); else children(child, callback)
}
function hasAggregate(value: QueryNode): boolean {
  if (value.k === 'Window' || value.k === 'Subquery') return false
  if (aggregateKinds.has(value.k)) return true
  return Object.values(value.a).some((child) => Array.isArray(child) ? child.some((entry) => node(entry) && hasAggregate(entry)) : node(child) && hasAggregate(child))
}
function timestamp(value: unknown): number | null {
  if (nil(value)) return null
  const text = String(value), parsed = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(text) ? text + 'T00:00:00Z' : text.replace(' ', 'T') + (/Z$|[+-]\d\d:\d\d$/.test(text) ? '' : 'Z'))
  return Number.isFinite(parsed) ? parsed : null
}
function cast(value: unknown, type: QueryNode, safe: boolean): unknown {
  if (nil(value)) return null
  const target = String(type.a.this)
  let result: unknown
  if (target === 'TEXT') result = String(value)
  else if (['DATE', 'TIMESTAMPNTZ'].includes(target)) { const time = timestamp(value); result = time === null ? null : target === 'DATE' ? new Date(time).toISOString().slice(0, 10) : new Date(time).toISOString() }
  else if (['INT', 'DECIMAL'].includes(target)) {
    const number = typeof value === 'string' && !value.trim() ? NaN : Number(value)
    const scale = Number(type.a.expressions?.[1]?.a.this?.a.this ?? 0)
    result = !Number.isFinite(number) ? null : target === 'INT' ? Math.sign(number) * Math.round(Math.abs(number)) : Math.sign(number) * Math.round((Math.abs(number) + Number.EPSILON) * 10 ** scale) / 10 ** scale
  } else throw new Error(`Unsupported report conversion ${target}.`)
  if (result === null && !safe) throw new Error(`Cannot convert report value to ${target}.`)
  return result
}

export class NativeReportEvaluator {
  private cache = new Map<string, Promise<QueryTable>>()
  private steps = 0
  private lastYield = 0
  private aggregateCache = new WeakMap<Frame[], Map<QueryNode, unknown>>()
  private likeCache = new Map<string, RegExp>()
  private scalarCache = new WeakMap<Frame, Map<QueryNode, unknown>>()
  private baseCache = new Map<string, QueryTable>()
  private catalog: ReportCatalog
  private plans: Record<string, QueryNode>
  private tables: Record<string, ReportRow[]>
  private parameters: Record<string, unknown>
  private asOf: string
  private signal: AbortSignal
  private progress: (message: string) => void
  constructor(catalog: ReportCatalog, plans: Record<string, QueryNode>, tables: Record<string, ReportRow[]>, parameters: Record<string, unknown>, asOf: string, signal: AbortSignal, progress: (message: string) => void = () => {}) {
    this.catalog = catalog; this.plans = plans; this.tables = tables; this.parameters = parameters; this.asOf = asOf; this.signal = signal; this.progress = progress
  }
  private async checkpoint() {
    if (++this.steps % 512 === 0) {
      this.signal.throwIfAborted()
      if (Date.now() - this.lastYield > 20) { await new Promise<void>((resolve) => setTimeout(resolve, 0)); this.lastYield = Date.now(); this.signal.throwIfAborted() }
    }
  }
  private column(expression: QueryNode, context: Context): unknown {
    const name = String(expression.a.this?.a.this), alias = id(expression.a.table)
    if (alias) return rowValue(context.frame.sources[alias] || {}, name)
    if (context.frame.projected && Object.keys(context.frame.projected).some((field) => field.toLowerCase() === name.toLowerCase())) return rowValue(context.frame.projected, name)
    const sources = Object.values(context.frame.sources).filter((row) => Object.keys(row).some((field) => field.toLowerCase() === name.toLowerCase()))
    if (sources.length > 1) throw new Error(`Ambiguous report column ${name}.`)
    return sources.length ? rowValue(sources[0], name) : null
  }
  private value(expression: QueryNode | undefined, context: Context): any {
    if (!expression) return null
    const a = expression.a, read = (child: QueryNode) => this.value(child, context)
    const left = () => read(a.this), right = () => read(a.expression)
    switch (expression.k) {
      case 'Null': return null
      case 'Literal': return a.is_string ? a.this : Number(a.this)
      case 'Column': return this.column(expression, context)
      case 'Placeholder': if (!(a.this in this.parameters)) throw new Error(`Report parameter ${a.this} is required.`); return this.parameters[a.this]
      case 'Alias': case 'Paren': return left()
      case 'Neg': { const v = left(); return nil(v) ? null : -Number(v) }
      case 'Cast': case 'TryCast': return cast(left(), a.to, expression.k === 'TryCast')
      case 'Coalesce': return [a.this, ...(a.expressions || [])].map(read).find((value) => !nil(value)) ?? null
      case 'Case': { const base = a.this ? left() : undefined; for (const condition of a.ifs || []) if (a.this ? !nil(base) && !nil(read(condition.a.this)) && compare(base, read(condition.a.this)) === 0 : truth(read(condition.a.this)) === true) return read(condition.a.true); return read(a.default) }
      case 'If': return truth(left()) === true ? read(a.true) : read(a.false)
      case 'Not': { const v = truth(left()); return v === null ? null : !v }
      case 'And': { const l = truth(left()), r = truth(right()); return l === false || r === false ? false : l === null || r === null ? null : true }
      case 'Or': { const l = truth(left()), r = truth(right()); return l === true || r === true ? true : l === null || r === null ? null : false }
      case 'Is': return nil(right()) ? nil(left()) : left() === right()
      case 'EQ': case 'NEQ': case 'LT': case 'LTE': case 'GT': case 'GTE': { const l = left(), r = right(); if (nil(l) || nil(r)) return null; const c = compare(l, r); return expression.k === 'EQ' ? c === 0 : expression.k === 'NEQ' ? c !== 0 : expression.k === 'LT' ? c < 0 : expression.k === 'LTE' ? c <= 0 : expression.k === 'GT' ? c > 0 : c >= 0 }
      case 'Between': { const v = left(), low = read(a.low), high = read(a.high); return [v, low, high].some(nil) ? null : compare(v, low) >= 0 && compare(v, high) <= 0 }
      case 'In': { const v = left(), entries = (a.expressions || []).map(read); if (nil(v)) return null; return entries.some((entry: unknown) => !nil(entry) && compare(v, entry) === 0) ? true : entries.some(nil) ? null : false }
      case 'Like': { const v = left(), pattern = right(); if (nil(v) || nil(pattern)) return null; const text = String(pattern); let regex = this.likeCache.get(text); if (!regex) { regex = new RegExp('^' + [...text].map((c) => c === '%' ? '[\\s\\S]*' : c === '_' ? '[\\s\\S]' : c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('') + '$', 'i'); this.likeCache.set(text, regex) } return a.negate ? !regex.test(String(v)) : regex.test(String(v)) }
      case 'DPipe': { const l = left(), r = right(); return nil(l) || nil(r) ? null : String(l) + String(r) }
      case 'Div': case 'Sub': case 'Add': { const l = left(), r = right(); if (nil(l) || nil(r)) return null; if (expression.k === 'Add' && typeof r === 'object' && r.interval) { const time = timestamp(l); if (time === null) return null; const date = new Date(time), day = date.getUTCDate(); date.setUTCDate(1); if (r.unit === 'YEAR') date.setUTCFullYear(date.getUTCFullYear() + r.amount); else if (r.unit === 'MONTH') date.setUTCMonth(date.getUTCMonth() + r.amount); else if (r.unit === 'DAY') { date.setUTCDate(day + r.amount); return date.toISOString() } else throw new Error(`Unsupported report interval ${r.unit}.`); const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate(); date.setUTCDate(Math.min(day, last)); return date.toISOString() } return expression.k === 'Div' ? Number(r) === 0 ? Number(l) === 0 ? NaN : Math.sign(Number(l)) * Infinity : Number(l) / Number(r) : expression.k === 'Add' ? Number(l) + Number(r) : Number(l) - Number(r) }
      case 'Interval': return { interval: true, amount: Number(left()), unit: String(a.unit?.a.this).toUpperCase() }
      case 'DateDiff': { const end = timestamp(left()), start = timestamp(right()); if (end === null || start === null) return null; const unit = String(a.unit?.a.this).toUpperCase(); if (unit === 'DAY') return Math.floor(end / 86400000) - Math.floor(start / 86400000); const e = new Date(end), s = new Date(start); if (unit === 'YEAR') return e.getUTCFullYear() - s.getUTCFullYear(); if (unit === 'MONTH') return (e.getUTCFullYear() - s.getUTCFullYear()) * 12 + e.getUTCMonth() - s.getUTCMonth(); throw new Error(`Unsupported date difference ${unit}.`) }
      case 'Month': case 'Year': case 'Day': { const time = timestamp(left()); if (time === null) return null; const date = new Date(time); return expression.k === 'Month' ? date.getUTCMonth() + 1 : expression.k === 'Year' ? date.getUTCFullYear() : date.getUTCDate() }
      case 'Lower': case 'Upper': case 'Length': case 'Left': case 'Substring': { const v = left(); if (nil(v)) return null; const text = String(v); if (expression.k === 'Lower') return text.toLowerCase(); if (expression.k === 'Upper') return text.toUpperCase(); if (expression.k === 'Length') return [...text].length; if (expression.k === 'Left') return [...text].slice(0, Number(read(a.expression))).join(''); const start = Number(read(a.start)), length = a.length ? Number(read(a.length)) : undefined; const index = start < 0 ? Math.max(0, [...text].length + start) : Math.max(0, start - 1); return [...text].slice(index, length === undefined ? undefined : index + length).join('') }
      case 'Anonymous': if (String(a.this).toLowerCase() === 'report_asof') return this.asOf; throw new Error(`Unsupported report function ${a.this}.`)
      case 'Window': return context.windows?.get(expression)?.get(context.frame) ?? null
      case 'Subquery': if (!this.scalarCache.get(context.frame)?.has(expression)) throw new Error('Scalar report subquery was not prepared.'); return this.scalarCache.get(context.frame)!.get(expression)
      case 'Min': case 'Max': case 'Sum': case 'Count': {
        const group = context.group || [context.frame]; let cached = this.aggregateCache.get(group); if (!cached) { cached = new Map(); this.aggregateCache.set(group, cached) } if (cached.has(expression)) return cached.get(expression)
        const distinct = a.this?.k === 'Distinct', inner = distinct ? a.this.a.expressions[0] : a.this
        let values = inner?.k === 'Star' ? group.map(() => 1) : group.map((frame) => this.value(inner, { frame, windows: context.windows })).filter((value) => !nil(value))
        if (distinct) values = [...new Map(values.map((value) => [key([value]), value])).values()]
        const result = expression.k === 'Count' ? values.length : !values.length ? null : expression.k === 'Sum' ? values.reduce((sum, value) => Number(sum) + Number(value), 0) : values.reduce((best, value) => compare(value, best) * (expression.k === 'Min' ? 1 : -1) < 0 ? value : best)
        cached.set(expression, result); return result
      }
      default: throw new Error(`Unsupported native report operation ${expression.k}.`)
    }
  }
  private async table(expression: QueryNode, env: Environment): Promise<{ table: QueryTable; alias: string }> {
    const alias = id(expression.a.alias?.a.this)
    if (expression.k === 'Subquery') return { table: await this.query(expression.a.this, env), alias }
    if (expression.k !== 'Table') throw new Error(`Unsupported report source ${expression.k}.`)
    const name = id(expression.a.this)
    if (env.has(name)) return { table: env.get(name)!, alias: alias || name }
    if (name.startsWith('base_')) {
      const original = Object.keys(this.catalog.tables).find((entry) => entry.toLowerCase() === name.slice(5))
      if (!original) throw new Error(`Unknown report table ${name}.`)
      let table = this.baseCache.get(original)
      if (!table) {
        const schema = this.catalog.tables[original], columns = Object.keys(schema), rows: ReportRow[] = []
        for (const row of this.tables[original] || []) {
          rows.push(Object.fromEntries(columns.map((column) => {
            let value = rowValue(row, column)
            if (nil(value)) value = null
            else if (schema[column].startsWith('DECIMAL')) { const scale = Number(schema[column].match(/,\s*(\d+)\)/)?.[1] || 0), number = Number(value); if (!Number.isFinite(number)) throw new Error(`Invalid decimal in ${original}.${column}.`); value = Math.sign(number) * Math.round((Math.abs(number) + Number.EPSILON) * 10 ** scale) / 10 ** scale }
            return [column, value]
          }))); await this.checkpoint()
        }
        table = { rows, columns }; this.baseCache.set(original, table)
      }
      return { table, alias: alias || name }
    }
    if (!name.startsWith('view_')) throw new Error(`Unverified native report table ${name}.`)
    let promise = this.cache.get(name)
    if (!promise) {
      const planKey = Object.keys(this.plans).find((entry) => entry.toLowerCase() === 'view:' + name.slice(5))
      if (!planKey) throw new Error(`Missing compiled report view ${name}.`)
      this.progress(`Calculating ${name.slice(5)}…`); promise = this.query(this.plans[planKey], new Map()); this.cache.set(name, promise)
    }
    return { table: await promise, alias: alias || name }
  }
  private sort(frames: Frame[], order: QueryNode, windows?: Context['windows']) {
    return [...frames].sort((left, right) => {
      for (const rule of order.a.expressions || []) {
        const a = this.value(rule.a.this, { frame: left, windows }), b = this.value(rule.a.this, { frame: right, windows })
        const result = nil(a) && nil(b) ? 0 : nil(a) ? rule.a.nulls_first ? -1 : 1 : nil(b) ? rule.a.nulls_first ? 1 : -1 : compare(a, b) * (rule.a.desc ? -1 : 1)
        if (result) return result
      }
      return left.ordinal - right.ordinal
    })
  }
  private async windows(expressions: QueryNode[], frames: Frame[]): Promise<NonNullable<Context['windows']>> {
    const found = new Set<QueryNode>(); expressions.forEach((expression) => children(expression, (child) => { if (child.k === 'Window') found.add(child) }))
    const output: NonNullable<Context['windows']> = new Map()
    for (const window of found) {
      const partitions = new Map<string, Frame[]>(), values = new Map<Frame, unknown>()
      for (const frame of frames) { const partition = key((window.a.partition_by || []).map((entry: QueryNode) => this.value(entry, { frame }))); const group = partitions.get(partition) || []; group.push(frame); partitions.set(partition, group); await this.checkpoint() }
      for (const group of partitions.values()) {
        if (window.a.this.k === 'RowNumber') (window.a.order ? this.sort(group, window.a.order) : group).forEach((frame, index) => values.set(frame, index + 1))
        else { if (window.a.order || window.a.spec) throw new Error('Ordered/framed aggregate windows are not supported by this report plan.'); const result = this.value(window.a.this, { frame: group[0], group }); for (const frame of group) values.set(frame, result) }
        await this.checkpoint()
      }
      output.set(window, values)
    }
    return output
  }
  async query(expression: QueryNode, inherited: Environment = new Map(), outer?: Frame): Promise<QueryTable> {
    this.signal.throwIfAborted()
    const env = new Map(inherited), a = expression.a
    for (const cte of a.with_?.a.expressions || []) env.set(id(cte.a.alias.a.this), await this.query(cte.a.this, env))
    if (expression.k === 'Union') {
      const left = await this.query(a.this, env), right = await this.query(a.expression, env)
      if (left.columns.length !== right.columns.length) throw new Error('Report UNION column count mismatch.')
      const rows = [...left.rows]
      for (const row of right.rows) { rows.push(Object.fromEntries(left.columns.map((column, index) => [column, rowValue(row, right.columns[index])]))); await this.checkpoint() }
      return { rows: a.distinct ? [...new Map(rows.map((row) => [key(left.columns.map((column) => rowValue(row, column))), row])).values()] : rows, columns: left.columns }
    }
    if (expression.k !== 'Select') throw new Error(`Unsupported report query ${expression.k}.`)
    const source = a.from_ ? await this.table(a.from_.a.this, env) : null
    const sourceColumns = new Map<string, string[]>(source ? [[source.alias, source.table.columns]] : [])
    let frames: Frame[] = source ? source.table.rows.map((row, ordinal) => ({ sources: { ...outer?.sources, [source.alias]: row }, ordinal })) : [{ sources: { ...outer?.sources }, ordinal: 0 }]
    for (const join of a.joins || []) {
      const right = await this.table(join.a.this, env); sourceColumns.set(right.alias, right.table.columns)
      const side = String(join.a.side || '').toUpperCase()
      if (side && !['LEFT', 'RIGHT', 'FULL'].includes(side)) throw new Error(`Unsupported ${side} report join.`)
      const tests: QueryNode[] = []; function conjunction(condition: QueryNode) { if (condition.k === 'Paren') conjunction(condition.a.this); else if (condition.k === 'And') { conjunction(condition.a.this); conjunction(condition.a.expression) } else tests.push(condition) } if (join.a.on) conjunction(join.a.on)
      const pairs = tests.filter((test) => test.k === 'EQ' && test.a.this?.k === 'Column' && test.a.expression?.k === 'Column').map((test) => id(test.a.this.a.table) === right.alias ? [test.a.expression, test.a.this] : id(test.a.expression.a.table) === right.alias ? [test.a.this, test.a.expression] : null).filter((pair): pair is QueryNode[] => !!pair && id(pair[0].a.table) !== right.alias)
      const index = new Map<string, ReportRow[]>()
      if (pairs.length) for (const row of right.table.rows) { const values = pairs.map((pair) => this.value(pair[1], { frame: { sources: { [right.alias]: row }, ordinal: 0 } })); if (values.some(nil)) continue; const k = key(values), bucket = index.get(k) || []; bucket.push(row); index.set(k, bucket); await this.checkpoint() }
      const joined: Frame[] = [], empty = Object.fromEntries(right.table.columns.map((column) => [column, null])), matchedRight = new Set<ReportRow>()
      for (const frame of frames) {
        const values = pairs.map((pair) => this.value(pair[0], { frame })), matches = pairs.length ? values.some(nil) ? [] : index.get(key(values)) || [] : right.table.rows
        let matched = false
        for (const row of matches) { const candidate = { sources: { ...frame.sources, [right.alias]: row }, ordinal: joined.length }; if (!join.a.on || truth(this.value(join.a.on, { frame: candidate })) === true) { joined.push(candidate); matched = true; matchedRight.add(row) } await this.checkpoint() }
        if (!matched && ['LEFT', 'FULL'].includes(side)) joined.push({ sources: { ...frame.sources, [right.alias]: empty }, ordinal: joined.length })
        await this.checkpoint()
      }
      if (['RIGHT', 'FULL'].includes(side)) {
        const emptyLeft = Object.fromEntries([...sourceColumns].filter(([alias]) => alias !== right.alias).map(([alias, columns]) => [alias, Object.fromEntries(columns.map((column) => [column, null]))]))
        for (const row of right.table.rows) if (!matchedRight.has(row)) { joined.push({ sources: { ...emptyLeft, [right.alias]: row }, ordinal: joined.length }); await this.checkpoint() }
      }
      frames = joined
    }
    if (a.where) { const filtered: Frame[] = []; for (const frame of frames) { if (truth(this.value(a.where.a.this, { frame })) === true) filtered.push(frame); await this.checkpoint() } frames = filtered }
    const expressions: QueryNode[] = a.expressions || [], windowValues = await this.windows(expressions, frames)
    const grouped = !!a.group || expressions.some(hasAggregate), groups = new Map<string, Frame[]>()
    if (grouped) { for (const frame of frames) { const k = key((a.group?.a.expressions || []).map((entry: QueryNode) => this.value(entry, { frame }))), group = groups.get(k) || []; group.push(frame); groups.set(k, group); await this.checkpoint() } if (!a.group && !groups.size) groups.set('[]', []) }
    const columns: string[] = [], projections: Array<{ column: string; expression?: QueryNode; alias?: string }> = []
    for (const entry of expressions) {
      const star = entry.k === 'Star' || entry.k === 'Column' && entry.a.this?.k === 'Star'
      if (star) { const aliases = entry.k === 'Column' ? [id(entry.a.table)] : [...sourceColumns.keys()]; for (const alias of aliases) for (const column of sourceColumns.get(alias) || []) { columns.push(column); projections.push({ column, alias }) } }
      else { const column = entry.k === 'Alias' ? String(entry.a.alias.a.this) : entry.k === 'Column' ? String(entry.a.this.a.this) : entry.k === 'Literal' ? String(entry.a.this) : entry.k === 'Null' ? 'NULL' : entry.k === 'Count' ? 'count_star()' : entry.k; columns.push(column); projections.push({ column, expression: entry }) }
    }
    const projected: Frame[] = [], scalars = new Set<QueryNode>()
    function findScalar(value: unknown) { if (!node(value)) return; if (value.k === 'Subquery') { scalars.add(value); return } for (const child of Object.values(value.a)) if (Array.isArray(child)) child.forEach(findScalar); else findScalar(child) }
    expressions.forEach(findScalar)
    for (const group of grouped ? groups.values() : frames.map((frame) => [frame])) {
      const frame: Frame = group[0] || { sources: {}, ordinal: 0 }, row: ReportRow = {}
      if (scalars.size) { const values = new Map<QueryNode, unknown>(); for (const scalar of scalars) { const result = await this.query(scalar.a.this, env, frame); if (result.columns.length !== 1 || result.rows.length > 1) throw new Error('Scalar report subquery must return one column and at most one row.'); values.set(scalar, result.rows.length ? rowValue(result.rows[0], result.columns[0]) : null) } this.scalarCache.set(frame, values) }
      for (const projection of projections) row[projection.column] = projection.expression ? this.value(projection.expression, { frame, group: grouped ? group : undefined, windows: windowValues }) : rowValue(frame.sources[projection.alias!] || {}, projection.column)
      projected.push({ ...frame, projected: row }); await this.checkpoint()
    }
    const ordered = a.order ? this.sort(projected, a.order, windowValues) : projected
    let rows = ordered.map((frame) => frame.projected!)
    if (a.distinct) rows = [...new Map(rows.map((row) => [key(columns.map((column) => rowValue(row, column))), row])).values()]
    this.signal.throwIfAborted()
    return { rows, columns }
  }
}
