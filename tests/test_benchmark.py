from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import pytest

from benchmarks.run import build_report, load_tasks, materialize_workspace, parse_usage, run_benchmark, safe_child


def test_load_tasks_rejects_duplicate_ids(tmp_path: Path) -> None:
    manifest = tmp_path / "tasks.jsonl"
    task = {
        "id": "same",
        "prompt": "fix it",
        "files": {"app.py": ""},
        "checks": [{"type": "file_exists", "path": "app.py"}],
    }
    manifest.write_text(json.dumps(task) + "\n" + json.dumps(task) + "\n", encoding="utf-8")

    with pytest.raises(ValueError, match="Duplicate task id"):
        load_tasks(manifest)


def test_workspace_paths_cannot_escape(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="escapes benchmark workspace"):
        safe_child(tmp_path, "../secret.txt")


def test_materialize_workspace_writes_declared_files(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    task = {"files": {"src/app.py": "print('ok')\n"}}
    materialize_workspace(task, workspace)
    assert (workspace / "src" / "app.py").read_text(encoding="utf-8") == "print('ok')\n"


def test_parse_usage_reads_last_cost_panel() -> None:
    output = "input 10 tokens\noutput 2 tokens\nestimate $0.0001\ninput 25 tokens\noutput 7 tokens\nestimate $0.0002"
    assert parse_usage(output) == {"input_tokens": 25, "output_tokens": 7, "estimated_cost_usd": 0.0002}


def test_report_includes_pass_rate_confidence_interval() -> None:
    records = [
        {"profile": "agent", "passed": True, "wall_time_seconds": 1.0, "estimated_cost_usd": 0.1},
        {"profile": "agent", "passed": False, "wall_time_seconds": 3.0, "estimated_cost_usd": 0.2},
    ]
    report = build_report(records)
    summary = report["profiles"][0]
    assert summary["pass_rate"] == 0.5
    assert summary["wall_time_seconds"]["median"] == 2.0
    assert summary["estimated_cost_usd"]["total"] == 0.3


def test_run_benchmark_end_to_end_with_isolated_command(tmp_path: Path) -> None:
    manifest = tmp_path / "tasks.jsonl"
    task = {
        "id": "repair-file",
        "prompt": "repair app.py",
        "files": {"app.py": "broken\n"},
        "checks": [{"type": "file_contains", "path": "app.py", "text": "fixed"}],
    }
    manifest.write_text(json.dumps(task) + "\n", encoding="utf-8")
    profile = tmp_path / "profile.json"
    profile.write_text(
        json.dumps(
            {
                "name": "mock-agent",
                "command": [
                    sys.executable,
                    "-c",
                    "from pathlib import Path; Path('app.py').write_text('fixed\\n', encoding='utf-8')",
                ],
            }
        ),
        encoding="utf-8",
    )
    args = argparse.Namespace(
        tasks=manifest,
        profile=profile,
        output=tmp_path / "results",
        run_id="test-run",
        task=None,
        repeat=1,
        timeout_seconds=30,
    )

    assert run_benchmark(args) == 0
    result = json.loads((args.output / args.run_id / "results.jsonl").read_text(encoding="utf-8"))
    assert result["passed"] is True
    assert result["profile"] == "mock-agent"
