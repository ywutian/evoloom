import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [sourceArg, overlayArg] = process.argv.slice(2);
if (!sourceArg || !overlayArg) {
  throw new Error(
    "Usage: prepare-agent-canvas-ui.mjs <canvas-source> <overlay>",
  );
}

const source = resolve(sourceArg);
const overlay = resolve(overlayArg);
if (
  !existsSync(`${source}/package-lock.json`) ||
  !existsSync(`${overlay}/src`)
) {
  throw new Error("Agent Canvas source or EvoLoom overlay is incomplete");
}

cpSync(overlay, source, { recursive: true, force: true });

function replaceExactly(relativePath, expected, replacement) {
  const path = `${source}/${relativePath}`;
  const current = readFileSync(path, "utf8");
  const matches = current.split(expected).length - 1;
  if (matches !== 1) {
    throw new Error(
      `${relativePath}: expected one patch anchor, found ${matches}`,
    );
  }
  writeFileSync(path, current.replace(expected, replacement));
}

replaceExactly(
  "src/root.tsx",
  'import "./index.css";',
  'import "./index.css";\nimport "./evoloom.css";',
);

replaceExactly(
  "src/root.tsx",
  'export const meta: MetaFunction = () => [\n  { title: "OpenHands" },\n  { name: "description", content: "Let\'s Start Building!" },\n];',
  'export const meta: MetaFunction = () => [\n  { title: "EvoLoom · Public Agent Workbench" },\n  { name: "description", content: "A self-evolving coding agent that shows its work." },\n];',
);

replaceExactly(
  "src/routes/root-layout.tsx",
  "          <Sidebar />",
  '          <a className="evoloom-skip-link" href="#main-content">Skip to main content</a>\n          <Sidebar />',
);

replaceExactly(
  "src/components/features/sidebar/sidebar.tsx",
  ': "md:w-[300px] md:min-w-[300px] pb-2 md:pl-2.5 md:pr-0",',
  ': "md:w-[232px] md:min-w-[232px] pb-2 md:pl-0 md:pr-0",',
);

replaceExactly(
  "src/mocks/handlers.ts",
  'import { FILE_SERVICE_HANDLERS } from "./file-service-handlers";',
  'import { FILE_SERVICE_HANDLERS } from "./file-service-handlers";\nimport { EVOLOOM_HANDLERS } from "./evoloom-handlers";',
);

replaceExactly(
  "src/mocks/handlers.ts",
  "export const handlers = [\n  ...FILE_SERVICE_HANDLERS,",
  "export const handlers = [\n  ...EVOLOOM_HANDLERS,\n  ...FILE_SERVICE_HANDLERS,",
);

console.log("[evoloom-ui] source overlay applied");
