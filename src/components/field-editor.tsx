"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { asPercent } from "@/lib/format";
import { LOW_CONFIDENCE_THRESHOLD } from "@/types";

/**
 * FieldEditor — docs/04_Frontend_Spec.md shared components.
 *
 * A labelled input. When the pipeline's confidence in this field is low it
 * renders with an amber border and a hint, so a reviewer's eye goes straight
 * to the fields that actually need checking rather than reading all nine.
 */
export function FieldEditor({
  name,
  label,
  value,
  confidence,
  disabled = false,
  edited = false,
  onChange,
}: {
  name: string;
  label: string;
  value: string;
  confidence?: number;
  disabled?: boolean;
  edited?: boolean;
  onChange: (value: string) => void;
}) {
  const lowConfidence =
    typeof confidence === "number" && confidence < LOW_CONFIDENCE_THRESHOLD;
  const missing = value.trim().length === 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={name} className="text-sm">
          {label}
        </Label>

        {edited ? (
          <span className="text-xs font-medium text-status-verified">
            Corrected
          </span>
        ) : typeof confidence === "number" ? (
          <span
            className={`text-xs ${lowConfidence ? "text-low-confidence" : "text-muted-foreground"}`}
          >
            {asPercent(confidence)} confident
          </span>
        ) : null}
      </div>

      <Input
        id={name}
        name={name}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={
          edited
            ? "border-status-verified focus-visible:border-status-verified"
            : lowConfidence
              ? "border-low-confidence bg-low-confidence/5 focus-visible:border-low-confidence"
              : undefined
        }
      />

      {missing ? (
        <p className="text-xs text-status-flagged">
          Nothing was read for this field — enter it from the scan
        </p>
      ) : lowConfidence && !edited ? (
        <p className="text-xs text-low-confidence">
          Low confidence — check this against the scan
        </p>
      ) : null}
    </div>
  );
}
