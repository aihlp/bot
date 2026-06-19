import { getJson, listJson, putJson, deleteKey } from "./kv";
import { decryptSecret, encryptSecret } from "./secrets";
import type { BotConfig, Env, GroupMode, KeyProvider, StoredApiKey } from "./types";

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,32}$/;

export function botKey(username: string): string {
  return `bot:${username}`;
}

export function keyRecordKey(id: string): string {
  return `key:${id}`;
}

export function normalizeBotInput(input: Record<string, unknown>, defaults: Partial<BotConfig> = {}): BotConfig | null {
  const username = typeof input.username === "string" ? input.username.trim() : "";
  if (!USERNAME_PATTERN.test(username)) {
    return null;
  }

  const groupMode = input.group_mode ?? defaults.group_mode ?? "all";
  if (!isGroupMode(groupMode)) {
    return null;
  }

  const modelParams = isRecord(input.model_params) ? input.model_params : {};
  const adminUserIds = Array.isArray(input.admin_user_ids)
    ? input.admin_user_ids.filter((id): id is number => typeof id === "number" && Number.isInteger(id))
    : Array.isArray(defaults.admin_user_ids)
      ? defaults.admin_user_ids
      : undefined;
  const mentionTrigger = typeof input.mention_trigger === "string"
    ? input.mention_trigger || undefined
    : typeof defaults.mention_trigger === "string"
      ? defaults.mention_trigger
      : undefined;
  const llmKeyId = typeof input.llm_key_id === "string"
    ? input.llm_key_id || undefined
    : typeof defaults.llm_key_id === "string"
      ? defaults.llm_key_id
      : undefined;

  const next: BotConfig = {
    username,
    telegram_token_encrypted_or_secret_ref: defaults.telegram_token_encrypted_or_secret_ref ?? "",
    telegram_token_set: defaults.telegram_token_set ?? false,
    is_active: typeof input.is_active === "boolean" ? input.is_active : defaults.is_active ?? false,
    webhook_secret_set: defaults.webhook_secret_set ?? false,
    model: typeof input.model === "string" && input.model.trim() ? input.model.trim() : defaults.model ?? "openai/gpt-4o-mini",
    system_prompt: typeof input.system_prompt === "string" ? input.system_prompt : defaults.system_prompt ?? "You are a helpful assistant.",
    default_language: typeof input.default_language === "string" && input.default_language.trim() ? input.default_language.trim() : defaults.default_language ?? "en",
    welcome_messages: Array.isArray(input.welcome_messages)
      ? input.welcome_messages
          .filter((item): item is { lang: string; text: string } => isRecord(item) && typeof item.lang === "string" && typeof item.text === "string")
          .map((item) => ({ lang: item.lang, text: item.text }))
      : defaults.welcome_messages ?? [{ lang: "en", text: "Hello. How can I help?" }],
    max_history: clampNumber(input.max_history, defaults.max_history, 1, 200),
    session_ttl: clampNumber(input.session_ttl, defaults.session_ttl, 60, 604800),
    group_mode: groupMode,
    reply_to_mentions: typeof input.reply_to_mentions === "boolean" ? input.reply_to_mentions : defaults.reply_to_mentions ?? true,
    model_params: {
      temperature: clampNumber(modelParams.temperature, defaults.model_params?.temperature, 0, 2),
      max_tokens: clampNumber(modelParams.max_tokens, defaults.model_params?.max_tokens, 1, 16000),
      top_p: clampNumber(modelParams.top_p, defaults.model_params?.top_p, 0, 1),
      frequency_penalty: clampNumber(modelParams.frequency_penalty, defaults.model_params?.frequency_penalty, -2, 2),
      presence_penalty: clampNumber(modelParams.presence_penalty, defaults.model_params?.presence_penalty, -2, 2)
    },
    streaming: typeof input.streaming === "boolean" ? input.streaming : defaults.streaming ?? true,
    created_at: defaults.created_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  if (adminUserIds) {
    next.admin_user_ids = adminUserIds;
  }
  if (mentionTrigger !== undefined) {
    next.mention_trigger = mentionTrigger;
  }
  if (llmKeyId !== undefined) {
    next.llm_key_id = llmKeyId;
  }

  if (typeof input.telegram_token === "string") {
    next.telegram_token_set = true;
  }

  return next;
}

export async function createBot(env: Env, input: Record<string, unknown>): Promise<{ bot: BotConfig; response: unknown } | { response: unknown; status: number }> {
  const existing = await getJson<BotConfig>(env.BOT_REGISTRY, botKey(String(input.username ?? "")));
  if (existing) {
    return { response: { ok: false, error: "bot_exists" }, status: 409 };
  }

  const normalized = normalizeBotInput(input, {
    max_history: 20,
    session_ttl: 3600,
    welcome_messages: [{ lang: "en", text: "Test bot is online." }]
  });

  if (!normalized) {
    return { response: { ok: false, error: "invalid_bot_config" }, status: 400 };
  }

  if (typeof input.telegram_token !== "string" || !input.telegram_token) {
    return { response: { ok: false, error: "telegram_token_required" }, status: 400 };
  }

  normalized.telegram_token_encrypted_or_secret_ref = await encryptSecret(input.telegram_token, env);
  normalized.telegram_token_set = true;

  if (typeof input.webhook_secret === "string" && input.webhook_secret.length > 0) {
    normalized.webhook_secret_encrypted_or_hash = await encryptSecret(input.webhook_secret, env);
    normalized.webhook_secret_set = true;
  }

  await putJson(env.BOT_REGISTRY, botKey(normalized.username), normalized);
  return { bot: normalized, response: maskBot(normalized) };
}

export async function updateBot(env: Env, username: string, input: Record<string, unknown>): Promise<{ bot: BotConfig; response: unknown } | { response: unknown; status: number }> {
  const existing = await getJson<BotConfig>(env.BOT_REGISTRY, botKey(username));
  if (!existing) {
    return { response: { ok: false, error: "bot_not_found" }, status: 404 };
  }

  const normalized = normalizeBotInput({ ...input, username }, existing);
  if (!normalized) {
    return { response: { ok: false, error: "invalid_bot_config" }, status: 400 };
  }

  if (typeof input.telegram_token === "string") {
    normalized.telegram_token_encrypted_or_secret_ref = await encryptSecret(input.telegram_token, env);
    normalized.telegram_token_set = true;
  } else {
    normalized.telegram_token_encrypted_or_secret_ref = existing.telegram_token_encrypted_or_secret_ref;
    normalized.telegram_token_set = existing.telegram_token_set;
  }

  if (typeof input.webhook_secret === "string") {
    normalized.webhook_secret_set = input.webhook_secret.length > 0;
    if (input.webhook_secret.length > 0) {
      normalized.webhook_secret_encrypted_or_hash = await encryptSecret(input.webhook_secret, env);
    } else {
      delete normalized.webhook_secret_encrypted_or_hash;
    }
  } else {
    normalized.webhook_secret_set = existing.webhook_secret_set;
    normalized.webhook_secret_encrypted_or_hash = existing.webhook_secret_encrypted_or_hash;
  }

  await putJson(env.BOT_REGISTRY, botKey(username), normalized);
  return { bot: normalized, response: maskBot(normalized) };
}

export async function getBot(env: Env, username: string): Promise<BotConfig | null> {
  return getJson<BotConfig>(env.BOT_REGISTRY, botKey(username));
}

export async function listBots(env: Env): Promise<BotConfig[]> {
  return listJson<BotConfig>(env.BOT_REGISTRY, "bot:");
}

export async function deleteBot(env: Env, username: string): Promise<boolean> {
  const existing = await getBot(env, username);
  if (!existing) {
    return false;
  }
  await deleteKey(env.BOT_REGISTRY, botKey(username));
  return true;
}

export function maskBot(bot: BotConfig): Record<string, unknown> {
  const {
    telegram_token_encrypted_or_secret_ref: _telegramToken,
    webhook_secret_encrypted_or_hash: _webhookSecret,
    ...publicBot
  } = bot;
  return publicBot;
}

export async function getBotTelegramToken(env: Env, bot: BotConfig): Promise<string> {
  if (!bot.telegram_token_set || !bot.telegram_token_encrypted_or_secret_ref) {
    throw new Error("telegram_token_missing");
  }
  return decryptSecret(bot.telegram_token_encrypted_or_secret_ref, env);
}

export async function getBotWebhookSecret(env: Env, bot: BotConfig): Promise<string> {
  if (!bot.webhook_secret_set || !bot.webhook_secret_encrypted_or_hash) {
    return "";
  }
  return decryptSecret(bot.webhook_secret_encrypted_or_hash, env);
}

export async function createApiKey(env: Env, input: Record<string, unknown>): Promise<{ key: StoredApiKey; response: unknown } | { response: unknown; status: number }> {
  const name = typeof input.name === "string" && input.name.trim() ? input.name.trim() : "";
  const provider = input.provider ?? "openrouter";
  const key = typeof input.key === "string" ? input.key : "";
  if (!name || !key || !isProvider(provider)) {
    return { response: { ok: false, error: "invalid_key_config" }, status: 400 };
  }

  const stored: StoredApiKey = {
    id: crypto.randomUUID(),
    name,
    provider,
    key_encrypted_or_secret_ref: await encryptSecret(key, env),
    key_set: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  await putJson(env.KEYS_KV, keyRecordKey(stored.id), stored);
  return { key: stored, response: maskKey(stored) };
}

export async function listApiKeys(env: Env): Promise<StoredApiKey[]> {
  return listJson<StoredApiKey>(env.KEYS_KV, "key:");
}

export async function deleteApiKey(env: Env, id: string): Promise<boolean> {
  const existing = await getJson<StoredApiKey>(env.KEYS_KV, keyRecordKey(id));
  if (!existing) {
    return false;
  }
  await deleteKey(env.KEYS_KV, keyRecordKey(id));
  return true;
}

export function maskKey(key: StoredApiKey): Record<string, unknown> {
  const { key_encrypted_or_secret_ref: _encryptedKey, ...publicKey } = key;
  return publicKey;
}

export async function getApiKey(env: Env, id: string): Promise<StoredApiKey | null> {
  return getJson<StoredApiKey>(env.KEYS_KV, keyRecordKey(id));
}

function isGroupMode(value: unknown): value is GroupMode {
  return value === "all" || value === "mention_only" || value === "admin_only";
}

function isProvider(value: unknown): value is KeyProvider {
  return value === "openrouter" || value === "openai" || value === "anthropic" || value === "custom";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampNumber(value: unknown, fallback: number | undefined, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback ?? min;
  }
  return Math.min(max, Math.max(min, Math.trunc(value)));
}
