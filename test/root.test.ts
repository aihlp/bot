import { describe, expect, it } from "vitest";
import { createTestEnv, request } from "./helpers";

describe("root", () => {
  it("redirects / to /admin", async () => {
    const { env } = createTestEnv();
    const response = await request("/", {}, env);
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/admin");
  });
});
