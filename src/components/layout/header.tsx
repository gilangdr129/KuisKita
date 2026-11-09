import Link from "next/link";
import { ThemeToggle } from "@/components/layout/theme-toggle";

/** Header global. Tautan navigasi menambah seiring halaman dibangun. */
export function Header() {
  return (
    <header className="border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
      <div className="mx-auto flex min-h-14 w-full max-w-5xl items-center justify-between px-4">
        <Link href="/" className="text-base font-bold tracking-tight">
          KuisKita
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
