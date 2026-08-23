# Contributing to EvoLoom

Thanks for helping improve EvoLoom. Keep changes focused, auditable, and safe
for a local coding-agent runtime.

## Development setup

Requirements: Python 3.11-3.13, `uv`, Git, and Node.js 22 or newer for the
public gateway tests.

```bash
uv sync --extra dev --frozen
uv run ruff check agents benchmarks tests scripts
uv run pytest
node --check scripts/public-gateway.mjs
node --test tests/test_public_gateway.mjs
uv run python scripts/quality_report.py --check
```

For container changes, build both `Dockerfile` and `Dockerfile.cloudrun`.

## Pull requests

- Explain the user-visible behavior and security impact.
- Add tests for new behavior, especially permissions, ownership, persistence,
  model selection, and tool execution.
- Do not commit `.env`, sessions, memory, benchmark results, credentials, or
  generated build output.
- Do not add benchmark claims without frozen tasks, per-task evidence, runner
  configuration, failures, and reproducible aggregation.
- Preserve the current public gateway restrictions unless the change includes
  a documented threat-model review.

Run the complete local checks before opening a pull request. CI must pass on
all supported Python versions.

## Reporting security issues

Do not disclose a suspected vulnerability in a public issue. Follow
`SECURITY.md` instead.
