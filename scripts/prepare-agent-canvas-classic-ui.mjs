import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const [sourceArg, overlayArg] = process.argv.slice(2);
if (!sourceArg || !overlayArg) {
  throw new Error("Usage: prepare-agent-canvas-classic-ui.mjs <canvas-source> <overlay>");
}

const source = resolve(sourceArg);
const overlay = resolve(overlayArg);
if (!existsSync(`${source}/package-lock.json`) || !existsSync(`${overlay}/src`)) {
  throw new Error("Agent Canvas source or EvoLoom overlay is incomplete");
}

const files = [
  "public/favicon.svg",
  "src/evoloom-classic.css",
  "src/evoloom/brand.tsx",
  "src/evoloom/config.ts",
  "src/hooks/use-app-title.ts",
  "src/hooks/use-chat-input-model-state.ts",
  "src/components/shared/buttons/openhands-logo-button.tsx",
];

for (const relativePath of files) {
  const destination = `${source}/${relativePath}`;
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(`${overlay}/${relativePath}`, destination, { force: true });
}

function replaceExactly(relativePath, expected, replacement) {
  const path = `${source}/${relativePath}`;
  const current = readFileSync(path, "utf8");
  const matches = current.split(expected).length - 1;
  if (matches !== 1) {
    throw new Error(`${relativePath}: expected one patch anchor, found ${matches}`);
  }
  writeFileSync(path, current.replace(expected, replacement));
}

replaceExactly(
  "src/root.tsx",
  'import "./index.css";',
  'import "./index.css";\nimport "./evoloom-classic.css";',
);

replaceExactly(
  "src/root.tsx",
  'export const meta: MetaFunction = () => [\n  { title: "OpenHands" },\n  { name: "description", content: "Let\'s Start Building!" },\n];',
  'export const meta: MetaFunction = () => [\n  { title: "EvoLoom" },\n  { name: "description", content: "A focused public coding-agent workbench." },\n];',
);

console.log("[evoloom-ui] classic polish overlay applied");
