import { fail, getRequestId, ok } from "@/lib/http/response";
import { describe, expect, it } from "vitest";

function request(headers?: Record<string, string>) {
  return new Request("http://localhost/api/uji", { headers });
}

describe("helper respons API", () => {
  it("ok() membungkus data dengan envelope + request_id", async () => {
    const response = ok(request(), { halo: "dunia" });
    expect(response.status).toBe(200);

    const body = (await response.json()) as { data: { halo: string }; request_id: string };
    expect(body.data.halo).toBe("dunia");
    expect(body.request_id).toBeTruthy();
  });

  it("ok() meneruskan header x-request-id", async () => {
    const response = ok(request({ "x-request-id": "abc-123" }), {});
    const body = (await response.json()) as { request_id: string };
    expect(body.request_id).toBe("abc-123");
  });

  it("fail() memakai status, kode, pesan, dan request_id yang konsisten", async () => {
    const response = fail(request(), 409, "ATTEMPT_ACTIVE", "Sudah ada percobaan aktif.");
    expect(response.status).toBe(409);

    const body = (await response.json()) as {
      error: { code: string; message: string; request_id: string };
    };
    expect(body.error.code).toBe("ATTEMPT_ACTIVE");
    expect(body.error.message).toBe("Sudah ada percobaan aktif.");
    expect(body.error.request_id).toBeTruthy();
  });

  it("getRequestId() membuat UUID baru bila header tidak ada", () => {
    expect(getRequestId(request())).toMatch(/^[0-9a-f-]{36}$/);
    expect(getRequestId(request({ "x-vercel-id": "vercel-1" }))).toBe("vercel-1");
  });
});
