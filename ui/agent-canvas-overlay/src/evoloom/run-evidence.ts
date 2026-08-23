import type { OHEvent } from "#/stores/use-event-store";

type LooseEvent = OHEvent & Record<string, unknown>;

export interface RunEvidence {
  id: string;
  title: string;
  kind: string;
  status: string;
  timestamp: string | null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function summarizeRunEvents(events: OHEvent[]): RunEvidence[] {
  const byToolCall = new Map<string, RunEvidence>();
  const standalone: RunEvidence[] = [];
  for (const rawEvent of events) {
    const event = rawEvent as LooseEvent;
    const action = record(event.action);
    const kind =
      stringValue(event.kind) ?? stringValue(action?.kind) ?? "Event";
    const toolCallId = stringValue(event.tool_call_id);
    if (kind !== "ACPToolCallEvent" && !kind.endsWith("Action")) continue;
    const evidence: RunEvidence = {
      id: toolCallId ?? String(event.id ?? `${kind}-${standalone.length}`),
      title:
        stringValue(event.title) ??
        stringValue(event.summary) ??
        stringValue(event.tool_name) ??
        stringValue(action?.path) ??
        stringValue(action?.command) ??
        kind.replace(/(Action|Event)$/, ""),
      kind: stringValue(event.tool_kind) ?? kind.replace(/(Action|Event)$/, ""),
      status:
        stringValue(event.status) ??
        (kind === "FinishAction" ? "completed" : "recorded"),
      timestamp: stringValue(event.timestamp),
    };
    if (toolCallId) byToolCall.set(toolCallId, evidence);
    else standalone.push(evidence);
  }
  return [...standalone, ...byToolCall.values()]
    .sort((a, b) => (a.timestamp ?? "").localeCompare(b.timestamp ?? ""))
    .slice(-16);
}

export function changedFilesFromEvents(events: OHEvent[]): string[] {
  const files = new Set<string>();
  for (const rawEvent of events) {
    const event = rawEvent as LooseEvent;
    const action = record(event.action);
    const input = record(event.raw_input);
    const kind = stringValue(event.kind) ?? stringValue(action?.kind) ?? "";
    const command = stringValue(action?.command);
    const isEdit =
      event.tool_kind === "edit" ||
      kind.includes("FileEditor") ||
      kind.includes("StrReplaceEditor") ||
      command === "create" ||
      command === "insert" ||
      command === "str_replace";
    if (!isEdit) continue;
    const path = stringValue(action?.path) ?? stringValue(input?.path);
    if (path) files.add(path);
  }
  return [...files];
}

export function elapsedFromEvents(events: OHEvent[]): string {
  const timestamps = events
    .map((event) => stringValue((event as LooseEvent).timestamp))
    .filter((value): value is string => Boolean(value))
    .map((value) => Date.parse(value))
    .filter(Number.isFinite);
  if (timestamps.length < 2) return "—";
  const seconds = Math.max(
    0,
    Math.round((Math.max(...timestamps) - Math.min(...timestamps)) / 1000),
  );
  return seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
