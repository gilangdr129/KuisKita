"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TurnstileField } from "@/components/auth/turnstile-field";
import { readData, readError, type EnvelopeError } from "@/lib/http/client";
import { signUpSchema, type SignUpInput } from "@/lib/validation/schemas";

type Props = {
  /** Halaman tujuan setelah daftar sukses. */
  next?: string;
};

export function DaftarForm({ next = "/" }: Props) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { email: "", username: "", password: "", konfirmasi: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const response = await fetch("/api/auth/daftar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    });

    if (response.ok) {
      // Tanpa verifikasi email (Confirm email nonaktif), sesi langsung dibuat —
      // lanjut ke tujuan. Kalau verifikasi wajib, arahkan ke halaman masuk
      // dengan pesan "periksa email".
      const payload = await readData<{ session_aktif?: boolean; needs_email_verification?: boolean }>(
        response,
      );
      if (payload?.session_aktif) {
        router.push(next);
        router.refresh();
        return;
      }
      router.push(`/masuk?status=periksa_email&next=${encodeURIComponent(next)}`);
      router.refresh();
      return;
    }

    const error = (await readError(response)) as EnvelopeError | null;
    setFormError(error?.error.message ?? "Pendaftaran gagal. Coba lagi.");
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Buat akun KuisKita</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            placeholder="nama@email.com"
            error={errors.email?.message}
            {...register("email")}
          />
          <Input
            label="Username"
            autoComplete="username"
            placeholder="rani_01"
            hint="3-20 karakter: huruf kecil, angka, titik, underscore"
            error={errors.username?.message}
            {...register("username")}
          />
          <Input
            label="Password"
            type="password"
            autoComplete="new-password"
            error={errors.password?.message}
            {...register("password")}
          />
          <Input
            label="Konfirmasi password"
            type="password"
            autoComplete="new-password"
            error={errors.konfirmasi?.message}
            {...register("konfirmasi")}
          />
          <TurnstileField />
          {formError ? (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {formError}
            </p>
          ) : null}
        </CardContent>
        <CardFooter>
          <Button type="submit" loading={isSubmitting} className="w-full">
            Daftar
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
