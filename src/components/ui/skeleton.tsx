import * as React from "react";
import { cn } from "@/lib/utils/cn";

/** Placeholder loading (skeleton). Hormati preferensi reduce-motion lewat animate-pulse. */
export function Skeleton({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-slate-200 dark:bg-slate-800", className)}
      aria-hidden="true"
      {...props}
    />
  );
}
