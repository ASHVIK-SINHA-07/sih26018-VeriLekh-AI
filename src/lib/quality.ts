import {
  FIELD_LABELS,
  LOW_CONFIDENCE_THRESHOLD,
  type ConfidenceMap,
  type ExtractedFieldName,
  type ExtractedFields,
  type IssueKind,
  type ValidationIssue,
} from "@/types";

/**
 * The data quality score.
 *
 * Digitisation of land records is largely done — the Department of Land
 * Resources reports Records of Rights computerised in the mid-90s of a
 * percent. What is not done is *quality*: the records that exist carry area
 * mismatches, duplicated survey numbers, missing khata entries and ownership
 * that no longer matches the ground. A system that only emits text does not
 * help with that. A system that emits text *with a defensible score attached*
 * lets a supervising officer triage thousands of records without reading them.
 *
 * Three things decide the score, and the split matters:
 *
 *   Completeness  did we get the fields at all?
 *   Confidence    how sure was the reader of the characters?
 *   Consistency   does the record contradict what is already on file?
 *
 * They are kept separate because they fail for different reasons and are fixed
 * by different people. A blank field is a rescan; a low-confidence field is a
 * proofread; a duplicate parcel is an investigation.
 *
 * Every deduction is recorded with its reason, so the number is never a black
 * box — a reviewer can always see what cost the record its points, which is
 * the difference between a score they trust and a score they ignore.
 */

const WEIGHTS = { completeness: 30, confidence: 30, consistency: 40 } as const;

/**
 * How much the share of below-threshold fields discounts mean confidence.
 * At 0.5, a record with half its fields uncertain loses a quarter of its
 * confidence score on top of the lower mean those fields already produce.
 */
const UNCERTAIN_PENALTY = 0.5;

/**
 * What each kind of finding costs the consistency component, out of 100.
 *
 * Ordered by how much doubt it casts on the record as a whole. A duplicate
 * parcel means one of two records is wrong about who owns land — nothing else
 * on the page matters until that is settled. A plausibility violation is
 * usually a decimal point. Low confidence is *not* scored here: it is already
 * the confidence component, and counting it twice would punish a faded scan
 * for being faded.
 */
const PENALTY: Record<IssueKind, number> = {
  duplicate: 80,
  // Another government system holding a different value for this parcel is a
  // heavier finding than an inconsistency inside our own database: it means
  // the record and the rest of the state disagree, which is what land disputes
  // are made of. A source that has not been updated in years is softer — the
  // record may simply be ahead of it — but it still needs a person.
  sourceConflict: 50,
  sourceStale: 25,
  // A broken chain of title — land sold twice, sold by a dead man, or shared
  // out beyond the whole — means ownership itself is in doubt. That is the
  // heaviest finding after a duplicate parcel. A backdated entry or an unlisted
  // co-owner needs a person but may have an innocent explanation.
  chainDefect: 60,
  chainWarning: 20,
  ownerConflict: 40,
  ownerVariant: 15,
  missing: 20,
  range: 20,
  confidence: 0,
  learned: 0,
};

export type QualityBand = "HIGH" | "MEDIUM" | "LOW";

export interface QualityComponent {
  /** 0–100 for this component alone. */
  score: number;
  /** How much of the final score it can move. */
  weight: number;
  /** One line a person can read. */
  detail: string;
  /** The same line as a message code and values, for translation. */
  detailCode: "completeness" | "confidence" | "confidenceNone" | "consistency" | "consistencyNone";
  detailParams: Record<string, number>;
}

/** A deduction, structured so the interface can say it in any language. */
export type Deduction =
  | { kind: "missingFields"; fields: string[] }
  | { kind: "lowFields"; fields: string[] }
  | { kind: "issue"; issue: ValidationIssue };

export interface QualityScore {
  /** 0–100. Rounded — this is rendered, and CLAUDE.md forbids float artefacts. */
  score: number;
  band: QualityBand;
  components: {
    completeness: QualityComponent;
    confidence: QualityComponent;
    consistency: QualityComponent;
  };
  /** Everything that cost the record points, worst first. */
  deductions: string[];
  /** The same deductions, structured for translation. */
  deductionItems: Deduction[];
}

/** Fields that make up a usable Record of Rights entry. */
const SCORED_FIELDS: ExtractedFieldName[] = [
  "ownerName", "surveyNumber", "khasraNumber", "khataNumber", "plotArea",
  "village", "tehsil", "district", "landClassification",
];

/**
 * Band thresholds, set against the seeded corpus so the labels mean what they
 * say: a clean verified record lands HIGH, a faded scan with several uncertain
 * fields lands MEDIUM, and a duplicate parcel or an unreadable page lands LOW.
 */
