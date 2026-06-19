import { afterEach, describe, expect, it, vi } from "vitest";
import { basicAuth, createBot, createTestEnv, request } from "./helpers";

describe("webhook", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns controlled error for missing username", async () => {
    const { env } = createTestEnv();
    const response = await request("/api/webhook/", { method: "POST", body: "{}" }, env);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: "missing_bot_username" });
    expect(response.status).toBe(400);
  });

  it("skips bot not found", async () => {
    const { env } = createTestEnv();
    const response = await request("/api/webhook/missing_bot", { method: "POST", body: "{}" }, env);
    await expect(response.json()).resolves.toMatchObject({ ok: true, skipped: "bot_not_found" });
  });

  it("skips inactive bots", async () => {
    const { env } = createTestEnv();
    await createBot(env, { is_active: false, webhook_secret: "secret" });
    const response = await request("/api/webhook/test_bot", { method: "POST", body: "{}" }, env);
    await expect(response.json()).resolves.toMatchObject({ ok: true, skipped: "bot_inactive" });
  });

  it("rejects invalid webhook secret", async () => {
    const { env } = createTestEnv();
    await createBot(env, { webhook_secret: "secret" });
    const response = await request("/api/webhook/test_bot", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": "wrong" },
      body: "{}"
    }, env);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: "invalid_webhook_secret" });
    expect(response.status).toBe(401);
  });

  it("skips unsupported updates without undefined branches", async () => {
    const { env } = createTestEnv();
    await createBot(env, { webhook_secret: "secret" });
    const response = await request("/api/webhook/test_bot", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": "secret" },
      body: JSON.stringify({ callback_query: { id: "1" } })
    }, env);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, skipped: "unsupported_update" });
    expect(body).not.toBeUndefined();
  });

  it("replies to /start with the welcome message", async () => {
    const { env } = createTestEnv();
    const fetchMock = vi.fn(async () => telegramOk());
    vi.stubGlobal("fetch", fetchMock);
    await createBot(env, { webhook_secret: "secret", welcome_messages: [{ lang: "en", text: "Test bot is online." }] });
    const response = await request("/api/webhook/test_bot", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": "secret" },
      body: JSON.stringify({ message: { message_id: 1, chat: { id: 42, type: "private" }, from: { id: 7 }, text: "/start" } })
    }, env);
    await expect(response.json()).resolves.toMatchObject({ ok: true, action: "welcome" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstCall = fetchMock.mock.calls[0];
    expect(firstCall?.[0]).toEqual(expect.stringContaining("sendMessage"));
    expect(JSON.parse(String(firstCall?.[1]?.body))).toMatchObject({ text: "Test bot is online\\." });
  });

  it("processes normal messages with AI and saves session", async () => {
    const { env } = createTestEnv();
    vi.stubGlobal("fetch", vi.fn(async (input: string) => input.includes("chat/completions") ? aiOk() : telegramOk()));
    await createBot(env, { webhook_secret: "secret" });
    const response = await request("/api/webhook/test_bot", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": "secret" },
      body: JSON.stringify({ message: { message_id: 1, chat: { id: 42, type: "private" }, from: { id: 7 }, text: "Say hello." } })
    }, env);
    await expect(response.json()).resolves.toMatchObject({ ok: true });
    expect(await env.SESSION_KV.get("session:test_bot:42")).toBeTruthy();
  });

  it("returns controlled JSON for AI provider errors", async () => {
    const { env } = createTestEnv();
    vi.stubGlobal("fetch", vi.fn(async (input: string) => input.includes("chat/completions") ? new Response("boom", { status: 500 }) : telegramOk()));
    await createBot(env, { webhook_secret: "secret" });
    const response = await request("/api/webhook/test_bot", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": "secret" },
      body: JSON.stringify({ message: { message_id: 1, chat: { id: 42, type: "private" }, from: { id: 7 }, text: "Say hello." } })
    }, env);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: "llm_error" });
    expect(response.status).toBe(502);
  });

  it("returns controlled JSON for Telegram send errors", async () => {
    const { env } = createTestEnv();
    vi.stubGlobal("fetch", vi.fn(async (input: string) => input.includes("sendMessage") ? telegramFail() : aiOk()));
    await createBot(env, { webhook_secret: "secret" });
    const response = await request("/api/webhook/test_bot", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": "secret" },
      body: JSON.stringify({ message: { message_id: 1, chat: { id: 42, type: "private" }, from: { id: 7 }, text: "Say hello." } })
    }, env);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: "telegram_send_error" });
    expect(response.status).toBe(502);
  });
});

function aiOk() {
  return new Response(JSON.stringify({ ok: true, choices: [{ message: { content: "AI reply" } }] }), { headers: { "Content-Type": "application/json" } });
}

function telegramOk() {
  return new Response(JSON.stringify({ ok: true, result: {} }), { headers: { "Content-Type": "application/json" } });
}

function telegramFail() {
  return new Response(JSON.stringify({ ok: false, error_code: 400, description: "bad request" }), { status: 400, headers: { "Content-Type": "application/json" } });
}
