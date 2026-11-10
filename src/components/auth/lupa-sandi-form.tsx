"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TurnstileField } from "@/components/auth/turnstile-field";
import { readError, type EnvelopeError } from "@/lib/http/client";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/lib/validation/schemas";

export function LupaSandiForm() {
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const response = await fetch("/api/auth/lupa-sandi", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    });

    if (response.ok) {
      setSent(true);
      return;
    }

    const error = (await readError(response)) as EnvelopeError | null;
    setFormError(error?.error.message ?? "Gagal mengirim tautan. Coba lagi.");
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Lupa password</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {sent ? (
            <p className="rounded-lg bg-teal-50 p-3 text-sm text-teal-800 dark:bg-teal-950 dark:text-teal-200">
              Bila email terdaftar, tautan reset password sudah dikirim. Periksa kotak masuk (dan
              folder spam).
            </p>
          ) : (
            <>
              <Input
                label="Email"
                type="email"
                autoComplete="email"
                error={errors.email?.message}
                {...register("email")}
              />
              <TurnstileField />
              {formError ? (
                <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                  {formError}
                </p>
              ) : null}
            </>
          )}
        </CardContent>
        {sent ? null : (
          <CardFooter>
            <Button type="submit" loading={isSubmitting} className="w-full">
              Kirim tautan reset
            </Button>
          </CardFooter>
        )}
      </Card>
    </form>
  );
}
