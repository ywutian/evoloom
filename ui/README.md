# EvoLoom Agent Canvas UI

The public demo keeps Agent Canvas's ACP, conversation protocol, and familiar
classic layout while applying a small EvoLoom brand and model-selection
overlay from source.

## Reproducible upstream

- Upstream: `OpenHands/OpenHands`
- Release: `v1.15.0`
- Commit: `ab23be62ad724fe83483036a0900bed7b7859166`
- Source archive SHA-256: `08100bfb8f8395b0a7e236634c06084cb5964cffa29ac7a7245cd2df47c7fa6b`
- License: MIT (the upstream `LICENSE` remains in the build source)

`Dockerfile.cloudrun` downloads only that verified snapshot. The
`agent-canvas-overlay` directory contains the additive source files;
`scripts/prepare-agent-canvas-classic-ui.mjs` performs exact, fail-closed edits
to apply the classic EvoLoom theme and metadata.

## Runtime configuration

The UI never edits generated bundles. It reads the model catalog and public
sandbox limits from `GET /api/evoloom/config`. A model choice is validated by
`POST /api/evoloom/model`, stored in an HttpOnly visitor cookie, and applied by
the gateway when the next conversation is created.

## Local verification

Agent Canvas requires Node 22.12 or newer; the container uses Node 24.

```bash
node scripts/prepare-agent-canvas-ui.mjs /path/to/agent-canvas ui/agent-canvas-overlay
cd /path/to/agent-canvas
npm ci
npm run typecheck
npm run build
npx vitest run src/evoloom
```

The Cloud Run image is still based on `ghcr.io/openhands/agent-canvas:1.15.0`;
only `/opt/agent-canvas/frontend` is replaced with the verified custom build.
