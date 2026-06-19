import { describe, expect, it, vi } from "vitest";
import { basicAuth, createBot, createTestEnv, request } from "./helpers";

describe("session streaming", () => {
  it("stores user and assistant messages and enforces max history", async () => {
    const { env } = createTestEnv();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, choices: [{ message: { content: "AI reply" } }] }), {
      headers: { "Content-Type": "application/json" }
    })));

    await createBot(env, { max_history: 2, session_ttl: 120 });
    const first = await request("/api/webhook/test_bot", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": "secret" },
      body: JSON.stringify({ message: { message_id: 1, chat: { id: 42, type: "private" }, from: { id: 7 }, text: "First" } })
    }, env);
    const second = await request("/api/webhook/test_bot", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": "secret" },
      body: JSON.stringify({ message: { message_id: 2, chat: { id: 42, type: "private" }, from: { id: 7 }, text: "Second" } })
    }, env);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const stored = await env.SESSION_KV.get("session:test_bot:42");
    expect(stored).toBeTruthy();
    const session = JSON.parse(stored ?? "{}");
    expect(session.messages.map((entry: { role: string }) => entry.role)).toEqual(["user", "assistant"]);
    expect(session.messages).toHaveLength(2);
    expect(session.messages[0]?.content).toBe("Second");
    expect(session.messages[1]?.content).toBe("AI reply");
    expect(env.SESSION_KV.put).toHaveBeenCalledWith("session:test_bot:42", expect.any(String), { expirationTtl: 120 });
  });
});
