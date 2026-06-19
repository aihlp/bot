import { describe, expect, it } from "vitest";
import { basicAuth, createTestEnv, request } from "./helpers";

describe("keys api", () => {
  it("creates, lists, and deletes API keys", async () => {
    const { env } = createTestEnv();
    const created = await request("/api/keys", {
      method: "POST",
      headers: { ...basicAuth(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "OpenRouter test key", provider: "openrouter", key: "provider-secret-key" })
    }, env);
    const createdBody = await created.json();
    expect(created.status).toBe(200);
    expect(createdBody.key_set).toBe(true);

    const listed = await request("/api/keys", { headers: basicAuth() }, env);
    await expect(listed.json()).resolves.toMatchObject({ ok: true, keys: [{ id: createdBody.id, name: "OpenRouter test key" }] });

    const deleted = await request(`/api/keys/${createdBody.id}`, { method: "DELETE", headers: basicAuth() }, env);
    await expect(deleted.json()).resolves.toMatchObject({ ok: true, deleted: true });
  });

  it("never returns raw provider keys", async () => {
    const { env } = createTestEnv();
    const response = await request("/api/keys", {
      method: "POST",
      headers: { ...basicAuth(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Secret key", provider: "openrouter", key: "provider-secret-key" })
    }, env);
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).not.toContain("provider-secret-key");
    expect(body).toContain("key_set");
  });
});
