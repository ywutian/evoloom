import { describe, expect, it } from "vitest";
import { chooseEvoLoomLocale } from "./locale";

describe("chooseEvoLoomLocale", () => {
  it("prefers an explicit stored language", () => {
    expect(chooseEvoLoomLocale("en", "zh-CN")).toBe("en");
  });

  it("uses simplified Chinese for Chinese browser locales", () => {
    expect(chooseEvoLoomLocale(null, "zh-TW")).toBe("zh-CN");
  });

  it("falls back to English", () => {
    expect(chooseEvoLoomLocale(null, "fr-FR")).toBe("en");
  });
});
