// Offline-only compiler. Runtime reports use static data plans, never SQL,
// Python, eval, new Function, workers or downloaded executable modules.
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
const source = readFileSync(new URL('./legacyReportCatalog.json', import.meta.url), 'utf8'), catalog = JSON.parse(source)
const queries = Object.fromEntries([...catalog.views.map((view) => ['view:' + view.name, view.sql]), ...catalog.reports.flatMap((report) => report.datasets.map((dataset) => [report.id + ':' + dataset.name, dataset.sql]))])
const script = String.raw`
import sys,json,collections
import sqlglot
from sqlglot import exp
types=collections.Counter()
def is_test_filter(node):
    if isinstance(node,exp.Not): return is_test_filter(node.this)
    return isinstance(node,(exp.Like,exp.EQ,exp.NEQ)) and isinstance(node.this,exp.Column) and node.this.name.lower()=='last_name' and isinstance(node.expression,exp.Literal) and node.expression.this.lower()=='test'
def remove_name_filters(node):
    if isinstance(node,exp.And):
        a=remove_name_filters(node.this); b=remove_name_filters(node.expression)
        return b if a is None else a if b is None else exp.and_(a,b)
    # The original SQL excluded last_name=Test. Explicit CP report eligibility
    # is now authoritative, so a real client named Test is not auto-excluded.
    if is_test_filter(node): return None
    return node
def encode(value):
    if isinstance(value,exp.Expression):
        types[type(value).__name__]+=1
        return {'k':type(value).__name__,'a':{k:encode(v) for k,v in value.args.items() if v is not None}}
    if isinstance(value,list): return [encode(v) for v in value]
    return value if value is None or isinstance(value,(str,int,float,bool)) else str(value.value)
result={}
for key,sql in json.load(sys.stdin).items():
    tree=sqlglot.parse_one(sql,read='duckdb')
    if not isinstance(tree,(exp.Select,exp.Union)): raise ValueError('Only SELECT/UNION report plans are permitted: '+key)
    for where in tree.find_all(exp.Where):
        filtered=remove_name_filters(where.this)
        if filtered is None: where.pop()
        else: where.set('this',filtered)
    # Unified Calls uses (cp.last_name <> 'Test' OR cp.last_name IS NULL).
    # The CP exclusion flag replaces that whole legacy name restriction.
    for where in list(tree.find_all(exp.Where)):
        if isinstance(where.this,exp.Or) and is_test_filter(where.this.this) and isinstance(where.this.expression,exp.Is) and isinstance(where.this.expression.this,exp.Column) and where.this.expression.this.name.lower()=='last_name': where.pop()
    result[key]=encode(tree)
print(json.dumps({'version':1,'queries':result,'nodeTypes':dict(types)},separators=(',',':')))
`
const result = spawnSync('python', ['-c', script], { input: JSON.stringify(queries), encoding: 'utf8', maxBuffer: 30 * 1024 * 1024, env: { ...process.env, PYTHONPATH: fileURLToPath(new URL('../../../.packages/reporting-tools', import.meta.url)) } })
if (result.status !== 0) throw Error(result.stderr || 'Native report compiler failed.')
const plans = JSON.parse(result.stdout)
plans.sourceSha256 = createHash('sha256').update(source).digest('hex')
writeFileSync(new URL('./nativeReportQueries.json', import.meta.url), JSON.stringify(plans))
console.log(JSON.stringify({ queries: Object.keys(plans.queries).length, nodeTypes: plans.nodeTypes }, null, 2))
