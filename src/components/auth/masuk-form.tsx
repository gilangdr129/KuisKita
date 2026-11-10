"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TurnstileField } from "@/components/auth/turnstile-field";
import { GoogleButton } from "@/components/auth/google-button";
import { readError, type EnvelopeError } from "@/lib/http/client";
import { signInSchema, type SignInInput } from "@/lib/validation/schemas";

export function MasukForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const status = searchParams.get("status");
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const response = await fetch("/api/auth/masuk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    });

    if (response.ok) {
      router.push(next);
      router.refresh();
      return;
    }

    const error = (await readError(response)) as EnvelopeError | null;
    setFormError(error?.error.message ?? "Masuk gagal. Coba lagi.");
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Masuk ke KuisKita</CardTitle>
          {status === "periksa_email" ? (
            <p className="rounded-lg bg-teal-50 p-3 text-sm text-teal-800 dark:bg-teal-950 dark:text-teal-200">
              Akun dibuat. Periksa email Anda untuk tautan verifikasi, lalu masuk di sini.
            </p>
          ) : null}
          {status === "terverifikasi" ? (
            <p className="rounded-lg bg-teal-50 p-3 text-sm text-teal-800 dark:bg-teal-950 dark:text-teal-200">
              Email terverifikasi. Silakan masuk.
            </p>
          ) : null}
          {status === "sesi_gagal" ? (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
              Tautan verifikasi tidak valid atau sudah kedaluwarsa. Minta tautan baru.
            </p>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            error={errors.email?.message}
            {...register("email")}
          />
          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            error={errors.password?.message}
            {...register("password")}
          />
          <TurnstileField />
          {formError ? (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {formError}
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="flex-col items-stretch gap-3">
          <Button type="submit" loading={isSubmitting} className="w-full">
            Masuk
          </Button>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
            atau
            <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
          </div>
          <GoogleButton next={next} />
          <p className="text-center text-sm text-slate-600 dark:text-slate-400">
            Belum punya akun?{" "}
            <a href="/daftar" className="font-medium text-teal-700 underline dark:text-teal-300">
              Daftar
            </a>
            {" · "}
            <a href="/lupa-sandi" className="font-medium text-teal-700 underline dark:text-teal-300">
              Lupa password
            </a>
          </p>
        </CardFooter>
      </Card>
    </form>
  );
}
