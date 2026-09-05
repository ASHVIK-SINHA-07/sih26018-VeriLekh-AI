"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { asRelativeTime } from "@/lib/format";
import { STATUS_LABELS, type DocumentStatus } from "@/types";

/**
 * The review queue with search and filters.
 *
 * Filtering happens on the client over the rows already rendered — the queue
 * is a working set of tens, not thousands, so a round trip per keystroke would
 * be slower and would lose the caret. If this ever grows past a few hundred
 * rows it should move to the API's existing status/district parameters.
 */
export interface QueueRow {
  id: string;
  filename: string;
  status: DocumentStatus;
  village: string | null;
  district: string | null;
  updatedAt: string;
  issueCount: number;
  topIssue: string | null;
}

export function QueueTable({ rows }: { rows: QueueRow[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"ALL" | DocumentStatus>("ALL");
  const [district, setDistrict] = useState("ALL");

  const districts = useMemo(
    () => [...new Set(rows.map((r) => r.district).filter(Boolean))] as string[],
    [rows],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (status !== "ALL" && row.status !== status) return false;
      if (district !== "ALL" && row.district !== district) return false;
      if (!needle) return true;
      return [row.filename, row.village, row.district]
        .filter(Boolean)
        .some((value) => (value as string).toLowerCase().includes(needle));
    });
  }, [rows, query, status, district]);

  const control =
    "h-8 border border-rule bg-panel px-2 text-[13px] outline-none focus-visible:border-navy";

  return (
    <div className="border border-hairline bg-panel">
      {/* filter bar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-hairline bg-panel-alt px-4 py-2.5">
        <div className="relative w-full sm:w-auto">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search document, village or district"
            aria-label="Search the queue"
            className={`${control} w-full pl-7 sm:w-72`}
          />
        </div>

        <label className="flex items-center gap-2">
          <span className="label-cap">Status</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as "ALL" | DocumentStatus)}
            className={control}
          >
            <option value="ALL">All</option>
            <option value="FLAGGED">{STATUS_LABELS.FLAGGED}</option>
            <option value="PENDING">{STATUS_LABELS.PENDING}</option>
          </select>
        </label>

        {districts.length > 0 ? (
          <label className="flex items-center gap-2">
            <span className="label-cap">District</span>
            <select
              value={district}
              onChange={(event) => setDistrict(event.target.value)}
              className={control}
            >
              <option value="ALL">All</option>
              {districts.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </label>
        ) : null}

        <span className="ml-auto text-[12px] text-muted-foreground tabular-nums">
          {filtered.length} of {rows.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="p-6">
          <EmptyState
            title={rows.length === 0 ? "Nothing to review" : "No records match those filters"}
            hint={
              rows.length === 0
                ? "Records appear here once they have been uploaded and read."
                : "Clear the search or widen the filters."
            }
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-hairline bg-panel-alt">
                <th className="label-cap px-4 py-2 text-left">Document</th>
                <th className="label-cap hidden px-3 py-2 text-left md:table-cell">Village</th>
                <th className="label-cap hidden px-3 py-2 text-left sm:table-cell">District</th>
                <th className="label-cap px-3 py-2 text-left">Status</th>
                <th className="label-cap hidden px-3 py-2 text-left lg:table-cell">Finding</th>
                <th className="label-cap hidden px-4 py-2 text-right sm:table-cell">Updated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-hairline transition-colors last:border-0 hover:bg-panel-alt/70"
                >
                  <td className="px-4 py-2.5 font-medium">
                    <Link href={`/verify/${row.id}`} className="text-navy hover:underline">
                      {row.filename}
                    </Link>
                  </td>
                  <td className="hidden px-3 py-2.5 text-ink-2 md:table-cell">{row.village ?? "—"}</td>
                  <td className="hidden px-3 py-2.5 text-ink-2 sm:table-cell">{row.district ?? "—"}</td>
                  <td className="px-3 py-2.5"><StatusBadge status={row.status} /></td>
                  <td className="hidden max-w-md truncate px-3 py-2.5 text-[12.5px] text-muted-foreground lg:table-cell">
                    {row.topIssue ?? "—"}
                    {row.issueCount > 1 ? (
                      <span className="text-muted-foreground"> +{row.issueCount - 1} more</span>
                    ) : null}
                  </td>
                  <td className="hidden px-4 py-2.5 text-right text-[12px] text-muted-foreground tabular-nums sm:table-cell">
                    {asRelativeTime(row.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
