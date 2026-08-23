import { http, HttpResponse } from "msw";

const models = [
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
  "gpt-5.4",
  "gpt-5.3-codex-spark",
];

let selectedModel = "gpt-5.6-terra";

function config() {
  return {
    brand: { name: "EvoLoom", tagline: "An agent that shows its work." },
    default_model: "gpt-5.6-terra",
    selected_model: selectedModel,
    locale: "en",
    available_models: models.map((id) => ({
      id,
      label: id.replace("gpt", "GPT").replaceAll("-", " "),
    })),
    demo_limits: { max_iterations: 20, max_prompt_chars: 12000 },
    capabilities: { streaming: true, tool_events: true, shell_access: false },
  };
}

export const EVOLOOM_HANDLERS = [
  http.get("*/api/evoloom/config", () => HttpResponse.json(config())),
  http.get("*/api/settings", () =>
    HttpResponse.json({
      agent_settings: {},
      conversation_settings: {},
      llm_api_key_is_set: true,
      user_consents_to_analytics: false,
      misc_settings: {
        app_preferences: { user_consents_to_analytics: false },
      },
    }),
  ),
  http.get("*/api/automation/sdk-version", () =>
    HttpResponse.json({ version: "disabled" }),
  ),
  http.post("*/api/automation/v1/telemetry/consent", () =>
    HttpResponse.json({}),
  ),
  http.post("*/api/evoloom/model", async ({ request }) => {
    const body = (await request.json()) as { model?: string };
    if (!body.model || !models.includes(body.model)) {
      return HttpResponse.json(
        { detail: "Unsupported model" },
        { status: 400 },
      );
    }
    selectedModel = body.model;
    return HttpResponse.json(config());
  }),
];
