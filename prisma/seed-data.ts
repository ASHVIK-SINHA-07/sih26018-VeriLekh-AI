/**
 * Synthetic land-record fixtures — docs/01_PRD.md data-privacy rule.
 *
 * EVERY value below is invented. Owner names are fabricated, khasra/khata/
 * survey numbers are made up, and no combination corresponds to a real parcel.
 * District and tehsil names are real places (they are not personal data);
 * village names are the generic sort found across north India.
 *
 * Text fields are stored in Devanagari because the source scan is in
 * Devanagari — the verification screen puts scan and fields side by side, and
 * that comparison is meaningless if the two are in different scripts. UI
 * labels stay English sentence case (CLAUDE.md D4).
 *
 * Four problems are planted here on purpose; the demo depends on the
 * validation engine catching them on screen (docs/01_PRD.md success criteria).
 */

export type SeedStatus =
  | "UPLOADED"
  | "PROCESSING"
  | "VERIFIED"
  | "FLAGGED"
  | "REJECTED";

export type SeedValidationStatus = "PASS" | "FLAGGED" | "DUPLICATE";

export interface SeedFields {
  ownerName: string | null;
  surveyNumber: string | null;
  khasraNumber: string | null;
  khataNumber: string | null;
  plotArea: string | null;
  village: string | null;
  tehsil: string | null;
  district: string | null;
  landClassification: string | null;
}

export interface SeedDoc {
  /** Stable key used to cross-reference documents (e.g. duplicateOf). */
  key: string;
  filename: string;
  status: SeedStatus;
  /** Which seeded account uploaded it. */
  uploadedBy: "ADMIN" | "VERIFIER";
  /** Days before now, so the dashboard trend chart has a real shape. */
  daysAgo: number;
  fasliYear: string;
  fields: SeedFields | null;
  confidence: Record<string, number>;
  ulpin: string | null;
  validation: {
    status: SeedValidationStatus;
    issues: { field: string; issue: string }[];
    duplicateOfKey?: string;
  } | null;
  /** Audit entries, oldest first. Every document has at least an UPLOAD. */
  audit: { action: "UPLOAD" | "APPROVE" | "REJECT" | "EDIT_FIELD"; daysAgo: number; by: "ADMIN" | "VERIFIER" }[];
  /** What this row demonstrates — for whoever runs the demo. */
  note?: string;
}

const HIGH = {
  ownerName: 0.96, surveyNumber: 0.94, khasraNumber: 0.95, khataNumber: 0.93,
  plotArea: 0.91, village: 0.97, tehsil: 0.96, district: 0.98,
  landClassification: 0.92,
};

