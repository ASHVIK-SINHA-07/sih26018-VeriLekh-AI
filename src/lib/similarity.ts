/**
 * Name and place comparison for records read off paper.
 *
 * Exact string equality is the wrong test here. The same person's name reaches
 * us spelled several ways: an honorific dropped, a surname omitted, a matra
 * misread by the recogniser. Treating every difference as a different person
 * buries a reviewer in false conflicts; treating none as different lets a real
 * ownership dispute through. So differences are scored, and the score decides
 * whether it is the same name, a variant worth checking, or a genuine conflict.
 */

/**
 * Devanagari combining marks — vowel signs, virama, anusvara, nukta — plus the
 * zero-width joiners recognisers scatter through their output. Removing them
 * leaves the consonant skeleton, which survives the matra reordering OCR
 * introduces: मलिहाबाद and मलहिबाद both reduce to मलहबद.
 */
const COMBINING = /[ऀ-ःऺ-ॏ॑-ॗॢॣ‌‍]/g;

/** Words that carry no identifying information in an Indian land record. */
const HONORIFICS = new Set([
  "श्री", "श्रीमती", "कुमारी", "स्वर्गीय", "स्व", "पुत्र", "पुत्री", "पत्नी",
  "मु", "मो", "shri", "smt", "kumari", "late", "son", "of", "wife", "daughter",
]);

/** Lower-case, strip punctuation, drop honorifics, collapse whitespace. */
export function nameTokens(value: string | null | undefined): string[] {
  return (value ?? "")
    .toLowerCase()
    .replace(/[.,;:'"()\[\]/\\-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 0 && !HONORIFICS.has(token));
}

/** The consonant skeleton of a token, for matching across matra variation. */
export function skeleton(value: string): string {
  return value.replace(COMBINING, "");
}

/** Levenshtein edit distance, iterative with a single row of state. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,                                    // deletion
        current[j - 1] + 1,                                 // insertion
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),  // substitution
      );
    }
    previous = current;
  }
  return previous[b.length];
}

/** 1 for identical, 0 for nothing in common. */
function tokenSimilarity(a: string, b: string): number {
  const [x, y] = [skeleton(a), skeleton(b)];
  if (x === y) return 1;
  const longest = Math.max(x.length, y.length);
  if (longest === 0) return 1;
  return Math.max(0, 1 - editDistance(x, y) / longest);
}

export type NameVerdict = "same" | "variant" | "different";

export interface NameComparison {
  score: number;
  verdict: NameVerdict;
  /** True when one name is the other plus extra words — a dropped surname. */
  subset: boolean;
}

/** At or above this, two names are the same person. */
const SAME_THRESHOLD = 0.92;
/** Below this, they are different people and the record is in conflict. */
const DIFFERENT_THRESHOLD = 0.55;
/** A token pair this close counts as the same word. */
const TOKEN_MATCH = 0.8;

/**
 * Compare two owner names.
 *
 * Every token of the shorter name is matched against its best partner in the
 * longer one, so word order does not matter and an extra surname does not
 * destroy the score. A name that is wholly contained in the other — "सुनीता
 * देवी" against "सुनीता देवी मिश्रा" — is reported as a subset, which is a
 * dropped surname rather than a different person, and is worth a reviewer's
 * eye without being called a conflict.
 */
export function compareNames(
  a: string | null | undefined,
  b: string | null | undefined,
): NameComparison {
  const left = nameTokens(a);
  const right = nameTokens(b);

  if (left.length === 0 || right.length === 0) {
    return { score: 0, verdict: "different", subset: false };
  }

  const [shorter, longer] =
    left.length <= right.length ? [left, right] : [right, left];

  let matched = 0;
  const claimed = new Set<number>();

  for (const token of shorter) {
    let bestScore = 0;
    let bestIndex = -1;
    longer.forEach((candidate, index) => {
      if (claimed.has(index)) return;
      const score = tokenSimilarity(token, candidate);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });
    if (bestScore >= TOKEN_MATCH && bestIndex !== -1) {
      claimed.add(bestIndex);
      matched += bestScore;
    }
  }

  const subset = claimed.size === shorter.length && shorter.length > 0;

  // Score against the longer name, so extra words still cost something — an
  // omitted surname should not read as a perfect match.
  const score = matched / longer.length;

  const verdict: NameVerdict =
    score >= SAME_THRESHOLD
      ? "same"
      : score >= DIFFERENT_THRESHOLD || subset
        ? "variant"
        : "different";

  return { score: Number(score.toFixed(3)), verdict, subset };
}

/**
 * Are two place names the same place? Villages and tehsils are read off the
 * same faded paper as everything else, so a strict comparison would miss
 * duplicate parcels whose village name was read a character differently.
 */
export function samePlace(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const left = nameTokens(a).join(" ");
  const right = nameTokens(b).join(" ");
  if (!left || !right) return false;
  return tokenSimilarity(left, right) >= 0.85;
}
