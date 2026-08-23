# EvoLoom Benchmark Evidence

This directory is the starting point for reproducible evidence, not a claim that EvoLoom already beats another agent.

## What is measured

Each task creates a fresh isolated workspace, runs one configured agent command, preserves stdout, stderr, and the final workspace, and executes deterministic checks. The report records:

- Pass@1 and a Wilson 95% confidence interval.
- Mean, median, and P95 wall time.
- Input tokens, output tokens, and estimated cost when EvoLoom prints those values.
- Per-task command results and retained workspaces for failure review.

The bundled `tasks.smoke.jsonl` contains only six small integration tasks. It validates the harness and should not be presented as a statistically meaningful coding benchmark.

## Validate the task manifest

```bash
uv run python -m benchmarks.run validate \
  --tasks benchmarks/tasks.smoke.jsonl
```

## Run EvoLoom

Export the normal model credentials first. The checked-in profile caps each task at 20 turns and an estimated USD 0.50. It uses `--yolo` only inside a newly created isolated benchmark workspace.

```bash
uv run python -m benchmarks.run run \
  --tasks benchmarks/tasks.smoke.jsonl \
  --profile benchmarks/profiles/evoloom-full.json
```

Results are written under `benchmark-results/<run-id>/` and are ignored by Git. Every task retains:

- `workspace/`: final files produced by the agent.
- `stdout.log` and `stderr.log`: complete process evidence.
- `results.jsonl`: machine-readable task outcomes.
- `report.json`: aggregate metrics and confidence intervals.

Run a single task or repeat each task:

```bash
uv run python -m benchmarks.run run \
  --tasks benchmarks/tasks.smoke.jsonl \
  --profile benchmarks/profiles/evoloom-full.json \
  --task fix-off-by-one \
  --repeat 3
```

## Compare systems fairly

Create a second profile with the same model, temperature, turn limit, cost limit, tools, and network access. Only the harness variant should change. A profile is a JSON object with a command array:

```json
{
  "name": "comparison-agent",
  "command": ["comparison-agent", "--prompt", "{prompt}"],
  "env": {},
  "isolate_home": true
}
```

Run every profile against the same task manifest and retain all result directories. Do not compare against a paper result unless the task subset, model, tools, budget, and judge are identical.

## Evidence required before publishing a score

The full benchmark should include at least 30 representative tasks and publish:

1. Task IDs, fixture versions, prompts, and deterministic checks.
2. Exact model identifier, provider, date, tool policy, turn limit, and cost limit.
3. One result row per task, including failures and timeouts.
4. Pass@1 with a confidence interval, wall time, token usage, and cost per successful task.
5. Paired outcomes for feature ablations so significance can be tested.

The GAIA and HLE values currently documented in `wiki/评测部分.md` are historical internal results. Until their raw per-task artifacts and exact runner configuration are restored, describe them as internal measurements rather than independently reproducible benchmark results.
