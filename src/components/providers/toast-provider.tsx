"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";

export type Toast = {
  id: string;
  title: string;
  description?: string;
  variant?: "default" | "danger";
};

type ToastContextValue = {
  toasts: Toast[];
  toast: (input: Omit<Toast, "id">) => void;
  dismiss: (id: string) => void;
};

const ToastContext = React.createContext<ToastContextValue | null>(null);

const TOAST_TIMEOUT_MS = 4000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const timeouts = React.useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = React.useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
    const timeout = timeouts.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      timeouts.current.delete(id);
    }
  }, []);

  const toast = React.useCallback(
    (input: Omit<Toast, "id">) => {
      const id = crypto.randomUUID();
      setToasts((current) => [...current, { ...input, id }]);
      const timeout = setTimeout(() => dismiss(id), TOAST_TIMEOUT_MS);
      timeouts.current.set(id, timeout);
    },
    [dismiss],
  );

  React.useEffect(() => {
    const pending = timeouts.current;
    return () => {
      pending.forEach((timeout) => clearTimeout(timeout));
      pending.clear();
    };
  }, []);

  const value = React.useMemo<ToastContextValue>(() => ({ toasts, toast, dismiss }), [
    toasts,
    toast,
    dismiss,
  ]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error("useToast harus dipakai di dalam <ToastProvider>.");
  }
  return context;
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4"
      role="region"
      aria-live="polite"
      aria-label="Notifikasi"
    >
      {toasts.map((item) => (
        <div
          key={item.id}
          role="status"
          className={cn(
            "pointer-events-auto w-full max-w-sm rounded-lg border p-3 shadow-lg",
            item.variant === "danger"
              ? "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100"
              : "border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">{item.title}</p>
              {item.description ? (
                <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                  {item.description}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(item.id)}
              className="rounded p-1 text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 dark:hover:bg-slate-800"
              aria-label="Tutup notifikasi"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