const HIGH_BAND = 90;
const LOW_BAND = 70;

function band(score: number): QualityBand {
  if (score >= HIGH_BAND) return "HIGH";
  if (score >= LOW_BAND) return "MEDIUM";
  return "LOW";
}

export interface QualityInput {
  fields: ExtractedFields;
  confidence: ConfidenceMap;
  issues: ValidationIssue[];
}

export function scoreRecord({ fields, confidence, issues }: QualityInput): QualityScore {
  const deductions: string[] = [];
  const deductionItems: Deduction[] = [];

  /* ------------------------------------------------------- completeness */
  const present = SCORED_FIELDS.filter((f) => {
    const v = fields[f];
    return typeof v === "string" && v.trim().length > 0;
  });
  const completeness = Math.round((present.length / SCORED_FIELDS.length) * 100);
  const missing = SCORED_FIELDS.filter((f) => !present.includes(f));
  if (missing.length > 0) {
    deductions.push(
      `${missing.length} field${missing.length === 1 ? "" : "s"} not extracted: ` +
      missing.map((f) => FIELD_LABELS[f]).join(", "),
    );
    deductionItems.push({ kind: "missingFields", fields: missing });
  }

  /* --------------------------------------------------------- confidence */
  // Mean over the fields that were actually read. Scoring a blank field's
  // absent confidence would double-count what completeness already measured.
  const scores = present
    .map((f) => confidence[f])
    .filter((s): s is number => typeof s === "number");
  const meanConfidence = scores.length === 0
    ? 0
    : scores.reduce((a, b) => a + b, 0) / scores.length;

  const uncertain = present.filter((f) => {
    const s = confidence[f];
    return typeof s === "number" && s < LOW_CONFIDENCE_THRESHOLD;
  });

  // A plain mean is too forgiving: four uncertain fields among five confident
  // ones still averages respectably, and the record reads as healthier than it
  // is. Records are used field by field — an unusable khasra number is not
  // redeemed by a confident district — so the share of fields that fell below
  // the review threshold discounts the mean directly.
  const uncertainShare = present.length === 0 ? 0 : uncertain.length / present.length;
  const confidenceScore = Math.round(
    meanConfidence * (1 - UNCERTAIN_PENALTY * uncertainShare) * 100,
  );
  if (uncertain.length > 0) {
    deductions.push(
      `${uncertain.length} field${uncertain.length === 1 ? "" : "s"} read with low confidence: ` +
      uncertain.map((f) => FIELD_LABELS[f]).join(", "),
    );
    deductionItems.push({ kind: "lowFields", fields: uncertain });
  }

  /* -------------------------------------------------------- consistency */
  let consistency = 100;
  const counted = issues.filter((i) => i.kind && PENALTY[i.kind] > 0);
  for (const issue of counted) {
    consistency -= PENALTY[issue.kind as IssueKind];
  }
  consistency = Math.max(0, consistency);

  // Worst finding first — that is the one the reviewer should read.
  for (const issue of [...counted].sort(
    (a, b) => PENALTY[b.kind as IssueKind] - PENALTY[a.kind as IssueKind],
  )) {
    deductions.push(issue.issue);
    deductionItems.push({ kind: "issue", issue });
  }

  /* -------------------------------------------------------------- total */
  const total = Math.round(
    (completeness * WEIGHTS.completeness +
      confidenceScore * WEIGHTS.confidence +
      consistency * WEIGHTS.consistency) /
      (WEIGHTS.completeness + WEIGHTS.confidence + WEIGHTS.consistency),
  );

  return {
    score: total,
    band: band(total),
    components: {
      completeness: {
        score: completeness,
        weight: WEIGHTS.completeness,
        detail: `${present.length} of ${SCORED_FIELDS.length} fields extracted`,
        detailCode: "completeness",
        detailParams: { present: present.length, total: SCORED_FIELDS.length },
      },
      confidence: {
        score: confidenceScore,
        weight: WEIGHTS.confidence,
        detail: scores.length === 0
          ? "nothing was read"
          : `mean ${confidenceScore}% across the fields that were read`,
        detailCode: scores.length === 0 ? "confidenceNone" : "confidence",
        detailParams: { pct: confidenceScore },
      },
      consistency: {
        score: consistency,
        weight: WEIGHTS.consistency,
        detail: counted.length === 0
          ? "nothing on file contradicts this record"
          : `${counted.length} contradiction${counted.length === 1 ? "" : "s"} — with other records, other systems or the ownership history`,
        detailCode: counted.length === 0 ? "consistencyNone" : "consistency",
        detailParams: { count: counted.length },
      },
    },
    deductions,
    deductionItems,
  };
}
