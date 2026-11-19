"""Compile provided T-SQL/RDL into a sanitized, reproducible browser catalog.

Generated JSON is build output; never includes connection strings, credentials,
embedded VB code, external links or executable JavaScript. SQL is parsed into an
AST, SELECT-only, translated locally and binder-tested against empty fixtures.
Install pinned tool versions from reporting-tools.requirements.txt into
.packages/reporting-tools, then run this script from CMS_Sandbox.
"""
import hashlib
import json
import re
import sys
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / '.packages' / 'reporting-tools'))
import sqlglot
from sqlglot import exp
from sqlglot.optimizer.scope import traverse_scope
import duckdb

SOURCE = ROOT / 'Apricot' / 'Apricot'
OUTPUT = Path(__file__).with_name('legacyReportCatalog.json')
ALIASES = {'dvsv_services': 'services', 'dvshelter_bednights': 'bednights', 'dvsv_calls': 'calls', 'dv_unmetshelter': 'unmetshelter', 'dv_events': 'events'}
TYPES = {}
BASE_COLUMNS = {}
NOTES = []

def requirements(sql):
    result = {}
    tree = sqlglot.parse_one(sql, read='tsql')
    ctes = {cte.alias.lower() for cte in tree.find_all(exp.CTE)}
    for scope in traverse_scope(tree):
        for column in scope.columns:
            source = scope.sources.get(column.table)
            if isinstance(source, exp.Table) and source.db.lower() not in ('dv', 'leaf', 'apr') and source.name.lower() not in ctes and not source.name.lower().startswith('vw_'):
                result.setdefault(source.name, set()).add(column.name)
    return {table: sorted(columns, key=str.lower) for table, columns in result.items()}

def strip_comments(text):
    # A SQL parser handles quoted literals; comments here contain no escaped
    # comment delimiters in the supplied source (verified by catalog tests).
    return re.sub(r'--[^\r\n]*', '', re.sub(r'/\*[\s\S]*?\*/', '', text))

def key(name):
    name = name.lower().removeprefix('vw_')
    return ALIASES.get(name, name)

def infer_type(name):
    value = name.lower()
    if value.endswith('id') or value in ('id', 'document_id', 'linktoid', 'linkfromid', 'parentid'):
        return 'VARCHAR'
    if value in ('dob', 'dateofservice', 'dateofcontact') or value.endswith('date') or value.endswith('start') or value.endswith('end'):
        return 'DATE'
    if value in ('minutes', 'sixty', 'inhours', 'hours', 'servicecost', 'numpets') or value.startswith(('total', 'numberof', 'count')):
        return 'DOUBLE'
    return 'VARCHAR'

def sql_transform(sql):
    tree = sqlglot.parse_one(sql, read='tsql')
    if not isinstance(tree, (exp.Select, exp.Union)):
        raise ValueError('Only SELECT/CTE/UNION report queries are permitted.')
    for node in tree.walk():
        if isinstance(node, (exp.Command, exp.Insert, exp.Delete, exp.Update, exp.Create, exp.Drop)):
            raise ValueError('Report SQL contains a non-read operation.')
    ctes = {cte.alias.lower() for cte in tree.find_all(exp.CTE)}
    dependencies = set()
    for scope in traverse_scope(tree):
        for column in scope.columns:
            source = scope.sources.get(column.table)
            if isinstance(source, exp.Table) and not source.db and source.name.lower() not in ctes:
                name = source.name
                BASE_COLUMNS.setdefault(name, {})[column.name] = TYPES.get(column.name.lower(), infer_type(column.name))
    for table in tree.find_all(exp.Table):
        if table.name.lower() in ctes and not table.db:
            continue
        if table.db.lower() in ('dv', 'leaf', 'apr') or table.name.lower().startswith('vw_'):
            name = key(table.name)
            dependencies.add(name)
            table.set('this', exp.to_identifier('view_' + name))
        else:
            name = table.name
            dependencies.add('table:' + name)
            table.set('this', exp.to_identifier('base_' + name))
        table.set('db', None)
        table.set('catalog', None)
    def transform(node):
        if isinstance(node, exp.Parameter) and node.name in ('ReportPeriodStart', 'ReportPeriodEnd'):
            return exp.Cast(this=node.copy(), to=exp.DataType.build('DATE'))
        if isinstance(node, exp.CurrentTimestamp):
            return exp.Anonymous(this='report_asof', expressions=[])
        if isinstance(node, exp.Add):
            def is_text(part):
                return (isinstance(part, exp.Literal) and part.is_string) or isinstance(part, exp.DPipe) or (isinstance(part, exp.Cast) and 'CHAR' in part.to.sql().upper()) or (isinstance(part, exp.Column) and TYPES.get(part.name.lower(), infer_type(part.name)) == 'VARCHAR') or isinstance(part, (exp.Lower, exp.Upper, exp.Substring, exp.Left, exp.Right)) or (isinstance(part, (exp.Add, exp.Paren)) and any(is_text(p) for p in part.iter_expressions()))
            if is_text(node.this) or is_text(node.expression):
                return exp.DPipe(this=node.this.copy(), expression=node.expression.copy())
        if isinstance(node, (exp.Cast, exp.Convert)) and node.args.get('to') and node.args['to'].sql().upper() in ('INT', 'INTEGER'):
            return exp.Anonymous(this='report_int', expressions=[node.this.copy()])
        if isinstance(node, (exp.EQ, exp.NEQ)):
            col, literal = node.this, node.expression
            if isinstance(col, exp.Column) and isinstance(literal, exp.Literal) and literal.is_string and literal.this == '' and infer_type(col.name) == 'DATE':
                comparison = exp.Is(this=col.copy(), expression=exp.Null())
                return exp.Not(this=comparison) if isinstance(node, exp.NEQ) else comparison
        return node
    for node in reversed(list(tree.walk())):
        replacement = transform(node)
        if replacement is not node:
            node.replace(replacement)
    return tree.sql(dialect='duckdb', unsupported_level=sqlglot.ErrorLevel.RAISE), sorted(dependencies)

