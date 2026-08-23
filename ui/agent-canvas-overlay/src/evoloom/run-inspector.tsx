import React from "react";
import { Activity, FileCode2, Gauge, X } from "lucide-react";
import { useEventStore } from "#/stores/use-event-store";
import useMetricsStore from "#/stores/metrics-store";
import { useAgentState } from "#/hooks/use-agent-state";
import { useChatInputModelState } from "#/hooks/use-chat-input-model-state";
import { copy, useEvoLoomLocale } from "#/evoloom/locale";
import { cn } from "#/utils/utils";
import {
  changedFilesFromEvents,
  elapsedFromEvents,
  summarizeRunEvents,
} from "#/evoloom/run-evidence";

type InspectorTab = "run" | "files" | "metrics";
interface RunInspectorProps {
  mobile?: boolean;
  open: boolean;
  onClose: () => void;
}

export function RunInspector({
  mobile = false,
  open,
  onClose,
}: RunInspectorProps) {
  const { locale } = useEvoLoomLocale();
  const labels = copy[locale].inspector;
  const events = useEventStore((state) => state.events);
  const metrics = useMetricsStore();
  const { curAgentState } = useAgentState();
  const model = useChatInputModelState();
  const [tab, setTab] = React.useState<InspectorTab>("run");
  const panelRef = React.useRef<HTMLElement>(null);
  const closeRef = React.useRef<HTMLButtonElement>(null);
  const evidence = React.useMemo(() => summarizeRunEvents(events), [events]);
  const files = React.useMemo(() => changedFilesFromEvents(events), [events]);
  const turns = events.filter((event) => event.source === "user").length;

  React.useEffect(() => {
    if (!mobile || !open) return undefined;
    closeRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), select:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mobile, onClose, open]);

  if (!open) return null;

  const panel = (
    <aside
      ref={panelRef}
      className={cn("evoloom-inspector", mobile && "evoloom-inspector--mobile")}
      aria-label={labels.evidence}
      role={mobile ? "dialog" : undefined}
      aria-modal={mobile || undefined}
    >
      <div className="evoloom-inspector__header">
        <div
          className="evoloom-inspector__tabs"
          role="tablist"
          aria-label={labels.views}
        >
          {(["run", "files", "metrics"] as InspectorTab[]).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={tab === item}
              onClick={() => setTab(item)}
            >
              {labels[item]}
            </button>
          ))}
        </div>
        <button
          ref={closeRef}
          type="button"
          className="evoloom-inspector__close"
          onClick={onClose}
          aria-label={labels.close}
        >
          <X aria-hidden size={18} />
        </button>
      </div>

      <div className="evoloom-inspector__meta">
        <span>
          <i className="evoloom-status-dot" />
          {String(curAgentState).replaceAll("_", " ")}
        </span>
        <code>{model.currentModelId ?? labels.modelPending}</code>
      </div>

      {tab === "run" ? (
        <div className="evoloom-run-list" role="tabpanel" aria-live="polite">
          {evidence.length ? (
            evidence.map((item, index) => (
              <article key={item.id} className="evoloom-run-item">
                <span className="evoloom-run-item__node">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <strong>{item.title}</strong>
                  <span>
                    {item.kind} · {item.status}
                  </span>
                </div>
              </article>
            ))
          ) : (
            <p className="evoloom-inspector__empty">
              <Activity aria-hidden size={20} />
              {labels.empty}
            </p>
          )}
        </div>
      ) : null}

      {tab === "files" ? (
        <div className="evoloom-file-list" role="tabpanel">
          {files.length ? (
            files.map((path) => (
              <div key={path}>
                <FileCode2 aria-hidden size={16} />
                <code>{path}</code>
              </div>
            ))
          ) : (
            <p className="evoloom-inspector__empty">{labels.empty}</p>
          )}
        </div>
      ) : null}

      {tab === "metrics" ? (
        <dl className="evoloom-metrics" role="tabpanel">
          <div>
            <dt>{labels.elapsed}</dt>
            <dd>{elapsedFromEvents(events)}</dd>
          </div>
          <div>
            <dt>{labels.turns}</dt>
            <dd>{turns || "—"}</dd>
          </div>
          <div>
            <dt>{labels.toolEvents}</dt>
            <dd>{evidence.length || "—"}</dd>
          </div>
          <div>
            <dt>{labels.filesChanged}</dt>
            <dd>{files.length || "—"}</dd>
          </div>
          <div>
            <dt>{labels.inputTokens}</dt>
            <dd>{metrics.usage?.prompt_tokens ?? "—"}</dd>
          </div>
          <div>
            <dt>{labels.outputTokens}</dt>
            <dd>{metrics.usage?.completion_tokens ?? "—"}</dd>
          </div>
          <div className="evoloom-metrics__note">
            <Gauge aria-hidden size={16} />
            <span>{labels.unavailable}</span>
          </div>
        </dl>
      ) : null}
    </aside>
  );

  return mobile ? (
    <div
      className="evoloom-inspector-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {panel}
    </div>
  ) : (
    panel
  );
}
