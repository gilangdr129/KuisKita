"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { readError, type EnvelopeError } from "@/lib/http/client";
import { updatePasswordSchema, type UpdatePasswordInput } from "@/lib/validation/schemas";

export function PerbaruiSandiForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UpdatePasswordInput>({
    resolver: zodResolver(updatePasswordSchema),
    defaultValues: { password: "", konfirmasi: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const response = await fetch("/api/auth/perbarui-sandi", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    });

    if (response.ok) {
      router.push("/?sandi_diperbarui=1");
      router.refresh();
      return;
    }

    const error = (await readError(response)) as EnvelopeError | null;
    setFormError(error?.error.message ?? "Gagal memperbarui password. Coba lagi.");
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Buat password baru</CardTitle>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Password lama Anda sudah digantikan setelah reset. Pilih password baru untuk melanjutkan.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Input
            label="Password baru"
            type="password"
            autoComplete="new-password"
            error={errors.password?.message}
            {...register("password")}
          />
          <Input
            label="Konfirmasi password baru"
            type="password"
            autoComplete="new-password"
            error={errors.konfirmasi?.message}
            {...register("konfirmasi")}
          />
          {formError ? (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {formError}
            </p>
          ) : null}
        </CardContent>
        <CardFooter>
          <Button type="submit" loading={isSubmitting} className="w-full">
            Simpan password baru
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
