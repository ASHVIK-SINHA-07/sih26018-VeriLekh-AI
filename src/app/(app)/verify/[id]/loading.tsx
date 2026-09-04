import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <section className="space-y-5">
      <Skeleton className="h-6 w-72" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-[32rem] w-full rounded-lg" />
        <div className="space-y-4">
          {[0, 1, 2, 3, 4, 5].map((row) => (
            <Skeleton key={row} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </section>
  );
}