def child(node, name):
    return node.find(name) if node is not None else None

def text(node, name, default=''):
    value = child(node, name)
    return value.text or default if value is not None else default

def filters(node):
    return [{'expression': text(f, 'FilterExpression'), 'operator': text(f, 'Operator'), 'values': [v.text or '' for v in f.findall('./FilterValues/FilterValue')]} for f in node.findall('./Filters/Filter')]

def sorts(node):
    return [{'expression': text(s, 'Value'), 'direction': text(s, 'Direction', 'Ascending')} for s in node.findall('./SortExpressions/SortExpression')]

def style(node):
    return {c.tag: c.text or '' for c in node.findall('./Style/*') if c.tag in ('BackgroundColor', 'Color', 'FontSize', 'FontWeight', 'TextAlign', 'Format', 'FontStyle')}

def members(node):
    if node is None:
        return []
    output = []
    for member in node.findall('./TablixMembers/TablixMember'):
        group = child(member, 'Group')
        output.append({'name': group.get('Name', '') if group is not None else '', 'expressions': [e.text or '' for e in group.findall('./GroupExpressions/GroupExpression')] if group is not None else [], 'filters': filters(group) if group is not None else [], 'sorts': sorts(member), 'hidden': text(child(member, 'Visibility'), 'Hidden'), 'toggle': text(child(member, 'Visibility'), 'ToggleItem'), 'header': contents(child(child(member, 'TablixHeader'), 'CellContents')), 'members': members(member)})
    return output

def contents(node):
    if node is None:
        return []
    result = []
    for item in list(node):
        if item.tag == 'ReportItems':
            result.extend(contents(item))
        elif item.tag == 'Textbox':
            paragraphs = []
            for paragraph in item.findall('./Paragraphs/Paragraph'):
                paragraphs.append([{'value': text(run, 'Value'), 'style': style(run)} for run in paragraph.findall('./TextRuns/TextRun')])
            result.append({'kind': 'text', 'name': item.get('Name', ''), 'paragraphs': paragraphs, 'style': style(item), 'top': text(item, 'Top'), 'hidden': text(child(item, 'Visibility'), 'Hidden')})
        elif item.tag == 'Rectangle':
            result.extend(contents(child(item, 'ReportItems')))
        elif item.tag == 'Tablix':
            body = child(item, 'TablixBody')
            result.append({'kind': 'table', 'name': item.get('Name', ''), 'dataset': text(item, 'DataSetName'), 'style': style(item), 'top': text(item, 'Top'), 'filters': filters(item), 'sorts': sorts(item), 'rowMembers': members(child(item, 'TablixRowHierarchy')), 'columnMembers': members(child(item, 'TablixColumnHierarchy')), 'rows': [[{'items': contents(child(cell, 'CellContents')), 'colSpan': int(text(child(cell, 'CellContents'), 'ColSpan', '1')), 'rowSpan': int(text(child(cell, 'CellContents'), 'RowSpan', '1'))} for cell in row.findall('./TablixCells/TablixCell')] for row in body.findall('./TablixRows/TablixRow')] if body is not None else []})
        # Old server links, VB code, connection details and embedded-image blobs
        # deliberately do not enter the application bundle.
    return result

