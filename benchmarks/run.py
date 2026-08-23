from __future__ import annotations

import argparse
import json
import math
import os
import re
import subprocess
import sys
import time
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path
from statistics import mean, median
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
ANSI_RE = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]")


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"Expected a JSON object: {path}")
    return value


def load_tasks(path: Path) -> list[dict[str, Any]]:
    tasks: list[dict[str, Any]] = []
    seen: set[str] = set()
    for line_number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        task = json.loads(raw)
        task_id = str(task.get("id") or "").strip()
        if not task_id:
            raise ValueError(f"Missing task id at {path}:{line_number}")
        if task_id in seen:
            raise ValueError(f"Duplicate task id: {task_id}")
        if not str(task.get("prompt") or "").strip():
            raise ValueError(f"Missing prompt for task: {task_id}")
        if not isinstance(task.get("files"), dict) or not task["files"]:
            raise ValueError(f"Task must define setup files: {task_id}")
        if not isinstance(task.get("checks"), list) or not task["checks"]:
            raise ValueError(f"Task must define checks: {task_id}")
        seen.add(task_id)
        tasks.append(task)
    if not tasks:
        raise ValueError(f"No tasks found: {path}")
    return tasks


def safe_child(root: Path, relative: str) -> Path:
    candidate = (root / relative).resolve()
    try:
        candidate.relative_to(root.resolve())
    except ValueError as exc:
        raise ValueError(f"Path escapes benchmark workspace: {relative}") from exc
    return candidate


def materialize_workspace(task: dict[str, Any], workspace: Path) -> None:
    workspace.mkdir(parents=True, exist_ok=False)
    for relative, content in task["files"].items():
        target = safe_child(workspace, str(relative))
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(str(content), encoding="utf-8")


def render_command(parts: list[Any], values: dict[str, str]) -> list[str]:
    return [str(part).format_map(values) for part in parts]


def run_process(
    command: list[str], *, cwd: Path, env: dict[str, str], timeout_seconds: int
) -> dict[str, Any]:
    started = time.monotonic()
    try:
        completed = subprocess.run(
            command,
            cwd=cwd,
            env=env,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=False,
        )
        return {
            "command": command,
            "returncode": completed.returncode,
            "stdout": completed.stdout,
            "stderr": completed.stderr,
            "timed_out": False,
            "wall_time_seconds": round(time.monotonic() - started, 3),
        }
    except subprocess.TimeoutExpired as exc:
        return {
            "command": command,
            "returncode": None,
            "stdout": exc.stdout or "",
            "stderr": exc.stderr or "",
            "timed_out": True,
            "wall_time_seconds": round(time.monotonic() - started, 3),
        }


def evaluate_checks(task: dict[str, Any], workspace: Path, env: dict[str, str]) -> list[dict[str, Any]]:
    outcomes: list[dict[str, Any]] = []
    for check in task["checks"]:
        kind = str(check.get("type") or "")
        if kind == "command":
            command = [str(part) for part in check.get("command") or []]
            if not command:
                raise ValueError(f"Empty command check in task {task['id']}")
            result = run_process(
                command,
                cwd=workspace,
                env=env,
                timeout_seconds=int(check.get("timeout_seconds") or 120),
            )
            outcomes.append(
                {
                    "type": kind,
                    "passed": result["returncode"] == int(check.get("expected_returncode", 0)),
                    "command": command,
                    "returncode": result["returncode"],
                    "timed_out": result["timed_out"],
                    "stdout": result["stdout"][-4000:],
                    "stderr": result["stderr"][-4000:],
                }
            )
            continue

        relative = str(check.get("path") or "")
        target = safe_child(workspace, relative)
        if kind == "file_exists":
            outcomes.append({"type": kind, "path": relative, "passed": target.is_file()})
        elif kind in {"file_contains", "file_not_contains"}:
            text = target.read_text(encoding="utf-8") if target.is_file() else ""
            needle = str(check.get("text") or "")
            found = needle in text
            outcomes.append(
                {
                    "type": kind,
                    "path": relative,
                    "passed": found if kind == "file_contains" else not found,
                }
            )
        else:
            raise ValueError(f"Unknown check type in task {task['id']}: {kind}")
    return outcomes


def parse_usage(output: str) -> dict[str, int | float | None]:
    text = ANSI_RE.sub("", output)
    input_matches = re.findall(r"input\s+([\d,]+)\s+tokens", text, flags=re.IGNORECASE)
    output_matches = re.findall(r"output\s+([\d,]+)\s+tokens", text, flags=re.IGNORECASE)
    cost_matches = re.findall(r"estimate\s+\$([\d.]+)", text, flags=re.IGNORECASE)
    return {
        "input_tokens": int(input_matches[-1].replace(",", "")) if input_matches else None,
        "output_tokens": int(output_matches[-1].replace(",", "")) if output_matches else None,
        "estimated_cost_usd": float(cost_matches[-1]) if cost_matches else None,
    }


