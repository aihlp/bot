import type { Fetcher, KVNamespace } from "@cloudflare/workers-types";

export type GroupMode = "all" | "mention_only" | "admin_only";
export type KeyProvider = "openrouter" | "openai" | "anthropic" | "custom";

export interface Env {
  BOT_REGISTRY: KVNamespace<string>;
  SESSION_KV: KVNamespace<string>;
  KEYS_KV: KVNamespace<string>;
  SETTINGS_KV: KVNamespace<string>;
  ASSETS: Fetcher;
  ADMIN_PASSWORD?: string;
  ADMIN_USERNAME?: string;
  SECRET_ENCRYPTION_KEY?: string;
  LLM_PROVIDER_API_KEY?: string;
  ENVIRONMENT?: string;
}

export interface BotConfig {
  username: string;
  telegram_token_encrypted_or_secret_ref: string;
  telegram_token_set: boolean;
  is_active: boolean;
  webhook_secret_encrypted_or_hash?: string;
  webhook_secret_set: boolean;
  llm_key_id?: string;
  model: string;
  system_prompt: string;
  default_language: string;
  welcome_messages: Array<{ lang: string; text: string }>;
  max_history: number;
  session_ttl: number;
  group_mode: GroupMode;
  admin_user_ids?: number[];
  mention_trigger?: string;
  reply_to_mentions: boolean;
  model_params: {
    temperature: number;
    max_tokens: number;
    top_p: number;
    frequency_penalty: number;
    presence_penalty: number;
  };
  streaming: boolean;
  created_at: string;
  updated_at: string;
}

export interface StoredApiKey {
  id: string;
  name: string;
  provider: KeyProvider;
  key_encrypted_or_secret_ref: string;
  key_set: boolean;
  created_at: string;
  updated_at: string;
}

export interface SessionState {
  messages: Array<{
    role: "user" | "assistant" | "system";
    content: string;
    created_at: string;
  }>;
  updated_at: string;
}

export interface GlobalSettings {
  default_model: string;
  default_system_prompt: string;
  default_language: string;
  default_welcome_messages: Array<{ lang: string; text: string }>;
  max_history: number;
  session_ttl: number;
}

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
