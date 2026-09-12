import { Panel } from "@/components/panel";
import { getI18n } from "@/i18n/server";
import { DISTRICT_HQ as HQ } from "@/lib/geography";

/**
 * Field-visit priority on a schematic outline of Uttar Pradesh.
 *
 * The district table says which districts need someone sent; this shows
 * where they are, at a glance. It is deliberately plain — a simplified
 * outline and a dot at each district headquarters — and says so on the map:
 * the system holds no parcel geometry, and cadastral mapping is on the
 * roadmap (D42). Nothing here is fetched from a map service, so nothing
 * leaves the machine.
 */

export interface MapDistrict {
  /** As the records write it — the same string the dashboard filters on. */
  district: string;
  records: number;
  /** Records that need someone sent to check on the ground. */
  needVisit: number;
}

/** Uttar Pradesh, simplified by hand to 41 points, [longitude, latitude]. */
const OUTLINE: [number, number][] = [
  [77.55, 30.4], [78.1, 29.95], [78.45, 29.7], [78.9, 29.4], [79.4, 28.95], [80.05, 28.8],
  [80.55, 28.65], [81.2, 28.4], [81.9, 27.95], [82.7, 27.55], [83.4, 27.4], [84.1, 27.35],
  [84.55, 26.95], [84.4, 26.35], [84.6, 25.75], [83.95, 25.45], [83.45, 25.1], [83.35, 24.45],
  [83.1, 23.9], [82.6, 24.2], [82.2, 24.75], [81.7, 24.95], [81.05, 25.05], [80.35, 25.2],
  [79.7, 25.05], [79.1, 24.6], [78.8, 24.2], [78.3, 24.35], [78.35, 25.0], [78.6, 25.45],
  [78.95, 25.95], [79.1, 26.35], [78.75, 26.75], [78.2, 26.85], [77.7, 27.1], [77.4, 27.55],
  [77.45, 28.1], [77.25, 28.45], [77.15, 29.0], [77.1, 29.5], [77.3, 30.05],
];

/** Plain equirectangular, longitude narrowed for UP's latitude. */
const project = ([lon, lat]: [number, number]): [number, number] => [
  20 + (lon - 76.9) * 53.4,
  15 + (30.6 - lat) * 60,
];

/** Where a label goes when "above" would collide with a neighbour. */
const LABEL_SIDE: Record<string, "above" | "left" | "right"> = {
  "कानपुर नगर": "left",
  "प्रयागराज": "left",
  "वाराणसी": "right",
};

const radius = (records: number) => Math.min(18, 7 + Math.sqrt(records) * 2.5);

const TONE = {
  high: "fill-status-flagged",
  mid: "fill-low-confidence",
  low: "fill-status-verified",
  none: "fill-status-uploaded",
} as const;

function toneFor(share: number): keyof typeof TONE {
  if (share >= 0.5) return "high";
  if (share >= 0.25) return "mid";
  if (share > 0) return "low";
  return "none";
}

function labelFor(side: "above" | "left" | "right", x: number, y: number, r: number) {
  if (side === "left") return { x: x - r - 7, name: y - 2, count: y + 12, anchor: "end" as const };
  if (side === "right") return { x: x + r + 7, name: y - 2, count: y + 12, anchor: "start" as const };
  return { x, name: y - r - 19, count: y - r - 6, anchor: "middle" as const };
}

/** Keeps a label readable where it crosses the outline. */
const HALO: React.CSSProperties = { paintOrder: "stroke", stroke: "var(--panel)", strokeWidth: 3.5, strokeLinejoin: "round" };

export async function DistrictMap({
  districts,
  selected,
}: {
  districts: MapDistrict[];
  /** The district the dashboard is filtered to, ringed on the map. */
  selected?: string;
}) {
  if (districts.length === 0) return null;
  const { t } = await getI18n();

  const placed = districts.filter((d) => HQ[d.district]);
  const unplaced = districts.filter((d) => !HQ[d.district]).map((d) => d.district);
  // Largest first, so a small dot is never hidden under a large one.
  const ordered = [...placed].sort((a, b) => b.records - a.records);
  const outline = OUTLINE.map((point) => project(point).join(",")).join(" ");

  return (
    <Panel
      title={t("map.title")}
      meta={t("map.meta")}
      bodyClassName="grid gap-6 p-4 sm:p-5 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:items-center"
    >
      <div>
        <svg viewBox="0 0 460 440" className="h-auto w-full max-w-[560px]" role="group" aria-label={t("map.title")}>
          <polygon points={outline} className="fill-panel-alt stroke-rule" strokeWidth={1.5} strokeLinejoin="round" />
          <text x={24} y={430} className="fill-ink-3 text-[12px] font-semibold tracking-[0.1em] uppercase">
            {t("map.state")}
          </text>

          {ordered.map((d) => {
            const [x, y] = project(HQ[d.district]);
            const r = radius(d.records);
            const share = d.records > 0 ? d.needVisit / d.records : 0;
            const label = labelFor(LABEL_SIDE[d.district] ?? "above", x, y, r);
            const described = t("map.dot", { district: d.district, needVisit: d.needVisit, records: d.records });
            return (
              <a
                key={d.district}
                href={`/dashboard?district=${encodeURIComponent(d.district)}`}
                aria-label={described}
                className="group outline-none"
              >
                <title>{described}</title>
                <circle
                  cx={x}
                  cy={y}
                  r={r + 5}
                  strokeWidth={2.5}
                  className={
                    selected === d.district
                      ? "fill-none stroke-navy"
                      : "fill-none stroke-transparent group-hover:stroke-navy/40 group-focus-visible:stroke-navy"
                  }
                />
                <circle cx={x} cy={y} r={r} className={TONE[toneFor(share)]} stroke="var(--panel)" strokeWidth={2} />
                <text x={label.x} y={label.name} textAnchor={label.anchor} className="fill-foreground text-[13.5px] font-semibold" style={HALO}>
                  {d.district}
                </text>
                <text x={label.x} y={label.count} textAnchor={label.anchor} className="fill-ink-2 text-[12px] tabular-nums" style={HALO}>
                  {t("map.count", { needVisit: d.needVisit, records: d.records })}
                </text>
              </a>
            );
          })}
        </svg>
        <p className="mt-2 text-[13px] text-muted-foreground italic">{t("map.caption")}</p>
      </div>

      <div className="space-y-3 text-[14px] text-ink-2">
        {(
          [
            ["high", "bg-status-flagged", "map.legendHigh"],
            ["mid", "bg-low-confidence", "map.legendMid"],
            ["low", "bg-status-verified", "map.legendLow"],
            ["none", "bg-status-uploaded", "map.legendNone"],
          ] as const
        ).map(([key, swatch, text]) => (
          <div key={key} className="flex items-center gap-2.5">
            <span className={`size-3 shrink-0 rounded-full ${swatch}`} aria-hidden="true" />
            <span>{t(text)}</span>
          </div>
        ))}
        <p className="border-t border-hairline pt-3">{t("map.size")}</p>
        <p>{t("map.hint")}</p>
        {selected ? (
          <a href="/dashboard" className="inline-block text-navy underline underline-offset-2">
            {t("map.showAll")}
          </a>
        ) : null}
        {unplaced.length > 0 ? (
          <p className="text-[13px] text-muted-foreground">{t("map.unplaced", { names: unplaced.join(", ") })}</p>
        ) : null}
      </div>
    </Panel>
  );
}
