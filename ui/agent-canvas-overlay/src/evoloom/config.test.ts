import { describe, expect, it } from "vitest";
import { parseEvoLoomConfig } from "./config";

const validConfig = {
  brand: { name: "EvoLoom", tagline: "Shows its work" },
  default_model: "gpt-5.6-terra",
  selected_model: "gpt-5.6-sol",
  locale: "en",
  available_models: [{ id: "gpt-5.6-sol", label: "GPT-5.6 Sol" }],
  demo_limits: { max_iterations: 20, max_prompt_chars: 12000 },
  capabilities: { streaming: true },
};

describe("parseEvoLoomConfig", () => {
  it("accepts a selected model present in the server catalog", () => {
    expect(parseEvoLoomConfig(validConfig).selected_model).toBe("gpt-5.6-sol");
  });

  it("rejects a selected model not present in the server catalog", () => {
    expect(() =>
      parseEvoLoomConfig({ ...validConfig, selected_model: "other" }),
    ).toThrow();
  });
});
