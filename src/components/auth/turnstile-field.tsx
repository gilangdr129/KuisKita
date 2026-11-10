/**
 * Slot Turnstile (F18). Widget Cloudflare dipasang penuh di F18; sekarang
 * hanya menyiapkan field tersembunyi agar kontrak form & validasi server
 * tidak berubah saat itu.
 */
export function TurnstileField() {
  return (
    <div data-testid="turnstile-slot" aria-hidden="true">
      <input type="hidden" name="turnstile_token" value="" />
    </div>
  );
}
