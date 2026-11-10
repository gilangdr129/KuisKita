import * as React from "react";
import { cn } from "@/lib/utils/cn";

export type InputProps = {
  label: string;
  error?: string;
  hint?: string;
} & React.ComponentPropsWithRef<"input">;

/** Input form dengan label, pesan kesalahan, dan tautan aria yang benar. */
export function Input({ label, error, hint, className, id, ...props }: InputProps) {
  const generatedId = React.useId();
  const inputId = id ?? generatedId;
  const messageId = `${inputId}-message`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-slate-700 dark:text-slate-200">
        {label}
      </label>
      <input
        id={inputId}
        className={cn(
          "min-h-11 rounded-lg border bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 dark:bg-slate-900 dark:text-slate-50 dark:placeholder:text-slate-500",
          error ? "border-red-500" : "border-slate-300 dark:border-slate-700",
          className,
        )}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? messageId : undefined}
        {...props}
      />
      {error || hint ? (
        <p
          id={messageId}
          className={cn("text-xs", error ? "text-red-600 dark:text-red-400" : "text-slate-500")}
        >
          {error ?? hint}
        </p>
      ) : null}
    </div>
  );
}
