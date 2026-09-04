import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ScreenHeader } from "@/components/screen-header";
import { UploadClient } from "./upload-client";
import type { DocumentListItem } from "@/types";

export const metadata = { title: "Upload — Land record digitization" };

/** Always read fresh: the list changes on every upload. */
export const dynamic = "force-dynamic";

/**
 * Screen 2 in docs/04_Frontend_Spec.md.
 *
 * Hidden entirely for Viewer. Middleware already redirects them, but this
 * fails closed too — a screen must never depend on one layer alone.
 */
export default async function UploadPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role === "VIEWER") redirect("/dashboard");

  const rows = await db.document.findMany({
    orderBy: { updatedAt: "desc" },
    take: 12,
    include: { record: { select: { district: true } } },
  });

  const recent: DocumentListItem[] = rows.map((row) => ({
    id: row.id,
    filename: row.filename,
    status: row.status,
    district: row.record?.district ?? null,
    updatedAt: row.updatedAt.toISOString(),
  }));

  return (
    <>
      <ScreenHeader
        title="Upload records"
        subtitle="Each record is read, extracted and checked automatically, then queued for review."
      />
      <div className="p-7">
        <UploadClient recent={recent} />
      </div>
    </>
  );
}
