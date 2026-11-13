import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";


/** Keep-alive harian: satu query ringan agar Supabase Free tidak menjeda proyek. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Otorisasi cron tidak valid.",
        },
      },
      { status: 401 },
    );
  }

  try {
    const supabase = getServiceSupabase();
    const { error } = await supabase.from("categories").select("id").limit(1);
    if (error) {
      return NextResponse.json(
        {
          error: {
            code: "KEEP_ALIVE_FAILED",
            message: error.message,
          },
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      status: "ok",
      task: "supabase-keep-alive",
      time: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "KEEP_ALIVE_FAILED",
          message: error instanceof Error ? error.message : "Kesalahan tak terduga.",
        },
      },
      { status: 500 },
    );
  }
}
