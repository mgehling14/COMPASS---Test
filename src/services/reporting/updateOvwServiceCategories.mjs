import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

const catalogUrl = new URL('./legacyReportCatalog.json', import.meta.url)
const nativeQueriesUrl = new URL('./nativeReportQueries.json', import.meta.url)
const catalog = JSON.parse(readFileSync(catalogUrl, 'utf8'))

const categoryCase = (service) => `CASE
\tWHEN ${service}.AdditionalServiceDetail IN ('Culturally Specific Healing', '125570003') THEN 'E-Culturally specific services'
\tWHEN ${service}.[Service] LIKE 'Medical Forensic Exam%' OR ${service}.PersonalAdvocacyAccompaniment = 'Victim Advocacy/Accompaniment to Medical Forensic Exam' THEN 'G-Forensic exam'
\tWHEN ${service}.[Service] LIKE 'Medical Advocacy%' OR ${service}.PersonalAdvocacyAccompaniment = 'Emergency Medical Care' THEN 'H-Hospital/clinic/other medical response'
\tWHEN ${service}.[Service] IN ('Interpretation') OR ${service}.ServiceCategory = 'Interpretation' OR ${service}.PersonalAdvocacyAccompaniment = 'Interpreter Services' THEN 'I-Language services'
\tWHEN ${service}.[Service] IN ('Transportation', 'Transportation Assistance', 'Pet Transportation') OR ${service}.PersonalAdvocacyAccompaniment = 'Transportation Assistance' THEN 'J-Transportation'
\tWHEN ${service}.[Service] IN ('Issued Voucher', 'Hotel Voucher') THEN 'L-Emergency shelter (hotel/motel)'
\tWHEN ${service}.ServiceCategory = 'Housing & Stability' OR ${service}.[Service] IN ('Housing Search Support', 'Housing Advocacy', 'Landlord Coordination', 'Financial Assistance (Housing Stability)', 'Housing Readiness Planning') OR ${service}.ShelterHousingServices IN ('Transitional housing', 'Relocation assistance') THEN 'M-Other housing support'
\tWHEN ${service}.[Service] LIKE 'Civil Legal Ad%' OR ${service}.[Service] IN ('Legal Referrals', 'Protective Order Assistance') OR ${service}.CriminalCivilJusticeAssistance LIKE 'Civil Legal Assistance%' OR ${service}.CriminalCivilJusticeAssistance = 'Immigration Assistance' OR ${service}.PersonalAdvocacyAccompaniment = 'Immigration Assistance' THEN 'A-Civil legal advocacy/court accompaniment'
\tWHEN ${service}.[Service] LIKE 'Criminal Legal Advocacy%' OR ${service}.[Service] = 'Criminal Justice Advocacy/Accompaniment' OR ${service}.CriminalCivilJusticeAssistance IN ('Notification of Criminal Justice Events', 'Victim Impact Statement Assistance', 'Assistance with Restitution', 'Other Emergency Justice-Related Assistance', 'Prosecution Interview Advocacy/Accompaniment', 'Law Enforcement Interview Advocacy/Accompaniment', 'Criminal Advocacy/Accompaniment') OR ${service}.PersonalAdvocacyAccompaniment = 'Law Enforcement Interview Advocacy/Accompaniment' THEN 'C-Criminal Justice Advocacy/court accompaniment'
\tWHEN ${service}.[Service] = 'Crisis Intervention' OR ${service}.EmotionalSupportorSafetyServices IN ('Crisis intervention (in-person, includes safety planning, etc.)', 'Hotline/crisis line counseling', 'On-scene crisis response (e.g., community crisis response)') THEN 'D-Crisis intervention'
\tWHEN ${service}.ServiceCategory IN ('Groups', 'Counseling') OR ${service}.[Service] IN ('Emotional Support', 'Counseling Referral', 'Support Groups', 'Coping Skills Development', 'Indivdual Counseling', 'Group Registration') OR ${service}.EmotionalSupportorSafetyServices IN ('Individual counseling', 'Support Groups (facilitated or peer)', 'Other therapy (traditional, culturalm or alternative healing: art, writing, or play therapy, etc.)') THEN 'B-Counseling/support group'
\tWHEN ${service}.[Service] IN ('Budgeting Support', 'Financial Literacy', 'Benefits Navigation', 'Emergency Financial Assistance') OR ${service}.EmotionalSupportorSafetyServices LIKE 'Emergency financial assistance%' THEN 'F-Information provided on economic matters'
\tWHEN ${service}.ServiceCategory = 'Other' OR ${service}.[Service] = 'Other' THEN 'N-Other'
\tELSE 'K-Victim/survivor advocacy'
END`

