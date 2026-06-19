import { describe, expect, it } from "vitest";
import { basicAuth, createTestEnv, request } from "./helpers";

describe("settings api", () => {
  it("gets default settings and saves updates", async () => {
    const { env } = createTestEnv();
    const get = await request("/api/settings", { headers: basicAuth() }, env);
    await expect(get.json()).resolves.toMatchObject({ ok: true, settings: { default_model: "openai/gpt-4o-mini", max_history: 20 } });

    const put = await request("/api/settings", {
      method: "PUT",
      headers: { ...basicAuth(), "Content-Type": "application/json" },
      body: JSON.stringify({ default_model: "openai/gpt-4.1-mini", max_history: 10, session_ttl: 7200 })
    }, env);
    await expect(put.json()).resolves.toMatchObject({ ok: true, settings: { default_model: "openai/gpt-4.1-mini", max_history: 10, session_ttl: 7200 } });
  });

  it("rejects unauthenticated settings access", async () => {
    const { env } = createTestEnv();
    const response = await request("/api/settings", {}, env);
    expect(response.status).toBe(401);
  });
});
