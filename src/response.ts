import type { JsonValue } from "./types";

export function jsonResponse(body: unknown, status = 200, headersInit: HeadersInit = {}): Response {
  const headers = new Headers(headersInit);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json; charset=utf-8");
  }
  return new Response(JSON.stringify(body as JsonValue), { status, headers });
}

export async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("invalid_json");
  }
}

export function notFound(): Response {
  return jsonResponse({ ok: false, error: "not_found" }, 404);
}

export function methodNotAllowed(): Response {
  return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
}
