import { requireAdminAuth } from "./admin-auth";
import {
  createBot,
  createApiKey,
  deleteApiKey,
  deleteBot,
  getBot,
  getBotTelegramToken,
  getBotWebhookSecret,
  listApiKeys,
  listBots,
  maskBot,
  updateBot
} from "./bots";
import { callLlmProvider } from "./llm";
import { jsonResponse, methodNotAllowed, notFound, readJson } from "./response";
import { saveSettings, getSettings } from "./settings";
import { safeEqual } from "./secrets";
import {
  appendSessionMessage,
  getSession,
  getStoredProviderKey,
  getWelcomeText,
  saveSession,
  sendTelegramMessage,
  sessionKey,
  shouldProcessGroupMessage,
  type TelegramMessageUpdate
} from "./telegram";
import type { Env } from "./types";

const adminFallback = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Telegram Bot Platform</title></head>
  <body><div id="root"><h1>Telegram Bot Platform</h1><p>Loading admin UI...</p></div><script type="module" src="/src/main.tsx"></script></body>
</html>`;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return redirect("/admin");
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return handleHealth(env);
    }

    if (request.method === "GET" && (url.pathname === "/admin" || url.pathname === "/admin/" || url.pathname.startsWith("/admin/"))) {
      return serveAdmin(request, env);
    }

    const segments = url.pathname.split("/").filter(Boolean);
    if (segments[0] === "api") {
      return handleApi(request, env, segments);
    }

    if (env.ASSETS?.fetch) {
      return env.ASSETS.fetch(request);
    }

    return notFound();
  }
};

function handleHealth(env: Env): Response {
  const missing: string[] = [];
  for (const binding of ["BOT_REGISTRY", "SESSION_KV", "KEYS_KV", "SETTINGS_KV", "ASSETS"] as const) {
    if (!env[binding]) {
      missing.push(binding);
    }
  }
  if (!env.ADMIN_PASSWORD) {
    missing.push("ADMIN_PASSWORD");
  }

  if (missing.length > 0) {
    return jsonResponse({ status: "misconfigured", missing }, 500);
  }

  return jsonResponse({
    status: "ok",
    bindings: {
      BOT_REGISTRY: true,
      SESSION_KV: true,
      KEYS_KV: true,
      SETTINGS_KV: true,
      ASSETS: true
    },
    admin_password_set: true
  });
}

async function serveAdmin(request: Request, env: Env): Promise<Response> {
  const authError = requireAdminAuth(request, env);
  if (authError) {
    return authError;
  }

  const url = new URL(request.url);
  if (url.pathname === "/admin" || url.pathname === "/admin/") {
    try {
      const assetRequest = new Request(new URL("/admin/index.html", request.url), request);
      const assetResponse = await env.ASSETS.fetch(assetRequest);
      if (assetResponse.status < 500) {
        return assetResponse;
      }
    } catch {
      // Fall through to the static inline shell.
    }
    return new Response(adminFallback, {
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  }

  return env.ASSETS.fetch(request);
}

async function handleApi(request: Request, env: Env, segments: string[]): Promise<Response> {
  try {
    if (segments[1] === "bots") {
      return handleBotsApi(request, env, segments);
    }

    if (segments[1] === "keys") {
      return handleKeysApi(request, env, segments);
    }

    if (segments[1] === "settings") {
      return handleSettingsApi(request, env, segments);
    }

    if (segments[1] === "webhook") {
      return handleWebhook(request, env, segments[2]);
    }
  } catch (error) {
    return jsonResponse({ ok: false, error: error instanceof Error ? error.message : "unknown_error" }, 400);
  }

  return notFound();
}

async function handleBotsApi(request: Request, env: Env, ctx: ExecutionContext, segments: string[]): Promise<Response> {
  const authError = requireAdminAuth(request, env);
  if (authError) {
    return authError;
  }

  if (segments.length === 2) {
    if (request.method === "GET") {
      const bots = await listBots(env);
      return jsonResponse({ ok: true, bots: bots.map(maskBot) });
    }
    if (request.method === "POST") {
      const body = await requireRecord(request);
      const result = await createBot(env, body);
      return jsonResponse(result.response, "status" in result ? result.status : 200);
    }
    return methodNotAllowed();
  }

  if (segments.length === 3) {
    const username = segments[2];
    if (request.method === "GET") {
      const bot = await getBot(env, username);
      return bot ? jsonResponse({ ok: true, bot: maskBot(bot) }) : jsonResponse({ ok: false, error: "bot_not_found" }, 404);
    }
    if (request.method === "PUT") {
      const body = await requireRecord(request);
      const result = await updateBot(env, username, body);
      return jsonResponse(result.response, "status" in result ? result.status : 200);
    }
    if (request.method === "DELETE") {
      const deleted = await deleteBot(env, username);
      return deleted ? jsonResponse({ ok: true, deleted: true }) : jsonResponse({ ok: false, error: "bot_not_found" }, 404);
    }
    return methodNotAllowed();
  }

  if (segments.length === 4) {
    const username = segments[2];
    const action = segments[3];
    if (action === "register-webhook" && request.method === "POST") {
      return registerWebhook(request, env, username);
    }
    if (action === "delete-webhook" && request.method === "POST") {
      return deleteWebhook(env, username);
    }
    if (action === "webhook-info" && request.method === "GET") {
      return webhookInfo(env, username);
    }
  }

  return notFound();
}

async function handleKeysApi(request: Request, env: Env, segments: string[]): Promise<Response> {
  const authError = requireAdminAuth(request, env);
  if (authError) {
    return authError;
  }

  if (segments.length === 2) {
    if (request.method === "GET") {
      const keys = await listApiKeys(env);
      return jsonResponse({ ok: true, keys: keys.map((key) => ({ id: key.id, name: key.name, provider: key.provider, key_set: key.key_set })) });
    }
    if (request.method === "POST") {
      const body = await requireRecord(request);
      const result = await createApiKey(env, body);
      return jsonResponse(result.response, "status" in result ? result.status : 200);
    }
    return methodNotAllowed();
  }

  if (segments.length === 3 && segments[2]) {
    if (request.method === "DELETE") {
      const deleted = await deleteApiKey(env, segments[2]);
      return deleted ? jsonResponse({ ok: true, deleted: true }) : jsonResponse({ ok: false, error: "key_not_found" }, 404);
    }
  }

  return methodNotAllowed();
}

async function handleSettingsApi(request: Request, env: Env, segments: string[]): Promise<Response> {
  const authError = requireAdminAuth(request, env);
  if (authError) {
    return authError;
  }

  if (segments.length !== 2) {
    return notFound();
  }

  if (request.method === "GET") {
    return jsonResponse({ ok: true, settings: await getSettings(env) });
  }

  if (request.method === "PUT") {
    const body = await requireRecord(request);
    const settings = await saveSettings(env, body);
    return jsonResponse({ ok: true, settings });
  }

  return methodNotAllowed();
}

async function handleWebhook(request: Request, env: Env, username: string | undefined): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed();
  }

  if (!username) {
    return jsonResponse({ ok: false, error: "missing_bot_username" }, 400);
  }

  const body = await readJson(request).catch(() => ({}));
  const update = body as TelegramMessageUpdate;
  const bot = await getBot(env, username);
  if (!bot) {
    return jsonResponse({ ok: true, skipped: "bot_not_found" });
  }

  if (!bot.is_active) {
    return jsonResponse({ ok: true, skipped: "bot_inactive" });
  }

  const expectedSecret = await getBotWebhookSecret(env, bot);
  if (expectedSecret && !safeEqual(request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "", expectedSecret)) {
    return jsonResponse({ ok: false, error: "invalid_webhook_secret" }, 401);
  }

  const message = update.message ?? update.edited_message;
  if (!message) {
    return jsonResponse({ ok: true, skipped: "unsupported_update" });
  }

  const groupDecision = shouldProcessGroupMessage(bot, update);
  if (!groupDecision.process) {
    return jsonResponse({ ok: true, skipped: groupDecision.skipped ?? "unsupported_update" });
  }

  const text = message.text ?? "";
  if (!text) {
    return jsonResponse({ ok: true, skipped: "unsupported_update" });
  }

  if (text === "/start") {
    const welcomeText = getWelcomeText(bot);
    const sendResult = await sendTelegramMessage(bot, await getBotTelegramToken(env, bot), message.chat.id, welcomeText);
    if (!sendResult.ok) {
      return jsonResponse({ ok: false, error: sendResult.error ?? "telegram_send_error", telegram_status: sendResult.status }, 502);
    }
    return jsonResponse({ ok: true, action: "welcome" });
  }

  const session = await getSession(env, bot, message.chat.id);
  const sessionText = session.messages.map((entry) => `${entry.role}: ${entry.content}`).join("\n");
  let assistantText = "";
  try {
    const providerKey = await getStoredProviderKey(env, bot);
    assistantText = await callLlmProvider(bot, providerKey, text, sessionText);
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: "llm_error",
        message: error instanceof Error ? error.message : "llm_provider_error"
      },
      502
    );
  }

  const nextSession = appendSessionMessage(appendSessionMessage(session, "user", text, bot.max_history), "assistant", assistantText, bot.max_history);
  await saveSession(env, bot, message.chat.id, nextSession);

  const sendResult = await sendTelegramMessage(bot, await getBotTelegramToken(env, bot), message.chat.id, assistantText);
  if (!sendResult.ok) {
    return jsonResponse({ ok: false, error: sendResult.error ?? "telegram_send_error", telegram_status: sendResult.status }, 502);
  }

  return jsonResponse({ ok: true, session_key: sessionKey(bot.username, message.chat.id) });
}

async function registerWebhook(request: Request, env: Env, username: string): Promise<Response> {
  const bot = await getBot(env, username);
  if (!bot) {
    return jsonResponse({ ok: false, error: "bot_not_found" }, 404);
  }

  const webhookUrl = new URL(`/api/webhook/${encodeURIComponent(username)}`, request.url);
  const secret = await getBotWebhookSecret(env, bot);
  const body: Record<string, string> = { url: webhookUrl.toString() };
  if (secret) {
    body.secret_token = secret;
  }

  const response = await fetch(`https://api.telegram.org/bot${encodeURIComponent(await getBotTelegramToken(env, bot))}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok || responseBody.ok === false) {
    return jsonResponse({ ok: false, error: "telegram_webhook_error", telegram_response: responseBody }, 502);
  }
  return jsonResponse({ ok: true, webhook: responseBody });
}

