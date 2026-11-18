"use client";

import * as React from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
    };
  }
}

type Props = {
  /** Dipanggil saat token diterbitkan / kedaluwarsa / gagal. */
  onToken?: (token: string | null | undefined) => void;
};

/**
 * Widget Cloudflare Turnstile (F18). Skrip hanya dimuat bila
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY diisi; tanpa site key, hanya field kosong
 * (server melewati verifikasi — mode nonaktif untuk development).
 */
export function TurnstileField({ onToken }: Props) {
  const ref = React.useRef<HTMLDivElement>(null);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  React.useEffect(() => {
    if (!siteKey || !ref.current) return;

    let widgetId: string | undefined;
    let dibatalkan = false;

    const render = () => {
      if (dibatalkan || !ref.current || !window.turnstile) return;
      widgetId = window.turnstile.render(ref.current, {
        sitekey: siteKey,
        callback: (token: string) => onToken?.(token),
        "expired-callback": () => onToken?.(null),
        "error-callback": () => onToken?.(null),
        theme: "auto",
      });
    };

    if (window.turnstile) {
      render();
    } else {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.onload = render;
      document.head.appendChild(script);
    }

    return () => {
      dibatalkan = true;
      if (widgetId && window.turnstile) window.turnstile.reset(widgetId);
    };
  }, [siteKey, onToken]);

  if (!siteKey) {
    return <input type="hidden" name="turnstile_token" value="" />;
  }

  return <div ref={ref} data-testid="turnstile-slot" />;
}