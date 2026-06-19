import { describe, expect, it, vi } from "vitest";
import type { Env } from "../src/types";
import { basicAuth, createBot, createTestEnv, request } from "./helpers";

describe("group modes", () => {
  async function webhook(env: Env, body: Record<string, unknown>) {
    return request("/api/webhook/test_bot", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": "secret" },
      body: JSON.stringify(body)
    }, env);
  }

  it("all processes group messages", async () => {
    const { env } = createTestEnv();
    vi.stubGlobal("fetch", vi.fn(async (input: string) => input.includes("sendMessage") ? telegramOk() : aiOk()));
    await createBot(env, { group_mode: "all" });
    const response = await webhook(env, { message: { message_id: 1, chat: { id: 99, type: "group" }, from: { id: 1 }, text: "Hello" } });
    await expect(response.json()).resolves.toMatchObject({ ok: true });
  });

  it("mention_only skips non-mentions", async () => {
    const { env } = createTestEnv();
    await createBot(env, { group_mode: "mention_only" });
    const response = await webhook(env, { message: { message_id: 1, chat: { id: 99, type: "group" }, from: { id: 1 }, text: "Hello" } });
    await expect(response.json()).resolves.toMatchObject({ ok: true, skipped: "mention_not_found" });
  });

  it("mention_only processes mentions", async () => {
    const { env } = createTestEnv();
    vi.stubGlobal("fetch", vi.fn(async (input: string) => input.includes("sendMessage") ? telegramOk() : aiOk()));
    await createBot(env, { group_mode: "mention_only" });
    const response = await webhook(env, { message: { message_id: 1, chat: { id: 99, type: "group" }, from: { id: 1 }, text: "Hello @test_bot" } });
    await expect(response.json()).resolves.toMatchObject({ ok: true });
  });

  it("admin_only processes configured admins and skips non-admins", async () => {
    const { env } = createTestEnv();
    vi.stubGlobal("fetch", vi.fn(async (input: string) => input.includes("sendMessage") ? telegramOk() : aiOk()));
    await createBot(env, { group_mode: "admin_only", admin_user_ids: [10] });
    const skip = await webhook(env, { message: { message_id: 1, chat: { id: 99, type: "group" }, from: { id: 2 }, text: "Hello" } });
    const process = await webhook(env, { message: { message_id: 2, chat: { id: 99, type: "group" }, from: { id: 10 }, text: "Hello" } });
    await expect(skip.json()).resolves.toMatchObject({ ok: true, skipped: "admin_only_skip" });
    await expect(process.json()).resolves.toMatchObject({ ok: true });
  });

  it("admin_only with no admin IDs returns explicit skipped reason", async () => {
    const { env } = createTestEnv();
    await createBot(env, { group_mode: "admin_only" });
    const response = await webhook(env, { message: { message_id: 1, chat: { id: 99, type: "group" }, from: { id: 2 }, text: "Hello" } });
    await expect(response.json()).resolves.toMatchObject({ ok: true, skipped: "admin_only_not_configured" });
  });
});

function aiOk() {
  return new Response(JSON.stringify({ ok: true, choices: [{ message: { content: "AI reply" } }] }), { headers: { "Content-Type": "application/json" } });
}

function telegramOk() {
  return new Response(JSON.stringify({ ok: true, result: {} }), { headers: { "Content-Type": "application/json" } });
}
