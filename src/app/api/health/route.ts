import { ok } from "@/lib/http/response";

/** Endpoint kesehatan: memverifikasi envelope API + request_id (Gate F2). */
export async function GET(request: Request) {
  return ok(request, {
    status: "ok",
    service: "kuiskita",
    phase: "F2",
    time: new Date().toISOString(),
  });
}
