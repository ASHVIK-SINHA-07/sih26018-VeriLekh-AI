import { compareNames } from "@/lib/similarity";
import {
  ONE, ZERO, add, compare, format, isZero, parseShare, sub,
  type Fraction,
} from "@/lib/fraction";

/**
 * Chain of title.
 *
 * The khatauni says who owns a parcel now. The mutation register says how they
 * came to own it. This replays that register in the order events happened and
 * keeps a running account of who holds what share — which is the only way to
 * see the defects that no single document shows:
 *
 *   · a seller who did not hold the land when they sold it (chain break)
 *   · the same land sold twice to different buyers (double sale)
 *   · a sale by someone whose interest had already passed on their death
 *   · an inheritance that hands out more than the deceased held
 *   · an entry dated before transactions that were registered ahead of it
 *     (backdating)
 *   · a current holder in the chain who is not the owner the record names
 *     (a transfer that was never mutated — the commonest real defect)
 *
 * Pure: the mutations and the record's owner are passed in, nothing is
 * queried, so the whole engine is testable in isolation (CLAUDE.md D18).
 */

export type MutationKind =
  | "ORIGINAL" | "SALE" | "INHERITANCE" | "GIFT" | "PARTITION" | "DECREE";

export const MUTATION_LABELS: Record<MutationKind, string> = {
  ORIGINAL: "Original entry",
  SALE: "Sale",
  INHERITANCE: "Inheritance",
  GIFT: "Gift",
  PARTITION: "Partition",
  DECREE: "Court decree",
};

export interface MutationRow {
  id: string;
  seq: number;
  mutationNumber: string | null;
  type: MutationKind;
  fromOwner: string | null;
  toOwner: string;
  share: string;
  effectiveDate: Date;
  recordedAt: Date;
  supersedesId: string | null;
  /** The scan this entry was read from, when it came through the pipeline. */
  sourceDocumentId?: string | null;
}

export type FindingKind =
  | "chainBreak"          // transferor held nothing at the time
  | "doubleSale"          // transferor had already transferred it away
  | "deceasedTransferor"  // transferor's interest had passed on death
  | "overTransfer"        // transferor held less than they transferred
  | "sharesExceedWhole"   // holdings add up to more than the parcel
  | "undistributed"       // an inheritance left part of the holding unassigned
  | "backdated"           // entered after later transactions, dated before them
  | "futureDated"         // effective date is in the future
  | "unreadableShare"     // the share could not be parsed
  | "duplicateNumber"     // two entries carry the same mutation number
  | "unrecordedTransfer"  // chain's holder is not the record's owner
  | "unlistedCoOwners"    // chain has co-owners the record does not name
  | "missingTransferor"   // a transfer with nobody transferring
  | "titleNotTraced";     // digitised history begins mid-chain

export type Severity = "critical" | "warning";

const SEVERITY: Record<FindingKind, Severity> = {
  chainBreak: "critical",
  doubleSale: "critical",
  deceasedTransferor: "critical",
  overTransfer: "critical",
  sharesExceedWhole: "critical",
  futureDated: "critical",
  missingTransferor: "critical",
  unrecordedTransfer: "critical",
  backdated: "warning",
  undistributed: "warning",
  unreadableShare: "warning",
  duplicateNumber: "warning",
  unlistedCoOwners: "warning",
  titleNotTraced: "warning",
};

export interface ChainFinding {
  kind: FindingKind;
  severity: Severity;
  /** The register entry it concerns; absent for findings about the chain as a whole. */
  seq?: number;
  message: string;
}

export interface Holding {
  owner: string;
  share: string;
  since: Date;
}

export interface ChainStep {
  mutation: MutationRow;
  /** Who held what immediately after this entry was applied. */
  holdersAfter: Holding[];
  /** False when a defect stopped the entry being applied to the holdings. */
  applied: boolean;
}

export interface ChainAnalysis {
  steps: ChainStep[];
  /** Entries replaced by a correction — shown struck through, never deleted. */
  superseded: MutationRow[];
  findings: ChainFinding[];
  currentHolders: Holding[];
  span: { from: Date; to: Date; years: number } | null;
  status: "CLEAN" | "DEFECTS" | "EMPTY";
}

/**
 * The rows that currently stand. A row named by another row's `supersedesId`
 * has been corrected; it stays in the register as history but is not replayed.
 */
