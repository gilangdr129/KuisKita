import { GET } from "./route";
import { describe, expect, it } from "vitest";

function jsonRequest(headers?: Record<string, string>) {
  return new Request("http://localhost/api/health", { headers });
}

describe("GET /api/health", () => {
  it("mengembalikan envelope data + request_id", async () => {
    const response = await GET(jsonRequest());
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      data: { status: string; service: string };
      request_id: string;
    };
    expect(body.data.status).toBe("ok");
    expect(body.data.service).toBe("kuiskita");
    expect(body.request_id).toBeTruthy();
  });

  it("memakai x-request-id dari request bila ada", async () => {
    const response = await GET(jsonRequest({ "x-request-id": "req-uji-123" }));
    const body = (await response.json()) as { request_id: string };
    expect(body.request_id).toBe("req-uji-123");
  });
});
