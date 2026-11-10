import type { Metadata } from "next";
import { DaftarForm } from "@/components/auth/daftar-form";

export const metadata: Metadata = {
  title: "Daftar",
};

export default async function DaftarPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const target = typeof next === "string" && next.startsWith("/") ? next : "/";

  return (
    <main className="mx-auto flex w-full max-w-sm flex-col px-4 py-12">
      <DaftarForm next={target} />
      <p className="mt-4 text-center text-sm text-slate-600 dark:text-slate-400">
        Sudah punya akun?{" "}
        <a href="/masuk" className="font-medium text-teal-700 underline dark:text-teal-300">
          Masuk
        </a>
      </p>
    </main>
  );
}