const viewSql = `WITH
cte_ovw_svcs AS (
SELECT DISTINCT cp.document_id AS Client_ProfileID
,cp.first_name + ' ' + cp.last_name AS client_name
,CASE
\tWHEN svcs.ProgramEnrollment LIKE 'DVSTOP%' THEN 'DVSTOP'
END AS [Program_Name]
,CAST(svcs.DateofService AS DATE) AS DateOfService
,svcs.InHours AS Hrs
,svcs.ServiceCategory
,svcs.[Service]
,${categoryCase('svcs')} AS OVW_Services
,CASE
\tWHEN svcs.ServiceCategory = 'OVW Client Assistance' THEN '0-' + svcs.[Service]
END AS OVW_ClientAssistance
,CASE
\tWHEN svcs.ServiceCategory = 'OVW Client Assistance' THEN svcs.ServiceCost
END AS ServiceCost
,svcs.RecordID AS svcs_RecordID

FROM Client_Profile AS cp
\tJOIN documents docs ON docs.ParentId=cp.document_id
\tJOIN ProgramEnrollment pe ON pe.RecordID=docs.RecordId
\tJOIN Links link ON link.LinkToId=docs.RecordId
\tJOIN [Services] svcs ON svcs.RecordID=LinkFromId

WHERE cp.last_name != 'Test'
\tAND svcs.Funder = 'OVW-Late Life'
\tAND pe.ProgramType NOT IN ('Hotline')
)

SELECT DISTINCT *
FROM cte_ovw_svcs ovwSvcs
WHERE ovwSvcs.[Program_Name] IS NOT NULL`

const duckCase = categoryCase('svcs').replaceAll('[Service]', '"Service"')
const duckSql = `WITH cte_ovw_svcs AS (SELECT DISTINCT cp.document_id AS Client_ProfileID, cp.first_name || ' ' || cp.last_name AS client_name, CASE WHEN svcs.ProgramEnrollment LIKE 'DVSTOP%' THEN 'DVSTOP' END AS "Program_Name", CAST(svcs.DateofService AS DATE) AS DateOfService, svcs.InHours AS Hrs, svcs.ServiceCategory, svcs."Service", ${duckCase.replaceAll('\n', ' ').replaceAll('\t', '')} AS OVW_Services, CASE WHEN svcs.ServiceCategory = 'OVW Client Assistance' THEN '0-' || svcs."Service" END AS OVW_ClientAssistance, CASE WHEN svcs.ServiceCategory = 'OVW Client Assistance' THEN svcs.ServiceCost END AS ServiceCost, svcs.RecordID AS svcs_RecordID FROM base_Client_Profile AS cp JOIN base_documents AS docs ON docs.ParentId = cp.document_id JOIN base_ProgramEnrollment AS pe ON pe.RecordID = docs.RecordId JOIN base_Links AS link ON link.LinkToId = docs.RecordId JOIN base_Services AS svcs ON svcs.RecordID = LinkFromId WHERE cp.last_name <> 'Test' AND svcs.Funder = 'OVW-Late Life' AND NOT pe.ProgramType IN ('Hotline')) SELECT DISTINCT * FROM cte_ovw_svcs AS ovwSvcs WHERE NOT ovwSvcs."Program_Name" IS NULL`

const view = catalog.views.find((entry) => entry.name === 'ovw_03_svcs')
if (!view) throw new Error('OVW services view was not found.')
view.sourceSql = viewSql
view.adaptedSourceSql = viewSql
view.adaptation = 'Current COMPASS service and subcategory selections map to all OVW Section F service categories; unmatched services default to victim/survivor advocacy.'
view.sql = duckSql
view.requirements.Services = [
  'AdditionalServiceDetail',
  'CriminalCivilJusticeAssistance',
  'DateofService',
  'EmotionalSupportorSafetyServices',
  'Funder',
  'InHours',
  'PersonalAdvocacyAccompaniment',
  'ProgramEnrollment',
  'RecordID',
  'Service',
  'ServiceCategory',
  'ServiceCost',
  'ShelterHousingServices',
]
view.sourceSha256 = createHash('sha256').update(viewSql).digest('hex')

