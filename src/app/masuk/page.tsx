import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Masuk",
};

export default function MasukPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-col px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Masuk ke KuisKita</CardTitle>
          <CardDescription>
            Halaman masuk lengkap (email, Google, magic link) dibangun di Fase 3. Halaman ini
            sementara untuk memastikan pengalihan route terproteksi berjalan benar.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button href="/" variant="secondary">
            Kembali ke beranda
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
