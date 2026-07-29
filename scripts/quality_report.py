from __future__ import annotations

import argparse
import ast
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_FILES = sorted((ROOT / "agents").glob("*.py"))


def build_report() -> dict[str, int | str]:
    functions: list[tuple[int, int, str]] = []
    physical_lines = 0
    logical_lines = 0
    broad_exceptions = 0

    for path in SOURCE_FILES:
        text = path.read_text(encoding="utf-8")
        tree = ast.parse(text)
        physical_lines += len(text.splitlines())
        logical_lines += sum(1 for line in text.splitlines() if line.strip() and not line.lstrip().startswith("#"))
        broad_exceptions += sum(
            isinstance(node, ast.ExceptHandler) and isinstance(node.type, ast.Name) and node.type.id == "Exception"
            for node in ast.walk(tree)
        )
        for node in ast.walk(tree):
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            length = (node.end_lineno or node.lineno) - node.lineno + 1
            complexity = 1 + sum(
                isinstance(child, (ast.If, ast.For, ast.AsyncFor, ast.While, ast.ExceptHandler, ast.IfExp, ast.Match))
                for child in ast.walk(node)
            )
            functions.append((length, complexity, f"{path.name}:{node.lineno}:{node.name}"))

    return {
        "source_files": len(SOURCE_FILES),
        "physical_lines": physical_lines,
        "logical_lines": logical_lines,
        "functions": len(functions),
        "test_files": len(list((ROOT / "tests").glob("test_*.py"))),
        "broad_exception_handlers": broad_exceptions,
        "max_function_lines": max((item[0] for item in functions), default=0),
        "max_function_complexity": max((item[1] for item in functions), default=0),
        "largest_function": max(functions, default=(0, 0, ""))[2],
        "most_complex_function": max(functions, key=lambda item: item[1], default=(0, 0, ""))[2],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="fail when a metric exceeds the checked-in budget")
    args = parser.parse_args()
    report = build_report()
    print(json.dumps(report, indent=2, ensure_ascii=False))

    if not args.check:
        return

    budget = json.loads((ROOT / "quality-budget.json").read_text(encoding="utf-8"))
    failures: list[str] = []
    for metric, limit in budget.get("maximum", {}).items():
        if int(report[metric]) > int(limit):
            failures.append(f"{metric}={report[metric]} exceeds maximum {limit}")
    for metric, limit in budget.get("minimum", {}).items():
        if int(report[metric]) < int(limit):
            failures.append(f"{metric}={report[metric]} is below minimum {limit}")
    if failures:
        raise SystemExit("Quality budget failed:\n- " + "\n- ".join(failures))


if __name__ == "__main__":
    main()