export function currentMutations(rows: MutationRow[]): {
  current: MutationRow[];
  superseded: MutationRow[];
} {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const replaced = new Set(rows.map((r) => r.supersedesId).filter(Boolean) as string[]);

  // A correction restates the entry it replaces; it is not a new event in the
  // register. So it takes that entry's position — otherwise every correction,
  // being entered later but dated earlier, would read as backdating. It keeps
  // its own recordedAt, which is how the history of the correction is shown.
  const positionOf = (r: MutationRow): number => {
    let seq = r.seq;
    let cursor = r.supersedesId ? byId.get(r.supersedesId) : undefined;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor.id)) {
      seen.add(cursor.id);
      seq = cursor.seq;
      cursor = cursor.supersedesId ? byId.get(cursor.supersedesId) : undefined;
    }
    return seq;
  };

  return {
    current: rows.filter((r) => !replaced.has(r.id)).map((r) => ({ ...r, seq: positionOf(r) })),
    superseded: rows.filter((r) => replaced.has(r.id)),
  };
}

/** Same person, by the same rule the rest of the system uses for owner names. */
function samePerson(a: string, b: string): boolean {
  return compareNames(a, b).verdict === "same";
}

const DAY = 24 * 60 * 60 * 1000;

// Same format as the timeline beside the findings, so a reviewer can match a
// finding to its entry by eye. UTC, because register dates are calendar dates.
const LABEL = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
function dateLabel(d: Date): string {
  return LABEL.format(d);
}

export interface ChainInput {
  mutations: MutationRow[];
  /** The owner the digitised record names, to compare the chain's head against. */
  recordOwner?: string | null;
  /** Injected so tests are not time-dependent. */
  now?: Date;
}

