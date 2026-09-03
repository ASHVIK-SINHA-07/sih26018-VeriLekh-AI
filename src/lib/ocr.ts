/**
 * The OCR seam — docs/02_Technical_Architecture.md.
 *
 * Nothing else in the application knows how OCR works. All access goes through
 * `runOcr`, which calls an external service over HTTP. The engine is
 * deliberately undecided: when the team picks one, they stand up a service
 * exposing `POST /extract` returning `{ rawText, language, blocks[] }`, point
 * OCR_SERVICE_URL at it, and change nothing else.
 *
 * Until then OCR_SERVICE_URL is "mock" and this returns canned Devanagari text
 * so the whole pipeline runs end to end. The mock is deterministic — the same
 * file always yields the same result — so a demo can be rehearsed and repeated.
 */

export interface OcrBlock {
  text: string;
  confidence: number;
}

export interface OcrResult {
  rawText: string;
  language: string;
  blocks: OcrBlock[];
}

const MOCK = "mock";

/** Reads the env var each call so tests can flip it without re-importing. */
function ocrServiceUrl(): string {
  return process.env.OCR_SERVICE_URL?.trim() || MOCK;
}

export function isMockOcr(): boolean {
  return ocrServiceUrl().toLowerCase() === MOCK;
}

/* -------------------------------------------------------------------------
 * Mock engine
 * ---------------------------------------------------------------------- */

interface MockRecord {
  district: string;
  tehsil: string;
  village: string;
  fasliYear: string;
  khataNumber: string;
  khasraNumber: string;
  surveyNumber: string;
  ownerName: string;
  plotArea: string;
  landClassification: string;
  /** Simulated page quality. Drives the per-block confidence scores. */
  quality: "clean" | "worn" | "faded";
}

/**
 * Canned pages. All values invented — docs/01_PRD.md forbids real records.
 * The set deliberately spans page qualities so an uploaded file can come back
 * clean, or with low-confidence fields that need human review.
 */
const MOCK_RECORDS: MockRecord[] = [
  {
    district: "वाराणसी", tehsil: "पिंडरा", village: "रामपुर खुर्द", fasliYear: "1431",
    khataNumber: "94", khasraNumber: "218/1", surveyNumber: "77",
    ownerName: "विनोद कुमार श्रीवास्तव", plotArea: "1.480",
    landClassification: "सिंचित", quality: "clean",
  },
  {
    district: "लखनऊ", tehsil: "मलिहाबाद", village: "भगवंतपुर", fasliYear: "1431",
    khataNumber: "163", khasraNumber: "45/2", surveyNumber: "112",
    ownerName: "मीना देवी", plotArea: "0.615",
    landClassification: "असिंचित", quality: "worn",
  },
  {
    district: "गोरखपुर", tehsil: "सहजनवा", village: "सलेमपुर", fasliYear: "1430",
    khataNumber: "51", khasraNumber: "130/4", surveyNumber: "88",
    ownerName: "श्यामलाल गुप्ता", plotArea: "2.250",
    landClassification: "बाग", quality: "faded",
  },
  {
    district: "प्रयागराज", tehsil: "सोरांव", village: "मुबारकपुर", fasliYear: "1431",
    khataNumber: "207", khasraNumber: "96", surveyNumber: "34",
    ownerName: "अब्दुल रहमान", plotArea: "0.340",
    landClassification: "आबादी", quality: "worn",
  },
];

/** Per-quality confidence for a field the engine found cleanly. */
const QUALITY_BASE: Record<MockRecord["quality"], number> = {
  clean: 0.95,
  worn: 0.86,
  // Above LOW_CONFIDENCE_THRESHOLD on purpose: even on a badly faded page the
  // *printed* headings still read cleanly. It is the handwritten fields that
  // fall below the line, via FRAGILE_FIELDS below. A profile that dropped
  // every field under the threshold would flag nine fields instead of the
  // three or four a reviewer actually needs to look at.
  faded: 0.82,
};

/**
 * Fields a worn or faded page tends to lose first: handwritten names and the
 * numerals, rather than the printed headings.
 */
const FRAGILE_FIELDS = ["ownerName", "khasraNumber", "plotArea", "landClassification"];

/** Stable hash so the same path always maps to the same canned page. */
function hashPath(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function mockOcr(imagePath: string): OcrResult {
  const hash = hashPath(imagePath);
  const record = MOCK_RECORDS[hash % MOCK_RECORDS.length];
  const base = QUALITY_BASE[record.quality];

  // Deterministic jitter so every line does not score identically.
  const jitter = (n: number) => ((hash >> (n % 16)) % 7) / 100;

  const lines: { text: string; field?: string }[] = [
    { text: "अधिकार अभिलेख — खतौनी" },
    { text: "राजस्व विभाग · उत्तर प्रदेश" },
    { text: `जिला: ${record.district}`, field: "district" },
    { text: `तहसील: ${record.tehsil}`, field: "tehsil" },
    { text: `ग्राम: ${record.village}`, field: "village" },
    { text: `फसली वर्ष: ${record.fasliYear}` },
    { text: `खाता संख्या: ${record.khataNumber}`, field: "khataNumber" },
    { text: `खसरा संख्या: ${record.khasraNumber}`, field: "khasraNumber" },
    { text: `सर्वे संख्या: ${record.surveyNumber}`, field: "surveyNumber" },
    { text: `स्वामी का नाम: ${record.ownerName}`, field: "ownerName" },
    { text: `क्षेत्रफल (हे.): ${record.plotArea}`, field: "plotArea" },
    { text: `भूमि वर्ग: ${record.landClassification}`, field: "landClassification" },
    { text: "प्रमाणित किया जाता है कि उपरोक्त प्रविष्टि अभिलेख के अनुसार है।" },
  ];

  const blocks: OcrBlock[] = lines.map((line, index) => {
    const fragile = line.field && FRAGILE_FIELDS.includes(line.field);
    // Printed headings survive a bad scan; handwriting does not.
    const penalty = fragile && record.quality !== "clean" ? 0.14 : 0;
    const confidence = Math.min(
      0.99,
      Math.max(0.3, base - penalty + jitter(index)),
    );
    return { text: line.text, confidence: Number(confidence.toFixed(2)) };
  });

  return {
    rawText: blocks.map((block) => block.text).join("\n"),
    language: "hi",
    blocks,
  };
}

/* -------------------------------------------------------------------------
 * Public interface
 * ---------------------------------------------------------------------- */

/**
 * Runs OCR over the image at `imagePath`.
 *
 * With OCR_SERVICE_URL unset or "mock", returns canned data. Otherwise POSTs
 * `{ imagePath }` to the configured service and expects an OcrResult back.
 */
export async function runOcr(imagePath: string): Promise<OcrResult> {
  if (isMockOcr()) {
    return mockOcr(imagePath);
  }

  const endpoint = new URL("/extract", ocrServiceUrl()).toString();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imagePath }),
  });

  if (!response.ok) {
    throw new Error(
      `OCR service responded ${response.status} ${response.statusText}`,
    );
  }

  const result = (await response.json()) as Partial<OcrResult>;
  if (typeof result.rawText !== "string" || !Array.isArray(result.blocks)) {
    throw new Error("OCR service returned a malformed OcrResult");
  }

  return {
    rawText: result.rawText,
    language: result.language ?? "unknown",
    blocks: result.blocks,
  };
}
