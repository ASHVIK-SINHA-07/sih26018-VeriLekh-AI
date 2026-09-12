"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/i18n/client";

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
  const { t } = useI18n();

  return (
    <label className="flex items-center gap-2 text-[14.5px]">
      <span className="label-cap">{t("dashboard.districtFilter")}</span>
      <select
        value={current}
        onChange={(event) => {
          const value = event.target.value;
          router.push(value ? `/dashboard?district=${encodeURIComponent(value)}` : "/dashboard");
        }}
        className="h-8 border border-rule bg-panel px-2 text-[14.5px] outline-none focus-visible:border-navy"
      >
        <option value="">{t("dashboard.allDistrictsOption")}</option>
        {districts.map((row) => (
          <option key={row.district} value={row.district}>
            {row.district} ({row.count})
          </option>
        ))}
      </select>
    </label>
  );
}
