/**
 * Header keamanan (Gate F18), dipasang oleh proxy untuk setiap respons.
 * CSP disesuaikan dengan kebutuhan Next.js 16 (skrip bootstrap inline) dan
 * widget Cloudflare Turnstile; di development, eval diizinkan untuk HMR.
 */
export function denganHeaderKeamanan<T extends Response>(response: T): T {
  const produksi = process.env.NODE_ENV === "production";
  const scriptSrc = produksi ? "'self' 'unsafe-inline'" : "'self' 'unsafe-inline' 'unsafe-eval'";

  response.headers.set(
    "content-security-policy",
    [
      "default-src 'self'",
      `script-src ${scriptSrc}`,
      "style-src 'self' 'unsafe-inline'",
      // Gambar soal/avatar dari bucket publik Supabase + pratinjau lokal.
      "img-src 'self' data: blob: https://*.supabase.co",
      "font-src 'self'",
      // API Supabase dari klien + widget/verifikasi Turnstile.
      "connect-src 'self' https://*.supabase.co https://challenges.cloudflare.com",
      "frame-src https://challenges.cloudflare.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  );

  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("x-frame-options", "DENY");
  response.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  response.headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");

  if (produksi) {
    response.headers.set("strict-transport-security", "max-age=63072000; includeSubDomains");
  }

  return response;
}