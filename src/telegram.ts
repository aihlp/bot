import { decryptSecret } from "./secrets";
import type { BotConfig, Env, SessionState } from "./types";

export interface TelegramMessageUpdate {
  message?: {
    message_id: number;
    chat: { id: number; type: string; title?: string };
    from?: { id: number; username?: string; is_bot?: boolean };
    text?: string;
    entities?: Array<{ type: string; offset: number; length: number; user?: { username?: string } }>;
  };
  edited_message?: TelegramMessageUpdate["message"];
}

const markdownSpecialCharacters = /([_*[\]()~`>#+\-=|{}.!])/g;

export function escapeMarkdownV2(text: string): string {
  return text.replace(markdownSpecialCharacters, "\\$1");
}

export function getWelcomeText(bot: BotConfig): string {
  const message = bot.welcome_messages.find((item) => item.lang === bot.default_language) ?? bot.welcome_messages[0];
  return message?.text ?? "Hello. How can I help?";
}

export function shouldProcessGroupMessage(bot: BotConfig, update: TelegramMessageUpdate): { process: boolean; skipped?: string } {
  const message = update.message ?? update.edited_message;
  if (!message) {
    return { process: false, skipped: "unsupported_update" };
  }

  const isGroup = message.chat.type === "group" || message.chat.type === "supergroup";
  if (!isGroup) {
    return { process: true };
  }

  if (bot.group_mode === "all") {
    return { process: true };
  }

  if (bot.group_mode === "mention_only") {
    const text = message.text ?? "";
    const mentionTrigger = bot.mention_trigger ?? `@${bot.username}`;
    const hasMention = text.includes(mentionTrigger) || Boolean(message.entities?.some((entity) => entity.type === "mention"));
    return hasMention ? { process: true } : { process: false, skipped: "mention_not_found" };
  }

  if (!bot.admin_user_ids || bot.admin_user_ids.length === 0) {
    return { process: false, skipped: "admin_only_not_configured" };
  }

  return bot.admin_user_ids.includes(message.from?.id ?? -1)
    ? { process: true }
    : { process: false, skipped: "admin_only_skip" };
}

export async function sendTelegramMessage(bot: BotConfig, token: string, chatId: number, text: string): Promise<{ ok: boolean; status: number; error?: string }> {
  const escapedText = escapeMarkdownV2(text);
  const response = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: escapedText,
      parse_mode: "MarkdownV2",
      disable_web_page_preview: true
    })
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) {
    return { ok: false, status: response.status, error: "telegram_send_error" };
  }
  return { ok: true, status: response.status };
}

export async function getSession(env: Env, bot: BotConfig, chatId: number): Promise<SessionState> {
  const key = sessionKey(bot.username, chatId);
  const stored = await env.SESSION_KV.get(key);
  if (!stored) {
    return { messages: [], updated_at: new Date().toISOString() };
  }
  return JSON.parse(stored) as SessionState;
}

export async function saveSession(env: Env, bot: BotConfig, chatId: number, session: SessionState): Promise<void> {
  await env.SESSION_KV.put(sessionKey(bot.username, chatId), JSON.stringify(session), { expirationTtl: bot.session_ttl });
}

export function appendSessionMessage(session: SessionState, role: "user" | "assistant" | "system", content: string, maxHistory: number): SessionState {
  const messages = [
    ...session.messages,
    { role, content, created_at: new Date().toISOString() }
  ].slice(-maxHistory);
  return { messages, updated_at: new Date().toISOString() };
}

export function sessionKey(botUsername: string, chatId: number): string {
  return `session:${botUsername}:${chatId}`;
}

export async function getStoredProviderKey(env: Env, bot: BotConfig): Promise<string> {
  if (!bot.llm_key_id) {
    return env.LLM_PROVIDER_API_KEY ?? "";
  }

  const storedKey = await env.KEYS_KV.get(`key:${bot.llm_key_id}`);
  if (!storedKey) {
    return "";
  }

  const parsed = JSON.parse(storedKey) as { key_encrypted_or_secret_ref: string; key_set: boolean };
  if (!parsed.key_set) {
    return "";
  }
  return decryptSecret(parsed.key_encrypted_or_secret_ref, env);
}
