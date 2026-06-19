import type { Env, GlobalSettings } from "./types";
import { getJson, putJson } from "./kv";

export const SETTINGS_KEY = "global";

export const defaultSettings: GlobalSettings = {
  default_model: "openai/gpt-4o-mini",
  default_system_prompt: "You are a helpful assistant.",
  default_language: "en",
  default_welcome_messages: [{ lang: "en", text: "Hello. How can I help?" }],
  max_history: 20,
  session_ttl: 3600
};

export async function getSettings(env: Env): Promise<GlobalSettings> {
  const stored = await getJson<GlobalSettings>(env.SETTINGS_KV, SETTINGS_KEY);
  return { ...defaultSettings, ...stored };
}

export async function saveSettings(env: Env, settings: Partial<GlobalSettings>): Promise<GlobalSettings> {
  const current = await getSettings(env);
  const next: GlobalSettings = {
    default_model: settings.default_model ?? current.default_model,
    default_system_prompt: settings.default_system_prompt ?? current.default_system_prompt,
    default_language: settings.default_language ?? current.default_language,
    default_welcome_messages: settings.default_welcome_messages ?? current.default_welcome_messages,
    max_history: settings.max_history ?? current.max_history,
    session_ttl: settings.session_ttl ?? current.session_ttl
  };
  await putJson(env.SETTINGS_KV, SETTINGS_KEY, next);
  return next;
}
