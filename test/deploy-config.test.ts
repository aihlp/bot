import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("deploy config", () => {
  it("keeps wrangler config portable without real KV namespace IDs", () => {
    const config = readFileSync("wrangler.toml", "utf8");
    expect(config).toContain('binding = "BOT_REGISTRY"');
    expect(config).toContain('binding = "SESSION_KV"');
    expect(config).toContain('binding = "KEYS_KV"');
    expect(config).toContain('binding = "SETTINGS_KV"');
    expect(config).toContain('id = "${BOT_REGISTRY_ID}"');
    expect(config).not.toMatch(/id = "[a-f0-9]{16,}"/);
  });

  it("uses Cloudflare Static Assets binding", () => {
    const config = readFileSync("wrangler.toml", "utf8");
    expect(config).toContain('[assets]');
    expect(config).toContain('directory = "./dist/admin"');
    expect(config).toContain('binding = "ASSETS"');
    expect(config).toContain('not_found_handling = "single-page-application"');
    expect(config).toContain('run_worker_first = ["/api/*", "/health", "/admin/*", "/"]');
  });

  it("includes required package scripts", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts.test).toBe("vitest run");
    expect(pkg.scripts.typecheck).toBe("tsc --noEmit");
    expect(pkg.scripts["build:admin"]).toBe("cd src/admin && npm ci && npm run build");
    expect(pkg.scripts.deploy).toBe("wrangler deploy");
  });
});
