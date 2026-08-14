.PHONY: setup test lint quality build

setup:
	uv sync --extra dev --frozen

test:
	uv run pytest -q

lint:
	uv run ruff check agents tests scripts

quality: lint test
	uv run python scripts/quality_report.py --check

build:
	docker build -t evoloom:local .
