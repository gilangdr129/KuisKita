import type { Metadata } from "next";
import { PerbaruiSandiForm } from "@/components/auth/perbarui-sandi-form";

export const metadata: Metadata = {
  title: "Perbarui password",
};

export default function PerbaruiSandiPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-col px-4 py-12">
      <PerbaruiSandiForm />
    </main>
  );
}
