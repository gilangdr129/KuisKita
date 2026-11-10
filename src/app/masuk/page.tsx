import type { Metadata } from "next";
import { Suspense } from "react";
import { MasukForm } from "@/components/auth/masuk-form";

export const metadata: Metadata = {
  title: "Masuk",
};

export default function MasukPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-col px-4 py-12">
      <Suspense fallback={null}>
        <MasukForm />
      </Suspense>
      <p className="mt-4 text-center text-sm text-slate-600 dark:text-slate-400">
        Belum punya akun?{" "}
        <a href="/daftar" className="font-medium text-teal-700 underline dark:text-teal-300">
          Daftar gratis
        </a>
      </p>
    </main>
  );
}
