import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ScreenHeader } from "@/components/screen-header";
import { Panel } from "@/components/panel";
import { getI18n } from "@/i18n/server";
import { formatDate, relativeTime } from "@/i18n/translate";
import { revokeApiToken } from "./actions";
import { CreateTokenForm } from "./create-token-form";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("apiAccess.metaTitle") };
}

export const dynamic = "force-dynamic";

/** The three read-only endpoints, in the order someone integrating needs them. */
const ENDPOINTS = [
  { path: "/api/v1/records?limit=25", key: "epList" },
  { path: "/api/v1/records/UP62B4F19C83A7", key: "epOne" },
  { path: "/api/v1/stats", key: "epStats" },
] as const;

/**
 * API access — keys for other government systems, and the reference they
 * integrate against. Admins only: the middleware sends anyone else away, and
 * this page fails closed on its own as well.
 */
export default async function ApiAccessPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  const { t, locale } = await getI18n();
  const tokens = await db.apiToken.findMany({
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { name: true } } },
  });

  // Examples show the address this page was reached on.
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"}`;

  return (
    <>
      <ScreenHeader title={t("apiAccess.title")} subtitle={t("apiAccess.subtitle")} />
      <div className="space-y-5 p-4 sm:p-7">
        <Panel title={t("apiAccess.newTitle")} bodyClassName="p-4 sm:p-5">
          <CreateTokenForm />
        </Panel>

        <Panel title={t("apiAccess.keysTitle")}>
          {tokens.length === 0 ? (
            <p className="p-4 text-[14px] text-muted-foreground">{t("apiAccess.none")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="border-b border-hairline bg-panel-alt">
                    <th className="label-cap px-4 py-2 text-left">{t("apiAccess.colName")}</th>
                    <th className="label-cap px-3 py-2 text-left">{t("apiAccess.colKey")}</th>
                    <th className="label-cap px-3 py-2 text-left">{t("apiAccess.colCreated")}</th>
                    <th className="label-cap px-3 py-2 text-left">{t("apiAccess.colUsed")}</th>
                    <th className="label-cap px-3 py-2 text-left">{t("apiAccess.colStatus")}</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {tokens.map((token) => (
                    <tr key={token.id} className="border-b border-hairline last:border-0">
                      <td className="px-4 py-2.5">
                        <span className="font-medium">{token.name}</span>
                        <span className="block text-[12.5px] text-muted-foreground">{token.createdBy.name}</span>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[13px]">{token.prefix}…</td>
                      <td className="px-3 py-2.5 tabular-nums">{formatDate(locale, token.createdAt)}</td>
                      <td className="px-3 py-2.5">
                        {token.lastUsedAt ? relativeTime(locale, token.lastUsedAt) : t("apiAccess.never")}
                      </td>
                      <td className="px-3 py-2.5">
                        {token.revokedAt ? (
                          <span className="text-status-flagged">{t("apiAccess.revoked")}</span>
                        ) : (
                          <span className="text-status-verified">{t("apiAccess.active")}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {token.revokedAt ? null : (
                          <form action={revokeApiToken}>
                            <input type="hidden" name="id" value={token.id} />
                            <button
                              type="submit"
                              className="border border-rule px-3 py-1 text-[13px] transition-colors hover:border-status-flagged hover:text-status-flagged"
                            >
                              {t("apiAccess.revoke")}
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title={t("apiAccess.refTitle")} bodyClassName="space-y-6 p-4 sm:p-5">
          <p className="max-w-[68ch] text-[14.5px] text-ink-2">{t("apiAccess.refIntro")}</p>
          {ENDPOINTS.map((endpoint) => (
            <div key={endpoint.key} className="space-y-2">
              <p className="font-mono text-[13.5px] break-all">
                <span className="mr-2 bg-navy px-1.5 py-0.5 text-[11.5px] font-semibold text-white">GET</span>
                {endpoint.path}
              </p>
              <p className="max-w-[68ch] text-[14px] text-ink-2">{t(`apiAccess.${endpoint.key}`)}</p>
              <pre className="overflow-x-auto border border-hairline bg-panel-alt p-3 text-[12.5px] leading-relaxed">
                {`curl -H "Authorization: Bearer $VERILEKH_KEY" \\\n  "${origin}${endpoint.path}"`}
              </pre>
            </div>
          ))}
          <div>
            <p className="label-cap">{t("apiAccess.errorsTitle")}</p>
            <ul className="mt-2 space-y-1 text-[14px] text-ink-2">
              <li>{t("apiAccess.err401")}</li>
              <li>{t("apiAccess.err404")}</li>
              <li>{t("apiAccess.err429")}</li>
            </ul>
          </div>
          <p className="text-[13px] text-muted-foreground">{t("apiAccess.notice")}</p>
        </Panel>
      </div>
    </>
  );
}
