import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ScreenHeader } from "@/components/screen-header";
import { Tour } from "@/components/tour";
import { UploadClient, type RecentUpload } from "./upload-client";
import { getI18n } from "@/i18n/server";
import { relativeTime } from "@/i18n/translate";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("upload.metaTitle") };
}

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

  const { t, locale } = await getI18n();
  const recent: RecentUpload[] = rows.map((row) => ({
    id: row.id,
    filename: row.filename,
    status: row.status,
    district: row.record?.district ?? null,
    updatedAt: row.updatedAt.toISOString(),
    updatedLabel: relativeTime(locale, row.updatedAt),
  }));

  return (
    <>
      <ScreenHeader
        title={t("upload.title")}
        subtitle={t("upload.subtitle")}
      />
      <div className="p-4 sm:p-7">
        <UploadClient recent={recent} />
        <Tour screen="upload" />
      </div>
    </>
  );
}
