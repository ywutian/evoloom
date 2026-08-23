import { createServer, request as httpRequest } from "node:http";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

const listenPort = Number.parseInt(
  process.env.PUBLIC_GATEWAY_PORT || process.env.PORT || "8080",
  10,
);
const upstreamPort = Number.parseInt(
  process.env.CANVAS_INTERNAL_PORT || "8081",
  10,
);
const backendKey = process.env.LOCAL_BACKEND_API_KEY;
const model = process.env.MODEL || "gpt-4o-mini";
const defaultPublicModels = ["gpt-4o-mini"];
const publicModels = parsePublicModels(
  process.env.EVOLOOM_PUBLIC_MODELS,
  model,
);
const publicKey = "evoloom-public-demo";
const maxBodyBytes = 1024 * 1024;
const maxPromptChars = 12000;
const maxIterations = 20;
const maxHistoryItems = 20;
const visitorCreateLimit = positiveInteger(
  process.env.EVOLOOM_CREATE_PER_VISITOR_PER_HOUR,
  5,
);
const clientCreateLimit = positiveInteger(
  process.env.EVOLOOM_CREATE_PER_CLIENT_PER_HOUR,
  10,
);
const globalCreateLimit = positiveInteger(
  process.env.EVOLOOM_CREATE_GLOBAL_PER_HOUR,
  60,
);
const dailyConversationLimit = positiveInteger(
  process.env.EVOLOOM_DAILY_CONVERSATION_LIMIT,
  50,
);
const dailyUsagePath =
  process.env.EVOLOOM_DAILY_USAGE_PATH || "/tmp/evoloom-daily-usage.json";
const visitorConversations = new Map();
const rateLimits = new Map();

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function clientAddress(req) {
  const forwarded = String(req.headers?.["x-forwarded-for"] || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return forwarded.at(-1) || req.socket?.remoteAddress || "unknown";
}

function clientRateKey(req) {
  return createHmac("sha256", backendKey || "evoloom-unconfigured")
    .update(clientAddress(req))
    .digest("base64url");
}

export function createDailyQuota({ limit, statePath, now = () => new Date() }) {
  let state = null;
  let queue = Promise.resolve();

  const day = () => now().toISOString().slice(0, 10);
  const runExclusive = (operation) => {
    const result = queue.then(operation, operation);
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
  const load = async () => {
    if (state) return;
    try {
      const stored = JSON.parse(await readFile(statePath, "utf8"));
      state =
        stored?.date === day() && Number.isSafeInteger(stored?.count)
          ? { date: stored.date, count: Math.max(0, stored.count) }
          : { date: day(), count: 0 };
    } catch {
      state = { date: day(), count: 0 };
    }
  };
  const persist = async () => {
    await mkdir(dirname(statePath), { recursive: true });
    const temporaryPath = `${statePath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(state)}\n`, {
      mode: 0o600,
    });
    await rename(temporaryPath, statePath);
  };
  const resetForToday = () => {
    if (state.date !== day()) state = { date: day(), count: 0 };
  };

  return {
    reserve: () =>
      runExclusive(async () => {
        await load();
        resetForToday();
        if (state.count >= limit) return false;
        state.count += 1;
        await persist();
        return true;
      }),
    release: () =>
      runExclusive(async () => {
        await load();
        resetForToday();
        state.count = Math.max(0, state.count - 1);
        await persist();
      }),
    snapshot: () =>
      runExclusive(async () => {
        await load();
        resetForToday();
        return { ...state };
      }),
  };
}

const dailyQuota = createDailyQuota({
  limit: dailyConversationLimit,
  statePath: dailyUsagePath,
});

function releaseDailyReservation() {
  void dailyQuota.release().catch(() => undefined);
}

export function parsePublicModels(rawModels, fallbackModel) {
  const configured = String(rawModels || "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(item));
  const models = configured.length ? configured : [...defaultPublicModels];
  if (fallbackModel && !models.includes(fallbackModel))
    models.push(fallbackModel);
  return [...new Set(models)];
}

export function publicConfig(selectedModel = model, locale = "en") {
  return {
    brand: {
      name: "EvoLoom",
      tagline: "An agent that shows its work.",
    },
    default_model: model,
    selected_model: allowedModel(selectedModel) || model,
    locale: locale === "zh-CN" ? "zh-CN" : "en",
    available_models: publicModels.map((modelId) => ({
      id: modelId,
      label: modelLabel(modelId),
    })),
    demo_limits: {
      max_iterations: maxIterations,
      max_prompt_chars: maxPromptChars,
      conversations_per_visitor_hour: visitorCreateLimit,
      conversations_per_client_hour: clientCreateLimit,
      conversations_per_day: dailyConversationLimit,
    },
    capabilities: {
      streaming: true,
      tool_events: true,
      model_switching: true,
      visitor_session_isolation: true,
      arbitrary_file_access: false,
      shell_access: false,
      secrets_write: false,
      plugins_write: false,
      skills_write: false,
    },
  };
}

function allowedModel(requested) {
  const candidate = typeof requested === "string" ? requested.trim() : "";
  return publicModels.includes(candidate) ? candidate : null;
}

export function settingsModelSelection(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  if (Object.keys(body).length !== 1 || !("agent_settings_diff" in body))
    return null;

  const diff = body.agent_settings_diff;
  if (!diff || typeof diff !== "object" || Array.isArray(diff)) return null;
  if (Object.keys(diff).length !== 1 || !("acp_model" in diff)) return null;
  return allowedModel(diff.acp_model);
}

function modelLabel(modelId) {
  const labels = {
    "gpt-5.6-sol": "GPT-5.6 Sol",
    "gpt-5.6-terra": "GPT-5.6 Terra",
    "gpt-5.6-luna": "GPT-5.6 Luna",
    "gpt-5.4": "GPT-5.4",
    "gpt-5.3-codex-spark": "GPT-5.3 Codex Spark",
  };
  return labels[modelId] || modelId;
}

function jsonResponse(res, status, body, extraHeaders = {}) {
  const payload = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": payload.length,
    ...extraHeaders,
  });
  res.end(payload);
}

function parseCookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .map((part) => part.trim().split("=", 2))
      .filter(([name, value]) => name && value),
  );
}

function visitorFor(req) {
  const existing = parseCookies(req).evoloom_visitor;
  if (existing && /^[a-f0-9-]{36}$/.test(existing)) {
    return { id: existing, isNew: false };
  }
  return { id: randomUUID(), isNew: true };
}

function visitorCookie(visitor) {
  return `evoloom_visitor=${visitor.id}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`;
}

function normalizedHistoryIds(ids) {
  return [...new Set(ids)]
    .filter((id) => /^[0-9a-f-]{36}$/i.test(id))
    .map((id) => id.toLowerCase())
    .slice(0, maxHistoryItems);
}

export function encodeHistoryCookie(visitorId, ids, secret = backendKey) {
  if (!secret) throw new Error("History cookie signing key is required");
  const payload = normalizedHistoryIds(ids).join(".");
  const signature = createHmac("sha256", secret)
    .update(`${visitorId}\n${payload}`)
    .digest("base64url");
  return `${payload}~${signature}`;
}

export function decodeHistoryCookie(value, visitorId, secret = backendKey) {
  if (!secret || typeof value !== "string") return [];
  const separator = value.lastIndexOf("~");
  if (separator < 0) return [];
  const payload = value.slice(0, separator);
  const supplied = value.slice(separator + 1);
  const expected = createHmac("sha256", secret)
    .update(`${visitorId}\n${payload}`)
    .digest("base64url");
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    return [];
  }
  const ids = payload ? payload.split(".") : [];
  if (normalizedHistoryIds(ids).join(".") !== payload) return [];
  return ids;
}

function historyCookie(visitorId, ids) {
  const value = encodeHistoryCookie(visitorId, ids);
  return `evoloom_history=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`;
}

function appendSetCookie(headers, cookie) {
  const current = headers["set-cookie"];
  headers["set-cookie"] = [
    ...(Array.isArray(current) ? current : current ? [current] : []),
    cookie,
  ];
}

function selectedModelCookie(modelId) {
  return `evoloom_model=${encodeURIComponent(modelId)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`;
}

function selectedModelFor(req) {
  const saved = parseCookies(req).evoloom_model;
  if (!saved) return model;
  try {
    return allowedModel(decodeURIComponent(saved)) || model;
  } catch {
    return model;
  }
}

