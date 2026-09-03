import { auth } from "@/lib/auth";

/** Placeholder — this screen is built in ticket T7. */
export default async function Page() {
  const session = await auth();

  return (
    <section className="space-y-2">
      <h1 className="text-xl font-medium text-navy">Verification</h1>
      <p className="text-sm text-muted-foreground">
        This screen is built in ticket T7.
      </p>
      <p className="text-sm text-muted-foreground">
        Signed in as {session?.user?.email} · role{" "}
        <span className="font-mono">{session?.user?.role}</span>
      </p>
    </section>
  );
}
