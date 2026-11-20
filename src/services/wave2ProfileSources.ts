// Source form 107. Review annotations are not proof of a Dataverse binding.
// Controls/datatype evidence: field-analysis-v2; review status: ANL_Client_Profile_Crosswalk_V2.xlsx.
export const PROFILE_SOURCES = [
  {
    "id": "document_id",
    "label": "Record ID",
    "programs": [
      "CAP",
      "ATO",
      "Workforce",
      "GED",
      "Financial Wellness"
    ],
    "datatype": "Read-only display",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "9754",
    "label": "HMIS #",
    "programs": [],
    "datatype": "Text (single line)",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "Translated"
  },
  {
    "id": "7612",
    "label": "IMC Number",
    "programs": [
      "Workforce"
    ],
    "datatype": "Text (single line)",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "Translated"
  },
  {
    "id": "9859",
    "label": "PI#",
    "programs": [],
    "datatype": "Text (single line)",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "Translated"
  },
  {
    "id": "5384",
    "label": "Name",
    "programs": [
      "CAP",
      "ATO",
      "Workforce",
      "GED",
      "Financial Wellness"
    ],
    "datatype": "Name (compound)",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "5385",
    "label": "Preferred Name",
    "programs": [
      "CAP",
      "ATO",
      "Workforce",
      "GED",
      "Financial Wellness"
    ],
    "datatype": "Name (compound)",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "5403",
    "label": "SSN Known?",
    "programs": [
      "CAP",
      "ATO",
      "Workforce",
      "GED",
      "Financial Wellness"
    ],
    "datatype": "Radio buttons",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "5404",
    "label": "DOB Known?",
    "programs": [
      "CAP",
      "ATO",
      "Workforce",
      "GED",
      "Financial Wellness"
    ],
    "datatype": "Radio buttons",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "5386",
    "label": "Social Security Number",
    "programs": [
      "CAP",
      "ATO",
      "Workforce",
      "GED",
      "Financial Wellness"
    ],
    "datatype": "SSN (segmented)",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "5387",
    "label": "Date of Birth",
    "programs": [
      "CAP",
      "ATO",
      "Workforce",
      "GED",
      "Financial Wellness"
    ],
    "datatype": "Date",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "5389",
    "label": "Home Phone",
    "programs": [
      "CAP",
      "ATO",
      "Workforce",
      "Financial Wellness"
    ],
    "datatype": "Phone (compound)",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "5388",
    "label": "Email",
    "programs": [
      "CAP",
      "ATO",
      "Workforce",
      "GED",
      "Financial Wellness"
    ],
    "datatype": "Email",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "5390",
    "label": "Cell Phone",
    "programs": [
      "CAP",
      "ATO",
      "Workforce",
      "GED",
      "Financial Wellness"
    ],
    "datatype": "Phone (compound)",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "5391",
    "label": "Work Phone",
    "programs": [
      "Workforce"
    ],
    "datatype": "Phone (compound)",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "7613",
    "label": "OK to Contact?",
    "programs": [
      "Workforce"
    ],
    "datatype": "Radio buttons",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "7614",
    "label": "Preferred Contact Method",
    "programs": [
      "Workforce"
    ],
    "datatype": "Checkbox group (multi-select)",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "7615",
    "label": "Why is it not OK to contact?",
    "programs": [],
    "datatype": "Radio buttons (Yes/No)",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "Translated"
  },
  {
    "id": "5402",
    "label": "Residency Status",
    "programs": [
      "CAP"
    ],
    "datatype": "Radio buttons",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "5398",
    "label": "Preferred Language",
    "programs": [
      "CAP"
    ],
    "datatype": "Radio buttons",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "5400",
    "label": "Marital Status",
    "programs": [
      "CAP"
    ],
    "datatype": "Dropdown",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "5399",
    "label": "Are you and/or a family member an ANL Employee?",
    "programs": [
      "CAP"
    ],
    "datatype": "Radio buttons",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "5395",
    "label": "Type of Insurance",
    "programs": [
      "CAP"
    ],
    "datatype": "Dropdown",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "Translated"
  },
  {
    "id": "5401",
    "label": "Name of Family Member",
    "programs": [
      "CAP"
    ],
    "datatype": "Text (single line)",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "Translated"
  },
  {
    "id": "8345",
    "label": "AHCCCS ID",
    "programs": [
      "CAP"
    ],
    "datatype": "Text (single line)",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "ADDED"
  },
  {
    "id": "5405",
    "label": "Do you receive Food Stamps (SNAP) or TANF (cash as",
    "programs": [
      "CAP"
    ],
    "datatype": "Radio buttons",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "5396",
    "label": "Place of Birth",
    "programs": [
      "CAP"
    ],
    "datatype": "Address (compound)",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "5406",
    "label": "Food Stamps (SNAP) Case Number",
    "programs": [
      "CAP"
    ],
    "datatype": "Numeric",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "Translated"
  },
  {
    "id": "5397",
    "label": "Relationship to Applicant/HOH",
    "programs": [
      "CAP",
      "ATO",
      "Workforce",
      "GED",
      "Financial Wellness"
    ],
    "datatype": "Radio buttons",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "5431",
    "label": "Current Address",
    "programs": [
      "CAP",
      "ATO",
      "Workforce",
      "GED",
      "Financial Wellness"
    ],
    "datatype": "Address (compound)",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "5432",
    "label": "Date in County",
    "programs": [
      "CAP"
    ],
    "datatype": "Date",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "7626",
    "label": "Facility Name",
    "programs": [
      "Workforce"
    ],
    "datatype": "Text (single line)",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "7627",
    "label": "Is the mailing address the same as the current add",
    "programs": [
      "Workforce"
    ],
    "datatype": "Radio buttons",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "7628",
    "label": "Mailing Address",
    "programs": [
      "Workforce"
    ],
    "datatype": "Address (compound)",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "Translated"
  },
  {
    "id": "7629",
    "label": "Facility Name (mailing address)",
    "programs": [
      "Workforce"
    ],
    "datatype": "Address (compound)",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "Translated"
  },
  {
    "id": "9763",
    "label": "Last Permanent Address",
    "programs": [
      "Workforce"
    ],
    "datatype": "Address (compound)",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "ADDED"
  },
  {
    "id": "9761",
    "label": "Allergies",
    "programs": [],
    "datatype": "Checkbox group (multi-select)",
    "basis": "Seen in video",
    "reviewStatus": "ADDED"
  },
  {
    "id": "5430",
    "label": "Disability",
    "programs": [
      "CAP",
      "ATO",
      "Workforce",
      "GED",
      "Financial Wellness"
    ],
    "datatype": "Checkbox group (multi-select)",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "9762",
    "label": "Do you have severe allergic reactions requiring th",
    "programs": [],
    "datatype": "Radio buttons (Yes/No)",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "ADDED"
  },
  {
    "id": "8344",
    "label": "Type of Disability",
    "programs": [
      "Workforce"
    ],
    "datatype": "Checkbox group (multi-select)",
    "basis": "Seen in video",
    "reviewStatus": "ADDED"
  },
  {
    "id": "9759",
    "label": "Allergies & Reactions",
    "programs": [],
    "datatype": "Text (single line)",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "ADDED"
  },
  {
    "id": "9758",
    "label": "Other Medical or Mental Health Challenges",
    "programs": [],
    "datatype": "Text (single line)",
    "basis": "Seen in video",
    "reviewStatus": "ADDED"
  },
  {
    "id": "5425",
    "label": "Race (Up to 5 can be selected)",
    "programs": [
      "CAP",
      "ATO",
      "Workforce",
      "GED",
      "Financial Wellness"
    ],
    "datatype": "Checkbox group (multi-select)",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "5426",
    "label": "Is the client multi-racial?",
    "programs": [
      "CAP",
      "ATO",
      "Workforce",
      "GED",
      "Financial Wellness"
    ],
    "datatype": "Radio buttons",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "5427",
    "label": "Ethnicity",
    "programs": [
      "CAP",
      "ATO",
      "Workforce",
      "GED",
      "Financial Wellness"
    ],
    "datatype": "Dropdown",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "7618",
    "label": "Transportation Type",
    "programs": [
      "Workforce"
    ],
    "datatype": "Dropdown",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "Translated"
  },
  {
    "id": "5428",
    "label": "Are you homeless?",
    "programs": [],
    "datatype": "Radio buttons (Yes/No)",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "Translated"
  },
  {
    "id": "5429",
    "label": "Are you homebound?",
    "programs": [
      "CAP"
    ],
    "datatype": "Radio buttons (Yes/No)",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "Translated"
  },
  {
    "id": "8350",
    "label": "Were you ever previously homeless?",
    "programs": [],
    "datatype": "Radio buttons",
    "basis": "Seen in video",
    "reviewStatus": "ADDED"
  },
  {
    "id": "8351",
    "label": "If so, for how long?",
    "programs": [],
    "datatype": "Radio buttons (Yes/No)",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "ADDED"
  },
  {
    "id": "9755",
    "label": "Number of times you have been homeless in the past",
    "programs": [],
    "datatype": "Numeric",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "ADDED"
  },
  {
    "id": "9756",
    "label": "Number of months you have been homeless in the pas",
    "programs": [],
    "datatype": "Numeric",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "ADDED"
  },
  {
    "id": "8348",
    "label": "Have you ever been evicted?",
    "programs": [],
    "datatype": "Radio buttons",
    "basis": "Seen in video",
    "reviewStatus": "ADDED"
  },
  {
    "id": "8349",
    "label": "If yes, how long ago?",
    "programs": [],
    "datatype": "Radio buttons (Yes/No)",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "ADDED"
  },
  {
    "id": "5423",
    "label": "Are you an Immigrant Farm Worker?",
    "programs": [
      "CAP"
    ],
    "datatype": "Radio buttons",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "5424",
    "label": "Are you a Seasonal Farm Worker?",
    "programs": [
      "CAP"
    ],
    "datatype": "Radio buttons",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "7988",
    "label": "Check 1 that applies:",
    "programs": [
      "ATO"
    ],
    "datatype": "Radio buttons",
    "basis": "Seen in video",
    "reviewStatus": "ADDED"
  },
  {
    "id": "9757",
    "label": "Do you have a vehicle you will need to park on pro",
    "programs": [],
    "datatype": "Radio buttons",
    "basis": "Seen in video",
    "reviewStatus": "ADDED"
  },
  {
    "id": "5413",
    "label": "Current Gender",
    "programs": [
      "CAP",
      "ATO",
      "Workforce",
      "GED",
      "Financial Wellness"
    ],
    "datatype": "Radio buttons",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "5417",
    "label": "Is client in the LGBTQ+ Community?",
    "programs": [
      "CAP",
      "ATO",
      "Workforce",
      "GED",
      "Financial Wellness"
    ],
    "datatype": "Radio buttons",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "5412",
    "label": "Sex Assigned at Birth",
    "programs": [],
    "datatype": "Radio buttons",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "5415",
    "label": "Sexual Orientation",
    "programs": [],
    "datatype": "Radio buttons",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "5416",
    "label": "Preferred Pronouns",
    "programs": [],
    "datatype": "Checkbox group (multi-select)",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "5414",
    "label": "Gender Identity",
    "programs": [],
    "datatype": "Radio buttons",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "5419",
    "label": "Veteran/Military Status",
    "programs": [
      "CAP",
      "ATO",
      "Workforce",
      "GED",
      "Financial Wellness"
    ],
    "datatype": "Radio buttons",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "7621",
    "label": "Military Branches Served",
    "programs": [
      "Workforce"
    ],
    "datatype": "Text (single line)",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "Translated"
  },
  {
    "id": "7622",
    "label": "Enlistment Date",
    "programs": [
      "Workforce"
    ],
    "datatype": "Date",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "Translated"
  },
  {
    "id": "7623",
    "label": "Military Service Eras Served",
    "programs": [
      "Workforce"
    ],
    "datatype": "Text (single line)",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "Translated"
  },
  {
    "id": "7624",
    "label": "Discharge Type",
    "programs": [
      "Workforce"
    ],
    "datatype": "Dropdown",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "Translated"
  },
  {
    "id": "7625",
    "label": "Discharge Date",
    "programs": [
      "Workforce"
    ],
    "datatype": "Date",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "Translated"
  },
  {
    "id": "5418",
    "label": "Student Status",
    "programs": [
      "ATO"
    ],
    "datatype": "Dropdown",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "5420",
    "label": "Education Level",
    "programs": [
      "ATO",
      "GED"
    ],
    "datatype": "Dropdown",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "5811",
    "label": "Is this person working and/or in school?",
    "programs": [
      "ATO"
    ],
    "datatype": "Radio buttons (Yes/No)",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "9782",
    "label": "Do you attend school online or in-person?",
    "programs": [
      "ATO"
    ],
    "datatype": "Radio buttons",
    "basis": "Seen in video",
    "reviewStatus": "ADDED"
  },
  {
    "id": "7982",
    "label": "What High School did you attend/are currently atte",
    "programs": [
      "ATO"
    ],
    "datatype": "Text (single line)",
    "basis": "Seen in video",
    "reviewStatus": "ADDED"
  },
  {
    "id": "7983",
    "label": "What college did you attend/are currently attendin",
    "programs": [
      "ATO"
    ],
    "datatype": "Text (single line)",
    "basis": "Seen in video",
    "reviewStatus": "ADDED"
  },
  {
    "id": "9780",
    "label": "What Preschool, Elementary School, or Jr. High/Mid",
    "programs": [
      "ATO"
    ],
    "datatype": "Text (single line)",
    "basis": "Seen in video",
    "reviewStatus": "ADDED"
  },
  {
    "id": "7986",
    "label": "High School Expected Graduation Date",
    "programs": [
      "ATO"
    ],
    "datatype": "Date",
    "basis": "Seen in video",
    "reviewStatus": "ADDED"
  },
  {
    "id": "7984",
    "label": "Current/Future Major",
    "programs": [
      "ATO"
    ],
    "datatype": "Text (single line)",
    "basis": "Seen in video",
    "reviewStatus": "ADDED"
  },
  {
    "id": "7985",
    "label": "College Expected Graduation Date",
    "programs": [
      "ATO"
    ],
    "datatype": "Date",
    "basis": "Seen in video",
    "reviewStatus": "ADDED"
  },
  {
    "id": "7987",
    "label": "Study Abroad Location",
    "programs": [
      "ATO"
    ],
    "datatype": "Text (single line)",
    "basis": "Seen in video",
    "reviewStatus": "ADDED"
  },
  {
    "id": "9783",
    "label": "Class Schedule",
    "programs": [
      "ATO"
    ],
    "datatype": "Text (multi-line)",
    "basis": "Seen in video",
    "reviewStatus": "ADDED"
  },
  {
    "id": "9785",
    "label": "Parent(s)/Guardian(s) on File at School",
    "programs": [
      "ATO"
    ],
    "datatype": "Text (single line)",
    "basis": "Seen in video",
    "reviewStatus": "ADDED"
  },
  {
    "id": "9784",
    "label": "School Contact Phone Number",
    "programs": [
      "ATO"
    ],
    "datatype": "Phone (compound)",
    "basis": "Seen in video",
    "reviewStatus": "ADDED"
  },
  {
    "id": "9781",
    "label": "School Address",
    "programs": [
      "ATO"
    ],
    "datatype": "Address (compound)",
    "basis": "Seen in video",
    "reviewStatus": "ADDED"
  },
  {
    "id": "8346",
    "label": "Have you ever been homeless?",
    "programs": [],
    "datatype": "Radio buttons (Yes/No)",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "Deactivated"
  },
  {
    "id": "8347",
    "label": "How long were you homeless?",
    "programs": [],
    "datatype": "Radio buttons (Yes/No)",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "Deactivated"
  },
  {
    "id": "7652",
    "label": "Emergency Contact 1",
    "programs": [
      "CAP",
      "ATO",
      "Workforce",
      "GED",
      "Financial Wellness"
    ],
    "datatype": "Text (single line)",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "Translated"
  },
  {
    "id": "7655",
    "label": "Emergency Contact Name (1)",
    "programs": [
      "CAP",
      "ATO",
      "Workforce",
      "GED",
      "Financial Wellness"
    ],
    "datatype": "Name (compound)",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "7658",
    "label": "Phone (1)",
    "programs": [
      "CAP",
      "ATO",
      "Workforce",
      "GED",
      "Financial Wellness"
    ],
    "datatype": "Phone (compound)",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "7661",
    "label": "Relationship (1)",
    "programs": [
      "CAP",
      "ATO",
      "Workforce",
      "GED",
      "Financial Wellness"
    ],
    "datatype": "Dropdown",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "7653",
    "label": "Emergency Contact 2",
    "programs": [
      "CAP",
      "ATO",
      "Workforce",
      "GED",
      "Financial Wellness"
    ],
    "datatype": "Text (single line)",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "Translated"
  },
  {
    "id": "7656",
    "label": "Emergency Contact Name (2)",
    "programs": [
      "CAP",
      "ATO",
      "Workforce",
      "GED",
      "Financial Wellness"
    ],
    "datatype": "Name (compound)",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "7659",
    "label": "Phone (2)",
    "programs": [
      "CAP",
      "ATO",
      "Workforce",
      "GED",
      "Financial Wellness"
    ],
    "datatype": "Phone (compound)",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "7662",
    "label": "Relationship (2)",
    "programs": [
      "CAP",
      "ATO",
      "Workforce",
      "GED",
      "Financial Wellness"
    ],
    "datatype": "Dropdown",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "7654",
    "label": "Emergency Contact 3",
    "programs": [
      "CAP",
      "ATO",
      "Workforce",
      "GED",
      "Financial Wellness"
    ],
    "datatype": "Text (single line)",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "Translated"
  },
  {
    "id": "7657",
    "label": "Emergency Contact Name (3)",
    "programs": [
      "CAP",
      "ATO",
      "Workforce",
      "GED",
      "Financial Wellness"
    ],
    "datatype": "Name (compound)",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "7660",
    "label": "Phone (3)",
    "programs": [
      "CAP",
      "ATO",
      "Workforce",
      "GED",
      "Financial Wellness"
    ],
    "datatype": "Phone (compound)",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "7663",
    "label": "Relationship (3)",
    "programs": [
      "CAP",
      "ATO",
      "Workforce",
      "GED",
      "Financial Wellness"
    ],
    "datatype": "Dropdown",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "7191",
    "label": "Are you currently banked?",
    "programs": [
      "Financial Wellness"
    ],
    "datatype": "Radio buttons (Yes/No)",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "7192",
    "label": "Type of Banking Accounts",
    "programs": [
      "Financial Wellness"
    ],
    "datatype": "Checkbox group (multi-select)",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "7193",
    "label": "Where do you do banking?",
    "programs": [
      "Financial Wellness"
    ],
    "datatype": "Checkbox group (multi-select)",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "7630",
    "label": "Barriers",
    "programs": [
      "Workforce"
    ],
    "datatype": "Text (single line)",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "Translated"
  },
  {
    "id": "7631",
    "label": "Why is transportation a barrier?",
    "programs": [
      "Workforce"
    ],
    "datatype": "Radio buttons (Yes/No)",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "Translated"
  },
  {
    "id": "7632",
    "label": "DV/SV Barriers & Information",
    "programs": [
      "Workforce"
    ],
    "datatype": "Text (single line)",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "Label Only"
  },
  {
    "id": "7633",
    "label": "Addiction Barriers & Information",
    "programs": [
      "Workforce"
    ],
    "datatype": "Text (single line)",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "Label Only"
  },
  {
    "id": "7685",
    "label": "Are you currently experiencing/ever experienced a ",
    "programs": [
      "Workforce"
    ],
    "datatype": "Checkbox group (multi-select)",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "7635",
    "label": "Are you currently experiencing/ever experienced ad",
    "programs": [
      "Workforce"
    ],
    "datatype": "Radio buttons",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "7636",
    "label": "Type of Victimization",
    "programs": [
      "Workforce"
    ],
    "datatype": "Dropdown",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "Translated"
  },
  {
    "id": "7637",
    "label": "Type of Addiction",
    "programs": [
      "Workforce"
    ],
    "datatype": "Checkbox group (multi-select)",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "9765",
    "label": "Are you currently fleeing?",
    "programs": [
      "Workforce"
    ],
    "datatype": "Radio buttons (Yes/No)",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "ADDED"
  },
  {
    "id": "7638",
    "label": "Type of Substance Use",
    "programs": [
      "Workforce"
    ],
    "datatype": "Checkbox group (multi-select)",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "9764",
    "label": "When did the experience occur?",
    "programs": [
      "Workforce"
    ],
    "datatype": "Radio buttons (Yes/No)",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "ADDED"
  },
  {
    "id": "7640",
    "label": "Were you ever convicted of a felony?",
    "programs": [
      "Workforce"
    ],
    "datatype": "Radio buttons (Yes/No)",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "7641",
    "label": "Type of Convictions (to select multiple, hold CTRL",
    "programs": [
      "Workforce"
    ],
    "datatype": "Multi-select list",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "9766",
    "label": "Were you ever convicted of a misdemeanor?",
    "programs": [
      "Workforce"
    ],
    "datatype": "Radio buttons (Yes/No)",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "9767",
    "label": "Do you have any current/active warrants?",
    "programs": [
      "Workforce"
    ],
    "datatype": "Radio buttons",
    "basis": "Seen in video",
    "reviewStatus": "ADDED"
  },
  {
    "id": "9768",
    "label": "Do you have an order of protection against you or ",
    "programs": [
      "Workforce"
    ],
    "datatype": "Radio buttons (Yes/No)",
    "basis": "Seen in video",
    "reviewStatus": "ADDED"
  },
  {
    "id": "7686",
    "label": "Re-entry Client?",
    "programs": [
      "Workforce"
    ],
    "datatype": "Radio buttons (Yes/No)",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "7642",
    "label": "Date of Release",
    "programs": [
      "Workforce"
    ],
    "datatype": "Date",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "7643",
    "label": "Arizona Department of Corrections #",
    "programs": [
      "Workforce"
    ],
    "datatype": "Text (single line)",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "7758",
    "label": "Bureau of Prisons #",
    "programs": [
      "Workforce"
    ],
    "datatype": "Text (single line)",
    "basis": "Seen in video",
    "reviewStatus": "ADDED"
  },
  {
    "id": "7759",
    "label": "Maricopa County Sheriff's Office #",
    "programs": [
      "Workforce"
    ],
    "datatype": "Text (single line)",
    "basis": "Seen in video",
    "reviewStatus": "ADDED"
  },
  {
    "id": "7644",
    "label": "Are you currently on probation?",
    "programs": [
      "Workforce"
    ],
    "datatype": "Radio buttons (Yes/No)",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "7687",
    "label": "Lifetime Probation?",
    "programs": [
      "Workforce"
    ],
    "datatype": "Radio buttons (Yes/No)",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "7645",
    "label": "Probation End Date",
    "programs": [
      "Workforce"
    ],
    "datatype": "Date",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "7646",
    "label": "Probation Officer Name",
    "programs": [
      "Workforce"
    ],
    "datatype": "Name (compound)",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "7647",
    "label": "Probation Officer Phone Number",
    "programs": [
      "Workforce"
    ],
    "datatype": "Phone (compound)",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "7648",
    "label": "Are you currently on parole?",
    "programs": [
      "Workforce"
    ],
    "datatype": "Radio buttons (Yes/No)",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "7649",
    "label": "Parole End Date",
    "programs": [
      "Workforce"
    ],
    "datatype": "Date",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "7650",
    "label": "Parole Officer Name",
    "programs": [
      "Workforce"
    ],
    "datatype": "Name (compound)",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "7651",
    "label": "Parole Officer Phone Number",
    "programs": [
      "Workforce"
    ],
    "datatype": "Phone (compound)",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "7666",
    "label": "Experience and Training",
    "programs": [
      "Workforce"
    ],
    "datatype": "Checkbox group (multi-select)",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "7667",
    "label": "Job Preferences",
    "programs": [
      "Workforce"
    ],
    "datatype": "Checkbox group (multi-select)",
    "basis": "Seen in video",
    "reviewStatus": "Translated"
  },
  {
    "id": "7665",
    "label": "Holland Code",
    "programs": [
      "Workforce"
    ],
    "datatype": "Text (single line)",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "Translated"
  },
  {
    "id": "9770",
    "label": "Name on Driver's License",
    "programs": [],
    "datatype": "Text (single line)",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "ADDED"
  },
  {
    "id": "9771",
    "label": "License Expiration Date",
    "programs": [],
    "datatype": "Date",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "ADDED"
  },
  {
    "id": "9772",
    "label": "Insurance Company Name",
    "programs": [],
    "datatype": "Text (single line)",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "ADDED"
  },
  {
    "id": "9773",
    "label": "Insurance Expiration Date",
    "programs": [],
    "datatype": "Date",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "ADDED"
  },
  {
    "id": "9774",
    "label": "Car's Make",
    "programs": [],
    "datatype": "Text (single line)",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "ADDED"
  },
  {
    "id": "9776",
    "label": "Car's Year",
    "programs": [],
    "datatype": "Text (single line)",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "ADDED"
  },
  {
    "id": "9777",
    "label": "Car's Model",
    "programs": [],
    "datatype": "Text (single line)",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "ADDED"
  },
  {
    "id": "9775",
    "label": "Car's Color",
    "programs": [],
    "datatype": "Text (single line)",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "ADDED"
  },
  {
    "id": "9778",
    "label": "Is the car registration valid?",
    "programs": [],
    "datatype": "Radio buttons (Yes/No)",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "ADDED"
  },
  {
    "id": "9779",
    "label": "Were copies of all paperwork on the vehicle taken?",
    "programs": [],
    "datatype": "Radio buttons (Yes/No)",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "ADDED"
  },
  {
    "id": "5407",
    "label": "Modification Date",
    "programs": [
      "CAP",
      "ATO",
      "Workforce",
      "GED",
      "Financial Wellness"
    ],
    "datatype": "System field",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "Translated"
  },
  {
    "id": "5408",
    "label": "Modified By",
    "programs": [
      "CAP",
      "ATO",
      "Workforce",
      "GED",
      "Financial Wellness"
    ],
    "datatype": "System field",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "Translated"
  },
  {
    "id": "5409",
    "label": "Creation Date",
    "programs": [
      "CAP",
      "ATO",
      "Workforce",
      "GED",
      "Financial Wellness"
    ],
    "datatype": "System field",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "Translated"
  },
  {
    "id": "5410",
    "label": "Created By",
    "programs": [
      "CAP",
      "ATO",
      "Workforce",
      "GED",
      "Financial Wellness"
    ],
    "datatype": "System field",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "Translated"
  },
  {
    "id": "5411",
    "label": "Assigned Programs",
    "programs": [
      "CAP",
      "ATO",
      "Workforce",
      "GED",
      "Financial Wellness"
    ],
    "datatype": "System field",
    "basis": "Inferred from label and SQL type",
    "reviewStatus": "Translated"
  }
] as const
