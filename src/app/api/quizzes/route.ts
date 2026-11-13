import { ok } from "@/lib/http/response";
import { parseOrFail } from "@/lib/http/validate";
import { quizFiltersSchema } from "@/lib/validation/schemas";
import { getServiceSupabase } from "@/lib/supabase/server";

/** GET /api/quizzes — katalog publik (filter, sortir, paginasi kursor). */
export async function GET(request: Request) {
  const url = new URL(request.url);

  const parsed = parseOrFail(
    request,
    quizFiltersSchema,
    {
      kategori: url.searchParams.get("kategori") ?? undefined,
      kesulitan: url.searchParams.get("kesulitan") ?? undefined,
      durasi: url.searchParams.get("durasi") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
      sortir: url.searchParams.get("sortir") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      cursor: url.searchParams.get("cursor") ?? undefined,
    },
  );
  if (!parsed.ok) return parsed.response;

  const supabase = getServiceSupabase();
  const { data, error } = await supabase.rpc("list_quizzes", {
    p_kategori: parsed.data.kategori ?? null,
    p_kesulitan: parsed.data.kesulitan ?? null,
    p_durasi: parsed.data.durasi ?? null,
    p_q: parsed.data.q ?? null,
    p_sortir: parsed.data.sortir,
    p_limit: parsed.data.limit,
    p_cursor: parsed.data.cursor ?? null,
  });

  if (error) {
    return ok(request, { items: [], next_cursor: null, has_more: false });
  }

  const hasil = data as { items: KatalogItem[]; next_cursor: unknown; has_more: boolean };
  return ok(request, {
    items: hasil.items ?? [],
    // Kursor sebagai string JSON agar bisa dikirim balik sebagai query param.
    next_cursor: hasil.next_cursor ? JSON.stringify(hasil.next_cursor) : null,
    has_more: Boolean(hasil.has_more),
  });
}

type KatalogItem = {
  id: string;
  judul: string;
};