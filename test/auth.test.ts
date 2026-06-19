import { describe, expect, it } from "vitest";
import { basicAuth, createTestEnv, request } from "./helpers";

describe("auth", () => {
  it("rejects unauthenticated admin and protected API routes", async () => {
    const { env } = createTestEnv();
    const admin = await request("/admin", {}, env);
    const bots = await request("/api/bots", {}, env);
    const keys = await request("/api/keys", {}, env);
    const settings = await request("/api/settings", {}, env);
    expect(admin.status).toBe(401);
    expect(bots.status).toBe(401);
    expect(keys.status).toBe(401);
    expect(settings.status).toBe(401);
  });

  it("allows authenticated admin", async () => {
    const { env } = createTestEnv();
    const response = await request("/admin", { headers: basicAuth() }, env);
    expect(response.status).toBe(200);
  });

  it("does not apply admin auth to webhook routes", async () => {
    const { env } = createTestEnv();
    const response = await request("/api/webhook/missing_bot", { method: "POST", body: "{}" }, env);
    await expect(response.json()).resolves.toMatchObject({ ok: true, skipped: "bot_not_found" });
    expect(response.status).toBe(200);
  });
});
