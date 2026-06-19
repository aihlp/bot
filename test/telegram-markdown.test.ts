import { describe, expect, it } from "vitest";
import { escapeMarkdownV2 } from "../src/telegram";

describe("telegram markdown", () => {
  it("escapes all MarkdownV2 special characters", () => {
    const text = "_*[]()~`>#+-=|{}.!";
    expect(escapeMarkdownV2(text)).toBe("\\_\\*\\[\\]\\(\\)\\~\\`\\>\\#\\+\\-\\=\\|\\{\\}\\.\\!");
  });

  it("does not leave malformed MarkdownV2 payload", () => {
    const text = "Hello _world_ [link](https://example.com) 1-2.";
    const escaped = escapeMarkdownV2(text);
    expect(escaped).toBe("Hello \\_world\\_ \\[link\\]\\(https://example\\.com\\) 1\\-2\\.");
    expect(escaped).not.toMatch(/(^|[^\\])[_*[\]()~`>#+\-=|{}.!]/);
  });
});
