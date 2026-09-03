import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { landingPageFor } from "@/lib/auth.config";

/**
 * Role router. There is no public landing page — this is an internal
 * back-office tool, not a citizen portal (docs/01_PRD.md).
 *
 * The post-login redirect rule from doc 03 lives here, in one place: the login
 * action always sends users to "/" and this decides where they actually go.
 * Admin and Verifier land on upload, Viewer on the dashboard.
 */
export default async function RootPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  redirect(landingPageFor(session.user.role));
}
