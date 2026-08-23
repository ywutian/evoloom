import { ArrowLeft, Check, Minus, ShieldCheck } from "lucide-react";
import { NavigationLink } from "#/components/shared/navigation-link";
import { useEvoLoomConfig } from "#/evoloom/config";
import { EvoLoomHeader } from "#/evoloom/header";
import { copy, useEvoLoomLocale } from "#/evoloom/locale";

const CONTENT = {
  en: {
    architecture: "What is running",
    architectureBody:
      "The model proposes actions. EvoLoom Runtime applies permissions, executes tools, returns results, compresses context, and can turn explicit feedback into reusable Skills.",
    flow: [
      "Model intent",
      "Runtime policy",
      "Tool execution",
      "Evidence",
      "Reusable learning",
    ],
    boundary: "Public sandbox boundary",
    enabled: [
      "Streaming responses",
      "Tool execution events",
      "Per-conversation model switching",
      "Visitor-isolated sessions",
    ],
    disabled: [
      "Arbitrary file browsing",
      "Interactive shell access",
      "Secret writes",
      "Plugin and Skill installation",
    ],
    benchmark: "Benchmark status",
    benchmarkLead: "6 smoke integration tasks",
    benchmarkBody:
      "These tasks validate the runner, artifacts, budgets, and checks. They are not a statistically meaningful coding benchmark and are not presented as a competitive success rate.",
    method: "Evidence standard",
    methodBody:
      "A publishable comparison requires at least 30 representative tasks, identical models and budgets, retained per-task artifacts, and an explicit judge configuration.",
    models: "Selectable models",
    sections: [
      "01 / RUNTIME",
      "02 / POLICY",
      "03 / MEASUREMENT",
      "04 / CATALOG",
    ],
    loading: "Loading…",
  },
  "zh-CN": {
    architecture: "实际运行的系统",
    architectureBody:
      "模型提出操作意图；EvoLoom Runtime 统一执行权限判断、工具调用、结果回写、上下文压缩，并可把明确反馈沉淀为可复用 Skills。",
    flow: ["模型意图", "Runtime 权限", "工具执行", "运行证据", "经验复用"],
    boundary: "公共沙箱边界",
    enabled: ["流式响应", "工具执行事件", "会话内模型切换", "访客会话隔离"],
    disabled: [
      "任意文件浏览",
      "交互式 Shell",
      "写入 Secret",
      "安装插件和 Skills",
    ],
    benchmark: "评测现状",
    benchmarkLead: "6 个 smoke 集成任务",
    benchmarkBody:
      "这些任务用于验证 Runner、产物、预算和检查流程，尚不构成有统计意义的 Coding Benchmark，也不会被包装为竞争性成功率。",
    method: "证据标准",
    methodBody:
      "正式对比至少需要 30 个代表性任务、完全一致的模型与预算、逐任务原始产物，以及明确的 Judge 配置。",
    models: "可选模型",
    sections: [
      "01 / RUNTIME",
      "02 / POLICY",
      "03 / MEASUREMENT",
      "04 / CATALOG",
    ],
    loading: "正在加载……",
  },
} as const;

export default function ProofPage() {
  const { locale } = useEvoLoomLocale();
  const text = copy[locale].proof;
  const content = CONTENT[locale];
  const config = useEvoLoomConfig();

  return (
    <main id="main-content" className="evoloom-proof">
      <EvoLoomHeader config={config.data} />
      <div className="evoloom-proof__intro">
        <NavigationLink to="/conversations" className="evoloom-back-link">
          <ArrowLeft aria-hidden size={16} /> {text.back}
        </NavigationLink>
        <p className="evoloom-kicker">{text.eyebrow}</p>
        <h1>{text.title}</h1>
        <p>{text.body}</p>
      </div>

      <div className="evoloom-proof__sections">
        <section className="evoloom-proof__architecture">
          <div>
            <p className="evoloom-section-index">{content.sections[0]}</p>
            <h2>{content.architecture}</h2>
            <p>{content.architectureBody}</p>
          </div>
          <ol className="evoloom-flow">
            {content.flow.map((step, index) => (
              <li key={step}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                {step}
              </li>
            ))}
          </ol>
        </section>

        <section>
          <p className="evoloom-section-index">{content.sections[1]}</p>
          <h2>{content.boundary}</h2>
          <div className="evoloom-boundary">
            <ul>
              {content.enabled.map((item) => (
                <li key={item}>
                  <Check aria-hidden size={16} />
                  {item}
                </li>
              ))}
            </ul>
            <ul>
              {content.disabled.map((item) => (
                <li key={item}>
                  <Minus aria-hidden size={16} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="evoloom-proof__benchmark">
          <div>
            <p className="evoloom-section-index">{content.sections[2]}</p>
            <h2>{content.benchmark}</h2>
            <strong>{content.benchmarkLead}</strong>
            <p>{content.benchmarkBody}</p>
          </div>
          <div className="evoloom-method-note">
            <ShieldCheck aria-hidden size={24} />
            <h3>{content.method}</h3>
            <p>{content.methodBody}</p>
          </div>
        </section>

        <section>
          <p className="evoloom-section-index">{content.sections[3]}</p>
          <h2>{content.models}</h2>
          <div className="evoloom-model-list">
            {config.data?.available_models.map((model) => (
              <span key={model.id}>{model.label}</span>
            )) ?? <span>{content.loading}</span>}
          </div>
        </section>
      </div>
    </main>
  );
}
