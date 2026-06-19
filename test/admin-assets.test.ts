import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { basicAuth, createTestEnv, request } from "./helpers";

describe("admin static assets", () => {
  it("rejects unauthenticated /admin", async () => {
    const { env } = createTestEnv();
    const response = await request("/admin", {}, env);
    expect(response.status).toBe(401);
  });

  it("serves admin HTML when authenticated", async () => {
    const { env } = createTestEnv();
    const response = await request("/admin", { headers: basicAuth() }, env);
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain("admin");
  });

  it("serves SPA HTML for /admin routes when authenticated", async () => {
    const { env } = createTestEnv();
    const response = await request("/admin/bots", { headers: basicAuth() }, env);
    expect(response.status).toBe(200);
  });

  it("serves generated JS and CSS assets", async () => {
    const { env } = createTestEnv();
    const js = await request("/assets/index-abc123.js", {}, env);
    const css = await request("/assets/index-def456.css", {}, env);
    expect(js.status).toBe(200);
    expect(css.status).toBe(200);
  });

  it("does not hardcode Vite asset hashes in Worker source", () => {
    const source = readFileSync("src/index.ts", "utf8");
    expect(source).not.toMatch(/assets\/index-[a-f0-9]{6,}\.js/);
  });
});
