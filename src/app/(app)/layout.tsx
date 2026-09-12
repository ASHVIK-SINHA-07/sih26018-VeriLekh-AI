import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { TopNav } from "@/components/top-nav";

/**
 * Shell for every signed-in screen: the navigation bar across the top, the
 * work area below at full width. The middleware already blocks anonymous
 * requests here; this re-reads the session so the bar can be role-gated, and
 * fails closed regardless.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col">
      <TopNav name={session.user.name ?? "Unknown user"} role={session.user.role} />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