export const SEED_DOCS: SeedDoc[] = [
  /* ---------------------------------------------------------------- verified */
  {
    key: "varanasi-0412",
    filename: "khatauni-varanasi-0412.svg",
    status: "VERIFIED",
    uploadedBy: "VERIFIER",
    daysAgo: 13,
    fasliYear: "1431",
    fields: {
      ownerName: "राजेश कुमार वर्मा", surveyNumber: "96", khasraNumber: "142/3",
      khataNumber: "87", plotArea: "1.245", village: "रामपुर खुर्द",
      tehsil: "पिंडरा", district: "वाराणसी", landClassification: "सिंचित",
    },
    confidence: HIGH,
    ulpin: "UP62B4F19C83A7",
    validation: { status: "PASS", issues: [] },
    audit: [
      { action: "UPLOAD", daysAgo: 13, by: "VERIFIER" },
      { action: "APPROVE", daysAgo: 13, by: "VERIFIER" },
    ],
    note: "Original of the planted duplicate pair (see varanasi-0733).",
  },
  {
    key: "lucknow-0219",
    filename: "khatauni-lucknow-0219.svg",
    status: "VERIFIED",
    uploadedBy: "VERIFIER",
    daysAgo: 12,
    fasliYear: "1431",
    fields: {
      ownerName: "सुनीता देवी मिश्रा", surveyNumber: "41", khasraNumber: "58/1",
      khataNumber: "214", plotArea: "0.680", village: "भगवंतपुर",
      tehsil: "मलिहाबाद", district: "लखनऊ", landClassification: "असिंचित",
    },
    confidence: HIGH,
    ulpin: "UP1D77A0C4E9B2",
    validation: { status: "PASS", issues: [] },
    audit: [
      { action: "UPLOAD", daysAgo: 12, by: "VERIFIER" },
      { action: "APPROVE", daysAgo: 12, by: "ADMIN" },
    ],
    note: "Owner of record for khata 214 — the planted mismatch contradicts this.",
  },
  {
    key: "gorakhpur-0102",
    filename: "khatauni-gorakhpur-0102.svg",
    status: "VERIFIED", uploadedBy: "VERIFIER", daysAgo: 11, fasliYear: "1431",
    fields: {
      ownerName: "कमला प्रसाद यादव", surveyNumber: "203", khasraNumber: "77/2",
      khataNumber: "45", plotArea: "2.100", village: "सलेमपुर",
      tehsil: "सहजनवा", district: "गोरखपुर", landClassification: "सिंचित",
    },
    confidence: HIGH, ulpin: "UP9E31C6B27FA4",
    validation: { status: "PASS", issues: [] },
    audit: [
      { action: "UPLOAD", daysAgo: 11, by: "VERIFIER" },
      { action: "APPROVE", daysAgo: 10, by: "VERIFIER" },
    ],
  },
  {
    key: "prayagraj-0044",
    filename: "khatauni-prayagraj-0044.svg",
    status: "VERIFIED", uploadedBy: "ADMIN", daysAgo: 9, fasliYear: "1430",
    fields: {
      ownerName: "फातिमा बेगम", surveyNumber: "118", khasraNumber: "310/1",
      khataNumber: "162", plotArea: "0.405", village: "मुबारकपुर",
      tehsil: "सोरांव", district: "प्रयागराज", landClassification: "बाग",
    },
    confidence: { ...HIGH, plotArea: 0.87 }, ulpin: "UP4A08D5312EC6",
    validation: { status: "PASS", issues: [] },
    audit: [
      { action: "UPLOAD", daysAgo: 9, by: "ADMIN" },
      { action: "APPROVE", daysAgo: 9, by: "ADMIN" },
    ],
  },
  {
    key: "kanpur-0198",
    filename: "khatauni-kanpur-0198.svg",
    status: "VERIFIED", uploadedBy: "VERIFIER", daysAgo: 7, fasliYear: "1431",
    fields: {
      ownerName: "राम नरेश तिवारी", surveyNumber: "64", khasraNumber: "29",
      khataNumber: "301", plotArea: "1.870", village: "टिकरी",
      tehsil: "बिल्हौर", district: "कानपुर नगर", landClassification: "सिंचित",
    },
    confidence: HIGH, ulpin: "UPB57E2F98D410",
    validation: { status: "PASS", issues: [] },
    audit: [
      { action: "UPLOAD", daysAgo: 7, by: "VERIFIER" },
      { action: "EDIT_FIELD", daysAgo: 7, by: "VERIFIER" },
      { action: "APPROVE", daysAgo: 7, by: "VERIFIER" },
    ],
    note: "Has an EDIT_FIELD entry — useful for showing the audit trail (T10).",
  },
  {
    key: "lucknow-0271",
    filename: "register-lucknow-0271.svg",
    status: "VERIFIED", uploadedBy: "VERIFIER", daysAgo: 5, fasliYear: "1431",
    fields: {
      ownerName: "दिनेश चंद्र गुप्ता", surveyNumber: "88", khasraNumber: "104/6",
      khataNumber: "76", plotArea: "0.925", village: "नौगवां",
      tehsil: "सदर", district: "लखनऊ", landClassification: "आबादी",
    },
    confidence: HIGH, ulpin: "UP3C6091AB7D5F",
    validation: { status: "PASS", issues: [] },
    audit: [
      { action: "UPLOAD", daysAgo: 5, by: "VERIFIER" },
      { action: "APPROVE", daysAgo: 4, by: "ADMIN" },
    ],
  },
  {
    key: "varanasi-0520",
    filename: "khatauni-varanasi-0520.svg",
    status: "VERIFIED", uploadedBy: "ADMIN", daysAgo: 4, fasliYear: "1431",
    fields: {
      ownerName: "शांति देवी", surveyNumber: "150", khasraNumber: "212",
      khataNumber: "119", plotArea: "3.400", village: "देवरीखास",
      tehsil: "पिंडरा", district: "वाराणसी", landClassification: "असिंचित",
    },
    confidence: HIGH, ulpin: "UP70FD4E28C193",
    validation: { status: "PASS", issues: [] },
    audit: [
      { action: "UPLOAD", daysAgo: 4, by: "ADMIN" },
      { action: "APPROVE", daysAgo: 3, by: "ADMIN" },
    ],
  },
  {
    key: "gorakhpur-0233",
    filename: "khatauni-gorakhpur-0233.svg",
    status: "VERIFIED", uploadedBy: "VERIFIER", daysAgo: 2, fasliYear: "1431",
    fields: {
      ownerName: "अनिल कुमार सिंह", surveyNumber: "37", khasraNumber: "91/4",
      khataNumber: "58", plotArea: "1.010", village: "चांदपुर",
      tehsil: "सहजनवा", district: "गोरखपुर", landClassification: "सिंचित",
    },
    confidence: HIGH, ulpin: "UP26AC8B03F5E7",
    validation: { status: "PASS", issues: [] },
    audit: [
      { action: "UPLOAD", daysAgo: 2, by: "VERIFIER" },
      { action: "APPROVE", daysAgo: 2, by: "VERIFIER" },
    ],
  },

  /* ------------------------------------------- flagged: the planted problems */
  {
    key: "varanasi-0733",
    filename: "khatauni-varanasi-0733.svg",
    status: "FLAGGED", uploadedBy: "VERIFIER", daysAgo: 3, fasliYear: "1431",
    fields: {
      ownerName: "राजेश कुमार वर्मा", surveyNumber: "96", khasraNumber: "142/3",
      khataNumber: "87", plotArea: "1.245", village: "रामपुर खुर्द",
      tehsil: "पिंडरा", district: "वाराणसी", landClassification: "सिंचित",
    },
    confidence: { ...HIGH, khasraNumber: 0.89 },
    ulpin: null,
    validation: {
      status: "DUPLICATE",
      duplicateOfKey: "varanasi-0412",
      issues: [
        { field: "khasraNumber", issue: "Duplicate parcel — khasra 142/3 in रामपुर खुर्द is already recorded under ULPIN UP62B4F19C83A7" },
      ],
    },
    audit: [{ action: "UPLOAD", daysAgo: 3, by: "VERIFIER" }],
    note: "PLANTED #1 — duplicate parcel. Best single record to demo validation live.",
  },
  {
    key: "lucknow-0388",
    filename: "khatauni-lucknow-0388.svg",
    status: "FLAGGED", uploadedBy: "VERIFIER", daysAgo: 3, fasliYear: "1431",
    fields: {
      ownerName: "सुनीता देवी", surveyNumber: "41", khasraNumber: "58/1",
      khataNumber: "214", plotArea: "0.680", village: "भगवंतपुर",
      tehsil: "मलिहाबाद", district: "लखनऊ", landClassification: "असिंचित",
    },
    confidence: { ...HIGH, ownerName: 0.64 },
    ulpin: null,
    validation: {
      status: "FLAGGED",
      issues: [
        { field: "ownerName", issue: "Owner name conflicts with the existing record for khata 214 (सुनीता देवी मिश्रा)" },
        { field: "ownerName", issue: "Low confidence — 64%" },
      ],
    },
    audit: [{ action: "UPLOAD", daysAgo: 3, by: "VERIFIER" }],
    note: "PLANTED #2 — mismatched owner. Correct it to सुनीता देवी मिश्रा and approve.",
  },
  {
    key: "gorakhpur-0158",
    filename: "khatauni-gorakhpur-0158.svg",
    status: "FLAGGED", uploadedBy: "VERIFIER", daysAgo: 2, fasliYear: "1431",
    fields: {
      ownerName: "गीता शर्मा", surveyNumber: "129", khasraNumber: "63/2",
      khataNumber: null, plotArea: "0.550", village: "सलेमपुर",
      tehsil: "सहजनवा", district: "गोरखपुर", landClassification: "सिंचित",
    },
    confidence: { ...HIGH, ownerName: 0.81 },
    ulpin: null,
    validation: {
      status: "FLAGGED",
      issues: [{ field: "khataNumber", issue: "Khata number is missing" }],
    },
    audit: [{ action: "UPLOAD", daysAgo: 2, by: "VERIFIER" }],
    note: "PLANTED #3 — missing required field.",
  },
  {
    key: "prayagraj-0087",
    filename: "register-prayagraj-0087.svg",
    status: "FLAGGED", uploadedBy: "VERIFIER", daysAgo: 1, fasliYear: "1430",
    fields: {
      ownerName: "मोहम्मद इरफान अंसारी", surveyNumber: "72", khasraNumber: "188/5",
      khataNumber: "93", plotArea: "0.760", village: "मुबारकपुर",
      tehsil: "सोरांव", district: "प्रयागराज", landClassification: "बंजर",
    },
    confidence: {
      ownerName: 0.58, surveyNumber: 0.79, khasraNumber: 0.61, khataNumber: 0.83,
      plotArea: 0.66, village: 0.88, tehsil: 0.9, district: 0.94,
      landClassification: 0.71,
    },
    ulpin: null,
    validation: {
      status: "FLAGGED",
      issues: [
        { field: "ownerName", issue: "Low confidence — 58%" },
        { field: "khasraNumber", issue: "Low confidence — 61%" },
        { field: "plotArea", issue: "Low confidence — 66%" },
        { field: "landClassification", issue: "Low confidence — 71%" },
      ],
    },
    audit: [{ action: "UPLOAD", daysAgo: 1, by: "VERIFIER" }],
    note: "PLANTED #4 — faded scan, four low-confidence fields in amber.",
  },

  /* ------------------------------------------------- flagged: ordinary cases */
  {
    key: "kanpur-0455",
    filename: "khatauni-kanpur-0455.svg",
    status: "FLAGGED", uploadedBy: "VERIFIER", daysAgo: 1, fasliYear: "1431",
    fields: {
      ownerName: "सावित्री देवी", surveyNumber: "55", khasraNumber: "147",
      khataNumber: "228", plotArea: "1.320", village: "टिकरी",
      tehsil: "बिल्हौर", district: "कानपुर नगर", landClassification: "सिंचित",
    },
    confidence: { ...HIGH, khataNumber: 0.68, plotArea: 0.73 },
    ulpin: null,
    validation: {
      status: "FLAGGED",
      issues: [
        { field: "khataNumber", issue: "Low confidence — 68%" },
        { field: "plotArea", issue: "Low confidence — 73%" },
      ],
    },
    audit: [{ action: "UPLOAD", daysAgo: 1, by: "VERIFIER" }],
  },
  {
    key: "varanasi-0611",
    filename: "register-varanasi-0611.svg",
    status: "FLAGGED", uploadedBy: "ADMIN", daysAgo: 0, fasliYear: "1431",
    fields: {
      ownerName: "हरीश चंद्र पाल", surveyNumber: "101", khasraNumber: "256/2",
      khataNumber: "140", plotArea: "0.290", village: "देवरीखास",
      tehsil: "पिंडरा", district: "वाराणसी", landClassification: "आबादी",
    },
    confidence: { ...HIGH, surveyNumber: 0.7, landClassification: 0.74 },
    ulpin: null,
    validation: {
      status: "FLAGGED",
      issues: [
        { field: "surveyNumber", issue: "Low confidence — 70%" },
        { field: "landClassification", issue: "Low confidence — 74%" },
      ],
    },
    audit: [{ action: "UPLOAD", daysAgo: 0, by: "ADMIN" }],
  },

  /* ------------------------------------------------------ rejected / in flight */
  {
    key: "gorakhpur-0176",
    filename: "register-gorakhpur-0176.svg",
    status: "REJECTED", uploadedBy: "VERIFIER", daysAgo: 6, fasliYear: "1429",
    fields: {
      ownerName: "राम नरेश तिवारी", surveyNumber: "19", khasraNumber: "8",
      khataNumber: "12", plotArea: "0.115", village: "चांदपुर",
      tehsil: "सहजनवा", district: "गोरखपुर", landClassification: "बंजर",
    },
    confidence: {
      ownerName: 0.41, surveyNumber: 0.38, khasraNumber: 0.44, khataNumber: 0.5,
      plotArea: 0.36, village: 0.62, tehsil: 0.71, district: 0.8,
      landClassification: 0.4,
    },
    ulpin: null,
    validation: {
      status: "FLAGGED",
      issues: [{ field: "ownerName", issue: "Scan quality too poor to extract reliably" }],
    },
    audit: [
      { action: "UPLOAD", daysAgo: 6, by: "VERIFIER" },
      { action: "REJECT", daysAgo: 6, by: "ADMIN" },
    ],
    note: "Rejected — page too damaged. Shows the REJECTED terminal state (D1).",
  },
  {
    key: "kanpur-0503",
    filename: "khatauni-kanpur-0503.svg",
    status: "PROCESSING", uploadedBy: "VERIFIER", daysAgo: 0, fasliYear: "1431",
    fields: null, confidence: {}, ulpin: null, validation: null,
    audit: [{ action: "UPLOAD", daysAgo: 0, by: "VERIFIER" }],
  },
  {
    key: "batch-0891",
    filename: "scan-batch-0891.svg",
    status: "UPLOADED", uploadedBy: "VERIFIER", daysAgo: 0, fasliYear: "1431",
    fields: null, confidence: {}, ulpin: null, validation: null,
    audit: [{ action: "UPLOAD", daysAgo: 0, by: "VERIFIER" }],
  },
  {
    key: "batch-0892",
    filename: "scan-batch-0892.svg",
    status: "UPLOADED", uploadedBy: "VERIFIER", daysAgo: 0, fasliYear: "1431",
    fields: null, confidence: {}, ulpin: null, validation: null,
    audit: [{ action: "UPLOAD", daysAgo: 0, by: "VERIFIER" }],
  },
];
