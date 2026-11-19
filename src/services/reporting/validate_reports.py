"""Offline binding/fixture tests for every translated SQL view and dataset."""
import json
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / '.packages' / 'reporting-tools'))
import duckdb

def validate():
    catalog = json.loads(Path(__file__).with_name('legacyReportCatalog.json').read_text(encoding='utf-8'))
    db = duckdb.connect()
    db.execute("CREATE MACRO report_asof() AS DATE '2026-10-13'")
    db.execute("CREATE MACRO report_int(x) AS CAST(TRUNC(TRY_CAST(x AS DOUBLE)) AS INTEGER)")
    for name, columns in catalog['tables'].items():
        db.execute('CREATE TABLE "base_' + name + '" (' + ', '.join('"' + c.replace('"', '""') + '" ' + t for c, t in columns.items()) + ')')
    pending = list(catalog['views'])
    bound, failures = [], []
    for _ in range(len(pending) + 1):
        progress = False
        for view in list(pending):
            if any(not d.startswith('table:') and d not in bound for d in view['dependencies']):
                continue
            try:
                db.execute('CREATE VIEW "view_' + view['name'] + '" AS ' + view['sql'])
                bound.append(view['name'])
            except Exception as error:
                failures.append({'view': view['name'], 'error': str(error).split('Candidate functions:')[0][-1800:]})
            pending.remove(view)
            progress = True
        if not progress:
            break
    params = {'ReportPeriodStart': '2026-09-01', 'ReportPeriodEnd': '2026-09-30', 'Quarter': 'Q4', 'Fiscal_Year': 2026, 'fiscal_year': 2026, 'Program_Name': 'DVSTOP'}
    dataset_count = 0
    for report in catalog['reports']:
        for dataset in report['datasets']:
            if any(not d.startswith('table:') and d not in bound for d in dataset['dependencies']):
                continue
            import re
            required = re.findall(r'\$([A-Za-z_]\w*)', dataset['sql'])
            try:
                db.execute(dataset['sql'], {name: params[name] for name in required})
                dataset_count += 1
            except Exception as error:
                failures.append({'report': report['title'], 'dataset': dataset['name'], 'error': str(error)[-1600:]})
    print(json.dumps({'viewsBound': len(bound), 'datasetsBound': dataset_count, 'failures': failures, 'pending': [v['name'] for v in pending]}, indent=2))
    return len(failures) + len(pending)

if __name__ == '__main__':
    sys.exit(1 if validate() else 0)