def percentile(values: list[float], quantile: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = max(0, math.ceil(quantile * len(ordered)) - 1)
    return round(ordered[index], 3)


def wilson_interval(passed: int, total: int, z: float = 1.96) -> tuple[float, float]:
    if total == 0:
        return 0.0, 0.0
    proportion = passed / total
    denominator = 1 + z * z / total
    center = (proportion + z * z / (2 * total)) / denominator
    margin = z * math.sqrt(proportion * (1 - proportion) / total + z * z / (4 * total * total)) / denominator
    return center - margin, center + margin


def build_report(records: list[dict[str, Any]]) -> dict[str, Any]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        grouped[str(record["profile"])].append(record)

    profiles: list[dict[str, Any]] = []
    for profile, items in sorted(grouped.items()):
        passed = sum(bool(item.get("passed")) for item in items)
        low, high = wilson_interval(passed, len(items))
        durations = [float(item["wall_time_seconds"]) for item in items]
        costs = [float(item["estimated_cost_usd"]) for item in items if item.get("estimated_cost_usd") is not None]
        profiles.append(
            {
                "profile": profile,
                "runs": len(items),
                "passed": passed,
                "pass_rate": round(passed / len(items), 4),
                "pass_rate_95ci": [round(low, 4), round(high, 4)],
                "wall_time_seconds": {
                    "mean": round(mean(durations), 3),
                    "median": round(median(durations), 3),
                    "p95": percentile(durations, 0.95),
                },
                "estimated_cost_usd": {
                    "total": round(sum(costs), 4) if costs else None,
                    "mean": round(mean(costs), 4) if costs else None,
                },
            }
        )
    return {"generated_at": datetime.now(UTC).isoformat(), "profiles": profiles}


def read_records(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def run_benchmark(args: argparse.Namespace) -> int:
    tasks = load_tasks(args.tasks)
    profile = load_json(args.profile)
    profile_name = str(profile.get("name") or args.profile.stem)
    command_template = profile.get("command")
    if not isinstance(command_template, list) or not command_template:
        raise ValueError("Profile command must be a non-empty JSON array")

    selected = set(args.task or [])
    if selected:
        tasks = [task for task in tasks if task["id"] in selected]
        missing = selected - {str(task["id"]) for task in tasks}
        if missing:
            raise ValueError(f"Unknown task ids: {', '.join(sorted(missing))}")

    run_id = args.run_id or datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    run_root = args.output / run_id
    run_root.mkdir(parents=True, exist_ok=False)
    results_path = run_root / "results.jsonl"

    for task in tasks:
        for repeat in range(1, args.repeat + 1):
            task_root = run_root / "tasks" / f"{task['id']}-r{repeat}"
            workspace = task_root / "workspace"
            materialize_workspace(task, workspace)
            isolated_home = task_root / "home"
            isolated_home.mkdir(parents=True)

            values = {
                "prompt": str(task["prompt"]),
                "project_root": str(ROOT),
                "workspace": str(workspace),
            }
            command = render_command(command_template, values)
            env = dict(os.environ)
            env.update({str(key): str(value).format_map(values) for key, value in profile.get("env", {}).items()})
            env["EVOLOOM_WORKSPACE"] = str(workspace)
            env["PYTHONUNBUFFERED"] = "1"
            if profile.get("isolate_home", True):
                env["HOME"] = str(isolated_home)

            agent_result = run_process(
                command,
                cwd=workspace,
                env=env,
                timeout_seconds=int(task.get("timeout_seconds") or args.timeout_seconds),
            )
            (task_root / "stdout.log").write_text(str(agent_result["stdout"]), encoding="utf-8")
            (task_root / "stderr.log").write_text(str(agent_result["stderr"]), encoding="utf-8")
            checks = evaluate_checks(task, workspace, env)
            usage = parse_usage(str(agent_result["stdout"]) + "\n" + str(agent_result["stderr"]))
            record = {
                "run_id": run_id,
                "task_id": task["id"],
                "category": task.get("category", "unspecified"),
                "profile": profile_name,
                "repeat": repeat,
                "passed": agent_result["returncode"] == 0 and all(item["passed"] for item in checks),
                "agent_returncode": agent_result["returncode"],
                "timed_out": agent_result["timed_out"],
                "wall_time_seconds": agent_result["wall_time_seconds"],
                "checks": checks,
                **usage,
            }
            with results_path.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(record, ensure_ascii=False) + "\n")
            state = "PASS" if record["passed"] else "FAIL"
            print(f"[{state}] {task['id']} repeat={repeat} time={record['wall_time_seconds']}s")

    records = read_records(results_path)
    report = build_report(records)
    (run_root / "report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0 if all(item["passed"] for item in records) else 1


def report_results(args: argparse.Namespace) -> int:
    records = read_records(args.results)
    if not records:
        raise ValueError(f"No result records found: {args.results}")
    print(json.dumps(build_report(records), indent=2, ensure_ascii=False))
    return 0


def validate_tasks(args: argparse.Namespace) -> int:
    tasks = load_tasks(args.tasks)
    print(f"Validated {len(tasks)} tasks from {args.tasks}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run and summarize reproducible EvoLoom benchmarks")
    subparsers = parser.add_subparsers(dest="command", required=True)

    validate = subparsers.add_parser("validate", help="Validate a JSONL task manifest")
    validate.add_argument("--tasks", type=Path, required=True)
    validate.set_defaults(handler=validate_tasks)

    run = subparsers.add_parser("run", help="Run benchmark tasks with a command profile")
    run.add_argument("--tasks", type=Path, required=True)
    run.add_argument("--profile", type=Path, required=True)
    run.add_argument("--output", type=Path, default=ROOT / "benchmark-results")
    run.add_argument("--run-id")
    run.add_argument("--task", action="append", help="Run only this task id; repeatable")
    run.add_argument("--repeat", type=int, default=1)
    run.add_argument("--timeout-seconds", type=int, default=900)
    run.set_defaults(handler=run_benchmark)

    report = subparsers.add_parser("report", help="Summarize an existing results.jsonl")
    report.add_argument("--results", type=Path, required=True)
    report.set_defaults(handler=report_results)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    try:
        raise SystemExit(args.handler(args))
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"benchmark error: {exc}", file=sys.stderr)
        raise SystemExit(2) from exc


if __name__ == "__main__":
    main()
