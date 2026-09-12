"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { asPercent } from "@/lib/format";
import { useI18n } from "@/i18n/client";
import {
  EXTRACTED_FIELD_NAMES,
  LOW_CONFIDENCE_THRESHOLD,
  REVIEWABLE_STATUSES,
  type ConfidenceMap,
  type DocumentStatus,
  type ExtractedFields,
} from "@/types";

/**
 * Recent activity, with a row that opens in place.
 *
 * Expanding shows the extracted fields and any validation issues without
 * leaving the dashboard — the same data the detail screen uses, already
 * fetched server-side, so opening a row costs no request.
 */
export interface ActivityRow {
  id: string;
  filename: string;
  status: DocumentStatus;
  village: string | null;
  district: string | null;
  ulpin: string | null;
  /** "6 hours ago", written on the server — see verify-client's issueTexts. */
  updatedLabel: string;
  fields: ExtractedFields | null;
  confidence: ConfidenceMap;
  /** Validation issues as sentences in the reader's language. */
  issueTexts: string[];
}

export function ActivityTable({
  rows,
  readOnly,
}: {
  rows: ActivityRow[];
  readOnly: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const { t } = useI18n();

  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr className="border-b border-hairline bg-panel-alt">
          <th className="w-8" />
          <th className="label-cap px-3 py-2 text-left">{t("common.document")}</th>
          <th className="label-cap hidden px-3 py-2 text-left md:table-cell">{t("common.village")}</th>
          <th className="label-cap hidden px-3 py-2 text-left sm:table-cell">{t("common.district")}</th>
          <th className="label-cap hidden px-3 py-2 text-left lg:table-cell">{t("common.ulpin")}</th>
          <th className="label-cap px-3 py-2 text-left">{t("common.status")}</th>
          <th className="label-cap hidden px-3 py-2 text-right sm:table-cell">{t("common.updated")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const expanded = open === row.id;
          return (
            <Fragment key={row.id}>
              <tr
                onClick={() => setOpen(expanded ? null : row.id)}
                className={`cursor-pointer border-b border-hairline transition-colors ${
                  expanded ? "bg-panel-alt" : "hover:bg-panel-alt/70"
                }`}
              >
                <td className="pl-3">
                  <ChevronRight
                    className={`size-3.5 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`}
                  />
                </td>
                <td className="px-3 py-2.5 font-medium">{row.filename}</td>
                <td className="hidden px-3 py-2.5 text-ink-2 md:table-cell">{row.village ?? "—"}</td>
                <td className="hidden px-3 py-2.5 text-ink-2 sm:table-cell">{row.district ?? "—"}</td>
                <td className="hidden px-3 py-2.5 font-mono text-[11.5px] text-muted-foreground tabular-nums lg:table-cell">
                  {row.ulpin ?? "—"}
                </td>
                <td className="px-3 py-2.5">
                  <StatusBadge status={row.status} />
                </td>
                <td className="hidden px-3 py-2.5 text-right text-[12px] text-muted-foreground tabular-nums sm:table-cell">
                  {row.updatedLabel}
                </td>
              </tr>

              {expanded ? (
                <tr className="border-b border-hairline bg-panel-alt">
                  <td colSpan={7} className="px-3 pt-1 pb-4">
                    {row.fields ? (
                      <div className="grid grid-cols-2 gap-x-6 gap-y-3 pl-0 sm:grid-cols-3 sm:pl-8 lg:grid-cols-5">
                        {EXTRACTED_FIELD_NAMES.map((field) => {
                          const score = row.confidence[field];
                          const low =
                            typeof score === "number" && score < LOW_CONFIDENCE_THRESHOLD;
                          return (
                            <div key={field}>
                              <p className="label-cap">{t(`fields.${field}`)}</p>
                              <p className="mt-0.5 text-[13px]">
                                {row.fields?.[field] ?? (
                                  <span className="text-status-flagged">{t("dashboard.notRead")}</span>
                                )}
                              </p>
                              {typeof score === "number" ? (
                                <p
                                  className={`text-[11px] tabular-nums ${low ? "text-low-confidence" : "text-muted-foreground"}`}
                                >
                                  {asPercent(score)}
                                </p>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="pl-8 text-[13px] text-muted-foreground">
                        {t("dashboard.notReadYet")}
                      </p>
                    )}

                    {row.issueTexts.length > 0 ? (
                      <ul className="mt-4 space-y-1 border-l-2 border-status-flagged pl-3 sm:ml-8">
                        {row.issueTexts.map((text, index) => (
                          <li key={index} className="text-[12.5px] text-ink-2">
                            {text}
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {!readOnly && REVIEWABLE_STATUSES.includes(row.status) ? (
                      <Link
                        href={`/verify/${row.id}`}
                        className="mt-4 ml-8 inline-block border border-navy px-3 py-1.5 text-[12.5px] font-medium text-navy transition-colors hover:bg-navy hover:text-white"
                      >
                        {t("dashboard.openForReview")}
                      </Link>
                    ) : null}
                  </td>
                </tr>
              ) : null}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
