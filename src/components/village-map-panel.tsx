import { checkAgainstMap, findVillageMap, type CadastralFinding, type Point } from "@/lib/cadastral";
import { VILLAGE_MAPS } from "@/lib/village-maps";
import { getI18n } from "@/i18n/server";
import { formatDate, type Translator } from "@/i18n/translate";

/**
 * The record against its village map — a demonstration of the link to
 * cadastral data, on SYNTHETIC plot boundaries.
 *
 * Shown on the review screen beside cross-source verification. Display only:
 * these findings do not change the record's quality score, so nothing stored
 * disagrees with what is shown (D59). The caption says the map is synthetic.
 */

const W = 460;
const PAD = 28;

const TONE = {
  MATCHES: { stripe: "border-l-status-verified", text: "text-status-verified", key: "cadastral.statusMatches" },
  DIFFERS: { stripe: "border-l-status-flagged", text: "text-status-flagged", key: "cadastral.statusDiffers" },
  NOT_ON_MAP: { stripe: "border-l-low-confidence", text: "text-low-confidence", key: "cadastral.statusNotOnMap" },
  NO_MAP: { stripe: "border-l-hairline-2", text: "text-ink-3", key: "cadastral.statusNoMap" },
} as const;

const ha = (value: number) => value.toFixed(3);

function describe(t: Translator, finding: CadastralFinding, village: string): string {
  switch (finding.kind) {
    case "notOnMap":
      return t("cadastral.notOnMap", { khasra: finding.khasra, village });
    case "areaDiffers":
      return t("cadastral.areaDiffers", {
        khasra: finding.khasra, mapHa: ha(finding.mapHa), recordHa: ha(finding.recordHa),
        pct: `${(finding.pct * 100).toFixed(1)}%`,
      });
    case "overlap":
      return t("cadastral.overlap", { khasra: finding.khasra, other: finding.other, overlapHa: ha(finding.overlapHa) });
  }
}

export async function VillageMapPanel({
  district, village, khasraNumber, plotArea,
}: {
  district: string | null;
  village: string | null;
  khasraNumber: string | null;
  plotArea: string | null;
}) {
  const { t, locale } = await getI18n();
  const map = findVillageMap(VILLAGE_MAPS, district, village);
  const check = checkAgainstMap(map, { khasraNumber, plotArea });
  const tone = TONE[check.status];

  // Fit the village into the drawing, north up.
  let drawing: React.ReactNode = null;
  if (map) {
    const points = map.plots.flatMap((p) => p.outline);
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const scale = (W - PAD * 2) / Math.max(1, maxX - minX);
    const height = (maxY - minY) * scale + PAD * 2 + 22;
    const px = ([x, y]: Point) => [PAD + (x - minX) * scale, PAD + (maxY - y) * scale] as const;
    const path = (outline: Point[]) => outline.map((p) => px(p).join(",")).join(" ");
    const centre = (outline: Point[]) => {
      const [sx, sy] = outline.reduce(([ax, ay], [x, y]) => [ax + x, ay + y], [0, 0]);
      return px([sx / outline.length, sy / outline.length]);
    };
    const barY = height - 16;

    drawing = (
      <svg viewBox={`0 0 ${W} ${height}`} className="h-auto w-full max-w-[460px]" role="img" aria-label={t("cadastral.title")}>
        {map.plots.map((plot) => {
          const mine = plot === check.plot;
          return (
            <polygon
              key={plot.khasra}
              points={path(plot.outline)}
              className={mine ? "fill-navy/15 stroke-navy" : "fill-panel-alt stroke-rule"}
              strokeWidth={mine ? 2.5 : 1.25}
              strokeLinejoin="round"
            />
          );
        })}
        {check.findings.map((f, i) =>
          f.kind === "overlap" ? (
            <polygon key={i} points={path(f.outline)} className="fill-status-flagged/40 stroke-status-flagged" strokeWidth={1.5} />
          ) : null,
        )}
        {map.plots.map((plot) => {
          const [cx, cy] = centre(plot.outline);
          const mine = plot === check.plot;
          return (
            <text
              key={plot.khasra}
              x={cx}
              y={cy + 4}
              textAnchor="middle"
              className={mine ? "fill-navy text-[13px] font-semibold" : "fill-ink-2 text-[12px]"}
            >
              {plot.khasra}
            </text>
          );
        })}
        {/* north arrow */}
        <g transform={`translate(${W - 16} 18)`} className="fill-ink-3">
          <path d="M0 -8 L5 6 L0 3 L-5 6 Z" />
          <text y={20} textAnchor="middle" className="text-[10px] font-semibold">N</text>
        </g>
        {/* 100 m scale bar */}
        <g transform={`translate(${PAD} ${barY})`} className="fill-ink-3 stroke-ink-3">
          <line x1={0} y1={0} x2={100 * scale} y2={0} strokeWidth={2} />
          <line x1={0} y1={-4} x2={0} y2={4} strokeWidth={1.5} />
          <line x1={100 * scale} y1={-4} x2={100 * scale} y2={4} strokeWidth={1.5} />
          <text x={100 * scale + 6} y={4} className="text-[11px]" stroke="none">100 m</text>
        </g>
      </svg>
    );
  }

  return (
    <div className={`border border-l-[3px] border-hairline bg-panel ${tone.stripe}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-hairline px-4 py-3">
        <p className="text-[15px] font-semibold text-foreground">
          {t("cadastral.title")}
          <span className="font-normal text-ink-3"> · {t("cadastral.meta")}</span>
        </p>
        <p className={`text-[12px] font-semibold tracking-[0.08em] uppercase ${tone.text}`}>{t(tone.key)}</p>
      </div>

      {!map ? (
        <p className="px-4 py-3 text-[14px] text-ink-2">{t("cadastral.noMap", { village: village ?? "—" })}</p>
      ) : (
        <div className="grid gap-5 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-start">
          <div>{drawing}</div>
          <div className="space-y-3 text-[14px] text-ink-2">
            {check.mapHa !== null && check.recordHa !== null ? (
              <p className="tabular-nums">{t("cadastral.measured", { mapHa: ha(check.mapHa), recordHa: ha(check.recordHa) })}</p>
            ) : null}
            {check.status === "MATCHES" ? (
              <p className="text-status-verified">{t("cadastral.matches", { khasra: khasraNumber ?? "" })}</p>
            ) : (
              <ul className="space-y-1.5">
                {check.findings.map((f, i) => (
                  <li key={i} className="text-status-flagged">✕ {describe(t, f, village ?? "")}</li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-hairline pt-3 text-[13px]">
              <span className="flex items-center gap-1.5"><span className="size-3 border-2 border-navy bg-navy/15" aria-hidden="true" />{t("cadastral.legendThis")}</span>
              <span className="flex items-center gap-1.5"><span className="size-3 border border-rule bg-panel-alt" aria-hidden="true" />{t("cadastral.legendOther")}</span>
              <span className="flex items-center gap-1.5"><span className="size-3 border border-status-flagged bg-status-flagged/40" aria-hidden="true" />{t("cadastral.legendOverlap")}</span>
            </div>
            <p className="text-[12.5px] text-ink-3">{t("cadastral.surveyed", { date: formatDate(locale, map.surveyed) })}</p>
          </div>
        </div>
      )}
      <p className="border-t border-hairline px-4 py-2.5 text-[12.5px] text-muted-foreground italic">{t("cadastral.caption")}</p>
    </div>
  );
}
