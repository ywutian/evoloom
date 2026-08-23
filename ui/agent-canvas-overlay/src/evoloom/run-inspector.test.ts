import { describe, expect, it } from "vitest";
import type { OHEvent } from "#/stores/use-event-store";
import { changedFilesFromEvents, summarizeRunEvents } from "./run-evidence";

describe("run evidence", () => {
  it("keeps the latest state for an ACP tool call", () => {
    const events = [
      {
        kind: "ACPToolCallEvent",
        id: "1",
        source: "agent",
        tool_call_id: "tool-1",
        title: "Edit app.py",
        tool_kind: "edit",
        status: "in_progress",
        timestamp: "2026-08-21T10:00:00Z",
      },
      {
        kind: "ACPToolCallEvent",
        id: "2",
        source: "agent",
        tool_call_id: "tool-1",
        title: "Edit app.py",
        tool_kind: "edit",
        status: "completed",
        timestamp: "2026-08-21T10:00:02Z",
      },
    ] as unknown as OHEvent[];
    expect(summarizeRunEvents(events)).toMatchObject([
      { status: "completed", title: "Edit app.py" },
    ]);
  });

  it("reports only files disclosed by edit events", () => {
    const events = [
      {
        kind: "ACPToolCallEvent",
        source: "agent",
        tool_kind: "edit",
        raw_input: { path: "/workspace/app.py" },
      },
      {
        kind: "ACPToolCallEvent",
        source: "agent",
        tool_kind: "read",
        raw_input: { path: "/workspace/secret.env" },
      },
    ] as unknown as OHEvent[];
    expect(changedFilesFromEvents(events)).toEqual(["/workspace/app.py"]);
  });
});
