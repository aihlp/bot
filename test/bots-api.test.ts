import { describe, expect, it } from "vitest";
import { basicAuth, createBot, createTestEnv, request } from "./helpers";

describe("bots api", () => {
  it("creates, lists, gets, updates, and deletes bots", async () => {
    const { env } = createTestEnv();
    await createBot(env);

    const list = await request("/api/bots", { headers: basicAuth() }, env);
    await expect(list.json()).resolves.toMatchObject({ ok: true, bots: [{ username: "test_bot", telegram_token_set: true }] });

    const get = await request("/api/bots/test_bot", { headers: basicAuth() }, env);
    await expect(get.json()).resolves.toMatchObject({ ok: true, bot: { username: "test_bot", is_active: true } });

    const update = await request("/api/bots/test_bot", {
      method: "PUT",
      headers: { ...basicAuth(), "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: false, system_prompt: "Updated prompt." })
    }, env);
    await expect(update.json()).resolves.toMatchObject({ username: "test_bot", is_active: false });

    const deleted = await request("/api/bots/test_bot", { method: "DELETE", headers: basicAuth() }, env);
    await expect(deleted.json()).resolves.toMatchObject({ ok: true, deleted: true });
  });

  it("never returns raw telegram tokens", async () => {
    const { env } = createTestEnv();
    const response = await request("/api/bots", {
      method: "POST",
      headers: { ...basicAuth(), "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "secret_bot",
        telegram_token: "telegram-super-secret-token",
        is_active: true
      })
    }, env);
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).not.toContain("telegram-super-secret-token");
    expect(body).toContain("telegram_token_set");
  });

  it("rejects invalid bot configuration", async () => {
    const { env } = createTestEnv();
    const response = await request("/api/bots", {
      method: "POST",
      headers: { ...basicAuth(), "Content-Type": "application/json" },
      body: JSON.stringify({ username: "bad name", telegram_token: "token" })
    }, env);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: "invalid_bot_config" });
    expect(response.status).toBe(400);
  });
});
