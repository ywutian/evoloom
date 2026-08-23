import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  clientAddress,
  conversationId,
  conversationTitleFromPrompt,
  conversationTitleFromText,
  conversationTitleUpdate,
  createDailyQuota,
  decodeHistoryCookie,
  encodeHistoryCookie,
  fixedConversationBody,
  isInterruptedExecutionStatus,
  parsePublicModels,
  publicConfig,
  settingsModelSelection,
} from "../scripts/public-gateway.mjs";

const HISTORY_IDS = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
];

test("the public catalog defaults to a reproducible standard model", () => {
  assert.deepEqual(parsePublicModels(undefined, "gpt-4o-mini"), [
    "gpt-4o-mini",
  ]);
  assert.deepEqual(parsePublicModels("relay-a,relay-b", "relay-a"), [
    "relay-a",
    "relay-b",
  ]);
});

test("conversation history cookies are signed and bound to one visitor", () => {
  const encoded = encodeHistoryCookie("visitor-a", HISTORY_IDS, "test-secret");
  assert.deepEqual(
    decodeHistoryCookie(encoded, "visitor-a", "test-secret"),
    HISTORY_IDS,
  );
  assert.deepEqual(
    decodeHistoryCookie(encoded, "visitor-b", "test-secret"),
    [],
  );
  assert.deepEqual(
    decodeHistoryCookie(
      encoded.replace("11111111", "aaaaaaaa"),
      "visitor-a",
      "test-secret",
    ),
    [],
  );
});

test("conversation history cookies reject malformed and excessive ids", () => {
  assert.deepEqual(
    decodeHistoryCookie("not-signed", "visitor-a", "test-secret"),
    [],
  );
  const ids = Array.from(
    { length: 25 },
    (_, index) =>
      `${String(index).padStart(8, "0")}-1111-4111-8111-111111111111`,
  );
  const encoded = encodeHistoryCookie("visitor-a", ids, "test-secret");
  assert.equal(
    decodeHistoryCookie(encoded, "visitor-a", "test-secret").length,
    20,
  );
});

test("client rate limiting uses the proxy-appended address", () => {
  assert.equal(
    clientAddress({
      headers: { "x-forwarded-for": "spoofed, 203.0.113.8" },
      socket: { remoteAddress: "127.0.0.1" },
    }),
    "203.0.113.8",
  );
  assert.equal(
    clientAddress({ headers: {}, socket: { remoteAddress: "127.0.0.1" } }),
    "127.0.0.1",
  );
});

test("daily conversation quota persists and releases failed reservations", async () => {
  const directory = await mkdtemp(join(tmpdir(), "evoloom-quota-"));
  const statePath = join(directory, "usage.json");
  try {
    const first = createDailyQuota({ limit: 2, statePath });
    assert.equal(await first.reserve(), true);
    assert.equal(await first.reserve(), true);
    assert.equal(await first.reserve(), false);

    const afterRestart = createDailyQuota({ limit: 2, statePath });
    assert.equal(await afterRestart.reserve(), false);
    await afterRestart.release();
    assert.equal(await afterRestart.reserve(), true);
    assert.deepEqual(await afterRestart.snapshot(), {
      date: new Date().toISOString().slice(0, 10),
      count: 2,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("conversation ownership covers REST history and websocket paths", () => {
  const id = HISTORY_IDS[0];
  assert.equal(conversationId(`/api/conversations/${id}`), id);
  assert.equal(conversationId(`/api/v1/conversation/${id}/events/search`), id);
  assert.equal(conversationId(`/sockets/events/${id}`), id);
  assert.equal(conversationId("/api/conversations/search"), null);
});

test("conversation creation preserves an allowed model and forces the safe ACP command", () => {
  const body = fixedConversationBody({
    initial_message: { content: [{ text: "hello" }] },
    agent_settings: {
      acp_model: "gpt-4o-mini",
      acp_command: ["malicious-command"],
    },
  });
  assert.equal(body.agent_settings.acp_model, "gpt-4o-mini");
  assert.deepEqual(body.agent_settings.acp_command, ["evoloom-acp"]);
  assert.equal(body.agent_settings.acp_server, "codex");
});

test("conversation creation rejects a model outside the allowlist", () => {
  const body = fixedConversationBody({
    agent_settings: { acp_model: "attacker/model" },
  });
  assert.equal(body.agent_settings.acp_model, "gpt-4o-mini");
});

test("conversation titles use the first prompt without random suffixes", () => {
  assert.equal(
    conversationTitleFromText("  Fix   the failing history test  "),
    "Fix the failing history test",
  );
  assert.equal(
    conversationTitleFromText("```js\nconst hidden = true\n```"),
    null,
  );
  assert.ok(conversationTitleFromText("x".repeat(100)).endsWith("..."));
  assert.equal(conversationTitleFromPrompt("1"), "EvoLoom task");
  assert.equal(conversationTitleFromPrompt(""), "EvoLoom task");
});

test("manual conversation renaming accepts only one safe title field", () => {
  assert.deepEqual(conversationTitleUpdate({ title: "  Release notes  " }), {
    title: "Release notes",
  });
  assert.equal(
    conversationTitleUpdate({ title: "Release", workspace: "/tmp" }),
    null,
  );
  assert.equal(conversationTitleUpdate({ title: "   " }), null);
});

test("the public config exposes the structured model catalog", () => {
  const config = publicConfig("gpt-4o-mini");
  assert.equal(config.selected_model, "gpt-4o-mini");
  assert.equal(config.available_models.length, 1);
  assert.equal(config.available_models[0].id, "gpt-4o-mini");
  assert.equal(config.demo_limits.max_iterations, 20);
  assert.equal(config.capabilities.shell_access, false);
});

test("a visitor-selected model overrides stale Canvas settings", () => {
  const body = fixedConversationBody(
    { agent_settings: { acp_model: "stale-model" } },
    "gpt-4o-mini",
  );
  assert.equal(body.agent_settings.acp_model, "gpt-4o-mini");
});

test("the classic Canvas settings request can change only the ACP model", () => {
  assert.equal(
    settingsModelSelection({
      agent_settings_diff: { acp_model: "gpt-4o-mini" },
    }),
    "gpt-4o-mini",
  );
  assert.equal(
    settingsModelSelection({
      agent_settings_diff: {
        acp_model: "gpt-4o-mini",
        acp_command: ["malicious-command"],
      },
    }),
    null,
  );
  assert.equal(
    settingsModelSelection({
      agent_settings_diff: { acp_model: "attacker/model" },
    }),
    null,
  );
  assert.equal(
    settingsModelSelection({
      conversation_settings_diff: { max_iterations: 999 },
    }),
    null,
  );
});

test("only completed interruption states normalize the upstream cancellation error", () => {
  assert.equal(isInterruptedExecutionStatus("idle"), true);
  assert.equal(isInterruptedExecutionStatus("stopped"), true);
  assert.equal(isInterruptedExecutionStatus("finished"), true);
  assert.equal(isInterruptedExecutionStatus("running"), false);
  assert.equal(isInterruptedExecutionStatus(null), false);
});