catalog.tables.Services.AdditionalServiceDetail = 'VARCHAR'
catalog.tables.Services.AdditionalServiceDetailOther = 'VARCHAR'

const labels = [
  ['A-Civil legal advocacy/court accompaniment', 'Civil legal advocacy/court accompaniments'],
  ['B-Counseling/support group', 'Counseling/support groups'],
  ['C-Criminal Justice Advocacy/court accompaniment', 'Criminal Justice Advocacy/court accompaniments'],
  ['D-Crisis intervention', 'Crisis interventions'],
  ['E-Culturally specific services', 'Culturally specific services'],
  ['F-Information provided on economic matters', 'Information provided on economic matters'],
  ['G-Forensic exam', 'Forensic exams'],
  ['H-Hospital/clinic/other medical response', 'Hospital/clinic/other medical responses'],
  ['I-Language services', 'Language services'],
  ['J-Transportation', 'Transportation services'],
  ['K-Victim/survivor advocacy', 'Victim/survivor advocacy services'],
  ['L-Emergency shelter (hotel/motel)', 'Emergency shelter (hotel/motel) services'],
  ['M-Other housing support', 'Other housing support services'],
  ['N-Other', 'Other services'],
]
const dqSummary = '="The service counts below are not distinct." & vbCrLf &\n' + labels.map(([value, label]) => `"# of ${label}: " &\nSum(IIF(Fields!OVW_Services.Value = "${value}", 1, 0))`).join(' & vbCrLf &\n\n')
const dqReport = catalog.reports.find((entry) => entry.id === 'ovw-dq-report-v26-1')
let updatedSummary = false
const visit = (value) => {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) return value.forEach(visit)
  for (const [key, child] of Object.entries(value)) {
    if (key === 'value' && typeof child === 'string' && child.includes('The service counts below are not distinct.')) {
      value[key] = dqSummary
      updatedSummary = true
    } else visit(child)
  }
}
visit(dqReport)
if (!updatedSummary) throw new Error('OVW DQ service summary expression was not found.')

const catalogSource = JSON.stringify(catalog, null, 2) + '\n'
writeFileSync(catalogUrl, catalogSource)

