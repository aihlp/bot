import type { Env } from "./types";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export async function encryptSecret(value: string, env: Pick<Env, "SECRET_ENCRYPTION_KEY">): Promise<string> {
  if (!value) {
    return "";
  }

  if (!env.SECRET_ENCRYPTION_KEY) {
    return `base64url:${bytesToBase64Url(encoder.encode(value))}`;
  }

  const keyMaterial = await crypto.subtle.digest("SHA-256", encoder.encode(env.SECRET_ENCRYPTION_KEY));
  const key = await crypto.subtle.importKey("raw", keyMaterial, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(value));
  return `aes-gcm:${bytesToBase64Url(iv)}:${bytesToBase64Url(new Uint8Array(encrypted))}`;
}

export async function decryptSecret(value: string, env: Pick<Env, "SECRET_ENCRYPTION_KEY">): Promise<string> {
  if (!value) {
    return "";
  }

  if (value.startsWith("base64url:")) {
    return decoder.decode(base64UrlToBytes(value.slice("base64url:".length)));
  }

  const [, ivBase64, encryptedBase64] = value.split(":");
  if (!ivBase64 || !encryptedBase64) {
    throw new Error("invalid_secret_format");
  }

  const keyMaterial = await crypto.subtle.digest("SHA-256", encoder.encode(env.SECRET_ENCRYPTION_KEY ?? ""));
  const key = await crypto.subtle.importKey("raw", keyMaterial, "AES-GCM", false, ["decrypt"]);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64UrlToBytes(ivBase64) },
    key,
    base64UrlToBytes(encryptedBase64)
  );
  return decoder.decode(decrypted);
}

export function safeEqual(left: string, right: string): boolean {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  if (leftBytes.length !== rightBytes.length) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    diff |= leftBytes[index] ^ rightBytes[index];
  }
  return diff === 0;
}