function localeFor(req) {
  const saved = parseCookies(req).evoloom_locale;
  if (saved === "zh-CN" || saved === "en") return saved;
  return /^zh(?:-|,|;|$)/i.test(String(req.headers["accept-language"] || ""))
    ? "zh-CN"
    : "en";
}

function ownedSet(visitorId) {
  if (!visitorConversations.has(visitorId)) {
    visitorConversations.set(visitorId, new Set());
  }
  return visitorConversations.get(visitorId);
}

function restoreHistoryOwnership(req, visitor) {
  let value = parseCookies(req).evoloom_history;
  try {
    value = value ? decodeURIComponent(value) : value;
  } catch {
    value = null;
  }
  const restored = decodeHistoryCookie(value, visitor.id);
  const owned = ownedSet(visitor.id);
  for (const id of restored) owned.add(id);
  return restored;
}

export function conversationTitleFromText(text, maxLength = 56) {
  const cleaned = String(text || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^[#>*`\-\s]+/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  const characters = Array.from(cleaned);
  if (characters.length <= maxLength) return cleaned;
  return `${characters
    .slice(0, maxLength - 3)
    .join("")
    .trimEnd()}...`;
}

export function conversationTitleFromPrompt(text) {
  const title = conversationTitleFromText(text);
  return title && Array.from(title).length >= 3 ? title : "EvoLoom task";
}

export function conversationTitleUpdate(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (Object.keys(value).length !== 1 || typeof value.title !== "string")
    return null;
  const title = conversationTitleFromText(value.title);
  return title ? { title } : null;
}

async function replaceGenericConversationTitle(item) {
  const currentTitle = String(item?.title || "").trim();
  if (currentTitle && !/^Conversation \d+$/i.test(currentTitle)) return item;
  try {
    const eventsResponse = await fetch(
      `http://127.0.0.1:${upstreamPort}/api/conversations/${item.id}/events/search?limit=20`,
      { headers: { "x-session-api-key": backendKey } },
    );
    if (!eventsResponse.ok) return item;
    const events = await eventsResponse.json();
    const firstUserMessage = events.items?.find(
      (event) => event.kind === "MessageEvent" && event.source === "user",
    );
    const text = firstUserMessage?.llm_message?.content?.find(
      (block) => typeof block?.text === "string",
    )?.text;
    const title = conversationTitleFromPrompt(text);
    const updateResponse = await fetch(
      `http://127.0.0.1:${upstreamPort}/api/conversations/${item.id}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-session-api-key": backendKey,
        },
        body: JSON.stringify({ title }),
      },
    );
    return updateResponse.ok ? { ...item, title } : item;
  } catch {
    return item;
  }
}

async function ownedConversationItems(visitor, requestedIds = null) {
  const owned = ownedSet(visitor.id);
  const ids = normalizedHistoryIds(requestedIds ?? [...owned]);
  const items = await Promise.all(
    ids.map(async (id) => {
      try {
        const response = await fetch(
          `http://127.0.0.1:${upstreamPort}/api/conversations/${id}`,
          { headers: { "x-session-api-key": backendKey } },
        );
        return response.ok
          ? await replaceGenericConversationTitle(await response.json())
          : null;
      } catch {
        return null;
      }
    }),
  );
  return items
    .filter(Boolean)
    .sort((a, b) =>
      String(b.updated_at || "").localeCompare(String(a.updated_at || "")),
    );
}

function rateLimited(key, limit, windowMs) {
  const now = Date.now();
  const recent = (rateLimits.get(key) || []).filter(
    (timestamp) => now - timestamp < windowMs,
  );
  if (recent.length >= limit) return true;
  recent.push(now);
  rateLimits.set(key, recent);
  return false;
}

function pathname(req) {
  try {
    return new URL(req.url || "/", "http://localhost").pathname;
  } catch {
    return "/";
  }
}

export function conversationId(path) {
  const match = path.match(
    /^(?:\/api\/conversations|\/api\/v1\/conversation|\/sockets\/events)\/([0-9a-f-]{36})(?:\/|$)/i,
  );
  return match?.[1]?.toLowerCase() || null;
}

export function isInterruptedExecutionStatus(status) {
  return ["idle", "stopped", "finished"].includes(status);
}