const nativeQueries = JSON.parse(readFileSync(nativeQueriesUrl, 'utf8'))
const qid = (name, quoted = false) => ({ k: 'Identifier', a: { this: name, quoted } })
const column = (name, quoted = false) => ({ k: 'Column', a: { this: qid(name, quoted), table: qid('svcs') } })
const literal = (value) => ({ k: 'Literal', a: { this: value, is_string: true } })
const binary = (k, left, right) => ({ k, a: { this: left, expression: right } })
const oneOf = (field, values) => ({ k: 'In', a: { this: field, expressions: values.map(literal) } })
const either = (...conditions) => conditions.reduce((left, right) => binary('Or', left, right))
const service = column('Service', true)
const category = column('ServiceCategory')
const detail = column('AdditionalServiceDetail')
const personal = column('PersonalAdvocacyAccompaniment')
const emotional = column('EmotionalSupportorSafetyServices')
const justice = column('CriminalCivilJusticeAssistance')
const housing = column('ShelterHousingServices')
const eq = (field, value) => binary('EQ', field, literal(value))
const like = (field, value) => binary('Like', field, literal(value))
const rules = [
  [oneOf(detail, ['Culturally Specific Healing', '125570003']), 'E-Culturally specific services'],
  [either(like(service, 'Medical Forensic Exam%'), eq(personal, 'Victim Advocacy/Accompaniment to Medical Forensic Exam')), 'G-Forensic exam'],
  [either(like(service, 'Medical Advocacy%'), eq(personal, 'Emergency Medical Care')), 'H-Hospital/clinic/other medical response'],
  [either(oneOf(service, ['Interpretation']), eq(category, 'Interpretation'), eq(personal, 'Interpreter Services')), 'I-Language services'],
  [either(oneOf(service, ['Transportation', 'Transportation Assistance', 'Pet Transportation']), eq(personal, 'Transportation Assistance')), 'J-Transportation'],
  [oneOf(service, ['Issued Voucher', 'Hotel Voucher']), 'L-Emergency shelter (hotel/motel)'],
  [either(eq(category, 'Housing & Stability'), oneOf(service, ['Housing Search Support', 'Housing Advocacy', 'Landlord Coordination', 'Financial Assistance (Housing Stability)', 'Housing Readiness Planning']), oneOf(housing, ['Transitional housing', 'Relocation assistance'])), 'M-Other housing support'],
  [either(like(service, 'Civil Legal Ad%'), oneOf(service, ['Legal Referrals', 'Protective Order Assistance']), like(justice, 'Civil Legal Assistance%'), eq(justice, 'Immigration Assistance'), eq(personal, 'Immigration Assistance')), 'A-Civil legal advocacy/court accompaniment'],
  [either(like(service, 'Criminal Legal Advocacy%'), eq(service, 'Criminal Justice Advocacy/Accompaniment'), oneOf(justice, ['Notification of Criminal Justice Events', 'Victim Impact Statement Assistance', 'Assistance with Restitution', 'Other Emergency Justice-Related Assistance', 'Prosecution Interview Advocacy/Accompaniment', 'Law Enforcement Interview Advocacy/Accompaniment', 'Criminal Advocacy/Accompaniment']), eq(personal, 'Law Enforcement Interview Advocacy/Accompaniment')), 'C-Criminal Justice Advocacy/court accompaniment'],
  [either(eq(service, 'Crisis Intervention'), oneOf(emotional, ['Crisis intervention (in-person, includes safety planning, etc.)', 'Hotline/crisis line counseling', 'On-scene crisis response (e.g., community crisis response)'])), 'D-Crisis intervention'],
  [either(oneOf(category, ['Groups', 'Counseling']), oneOf(service, ['Emotional Support', 'Counseling Referral', 'Support Groups', 'Coping Skills Development', 'Indivdual Counseling', 'Group Registration']), oneOf(emotional, ['Individual counseling', 'Support Groups (facilitated or peer)', 'Other therapy (traditional, culturalm or alternative healing: art, writing, or play therapy, etc.)'])), 'B-Counseling/support group'],
  [either(oneOf(service, ['Budgeting Support', 'Financial Literacy', 'Benefits Navigation', 'Emergency Financial Assistance']), like(emotional, 'Emergency financial assistance%')), 'F-Information provided on economic matters'],
  [either(eq(category, 'Other'), eq(service, 'Other')), 'N-Other'],
]
const ovwCase = { k: 'Case', a: { ifs: rules.map(([condition, result]) => ({ k: 'If', a: { this: condition, true: literal(result) } })), default: literal('K-Victim/survivor advocacy') } }
const ovwPlan = nativeQueries.queries['view:ovw_03_svcs']
let updatedPlan = false
const replaceOvwCase = (value) => {
  if (!value || typeof value !== 'object') return
  if (value.k === 'Alias' && value.a?.alias?.a?.this === 'OVW_Services') {
    value.a.this = ovwCase
    updatedPlan = true
    return
  }
  for (const child of Object.values(value)) if (Array.isArray(child)) child.forEach(replaceOvwCase); else replaceOvwCase(child)
}
replaceOvwCase(ovwPlan)
if (!updatedPlan) throw new Error('Compiled OVW service category expression was not found.')
const counts = {}
const countNodes = (value) => {
  if (!value || typeof value !== 'object') return
  if (typeof value.k === 'string') counts[value.k] = (counts[value.k] || 0) + 1
  for (const child of Object.values(value)) if (Array.isArray(child)) child.forEach(countNodes); else countNodes(child)
}
countNodes(nativeQueries.queries)
nativeQueries.nodeTypes = counts
nativeQueries.sourceSha256 = createHash('sha256').update(catalogSource).digest('hex')
writeFileSync(nativeQueriesUrl, JSON.stringify(nativeQueries))
