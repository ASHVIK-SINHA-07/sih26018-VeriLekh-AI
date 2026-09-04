"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * "Push to NGDRS (simulated)" — docs/05_Feature_Tickets.md T9.
 *
 * Calls this system's own simulated endpoint and shows exactly what came back.
 * The wording here is deliberate and should not be softened: a judge must be
 * able to tell at a glance that no government system was contacted.
 */
export function NgdrsPanel({ ulpin }: { ulpin: string }) {
  const [payload, setPayload] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/mock/ngdrs/${ulpin}`);
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "The simulated endpoint refused this record");
        setPayload(null);
      } else {
        setPayload(JSON.stringify(body, null, 2));
      }
    } catch {
      setError("Could not reach the simulated endpoint");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-navy">Registry integration</h2>
          <p className="text-xs text-muted-foreground">
            Simulated — nothing is sent to NGDRS, DILRMP or any government system.
          </p>
        </div>
        <Button variant="outline" onClick={() => void submit()} disabled={loading}>
          {loading ? "Submitting…" : "Push to NGDRS (simulated)"}
        </Button>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-status-flagged">{error}</p>
      ) : null}

      {payload ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-terracotta">
            Simulated response — generated locally from this record
          </p>
          <pre className="max-h-80 overflow-auto rounded-lg bg-surface p-3 text-xs leading-relaxed">
            {payload}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
