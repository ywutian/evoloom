import React from "react";
import { ArrowRight, Check, LockKeyhole, Network, Wrench } from "lucide-react";
import { useCreateConversation } from "#/hooks/mutation/use-create-conversation";
import { useNavigation } from "#/context/navigation-context";
import { displayErrorToast } from "#/utils/custom-toast-handlers";
import { useEvoLoomConfig } from "#/evoloom/config";
import { EvoLoomHeader } from "#/evoloom/header";
import { copy, useEvoLoomLocale } from "#/evoloom/locale";

const EXAMPLES = {
  en: [
    "Audit this Python project and rank the three highest-impact reliability fixes.",
    "Trace how model selection reaches the agent runtime and identify failure modes.",
    "Add a dependency-free slugify function and verify it with focused tests.",
    "Explain this repository's architecture using evidence from the code.",
  ],
  "zh-CN": [
    "检查这个 Python 项目，并按影响排序三个最值得修复的可靠性问题。",
    "追踪模型选择如何进入 Agent Runtime，并找出可能的失败点。",
    "实现一个无依赖的 slugify 函数，并用针对性测试验证。",
    "根据代码证据解释这个项目的整体架构。",
  ],
} as const;

function RunSpecimen() {
  const { locale } = useEvoLoomLocale();
  const text = copy[locale].specimen;
  return (
    <section className="evoloom-specimen" aria-labelledby="specimen-title">
      <p className="evoloom-kicker">{text.label}</p>
      <h2 id="specimen-title">{text.title}</h2>
      <div className="evoloom-threadline" aria-label={text.stages.join(", ")}>
        {text.stages.map((stage, index) => (
          <div className="evoloom-threadline__stage" key={stage}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{stage}</strong>
          </div>
        ))}
      </div>
      <p className="evoloom-specimen__detail">{text.detail}</p>
    </section>
  );
}

export function EvoLoomHome() {
  const { locale } = useEvoLoomLocale();
  const text = copy[locale].home;
  const config = useEvoLoomConfig();
  const { mutateAsync: createConversation, isPending } =
    useCreateConversation();
  const { navigate } = useNavigation();
  const [prompt, setPrompt] = React.useState("");
  const [modelPending, setModelPending] = React.useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const query = prompt.trim();
    if (!query || isPending || config.status !== "ready") return;
    try {
      const conversation = await createConversation({
        query,
        entryPoint: "evoloom_public_home",
      });
      navigate(`/conversations/${conversation.conversation_id}`);
    } catch (error) {
      displayErrorToast(error instanceof Error ? error.message : null);
    }
  };

  const selectModel = async (model: string) => {
    setModelPending(true);
    try {
      await config.selectModel(model);
    } catch (error) {
      displayErrorToast(error instanceof Error ? error.message : null);
    } finally {
      setModelPending(false);
    }
  };

  return (
    <main id="main-content" className="evoloom-home">
      <EvoLoomHeader
        config={config.data}
        onModelChange={(model) => void selectModel(model)}
        modelPending={modelPending}
      />

      <div className="evoloom-home__grid">
        <section className="evoloom-home__primary" aria-labelledby="home-title">
          <p className="evoloom-kicker">{text.eyebrow}</p>
          <h1 id="home-title">{text.title}</h1>
          <p className="evoloom-home__intro">{text.body}</p>

          {config.status === "error" ? (
            <div className="evoloom-config-error" role="alert">
              <span>{text.configError}</span>
              <button type="button" onClick={() => config.retry()}>
                {text.retry}
              </button>
            </div>
          ) : (
            <form className="evoloom-composer" onSubmit={submit}>
              <label htmlFor="evoloom-task">{text.label}</label>
              <textarea
                id="evoloom-task"
                value={prompt}
                maxLength={config.data?.demo_limits.max_prompt_chars ?? 12000}
                placeholder={text.placeholder}
                onChange={(event) => setPrompt(event.target.value)}
                rows={5}
              />
              <div className="evoloom-composer__footer">
                <span>{config.data?.selected_model ?? text.loadingModel}</span>
                <button
                  type="submit"
                  disabled={
                    !prompt.trim() || isPending || config.status !== "ready"
                  }
                >
                  {isPending ? text.running : text.run}
                  {!isPending ? <ArrowRight aria-hidden size={18} /> : null}
                </button>
              </div>
            </form>
          )}

          <div className="evoloom-examples">
            <h2>{text.examples}</h2>
            <div>
              {EXAMPLES[locale].map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setPrompt(example)}
                >
                  <ArrowRight aria-hidden size={14} />
                  <span>{example}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <aside
          className="evoloom-home__evidence"
          aria-label={text.evidencePreview}
        >
          <RunSpecimen />
          <div className="evoloom-facts">
            <div>
              <Network aria-hidden size={17} />
              <strong>{config.data?.available_models.length ?? "—"}</strong>
              <span>{text.models}</span>
            </div>
            <div>
              <Wrench aria-hidden size={17} />
              <strong>{config.data?.demo_limits.max_iterations ?? "—"}</strong>
              <span>{text.turns}</span>
            </div>
            <div>
              <LockKeyhole aria-hidden size={17} />
              <Check aria-hidden size={14} />
              <span>{text.isolated}</span>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
