import { GET } from "./route";
import { describe, expect, it } from "vitest";

describe("GET /api/health", () => {
  it("mengembalikan status ok", async () => {
    const response = await GET();
    expect(response.status).toBe(200);

    const body = (await response.json()) as { status: string; service: string };
    expect(body.status).toBe("ok");
    expect(body.service).toBe("kuiskita");
  });
});
