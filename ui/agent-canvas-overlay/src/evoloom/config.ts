import React from "react";

export interface EvoLoomModel {
  id: string;
  label: string;
}

export interface EvoLoomConfig {
  brand: { name: string; tagline: string };
  default_model: string;
  selected_model: string;
  locale: "en" | "zh-CN";
  available_models: EvoLoomModel[];
  demo_limits: { max_iterations: number; max_prompt_chars: number };
  capabilities: Record<string, boolean>;
}

type ConfigState =
  | { status: "loading"; data: null; error: null }
  | { status: "ready"; data: EvoLoomConfig; error: null }
  | { status: "error"; data: null; error: string };

export function parseEvoLoomConfig(value: unknown): EvoLoomConfig {
  if (!value || typeof value !== "object")
    throw new Error("Invalid EvoLoom configuration");
  const config = value as Partial<EvoLoomConfig>;
  const models = Array.isArray(config.available_models)
    ? config.available_models.filter(
        (item): item is EvoLoomModel =>
          Boolean(item) &&
          typeof item.id === "string" &&
          typeof item.label === "string",
      )
    : [];
  if (
    !config.brand ||
    typeof config.brand.name !== "string" ||
    typeof config.default_model !== "string" ||
    typeof config.selected_model !== "string" ||
    !models.length ||
    !models.some((item) => item.id === config.selected_model) ||
    !config.demo_limits ||
    typeof config.demo_limits.max_iterations !== "number" ||
    typeof config.demo_limits.max_prompt_chars !== "number" ||
    !config.capabilities
  ) {
    throw new Error("Invalid EvoLoom configuration");
  }
  return {
    ...config,
    locale: config.locale === "zh-CN" ? "zh-CN" : "en",
    available_models: models,
  } as EvoLoomConfig;
}

async function requestConfig(
  model?: string,
  signal?: AbortSignal,
): Promise<EvoLoomConfig> {
  const response = await fetch(
    model ? "/api/evoloom/model" : "/api/evoloom/config",
    {
      method: model ? "POST" : "GET",
      credentials: "same-origin",
      headers: model ? { "content-type": "application/json" } : undefined,
      body: model ? JSON.stringify({ model }) : undefined,
      signal,
    },
  );
  if (!response.ok) {
    throw new Error(`Configuration request failed (${response.status})`);
  }
  return parseEvoLoomConfig(await response.json());
}

export function useEvoLoomConfig() {
  const [state, setState] = React.useState<ConfigState>({
    status: "loading",
    data: null,
    error: null,
  });

  const load = React.useCallback(() => {
    const controller = new AbortController();
    setState({ status: "loading", data: null, error: null });
    void requestConfig(undefined, controller.signal)
      .then((data) => setState({ status: "ready", data, error: null }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          data: null,
          error:
            error instanceof Error
              ? error.message
              : "Configuration unavailable",
        });
      });
    return () => controller.abort();
  }, []);

  React.useEffect(() => load(), [load]);

  const selectModel = React.useCallback(async (model: string) => {
    const data = await requestConfig(model);
    setState({ status: "ready", data, error: null });
    return data;
  }, []);

  return { ...state, retry: load, selectModel };
}
