import * as React from "react";

export type EmptyStateProps = {
  title: string;
  description?: string;
  action?: React.ReactNode;
};

/** Tampilan saat daftar kosong (katalog, riwayat, hasil pencarian). */
export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 px-6 py-10 text-center dark:border-slate-700">
      <p className="text-base font-semibold">{title}</p>
      {description ? (
        <p className="max-w-sm text-sm text-slate-600 dark:text-slate-400">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
