/**
 * Checks a record against a village cadastral map — the textual–spatial
 * link DILRMP is after.
 *
 * The join key is the one the reader already extracts: village and khasra
 * number. Given a village map, three things can be checked that no single
 * document can show: whether the khasra exists on the map at all, whether the
 * area the map measures agrees with the area the record states, and whether
 * the plot's boundary overlaps a neighbour's — which is where boundary
 * disputes begin.
 *
 * Pure functions, maps injected — same rule as D18. Plots are convex
 * quadrilaterals in metres on a local grid, which keeps area and overlap
 * exact. A real deployment would read Bhu-Naksha geometry instead; this module
 * would not change.
 */

export type Point = [number, number];

export interface Plot {
  khasra: string;
  /** Corners in metres, in order around the plot. Convex. */
  outline: Point[];
}

export interface VillageMap {
  district: string;
  village: string;
  /** When the map was surveyed, ISO date. */
  surveyed: string;
  plots: Plot[];
}

/** Same tolerance as cross-source area (D49): survey and revenue disagree a little. */
export const AREA_TOLERANCE = 0.02;
/** Below this, two plots merely touch along a shared line. */
const TOUCH_HA = 0.001;

function signedArea(outline: Point[]): number {
  let twice = 0;
  for (let i = 0; i < outline.length; i++) {
    const [x1, y1] = outline[i];
    const [x2, y2] = outline[(i + 1) % outline.length];
    twice += x1 * y2 - x2 * y1;
  }
  return twice / 2;
}

/** Area in hectares of a polygon in metres (the shoelace formula). */
export function areaHa(outline: Point[]): number {
  return Math.abs(signedArea(outline)) / 10_000;
}

function intersect(p: Point, q: Point, a: Point, b: Point): Point {
  const a1 = q[1] - p[1], b1 = p[0] - q[0], c1 = a1 * p[0] + b1 * p[1];
  const a2 = b[1] - a[1], b2 = a[0] - b[0], c2 = a2 * a[0] + b2 * a[1];
  const det = a1 * b2 - a2 * b1;
  if (Math.abs(det) < 1e-12) return q;
  return [(b2 * c1 - b1 * c2) / det, (a1 * c2 - a2 * c1) / det];
}

/** The part of convex `subject` inside convex `clip` (Sutherland–Hodgman). */
export function overlapOutline(subject: Point[], clip: Point[]): Point[] {
  const turn = signedArea(clip) >= 0 ? 1 : -1;
  let output = subject;
  for (let i = 0; i < clip.length && output.length > 0; i++) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    const inside = (p: Point) => turn * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) >= 0;
    const input = output;
    output = [];
    for (let j = 0; j < input.length; j++) {
      const p = input[j];
      const q = input[(j + 1) % input.length];
      if (inside(p)) output.push(p);
      if (inside(p) !== inside(q)) output.push(intersect(p, q, a, b));
    }
  }
  return output;
}

export function overlapHa(a: Point[], b: Point[]): number {
  const shared = overlapOutline(a, b);
  return shared.length < 3 ? 0 : areaHa(shared);
}

export function findVillageMap(maps: VillageMap[], district: string | null, village: string | null): VillageMap | null {
  if (!district || !village) return null;
  return maps.find((m) => m.district === district.trim() && m.village === village.trim()) ?? null;
}

export type CadastralFinding =
  | { kind: "areaDiffers"; khasra: string; mapHa: number; recordHa: number; pct: number }
  | { kind: "overlap"; khasra: string; other: string; overlapHa: number; outline: Point[] }
  | { kind: "notOnMap"; khasra: string };

export interface MapCheck {
  status: "NO_MAP" | "NOT_ON_MAP" | "MATCHES" | "DIFFERS";
  plot: Plot | null;
  mapHa: number | null;
  recordHa: number | null;
  findings: CadastralFinding[];
}

export function checkAgainstMap(
  map: VillageMap | null,
  record: { khasraNumber: string | null; plotArea: string | null },
): MapCheck {
  const khasra = record.khasraNumber?.trim();
  const parsed = Number(record.plotArea);
  const recordHa = record.plotArea && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  if (!map || !khasra) return { status: "NO_MAP", plot: null, mapHa: null, recordHa, findings: [] };

  const plot = map.plots.find((p) => p.khasra === khasra) ?? null;
  if (!plot) {
    return { status: "NOT_ON_MAP", plot: null, mapHa: null, recordHa, findings: [{ kind: "notOnMap", khasra }] };
  }

  const mapHa = areaHa(plot.outline);
  const findings: CadastralFinding[] = [];

  if (recordHa !== null) {
    const pct = Math.abs(mapHa - recordHa) / recordHa;
    if (pct > AREA_TOLERANCE) findings.push({ kind: "areaDiffers", khasra, mapHa, recordHa, pct });
  }

  for (const other of map.plots) {
    if (other === plot) continue;
    const shared = overlapOutline(plot.outline, other.outline);
    const ha = shared.length < 3 ? 0 : areaHa(shared);
    if (ha > TOUCH_HA) findings.push({ kind: "overlap", khasra, other: other.khasra, overlapHa: ha, outline: shared });
  }

  return { status: findings.length > 0 ? "DIFFERS" : "MATCHES", plot, mapHa, recordHa, findings };
}
