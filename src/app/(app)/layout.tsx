import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SideRail } from "@/components/side-rail";

/**
 * Shell for every signed-in screen: fixed navigation rail, scrolling work
 * area. The middleware already blocks anonymous requests here; this re-reads
 * the session so the rail can be role-gated, and fails closed regardless.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <SideRail name={session.user.name ?? "Unknown user"} role={session.user.role} />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
