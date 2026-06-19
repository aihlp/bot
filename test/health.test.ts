import { describe, expect, it } from "vitest";
import { createTestEnv, request } from "./helpers";

describe("health", () => {
  it("returns 200 when all bindings and ADMIN_PASSWORD are present", async () => {
    const { env } = createTestEnv();
    const response = await request("/health", {}, env);
    await expect(response.json()).resolves.toMatchObject({ status: "ok", admin_password_set: true });
    expect(response.status).toBe(200);
  });

  it.each(["BOT_REGISTRY", "SESSION_KV", "KEYS_KV", "SETTINGS_KV", "ASSETS"])("lists missing binding %s", async (binding) => {
    const { env } = createTestEnv();
    const response = await request("/health", {}, { ...env, [binding]: undefined } as typeof env);
    await expect(response.json()).resolves.toMatchObject({ status: "misconfigured", missing: [binding] });
    expect(response.status).toBe(500);
  });

  it("lists multiple missing bindings", async () => {
    const { env } = createTestEnv();
    const response = await request("/health", {}, { ...env, BOT_REGISTRY: undefined, ASSETS: undefined } as typeof env);
    await expect(response.json()).resolves.toMatchObject({ status: "misconfigured", missing: ["BOT_REGISTRY", "ASSETS"] });
    expect(response.status).toBe(500);
  });

  it("reports missing ADMIN_PASSWORD in production diagnostics", async () => {
    const { env } = createTestEnv();
    const response = await request("/health", {}, { ...env, ADMIN_PASSWORD: undefined } as typeof env);
    await expect(response.json()).resolves.toMatchObject({ status: "misconfigured", missing: ["ADMIN_PASSWORD"] });
    expect(response.status).toBe(500);
  });
});
