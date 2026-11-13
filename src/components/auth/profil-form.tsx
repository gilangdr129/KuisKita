"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { readError, type EnvelopeError } from "@/lib/http/client";
import { updateUsernameSchema, type UpdateUsernameInput } from "@/lib/validation/schemas";

type Props = {
  usernameSekarang: string;
};

export function ProfilForm({ usernameSekarang }: Props) {
  const router = useRouter();
  const [sukses, setSukses] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UpdateUsernameInput>({
    resolver: zodResolver(updateUsernameSchema),
    defaultValues: { username: usernameSekarang },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSukses(false);
    setFormError(null);

    const response = await fetch("/api/me/profil", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    });

    if (response.ok) {
      setSukses(true);
      router.refresh();
      return;
    }

    const error = (await readError(response)) as EnvelopeError | null;
    setFormError(error?.error.message ?? "Gagal menyimpan username.");
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
      <Input
        label="Username"
        autoComplete="username"
        error={errors.username?.message}
        {...register("username")}
      />
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" loading={isSubmitting}>
          Simpan username
        </Button>
        {sukses ? (
          <span role="status" className="text-xs text-teal-700 dark:text-teal-300">
            Tersimpan.
          </span>
        ) : null}
      </div>
      {formError ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {formError}
        </p>
      ) : null}
    </form>
  );
}