export function analyseChain({ mutations, recordOwner, now = new Date() }: ChainInput): ChainAnalysis {
  const { current, superseded } = currentMutations(mutations);

  if (current.length === 0) {
    return { steps: [], superseded, findings: [], currentHolders: [], span: null, status: "EMPTY" };
  }

  const findings: ChainFinding[] = [];
  const flag = (kind: FindingKind, message: string, seq?: number) =>
    findings.push({ kind, severity: SEVERITY[kind], seq, message });

  /* ------------------------------------------- register-order checks ---- */
  // Backdating: an entry registered after another, but claiming an earlier
  // date, rewrites history that was already on the record. Checked in the
  // order entries were *made*, which is what seq records.
  const bySeq = [...current].sort((a, b) => a.seq - b.seq);
  let latestSoFar: MutationRow | null = null;
  for (const m of bySeq) {
    if (latestSoFar && m.effectiveDate.getTime() < latestSoFar.effectiveDate.getTime()) {
      flag(
        "backdated",
        `Entry ${m.seq} is dated ${dateLabel(m.effectiveDate)} but was entered after entry ` +
          `${latestSoFar.seq}, dated ${dateLabel(latestSoFar.effectiveDate)} — it rewrites history already on record`,
        m.seq,
      );
    }
    if (!latestSoFar || m.effectiveDate > latestSoFar.effectiveDate) latestSoFar = m;
    if (m.effectiveDate.getTime() > now.getTime() + DAY) {
      flag("futureDated", `Entry ${m.seq} is dated ${dateLabel(m.effectiveDate)}, which has not happened yet`, m.seq);
    }
  }

  const seenNumbers = new Map<string, number>();
  for (const m of bySeq) {
    if (!m.mutationNumber) continue;
    const prior = seenNumbers.get(m.mutationNumber);
    if (prior !== undefined) {
      flag("duplicateNumber", `Mutation number ${m.mutationNumber} appears on entries ${prior} and ${m.seq}`, m.seq);
    } else {
      seenNumbers.set(m.mutationNumber, m.seq);
    }
  }

  /* ------------------------------------------------------ the replay ---- */
  // Events are replayed in the order they happened, not the order entered.
  // Ties keep register order, so heirs of one inheritance stay together.
  const byTime = [...current].sort(
    (a, b) => a.effectiveDate.getTime() - b.effectiveDate.getTime() || a.seq - b.seq,
  );

  const holders: { owner: string; share: Fraction; since: Date }[] = [];
  /** People whose whole holding passed to heirs — they cannot transfer again. */
  const deceased = new Map<string, Date>();
  /** People who transferred their entire holding away, with when and to whom. */
  const exited = new Map<string, { date: Date; to: string }>();

  const find = (name: string) => holders.find((h) => samePerson(h.owner, name));
  const credit = (name: string, share: Fraction, since: Date) => {
    const h = find(name);
    if (h) h.share = add(h.share, share);
    else holders.push({ owner: name, share, since });
  };
  const snapshot = (): Holding[] =>
    holders.filter((h) => !isZero(h.share)).map((h) => ({ owner: h.owner, share: format(h.share), since: h.since }));

  const steps: ChainStep[] = [];

  // Registers are digitised from some point onward, not from the parcel's
  // creation. When the earliest entry on record is a transfer rather than an
  // original entry, the transferor's earlier title simply is not on file —
  // which is not the same as their having none. They are presumed to have
  // held what they transferred, and the chain says so as a warning: the
  // history needs its earlier documents, but nothing here contradicts it.
  const earliest = byTime[0];
  if (earliest && earliest.type !== "ORIGINAL" && earliest.fromOwner) {
    const opening = earliest.type === "INHERITANCE"
      ? byTime
          .filter((m) => m.type === "INHERITANCE" && m.fromOwner === earliest.fromOwner &&
            m.effectiveDate.getTime() === earliest.effectiveDate.getTime())
          .map((m) => parseShare(m.share) ?? ZERO)
          .reduce(add, ZERO)
      : parseShare(earliest.share);
    if (opening && !isZero(opening)) {
      holders.push({ owner: earliest.fromOwner, share: opening, since: earliest.effectiveDate });
      flag(
        "titleNotTraced",
        `The digitised history begins with this ${MUTATION_LABELS[earliest.type].toLowerCase()} from ${earliest.fromOwner} — ` +
          `how they acquired the parcel is not on record, so their title is presumed, not traced`,
        earliest.seq,
      );
    }
  }

  // An inheritance is recorded as one entry per heir, all naming the same
  // deceased on the same day. They are settled together so the first heir's
  // entry does not remove the deceased before the others are credited.
  const inheritanceGroups = new Map<string, MutationRow[]>();
  for (const m of byTime) {
    if (m.type !== "INHERITANCE" || !m.fromOwner) continue;
    const key = `${m.fromOwner}\u0000${m.effectiveDate.toISOString()}`;
    inheritanceGroups.set(key, [...(inheritanceGroups.get(key) ?? []), m]);
  }
  const settledGroups = new Set<string>();

  for (const m of byTime) {
    const share = parseShare(m.share);
    if (!share) {
      flag("unreadableShare", `Entry ${m.seq} records a share of "${m.share}", which is not a fraction of the parcel`, m.seq);
      steps.push({ mutation: m, holdersAfter: snapshot(), applied: false });
      continue;
    }

    /* ---- the first entry on record establishes the holding ---------- */
    if (m.type === "ORIGINAL") {
      credit(m.toOwner, share, m.effectiveDate);
      steps.push({ mutation: m, holdersAfter: snapshot(), applied: true });
      continue;
    }

    if (!m.fromOwner) {
      flag("missingTransferor", `Entry ${m.seq} is a ${MUTATION_LABELS[m.type].toLowerCase()} with no transferor named`, m.seq);
      steps.push({ mutation: m, holdersAfter: snapshot(), applied: false });
      continue;
    }

    // The remaining heirs of an inheritance already settled with the first
    // heir's entry. The deceased has left the holdings by now, so this must be
    // checked before the holder lookup, or every second heir would read as a
    // transfer by someone who had died.
    if (m.type === "INHERITANCE") {
      const key = `${m.fromOwner}\u0000${m.effectiveDate.toISOString()}`;
      if (settledGroups.has(key)) {
        steps.push({ mutation: m, holdersAfter: snapshot(), applied: true });
        continue;
      }
    }

    /* ---- is the transferor entitled to transfer at all? ------------- */
    const holder = find(m.fromOwner);
    if (!holder) {
      const died = [...deceased.entries()].find(([name]) => samePerson(name, m.fromOwner as string));
      const left = [...exited.entries()].find(([name]) => samePerson(name, m.fromOwner as string));
      if (died) {
        flag(
          "deceasedTransferor",
          `${m.fromOwner} transfers ${m.share} on ${dateLabel(m.effectiveDate)}, but their interest passed to heirs on ` +
            `${dateLabel(died[1])} — a transfer by a holder who had died`,
          m.seq,
        );
      } else if (left) {
        flag(
          "doubleSale",
          `${m.fromOwner} transfers ${m.share} to ${m.toOwner} on ${dateLabel(m.effectiveDate)}, but had already ` +
            `transferred their entire holding to ${left[1].to} on ${dateLabel(left[1].date)} — the same land sold twice`,
          m.seq,
        );
      } else {
        flag(
          "chainBreak",
          `${m.fromOwner} transfers ${m.share} on ${dateLabel(m.effectiveDate)}, but holds nothing in this parcel ` +
            `at that date — no entry shows how they acquired it`,
          m.seq,
        );
      }
      steps.push({ mutation: m, holdersAfter: snapshot(), applied: false });
      continue;
    }

    /* ---- inheritance: settle every heir of this death at once ------- */
    if (m.type === "INHERITANCE") {
      const key = `${m.fromOwner}\u0000${m.effectiveDate.toISOString()}`;
      if (!settledGroups.has(key)) {
        settledGroups.add(key);
        const heirs = inheritanceGroups.get(key) ?? [m];
        const shares = heirs.map((h) => parseShare(h.share) ?? ZERO);
        const total = shares.reduce(add, ZERO);
        const held = holder.share;
        if (compare(total, held) > 0) {
          flag(
            "sharesExceedWhole",
            `The inheritance from ${m.fromOwner} on ${dateLabel(m.effectiveDate)} hands out ${format(total)} of the ` +
              `parcel, but ${m.fromOwner} held only ${format(held)} — heirs have been allotted more land than exists`,
            m.seq,
          );
        } else if (compare(total, held) < 0) {
          flag(
            "undistributed",
            `The inheritance from ${m.fromOwner} distributes ${format(total)} of the ${format(held)} they held — ` +
              `${format(sub(held, total))} is left with no recorded heir`,
            m.seq,
          );
        }
        // Heirs are credited what the entries say; the deceased leaves the
        // chain entirely either way. An over-allocation is reported, not
        // silently trimmed — trimming would be the system deciding who
        // inherits.
        holder.share = ZERO;
        holders.splice(holders.indexOf(holder), 1);
        deceased.set(m.fromOwner, m.effectiveDate);
        heirs.forEach((h, i) => credit(h.toOwner, shares[i], h.effectiveDate));
      }
      steps.push({ mutation: m, holdersAfter: snapshot(), applied: true });
      continue;
    }

    /* ---- sale, gift, partition, decree ------------------------------ */
    if (compare(share, holder.share) > 0) {
      flag(
        "overTransfer",
        `${m.fromOwner} transfers ${m.share} to ${m.toOwner} on ${dateLabel(m.effectiveDate)}, but holds only ` +
          `${format(holder.share)} at that date`,
        m.seq,
      );
      steps.push({ mutation: m, holdersAfter: snapshot(), applied: false });
      continue;
    }

    holder.share = sub(holder.share, share);
    if (isZero(holder.share)) {
      holders.splice(holders.indexOf(holder), 1);
      exited.set(m.fromOwner, { date: m.effectiveDate, to: m.toOwner });
    }
    credit(m.toOwner, share, m.effectiveDate);
    steps.push({ mutation: m, holdersAfter: snapshot(), applied: true });
  }

  /* ------------------------------------------ the whole must be whole ---- */
  const totalHeld = holders.reduce((sum, h) => add(sum, h.share), ZERO);
  if (compare(totalHeld, ONE) > 0 && !findings.some((f) => f.kind === "sharesExceedWhole")) {
    flag(
      "sharesExceedWhole",
      `Current holdings add up to ${format(totalHeld)} of the parcel — more land is recorded as owned than exists`,
    );
  }

  const currentHolders = snapshot();

  /* ------------------------------ does the chain end where the record is? */
  if (recordOwner && currentHolders.length > 0) {
    const named = currentHolders.find((h) => samePerson(h.owner, recordOwner));
    if (!named) {
      const head = currentHolders.map((h) => `${h.owner} (${h.share})`).join(", ");
      flag(
        "unrecordedTransfer",
        `The record names ${recordOwner} as owner, but the chain of mutations ends with ${head} — ` +
          `a transfer has not been reflected in the Record of Rights`,
      );
    } else if (currentHolders.length > 1) {
      const others = currentHolders.filter((h) => h !== named).map((h) => `${h.owner} (${h.share})`).join(", ");
      flag(
        "unlistedCoOwners",
        `The record names only ${recordOwner}, who holds ${named.share}; the chain also gives ${others}`,
      );
    }
  }

  const first = byTime[0].effectiveDate;
  const last = byTime[byTime.length - 1].effectiveDate;

  return {
    steps,
    superseded,
    findings,
    currentHolders,
    span: {
      from: first,
      to: last,
      years: Math.round(((last.getTime() - first.getTime()) / (365.25 * DAY)) * 10) / 10,
    },
    status: findings.length > 0 ? "DEFECTS" : "CLEAN",
  };
}
