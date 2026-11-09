import { parseOrFail } from "@/lib/http/validate";
import { emailSchema, usernameSchema } from "@/lib/validation/schemas";
import { z } from "zod";
import { describe, expect, it } from "vitest";

const schema = z.object({ email: emailSchema, username: usernameSchema });

function request(body?: unknown) {
  if (body === undefined) {
    return new Request("http://localhost/api/uji");
  }
  return new Request("http://localhost/api/uji", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("parseOrFail", () => {
  it("mengembalikan data tervalidasi untuk input benar", () => {
    const result = parseOrFail(request(), schema, {
      email: "Rani@Contoh.co.id",
      username: "rani_01",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.email).toBe("rani@contoh.co.id");
      expect(result.data.username).toBe("rani_01");
    }
  });

  it("mengembalikan 400 VALIDATION_ERROR untuk input salah", async () => {
    const result = parseOrFail(request(), schema, { email: "bukan-email", username: "X" });
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.response.status).toBe(400);
    const body = (await result.response.json()) as {
      error: { code: string; message: string };
    };
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toContain("email");
    expect(body.error.message).toContain("username");
  });
});
