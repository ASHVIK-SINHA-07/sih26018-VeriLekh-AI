"use client";

import { useRouter, useSearchParams } from "next/navigation";

/**
 * District filter — scopes every figure below it (doc 04 filter row).
 * A plain select rather than a combobox: five districts, and it has to be
 * obvious on a projector.
 */
export function DistrictFilter({
  districts,
}: {
  districts: { district: string; count: number }[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const current = params.get("district") ?? "";

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">District</span>
      <select
        value={current}
        onChange={(event) => {
          const value = event.target.value;
          router.push(value ? `/dashboard?district=${encodeURIComponent(value)}` : "/dashboard");
        }}
        className="h-8 rounded-lg border border-border bg-white px-2 text-sm outline-none focus-visible:border-navy"
      >
        <option value="">All districts</option>
        {districts.map((row) => (
          <option key={row.district} value={row.district}>
            {row.district} ({row.count})
          </option>
        ))}
      </select>
    </label>
  );
}
