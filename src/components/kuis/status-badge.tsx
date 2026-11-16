const LABEL: Record<string, string> = {
  draft: "Draf",
  published: "Terbit",
  suspended: "Ditangguhkan",
};

const WARNA: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  published: "bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200",
  suspended: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
};

/** Lencana status kuis pada dasbor kreator. */
export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${WARNA[status] ?? WARNA.draft}`}
    >
      {LABEL[status] ?? status}
    </span>
  );
}