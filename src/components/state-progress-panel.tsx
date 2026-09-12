import { Panel } from "@/components/panel";
import { getI18n } from "@/i18n/server";
import { formatCount } from "@/i18n/translate";
import type { DashboardStats } from "@/types";

/**
 * Digitization progress by state — the level above the district table.
 *
 * Only Uttar Pradesh has records in this prototype, and the panel says so
 * rather than padding the table: a new state's row appears the moment its
 * first record is read.
 */
export async function StateProgressPanel({ rows }: { rows: DashboardStats["byState"] }) {
  if (rows.length === 0) return null;
  const { t, locale } = await getI18n();
  const n = (value: number) => formatCount(locale, value);
  const knownStates = rows.filter((row) => row.state !== "UNASSIGNED").length;

  return (
    <Panel title={t("states.title")}>
      <div className="overflow-x-auto">
        <table className="w-full text-[14px]">
          <thead>
            <tr className="border-b border-hairline bg-panel-alt">
              <th className="label-cap px-4 py-2 text-left">{t("states.state")}</th>
              <th className="label-cap px-3 py-2 text-right">{t("states.documents")}</th>
              <th className="label-cap px-3 py-2 text-right">{t("states.verified")}</th>
              <th className="label-cap px-3 py-2 text-right">{t("states.awaiting")}</th>
              <th className="label-cap px-4 py-2 text-right">{t("states.districts")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.state} className="border-b border-hairline last:border-0">
                <td className="px-4 py-2.5 font-medium">
                  {row.state === "UNASSIGNED" ? t("states.unassigned") : t(`states.${row.state}`)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{n(row.documents)}</td>
                <td className="px-3 py-2.5 text-right text-status-verified tabular-nums">{n(row.verified)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{n(row.awaiting)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{n(row.districts)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {knownStates <= 1 ? (
        <p className="border-t border-hairline px-4 py-2.5 text-[13px] text-muted-foreground">{t("states.note")}</p>
      ) : null}
    </Panel>
  );
}
