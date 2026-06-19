import { vi } from "vitest";
import worker from "../src/index";
import type { Env } from "../src/types";
import type { KVNamespace, KVNamespacePutOptions } from "@cloudflare/workers-types";

export interface MockKV extends KVNamespace<string> {
  _map: Map<string, string>;
  put: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
}

export interface TestContext {
  env: Env;
  kv: Record<"BOT_REGISTRY" | "SESSION_KV" | "KEYS_KV" | "SETTINGS_KV", MockKV>;
  ctx: ExecutionContext;
}

export function createTestEnv(overrides: Partial<Env> = {}): TestContext {
  const kv = (map = new Map<string, string>()): MockKV => ({
    _map: map,
    get: vi.fn(async (key: string) => map.get(key) ?? null),
    put: vi.fn(async (key: string, value: string, options?: KVNamespacePutOptions) => {
      map.set(key, value);
      return Promise.resolve();
    }),
    delete: vi.fn(async (key: string) => {
      map.delete(key);
      return Promise.resolve();
    }),
    list: vi.fn(async () => ({
      keys: [...map.keys()].map((name) => ({ name }))
    }))
  });

  const botRegistry = kv();
  const sessionKv = kv();
  const keysKv = kv();
  const settingsKv = kv();
  const assets = {
    fetch: vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url, "http://assets.test");
      if (url.pathname === "/admin/index.html" || url.pathname.startsWith("/admin/")) {
        return new Response("<html>admin</html>", { headers: { "Content-Type": "text/html" } });
      }
      if (url.pathname.startsWith("/assets/")) {
        return new Response("asset", { headers: { "Content-Type": url.pathname.endsWith(".css") ? "text/css" : "text/javascript" } });
      }
      return new Response("not found", { status: 404 });
    })
  };

  return {
    kv: { BOT_REGISTRY: botRegistry, SESSION_KV: sessionKv, KEYS_KV: keysKv, SETTINGS_KV: settingsKv },
    ctx: { waitUntil: vi.fn((promise: Promise<unknown>) => promise), passThroughOnException: vi.fn() },
    env: {
      BOT_REGISTRY: botRegistry,
      SESSION_KV: sessionKv,
      KEYS_KV: keysKv,
      SETTINGS_KV: settingsKv,
      ASSETS: assets as Env["ASSETS"],
      ADMIN_PASSWORD: "admin-password",
      LLM_PROVIDER_API_KEY: "llm-test-key",
      ENVIRONMENT: "test",
      ...overrides
    }
  };
}

export async function request(path: string, init: RequestInit = {}, env = createTestEnv().env): Promise<Response> {
  const { env: contextEnv, ctx } = createTestEnv();
  const targetEnv = env === contextEnv ? env : { ...contextEnv.env, ...env };
  return worker.fetch(new Request(new URL(path, "http://localhost"), init), targetEnv as Env, ctx);
}

export function basicAuth(password = "admin-password"): HeadersInit {
  return { Authorization: `Basic ${btoa(`admin:${password}`)}` };
}

export async function createBot(env: Env, overrides: Record<string, unknown> = {}): Promise<unknown> {
  const response = await request("/api/bots", {
    method: "POST",
    headers: { ...basicAuth(), "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "test_bot",
      telegram_token: "telegram-token",
      is_active: true,
      model: "openai/gpt-4o-mini",
      system_prompt: "You are a helpful assistant.",
      default_language: "en",
      welcome_messages: [{ lang: "en", text: "Test bot is online." }],
      max_history: 20,
      session_ttl: 3600,
      group_mode: "all",
      reply_to_mentions: true,
      streaming: true,
      ...overrides
    })
  }, env);
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function createStoredKey(env: Env, id = "key-1"): Promise<unknown> {
  const response = await request("/api/keys", {
    method: "POST",
    headers: { ...basicAuth(), "Content-Type": "application/json" },
    body: JSON.stringify({ id, name: "OpenRouter test key", provider: "openrouter", key: "provider-key" })
  }, env);
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}