def parse_report(path):
    raw = path.read_text(encoding='utf-8-sig')
    if '<!DOCTYPE' in raw.upper():
        raise ValueError('DTD/external entity declarations are not permitted.')
    root = ET.fromstring(raw)
    for node in root.iter():
        node.tag = node.tag.split('}')[-1]
    datasets = []
    for dataset in root.findall('./DataSets/DataSet'):
        source_sql = text(child(dataset, 'Query'), 'CommandText')
        translated, dependencies = sql_transform(source_sql)
        datasets.append({'name': dataset.get('Name'), 'sql': translated, 'sourceSql': source_sql, 'dependencies': dependencies, 'requirements': requirements(source_sql), 'filters': filters(dataset), 'fields': [{'name': f.get('Name'), 'source': text(f, 'DataField'), 'expression': text(f, 'Value')} for f in dataset.findall('./Fields/Field')]})
    parameters = []
    for param in root.findall('./ReportParameters/ReportParameter'):
        parameters.append({'name': param.get('Name'), 'type': text(param, 'DataType'), 'prompt': text(param, 'Prompt', param.get('Name')), 'hidden': text(param, 'Hidden') == 'true', 'values': [{'value': text(v, 'Value'), 'label': text(v, 'Label')} for v in param.findall('./ValidValues/ParameterValues/ParameterValue')]})
    items = []
    bodies = root.findall('./ReportSections/ReportSection/Body/ReportItems') or root.findall('./Body/ReportItems')
    for body in bodies:
        items.extend(contents(body))
    # Header/footer text is not mixed into table scopes; standard report name,
    # parameters and generation time are supplied by the native report shell.
    return {'id': re.sub(r'[^a-z0-9]+', '-', path.stem.lower()).strip('-'), 'title': path.stem, 'sourceFile': path.name, 'sourceSha256': hashlib.sha256(raw.encode()).hexdigest(), 'parameters': parameters, 'datasets': datasets, 'items': items}

def main():
    ddl = (SOURCE / 'Apricot Tables for DVSV.txt').read_text(encoding='utf-8-sig')
    for match in re.finditer(r'\[([^\]]+)\]\s+\[(varchar|nvarchar|int|bigint|decimal|datetime|date|time|tinyint)\]', ddl, re.I):
        TYPES[match[1].lower()] = {'datetime': 'DATE', 'date': 'DATE', 'int': 'DOUBLE', 'bigint': 'DOUBLE', 'decimal': 'DECIMAL(38,2)', 'tinyint': 'DOUBLE'}.get(match[2].lower(), 'VARCHAR')
        if match[1].lower().endswith('id') or match[1].lower() == 'document_id':
            TYPES[match[1].lower()] = 'VARCHAR'
    views = []
    overrides = json.loads(Path(__file__).with_name('legacyReportOverrides.json').read_text(encoding='utf-8'))
    for path in sorted(SOURCE.glob('*.txt')):
        if path.name == 'Apricot Tables for DVSV.txt':
            continue
        raw = path.read_text(encoding='utf-8-sig')
        match = re.search(r'(?:CREATE|ALTER)\s+VIEW\s+\[\w+\]\.\[([^\]]+)\]\s+AS\s+([\s\S]*)', strip_comments(raw), re.I)
        if not match:
            raise ValueError('Cannot identify view: ' + path.name)
        body = re.sub(r'^\s*GO\s*$', '', match[2], flags=re.M).strip()
        override = overrides.get(key(match[1]))
        adapted = override['sql'] if override else body
        translated, dependencies = sql_transform(adapted)
        views.append({'name': key(match[1]), 'sourceFile': path.name, 'sourceSql': body, 'adaptedSourceSql': adapted, 'adaptation': override['reason'] if override else '', 'sql': translated, 'dependencies': dependencies, 'requirements': requirements(adapted), 'sourceSha256': hashlib.sha256(raw.encode()).hexdigest()})
    reports = [parse_report(path) for path in sorted(SOURCE.glob('*.rdl'))]
    # Resolve every base column used by schema-qualified tables too.
    for view in views:
        original = sqlglot.parse_one(view['adaptedSourceSql'], read='tsql')
        for scope in traverse_scope(original):
            for col in scope.columns:
                source = scope.sources.get(col.table)
                if isinstance(source, exp.Table) and source.db.lower() not in ('dv', 'leaf', 'apr') and not source.name.lower().startswith(('vw_', 'cte_')):
                    BASE_COLUMNS.setdefault(source.name, {})[col.name] = TYPES.get(col.name.lower(), infer_type(col.name))
    # GUID linkage substitutes the numeric Apricot IDs, with a display-ID map.
    for columns in BASE_COLUMNS.values():
        for name in columns:
            if name.lower().endswith('id') or name.lower() in ('id', 'document_id'):
                columns[name] = 'VARCHAR'
    # SQL identifiers are case-insensitive in both source and target engines.
    for name, columns in list(BASE_COLUMNS.items()):
        deduplicated = {}
        seen = set()
        for field, datatype in columns.items():
            if field.lower() not in seen:
                deduplicated[field] = datatype
                seen.add(field.lower())
        BASE_COLUMNS[name] = deduplicated
    catalog = {'version': 1, 'compiler': {'sqlglot': sqlglot.__version__, 'duckdbTests': duckdb.__version__}, 'deferredReferences': ['Ref_Dates', 'Ref_ShelterCapacity'], 'views': views, 'reports': reports, 'tables': BASE_COLUMNS, 'notes': NOTES}
    OUTPUT.write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'reports': len(reports), 'views': len(views), 'tables': {name: len(columns) for name, columns in BASE_COLUMNS.items()}, 'output': str(OUTPUT)}))

if __name__ == '__main__':
    main()
