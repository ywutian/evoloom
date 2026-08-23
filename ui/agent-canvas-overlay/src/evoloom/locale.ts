import React from "react";
import i18n from "#/i18n";

export type EvoLoomLocale = "en" | "zh-CN";

const STORAGE_KEY = "evoloom-locale";
const LOCALE_CHANGE_EVENT = "evoloom-locale-change";

export function chooseEvoLoomLocale(
  stored: string | null,
  browserLanguage: string,
): EvoLoomLocale {
  if (stored === "en" || stored === "zh-CN") return stored;
  return browserLanguage.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

function detectedLocale(): EvoLoomLocale {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return chooseEvoLoomLocale(stored, window.navigator.language);
}

export function useEvoLoomLocale() {
  const [locale, setLocaleState] =
    React.useState<EvoLoomLocale>(detectedLocale);

  const setLocale = React.useCallback((nextLocale: EvoLoomLocale) => {
    setLocaleState(nextLocale);
    window.localStorage.setItem(STORAGE_KEY, nextLocale);
    window.localStorage.setItem("i18nextLng", nextLocale);
    document.cookie = `evoloom_locale=${nextLocale}; Path=/; SameSite=Lax; Max-Age=31536000`;
    document.documentElement.lang = nextLocale;
    void i18n.changeLanguage(nextLocale);
    window.dispatchEvent(
      new CustomEvent<EvoLoomLocale>(LOCALE_CHANGE_EVENT, {
        detail: nextLocale,
      }),
    );
  }, []);

  React.useEffect(() => {
    document.documentElement.lang = locale;
    void i18n.changeLanguage(locale);
  }, [locale]);

  React.useEffect(() => {
    const handleLocaleChange = (event: Event) => {
      setLocaleState((event as CustomEvent<EvoLoomLocale>).detail);
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setLocaleState(detectedLocale());
    };
    window.addEventListener(LOCALE_CHANGE_EVENT, handleLocaleChange);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(LOCALE_CHANGE_EVENT, handleLocaleChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  return { locale, setLocale };
}

export const copy = {
  en: {
    nav: {
      proof: "Proof",
      newTask: "New task",
      recent: "Recent runs",
      close: "Close navigation",
      workspace: "Workspace",
      sandboxPolicy: "PUBLIC SANDBOX · 20 TURN LIMIT",
    },
    header: {
      navigation: "EvoLoom navigation",
      switchLanguage: "切换到中文",
      language: "中文",
      model: "Model",
    },
    home: {
      eyebrow: "PUBLIC AGENT WORKBENCH",
      title: "Build with an agent that shows its work.",
      body: "Give EvoLoom a concrete task. Follow the plan, tool calls, file changes, and final result as one traceable run.",
      label: "Describe a real task",
      placeholder:
        "Review this repository and identify the three highest-impact reliability fixes…",
      run: "Run with EvoLoom",
      running: "Starting a protected workspace…",
      examples: "Try a real task",
      configError: "The public model catalog could not be loaded.",
      retry: "Retry configuration",
      sandbox: "Public sandbox",
      models: "relay models",
      turns: "turn limit",
      isolated: "visitor-isolated",
      loadingModel: "Loading model catalog…",
      evidencePreview: "Runtime evidence preview",
    },
    specimen: {
      label: "LIVE RUN SPECIMEN",
      title: "One task. One visible execution thread.",
      stages: ["Plan", "Tool", "Change", "Done"],
      detail:
        "The orange thread advances only when the runtime emits evidence.",
    },
    proof: {
      eyebrow: "EVIDENCE, NOT CLAIMS",
      title: "A public demo should be inspectable.",
      body: "EvoLoom separates what the platform can do from what this protected deployment allows, and labels early integration checks honestly.",
      back: "Run the agent",
    },
    inspector: {
      run: "Run",
      files: "Files",
      metrics: "Metrics",
      empty: "Evidence appears as the agent works.",
      conversation: "Conversation",
      show: "Show run evidence",
      hide: "Hide run evidence",
      evidence: "Run evidence",
      views: "Evidence views",
      close: "Close evidence panel",
      modelPending: "model pending",
      elapsed: "Elapsed",
      turns: "Turns",
      toolEvents: "Tool events",
      filesChanged: "Files changed",
      inputTokens: "Input tokens",
      outputTokens: "Output tokens",
      unavailable: "Unavailable values are never estimated.",
    },
  },
  "zh-CN": {
    nav: {
      proof: "证据",
      newTask: "新任务",
      recent: "最近运行",
      close: "关闭导航",
      workspace: "工作区",
      sandboxPolicy: "公共沙箱 · 20 轮上限",
    },
    header: {
      navigation: "EvoLoom 导航",
      switchLanguage: "Switch to English",
      language: "EN",
      model: "模型",
    },
    home: {
      eyebrow: "公共 AGENT 工作台",
      title: "让 Agent 工作，也让它展示过程。",
      body: "给 EvoLoom 一个具体任务，沿同一条执行线查看计划、工具调用、文件变化和最终结果。",
      label: "描述一个真实任务",
      placeholder: "检查这个项目，并找出三个最值得优先处理的可靠性问题……",
      run: "交给 EvoLoom",
      running: "正在创建受保护的工作区……",
      examples: "试试真实任务",
      configError: "暂时无法读取公开模型目录。",
      retry: "重新加载配置",
      sandbox: "公共沙箱",
      models: "个中转模型",
      turns: "轮上限",
      isolated: "访客隔离",
      loadingModel: "正在加载模型目录……",
      evidencePreview: "运行证据预览",
    },
    specimen: {
      label: "实时运行样本",
      title: "一个任务，一条可追踪的执行线。",
      stages: ["计划", "工具", "修改", "完成"],
      detail: "只有 Runtime 产生真实证据时，橙色执行线才会前进。",
    },
    proof: {
      eyebrow: "展示证据，而不是口号",
      title: "公开 Demo 应该经得起检查。",
      body: "EvoLoom 明确区分平台能力和公共部署允许的权限，并如实标记仍处于早期阶段的集成评测。",
      back: "运行 Agent",
    },
    inspector: {
      run: "运行",
      files: "文件",
      metrics: "指标",
      empty: "Agent 开始工作后，这里会出现运行证据。",
      conversation: "对话",
      show: "显示运行证据",
      hide: "隐藏运行证据",
      evidence: "运行证据",
      views: "证据视图",
      close: "关闭证据面板",
      modelPending: "模型待确认",
      elapsed: "耗时",
      turns: "轮次",
      toolEvents: "工具事件",
      filesChanged: "文件变化",
      inputTokens: "输入 Token",
      outputTokens: "输出 Token",
      unavailable: "缺失的数据不会被估算。",
    },
  },
} as const;
