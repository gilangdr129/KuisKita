/** Loading skeleton untuk daftar katalog (ditampilkan saat navigasi filter). */
export function KatalogSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2" aria-hidden="true">
      {[0, 1, 2, 3].map((item) => (
        <div
          key={item}
          className="h-32 animate-pulse rounded-xl border border-slate-200 dark:border-slate-800"
        />
      ))}
    </div>
  );
}