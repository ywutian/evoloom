#!/usr/bin/env python3
from pathlib import Path

from __future__ import annotations
from typing import Any
import json

SESSION_DIR = Path.home() / ".bear-code" / "sessions"



def _ensure_dir() -> None:
    SESSION_DIR.mkdir(parents=True, exist_ok=True)

def save_session(session_id:str, data:dict[str, Any])-> None:
    _ensure_dir()
    (SESSION_DIR / f"{session_id}.json").write_text(json.dumps(data, indent=2, default=str))
