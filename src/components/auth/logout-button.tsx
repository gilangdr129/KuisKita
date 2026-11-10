"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const onLogout = async () => {
    setLoading(true);
    await fetch("/api/auth/keluar", { method: "POST" });
    router.push("/");
    router.refresh();
  };

  return (
    <Button variant="secondary" onClick={onLogout} loading={loading}>
      Keluar
    </Button>
  );
}
