import type { Metadata } from "next";
import { DaftarForm } from "@/components/auth/daftar-form";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Daftar",
};

export default function DaftarPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-col px-4 py-12">
      <Suspense fallback={null}>
        <DaftarForm />
      </Suspense>
      <p className="mt-4 text-center text-sm text-slate-600 dark:text-slate-400">
        Sudah punya akun?{" "}
        <a href="/masuk" className="font-medium text-teal-700 underline dark:text-teal-300">
          Masuk
        </a>
      </p>
    </main>
  );
}