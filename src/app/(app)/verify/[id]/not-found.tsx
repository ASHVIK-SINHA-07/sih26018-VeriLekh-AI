import Link from "next/link";

export default function NotFound() {
  return (
    <section className="space-y-3">
      <h1 className="text-xl font-medium text-navy">Record not found</h1>
      <p className="text-sm text-muted-foreground">
        No document with that reference exists. It may have been removed, or the
        link may be out of date.
      </p>
      <Link href="/verify" className="text-sm text-navy underline underline-offset-2">
        ← Back to the verification queue
      </Link>
    </section>
  );
}
