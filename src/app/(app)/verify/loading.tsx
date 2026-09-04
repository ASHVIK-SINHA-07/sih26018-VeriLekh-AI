import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <section className="space-y-6">
      <Skeleton className="h-6 w-56" />
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map((row) => (
          <Skeleton key={row} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    </section>
  );
}