async function interruptedConversationStatus(id) {
  try {
    const response = await fetch(
      `http://127.0.0.1:${upstreamPort}/api/conversations/${id}`,
      {
        headers: { "x-session-api-key": backendKey },
      },
    );
    if (!response.ok) return null;
    return (await response.json()).execution_status || null;
  } catch {
    return null;
  }
}

function isAllowedMutation(method, path) {
  if (method === "POST" && path === "/api/conversations") return true;
  if (method === "PATCH" && /^\/api\/conversations\/[0-9a-f-]{36}$/i.test(path))
    return true;
  if (
    method === "DELETE" &&
    /^\/api\/conversations\/[0-9a-f-]{36}$/i.test(path)
  )
    return true;
  if (method !== "POST") return false;
  return /^\/api\/conversations\/[0-9a-f-]{36}\/(ask_agent|run|interrupt|pause|condense|switch_acp_model|events\/respond_to_confirmation|goal\/(resume|stop))$/i.test(
    path,
  );
}

function routeDecision(req, visitor) {
  const method = (req.method || "GET").toUpperCase();
  const path = pathname(req);

  if (["/docs", "/redoc", "/openapi.json"].includes(path)) return "block";
  if (method === "GET" && path === "/api/evoloom/config")
    return "evoloom-config";
  if (method === "POST" && path === "/api/evoloom/model")
    return "evoloom-model";
  if (method === "PATCH" && path === "/api/settings")
    return "evoloom-settings-model";
  if (method === "GET" && path === "/api/automation/health")
    return "automation-health";
  if (method === "GET" && path === "/api/automation/sdk-version")
    return "automation-sdk";
  if (method === "POST" && path === "/api/automation/v1/telemetry/consent")
    return "empty-object";
  if (method === "POST" && path === "/api/bash/execute_bash_command")
    return "disabled-bash";
  if (path.startsWith("/api/automation") || path.startsWith("/api/bash"))
    return "block";
  if (method === "POST" && path === "/api/auth/workspace-session")
    return "no-content";
  if ((method === "GET" || method === "HEAD") && path === "/api/file/home")
    return "allow";
  if (path.startsWith("/api/file")) return "block";
  if (method === "GET" && path === "/api/settings/secrets")
    return "empty-secrets";
  if (
    path.startsWith("/api/settings/secrets") ||
    path.startsWith("/api/secrets")
  )
    return "block";
  if (method === "GET" && path === "/api/plugins/installed")
    return "empty-plugins";
  if (method === "POST" && path === "/api/skills") return "empty-skills";
  if (path.startsWith("/api/plugins") || path.startsWith("/api/skills"))
    return "block";
  if (
    (method === "GET" || method === "HEAD") &&
    ["/api/profiles", "/api/agent-profiles"].includes(path)
  ) {
    return "empty-profiles";
  }
  if (
    path.startsWith("/api/profiles") ||
    path.startsWith("/api/agent-profiles")
  )
    return "block";
  if (path === "/v1/chat/completions" || path === "/v1/models") return "block";
  if (/(switch_llm|switch_profile|load_plugin|security_analyzer)$/.test(path))
    return "block";

  if (method === "GET" || method === "HEAD") {
    if (path === "/api/conversations/count") return "history-count";
    if (path === "/api/conversations/search") return "history-search";
    if (path === "/api/conversations") {
      const ids = new URL(
        req.url || "/",
        "http://localhost",
      ).searchParams.getAll("ids");
      if (
        ids.length === 0 ||
        ids.some((id) => !ownedSet(visitor.id).has(id.toLowerCase()))
      ) {
        return "not-owned";
      }
    }
    const id = conversationId(path);
    if (id && !ownedSet(visitor.id).has(id)) return "not-owned";
    return "allow";
  }

  if (!isAllowedMutation(method, path)) return "block";
  const id = conversationId(path);
  if (id && !ownedSet(visitor.id).has(id)) return "not-owned";
  return "allow";
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBodyBytes) throw new Error("request-too-large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export function fixedConversationBody(original, selectedModel = null) {
  let content = original?.initial_message?.content;
  if (!Array.isArray(content)) content = [];
  const text = content
    .filter((block) => block && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n\n")
    .slice(0, maxPromptChars);

  const requestedModel =
    allowedModel(selectedModel) ||
    allowedModel(original?.agent_settings?.acp_model) ||
    model;

  return {
    workspace: { kind: "LocalWorkspace", working_dir: "/workspace" },
    worktree: false,
    confirmation_policy: { kind: "NeverConfirm" },
    initial_message: text ? { content: [{ text }] } : null,
    max_iterations: maxIterations,
    stuck_detection: true,
    secrets: {},
    tool_module_qualnames: {},
    client_tools: [],
    agent_definitions: [],
    plugins: null,
    hook_config: null,
    autotitle: false,
    agent_settings: {
      agent_kind: "acp",
      // Use Canvas's pinned Codex catalog while keeping EvoLoom as the ACP command.
      acp_server: "codex",
      acp_command: ["evoloom-acp"],
      acp_args: [],
      acp_model: requestedModel,
      acp_prompt_timeout: 900,
      acp_startup_timeout: 90,
      mcp_config: {},
      acp_isolate_data_dir: false,
      acp_file_secrets: [],
    },
  };
}

function upstreamHeaders(req, body) {
  const headers = { ...req.headers };
  headers.host = `127.0.0.1:${upstreamPort}`;
  headers["x-session-api-key"] = backendKey;
  delete headers["x-expose-secrets"];
  delete headers.authorization;
  headers["accept-encoding"] = "identity";
  if (body) headers["content-length"] = body.length;
  return headers;
}

function safeUpstreamUrl(rawUrl) {
  return (rawUrl || "/")
    .split(encodeURIComponent(publicKey))
    .join(encodeURIComponent(backendKey))
    .split(publicKey)
    .join(backendKey);
}

function copyResponseHeaders(headers, visitor) {
  const copied = { ...headers };
  delete copied["content-length"];
  delete copied["transfer-encoding"];
  delete copied["content-encoding"];
  copied["cache-control"] = copied["cache-control"] || "no-store";
  copied["x-content-type-options"] = "nosniff";
  copied["referrer-policy"] = "same-origin";
  if (visitor.isNew) copied["set-cookie"] = visitorCookie(visitor);
  return copied;
}

async function proxyHttp(req, res, visitor) {
  const method = (req.method || "GET").toUpperCase();
  const path = pathname(req);
  let body = null;
  let generatedTitle = null;
  let dailyReservation = false;

  if (!["GET", "HEAD"].includes(method)) {
    try {
      body = await readBody(req);
    } catch (error) {
      const status = error.message === "request-too-large" ? 413 : 400;
      jsonResponse(res, status, { detail: "Invalid request body" });
      return;
    }
  }

  if (method === "POST" && path === "/api/conversations") {
    try {
      const original = JSON.parse(body || "{}");
      const titleText = Array.isArray(original?.initial_message?.content)
        ? original.initial_message.content
            .filter((block) => typeof block?.text === "string")
            .map((block) => block.text)
            .join(" ")
        : "";
      generatedTitle = conversationTitleFromPrompt(titleText);
      body = Buffer.from(
        JSON.stringify(fixedConversationBody(original, selectedModelFor(req))),
      );
    } catch {
      jsonResponse(res, 400, { detail: "Invalid JSON" });
      return;
    }
    const rateWindow = 60 * 60 * 1000;
    const limited =
      rateLimited(
        `create-visitor:${visitor.id}`,
        visitorCreateLimit,
        rateWindow,
      ) ||
      rateLimited(
        `create-client:${clientRateKey(req)}`,
        clientCreateLimit,
        rateWindow,
      ) ||
      rateLimited("create-global", globalCreateLimit, rateWindow);
    let dailyAvailable = false;
    if (!limited) {
      try {
        dailyAvailable = await dailyQuota.reserve();
      } catch {
        jsonResponse(
          res,
          503,
          { detail: "The public demo usage counter is unavailable." },
          { "retry-after": "60" },
        );
        return;
      }
    }
    if (limited || !dailyAvailable) {
      jsonResponse(
        res,
        429,
        { detail: "The public demo conversation limit has been reached." },
        { "retry-after": "3600" },
      );
      return;
    }
    dailyReservation = true;
  }

  if (
    method === "PATCH" &&
    /^\/api\/conversations\/[0-9a-f-]{36}$/i.test(path)
  ) {
    try {
      const update = conversationTitleUpdate(JSON.parse(body || "{}"));
      if (!update) {
        jsonResponse(res, 400, {
          detail: "Only a short title can be changed.",
        });
        return;
      }
      body = Buffer.from(JSON.stringify(update));
    } catch {
      jsonResponse(res, 400, { detail: "Invalid JSON" });
      return;
    }
  }

  if (method === "POST" && /\/switch_acp_model$/i.test(path)) {
    try {
      const requested = allowedModel(JSON.parse(body || "{}").model);
      if (!requested) {
        jsonResponse(res, 400, { detail: "Unsupported model" });
        return;
      }
      body = Buffer.from(JSON.stringify({ model: requested }));
    } catch {
      jsonResponse(res, 400, { detail: "Invalid JSON" });
      return;
    }
  }

  const upstreamReq = httpRequest(
    {
      hostname: "127.0.0.1",
      port: upstreamPort,
      path: safeUpstreamUrl(req.url),
      method,
      headers: upstreamHeaders(req, body),
    },
    (upstreamRes) => {
      const upstreamStatus = upstreamRes.statusCode || 502;
      if (dailyReservation && (upstreamStatus < 200 || upstreamStatus >= 300)) {
        dailyReservation = false;
        releaseDailyReservation();
      }
      const contentType = String(upstreamRes.headers["content-type"] || "");
      const isInterrupt = method === "POST" && /\/interrupt$/i.test(path);
      const isConversationDelete = method === "DELETE" && conversationId(path);
      const mustFilter =
        contentType.includes("text/html") ||
        (method === "GET" && path === "/api/settings") ||
        (method === "POST" && path === "/api/conversations") ||
        isConversationDelete ||
        isInterrupt;
      const headers = copyResponseHeaders(upstreamRes.headers, visitor);

      if (!mustFilter) {
        res.writeHead(upstreamRes.statusCode || 502, headers);
        upstreamRes.pipe(res);
        return;
      }

      const chunks = [];
      upstreamRes.on("data", (chunk) => chunks.push(chunk));
      upstreamRes.on("end", async () => {
        let payload = Buffer.concat(chunks);
        let responseStatus = upstreamRes.statusCode || 502;
        if (contentType.includes("text/html")) {
          const publicHtml = payload
            .toString("utf8")
            .split(backendKey)
            .join(publicKey);
          const onboardingScript =
            "<script>try{localStorage.setItem('openhands-onboarded','1')}catch(e){}</script>";
          payload = Buffer.from(
            publicHtml.replace("</head>", `${onboardingScript}</head>`),
          );
        }
        if (
          method === "GET" &&
          path === "/api/settings" &&
          (upstreamRes.statusCode || 500) >= 200 &&
          (upstreamRes.statusCode || 500) < 300
        ) {
          try {
            const settings = JSON.parse(payload.toString("utf8"));
            settings.llm_api_key_set = true;
            settings.llm_api_key_is_set = true;
            settings.user_consents_to_analytics = false;
            settings.is_new_user = false;
            settings.misc_settings = settings.misc_settings || {};
            settings.misc_settings.app_preferences =
              settings.misc_settings.app_preferences || {};
            settings.misc_settings.app_preferences.user_consents_to_analytics = false;
            settings.language = localeFor(req);
            settings.agent_settings =
              settings.agent_settings &&
              typeof settings.agent_settings === "object"
                ? settings.agent_settings
                : {};
            settings.agent_settings.acp_model = selectedModelFor(req);
            payload = Buffer.from(JSON.stringify(settings));
          } catch {
            // Preserve the upstream response if its schema changes.
          }
        }
        if (
          method === "POST" &&
          path === "/api/conversations" &&
          (upstreamRes.statusCode || 500) >= 200 &&
          (upstreamRes.statusCode || 500) < 300
        ) {
          try {
            const created = JSON.parse(payload.toString("utf8"));
            const id = String(
              created.id || created.conversation_id || "",
            ).toLowerCase();
            if (/^[0-9a-f-]{36}$/.test(id)) {
              const owned = ownedSet(visitor.id);
              owned.add(id);
              appendSetCookie(
                headers,
                historyCookie(
                  visitor.id,
                  [id, ...owned].slice(0, maxHistoryItems),
                ),
              );
              if (generatedTitle) {
                try {
                  const titleResponse = await fetch(
                    `http://127.0.0.1:${upstreamPort}/api/conversations/${id}`,
                    {
                      method: "PATCH",
                      headers: {
                        "content-type": "application/json",
                        "x-session-api-key": backendKey,
                      },
                      body: JSON.stringify({ title: generatedTitle }),
                    },
                  );
                  if (titleResponse.ok) {
                    created.title = generatedTitle;
                    payload = Buffer.from(JSON.stringify(created));
                  }
                } catch {
                  // Conversation creation remains successful if title storage fails.
                }
              }
            }
          } catch {
            // The upstream response remains authoritative if its schema changes.
          }
        }
        if (
          isConversationDelete &&
          responseStatus >= 200 &&
          responseStatus < 300
        ) {
          const id = conversationId(path);
          const owned = ownedSet(visitor.id);
          owned.delete(id);
          appendSetCookie(headers, historyCookie(visitor.id, [...owned]));
        }
        if (isInterrupt && responseStatus >= 500) {
          const status = await interruptedConversationStatus(
            conversationId(path),
          );
          if (isInterruptedExecutionStatus(status)) {
            responseStatus = 200;
            payload = Buffer.from(JSON.stringify({ status: "interrupted" }));
            headers["content-type"] = "application/json";
          }
        }
        headers["content-length"] = payload.length;
        res.writeHead(responseStatus, headers);
        res.end(payload);
      });
    },
  );

  upstreamReq.on("error", (error) => {
    if (dailyReservation) {
      dailyReservation = false;
      releaseDailyReservation();
    }
    if (!res.headersSent)
      jsonResponse(res, 502, {
        detail: `Demo backend unavailable: ${error.message}`,
      });
    else res.destroy();
  });
  if (body) upstreamReq.end(body);
  else upstreamReq.end();
}

function proxyWebSocket(req, socket, head, visitor) {
  const path = pathname(req);
  const id =
    conversationId(path) ||
    new URL(req.url || "/", "http://localhost").searchParams.get(
      "conversation_id",
    );
  if (
    !path.startsWith("/sockets") ||
    (id && !ownedSet(visitor.id).has(id.toLowerCase()))
  ) {
    socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }

  const headers = upstreamHeaders(req, null);
  const upstreamReq = httpRequest({
    hostname: "127.0.0.1",
    port: upstreamPort,
    path: safeUpstreamUrl(req.url),
    method: req.method,
    headers,
  });
  upstreamReq.on("upgrade", (upstreamRes, upstreamSocket, upstreamHead) => {
    const responseHeaders = Object.entries(upstreamRes.headers)
      .flatMap(([name, value]) =>
        Array.isArray(value)
          ? value.map((item) => `${name}: ${item}`)
          : [`${name}: ${value}`],
      )
      .join("\r\n");
    socket.write(
      `HTTP/1.1 ${upstreamRes.statusCode} ${upstreamRes.statusMessage}\r\n${responseHeaders}\r\n\r\n`,
    );
    if (upstreamHead.length) socket.write(upstreamHead);
    if (head.length) upstreamSocket.write(head);
    upstreamSocket.pipe(socket);
    socket.pipe(upstreamSocket);
  });
  upstreamReq.on("error", () => socket.destroy());
  upstreamReq.end();
}

export function startServer() {
  if (!backendKey) {
    throw new Error("LOCAL_BACKEND_API_KEY is required");
  }

  const server = createServer(async (req, res) => {
    const visitor = visitorFor(req);
    restoreHistoryOwnership(req, visitor);
    const decision = routeDecision(req, visitor);
    const cookieHeader = visitor.isNew
      ? { "set-cookie": visitorCookie(visitor) }
      : {};
    if (decision === "block") {
      jsonResponse(
        res,
        403,
        { detail: "This operation is disabled in the public EvoLoom demo." },
        cookieHeader,
      );
      return;
    }
    if (decision === "evoloom-config") {
      jsonResponse(
        res,
        200,
        publicConfig(selectedModelFor(req), localeFor(req)),
        cookieHeader,
      );
      return;
    }
    if (decision === "evoloom-model") {
      try {
        const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
        const selectedModel = allowedModel(body.model);
        if (!selectedModel) {
          jsonResponse(res, 400, { detail: "Unsupported model" }, cookieHeader);
          return;
        }
        jsonResponse(res, 200, publicConfig(selectedModel), {
          ...cookieHeader,
          "set-cookie": [
            ...(cookieHeader["set-cookie"] ? [cookieHeader["set-cookie"]] : []),
            selectedModelCookie(selectedModel),
          ],
        });
      } catch {
        jsonResponse(res, 400, { detail: "Invalid JSON" }, cookieHeader);
      }
      return;
    }
    if (decision === "evoloom-settings-model") {
      try {
        const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
        const selectedModel = settingsModelSelection(body);
        if (!selectedModel) {
          jsonResponse(
            res,
            400,
            { detail: "Only an allowed ACP model can be changed." },
            cookieHeader,
          );
          return;
        }
        jsonResponse(res, 200, true, {
          ...cookieHeader,
          "set-cookie": [
            ...(cookieHeader["set-cookie"] ? [cookieHeader["set-cookie"]] : []),
            selectedModelCookie(selectedModel),
          ],
        });
      } catch {
        jsonResponse(res, 400, { detail: "Invalid JSON" }, cookieHeader);
      }
      return;
    }
    if (decision === "not-owned") {
      jsonResponse(
        res,
        404,
        { detail: "Conversation not found" },
        cookieHeader,
      );
      return;
    }
    if (decision === "empty-list") {
      const body = pathname(req).endsWith("/count")
        ? 0
        : { items: [], next_page_id: null };
      jsonResponse(res, 200, body, cookieHeader);
      return;
    }
    if (decision === "history-count") {
      const items = await ownedConversationItems(visitor);
      jsonResponse(res, 200, items.length, cookieHeader);
      return;
    }
    if (decision === "history-search") {
      const url = new URL(req.url || "/", "http://localhost");
      const limit = Math.min(
        Math.max(
          Number.parseInt(url.searchParams.get("limit") || "20", 10) || 20,
          1,
        ),
        maxHistoryItems,
      );
      const items = await ownedConversationItems(visitor);
      jsonResponse(
        res,
        200,
        { items: items.slice(0, limit), next_page_id: null },
        cookieHeader,
      );
      return;
    }
    if (decision === "empty-profiles") {
      const body =
        pathname(req) === "/api/profiles"
          ? { profiles: [], active_profile: null }
          : { profiles: [], active_agent_profile_id: null };
      jsonResponse(res, 200, body, cookieHeader);
      return;
    }
    if (decision === "empty-secrets") {
      jsonResponse(res, 200, { secrets: [] }, cookieHeader);
      return;
    }
    if (decision === "empty-plugins") {
      jsonResponse(res, 200, { plugins: [] }, cookieHeader);
      return;
    }
    if (decision === "empty-skills") {
      jsonResponse(res, 200, { skills: [], sources: {} }, cookieHeader);
      return;
    }
    if (decision === "automation-health") {
      jsonResponse(res, 200, { status: "disabled" }, cookieHeader);
      return;
    }
    if (decision === "automation-sdk") {
      jsonResponse(res, 200, { version: "disabled" }, cookieHeader);
      return;
    }
    if (decision === "empty-object") {
      jsonResponse(res, 200, {}, cookieHeader);
      return;
    }
    if (decision === "disabled-bash") {
      jsonResponse(
        res,
        200,
        {
          kind: "BashOutput",
          id: randomUUID(),
          timestamp: new Date().toISOString(),
          command_id: randomUUID(),
          order: 0,
          exit_code: 126,
          stdout: null,
          stderr: "Terminal is disabled in the public EvoLoom demo.\n",
        },
        cookieHeader,
      );
      return;
    }
    if (decision === "no-content") {
      res.writeHead(204, cookieHeader);
      res.end();
      return;
    }
    proxyHttp(req, res, visitor);
  });

  server.on("upgrade", (req, socket, head) =>
    proxyWebSocket(req, socket, head, visitorFor(req)),
  );
  server.listen(listenPort, "0.0.0.0", () => {
    console.log(`[evoloom] public gateway listening on 0.0.0.0:${listenPort}`);
  });
  return server;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  startServer();
}
