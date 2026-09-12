import { Panel } from "@/components/panel";
import { getI18n } from "@/i18n/server";
import type { DashboardStats, ErrorCategory } from "@/types";

/**
 * Error statistics and validation status — what the checks have found,
 * across every record that has not been rejected.
 *
 * Left: records by validation result. Right: records by kind of problem,
 * each record counted once per kind. Cross-source disagreements and chain
 * defects are worked out live from each record's evidence rather than stored,
 * so those two rows come from the same figures as the district table.
 */
export async function ErrorStatsPanel({
  validation,
  errors,
}: {
  validation: DashboardStats["validation"];
  errors: { category: ErrorCategory; records: number }[];
}) {
  const { t } = await getI18n();

  const statuses = [
    { key: "pass", value: validation.pass, tone: "bg-status-verified" },
    { key: "flagged", value: validation.flagged, tone: "bg-status-flagged" },
    { key: "duplicate", value: validation.duplicate, tone: "bg-low-confidence" },
    { key: "notRead", value: validation.notRead, tone: "bg-status-uploaded" },
  ] as const;
  const total = statuses.reduce((sum, row) => sum + row.value, 0);
  const present = errors.filter((row) => row.records > 0);
  const widest = Math.max(1, ...present.map((row) => row.records));

  return (
    <Panel
      title={t("errorStats.title")}
      meta={t("errorStats.meta")}
      bodyClassName="grid gap-7 p-4 sm:p-5 lg:grid-cols-2"
    >
      <div>
        <p className="label-cap">{t("errorStats.statusTitle")}</p>
        {total > 0 ? (
          <div className="mt-3 flex h-3 w-full overflow-hidden bg-panel-alt" aria-hidden="true">
            {statuses.map((row) =>
              row.value > 0 ? (
                <div key={row.key} className={row.tone} style={{ width: `${(row.value / total) * 100}%` }} />
              ) : null,
            )}
          </div>
        ) : null}
        <ul className="mt-3 space-y-1.5">
          {statuses.map((row) => (
            <li key={row.key} className="flex items-center justify-between gap-3 text-[14px]">
              <span className="flex items-center gap-2">
                <span className={`size-2.5 shrink-0 rounded-full ${row.tone}`} aria-hidden="true" />
                {t(`errorStats.${row.key}`)}
              </span>
              <span className="text-ink-2 tabular-nums">{t("errorStats.records", { count: row.value })}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="label-cap">{t("errorStats.kindsTitle")}</p>
        {present.length === 0 ? (
          <p className="mt-3 text-[14px] text-muted-foreground">{t("errorStats.none")}</p>
        ) : (
          <ul className="mt-3 space-y-2.5">
            {present.map((row) => (
              <li key={row.category}>
                <div className="flex items-baseline justify-between gap-3 text-[14px]">
                  <span>{t(`errorStats.${row.category}`)}</span>
                  <span className="shrink-0 text-ink-2 tabular-nums">{t("errorStats.records", { count: row.records })}</span>
                </div>
                <div className="mt-1 h-1.5 bg-panel-alt" aria-hidden="true">
                  <div
                    className={row.category === "autoCorrected" ? "h-full bg-status-verified" : "h-full bg-navy"}
                    style={{ width: `${(row.records / widest) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}
