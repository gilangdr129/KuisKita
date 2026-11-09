"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

const subscribeNoop = () => () => {};
const getSnapshotTrue = () => true;
const getSnapshotFalse = () => false;

/** Deteksi render sisi klien (menghindari hydration mismatch tema). */
function useMounted() {
  return React.useSyncExternalStore(subscribeNoop, getSnapshotTrue, getSnapshotFalse);
}

/** Toggle tema gelap/terang (mengikuti preferensi sistem sebagai default). */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();

  const isDark = resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Aktifkan mode terang" : "Aktifkan mode gelap"}
      title={isDark ? "Mode terang" : "Mode gelap"}
    >
      {mounted ? (
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {isDark ? (
            <circle cx="12" cy="12" r="4" />
          ) : (
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          )}
        </svg>
      ) : null}
      {mounted ? (isDark ? "Terang" : "Gelap") : "Tema"}
    </Button>
  );
}
