import { safeEqual } from "./secrets";
import type { Env } from "./types";
import { jsonResponse } from "./response";

export function isAuthenticated(request: Request, env: Env): boolean {
  if (!env.ADMIN_PASSWORD) {
    return false;
  }

  const header = request.headers.get("Authorization") ?? "";
  if (!header.startsWith("Basic ")) {
    return false;
  }

  try {
    const decoded = atob(header.slice("Basic ".length));
    const separator = decoded.indexOf(":");
    if (separator < 0) {
      return false;
    }
    const username = decoded.slice(0, separator);
    const password = decoded.slice(separator + 1);
    const expectedUsername = env.ADMIN_USERNAME ?? "admin";
    return safeEqual(username, expectedUsername) && safeEqual(password, env.ADMIN_PASSWORD);
  } catch {
    return false;
  }
}

export function requireAdminAuth(request: Request, env: Env): Response | null {
  if (isAuthenticated(request, env)) {
    return null;
  }

  return jsonResponse(
    { ok: false, error: "unauthorized" },
    401,
    new Headers({ "WWW-Authenticate": 'Basic realm="Telegram Bot Platform"' })
  );
}
