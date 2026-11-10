import type { Metadata } from "next";
import { LupaSandiForm } from "@/components/auth/lupa-sandi-form";

export const metadata: Metadata = {
  title: "Lupa password",
};

export default function LupaSandiPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-col px-4 py-12">
      <LupaSandiForm />
      <p className="mt-4 text-center text-sm text-slate-600 dark:text-slate-400">
        Ingat password Anda?{" "}
        <a href="/masuk" className="font-medium text-teal-700 underline dark:text-teal-300">
          Masuk
        </a>
      </p>
    </main>
  );
}
