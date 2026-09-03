import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppNav } from "@/components/app-nav";

/**
 * Shell for every signed-in screen. The middleware already blocks anonymous
 * requests to these routes; this re-reads the session server-side so the nav
 * can be role-gated, and fails closed if it is somehow absent.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-surface">
      <AppNav name={session.user.name ?? "Unknown user"} role={session.user.role} />
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
