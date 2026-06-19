import type { KVNamespace } from "@cloudflare/workers-types";
import type { JsonValue } from "./types";

export async function getJson<T>(kv: KVNamespace<string>, key: string): Promise<T | null> {
  const value = await kv.get(key);
  if (!value) {
    return null;
  }
  return JSON.parse(value) as T;
}

export async function putJson<T extends JsonValue>(
  kv: KVNamespace<string>,
  key: string,
  value: T,
  options?: { expirationTtl?: number }
): Promise<void> {
  await kv.put(key, JSON.stringify(value), options);
}

export async function listJson<T>(kv: KVNamespace<string>, prefix: string): Promise<T[]> {
  const listed = await kv.list({ prefix });
  const items: T[] = [];
  for (const key of listed.keys) {
    const value = await kv.get(key.name);
    if (value) {
      items.push(JSON.parse(value) as T);
    }
  }
  return items;
}

export async function deleteKey(kv: KVNamespace<string>, key: string): Promise<void> {
  await kv.delete(key);
}