async function deleteWebhook(env: Env, username: string): Promise<Response> {
  const bot = await getBot(env, username);
  if (!bot) {
    return jsonResponse({ ok: false, error: "bot_not_found" }, 404);
  }

  const response = await fetch(`https://api.telegram.org/bot${encodeURIComponent(await getBotTelegramToken(env, bot))}/deleteWebhook`, {
    method: "POST"
  });
  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok || responseBody.ok === false) {
    return jsonResponse({ ok: false, error: "telegram_webhook_error", telegram_response: responseBody }, 502);
  }
  return jsonResponse({ ok: true, webhook: responseBody });
}

async function webhookInfo(env: Env, username: string): Promise<Response> {
  const bot = await getBot(env, username);
  if (!bot) {
    return jsonResponse({ ok: false, error: "bot_not_found" }, 404);
  }

  const response = await fetch(`https://api.telegram.org/bot${encodeURIComponent(await getBotTelegramToken(env, bot))}/getWebhookInfo`);
  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok || responseBody.ok === false) {
    return jsonResponse({ ok: false, error: "telegram_webhook_error", telegram_response: responseBody }, 502);
  }
  return jsonResponse({ ok: true, webhook: responseBody });
}

async function requireRecord(request: Request): Promise<Record<string, unknown>> {
  const body = await readJson(request);
  if (!isRecord(body)) {
    throw new Error("invalid_json_object");
  }
  return body;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { Location: location } });
}
