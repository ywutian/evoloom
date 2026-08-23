"""ACP stdio adapter for running EvoLoom behind Agent Canvas."""

from __future__ import annotations

import asyncio
import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from uuid import uuid4

from acp import (
    PROTOCOL_VERSION,
    InitializeResponse,
    LoadSessionResponse,
    NewSessionResponse,
    PromptResponse,
    run_agent,
    text_block,
    update_agent_message,
)
from acp import (
    Agent as ACPAgent,
)
from acp.interfaces import Client
from acp.schema import (
    AgentCapabilities,
    AudioContentBlock,
    ClientCapabilities,
    EmbeddedResourceContentBlock,
    HttpMcpServer,
    ImageContentBlock,
    Implementation,
    McpServerStdio,
    ResourceContentBlock,
    SessionConfigOptionSelect,
    SessionConfigSelectOption,
    SetSessionConfigOptionResponse,
    SseMcpServer,
    TextContentBlock,
)

from agents.agent import Agent as EvoLoomAgent
from agents.tools import tool_definitions

PUBLIC_TOOL_NAMES = {
    "read_file",
    "write_file",
    "edit_file",
    "list_files",
    "grep_search",
    "compact_context",
}

DEFAULT_PUBLIC_MODELS = (
    ("gpt-4o-mini", "GPT-4o mini"),
)


@dataclass
class SessionState:
    cwd: Path
    agent: EvoLoomAgent
    output: asyncio.Queue[str]


def _clean_env(name: str, default: str | None = None) -> str | None:
    value = os.environ.get(name, default)
    return value.strip() if value and value.strip() else None


def _prompt_text(prompt: list[Any]) -> str:
    chunks: list[str] = []
    for block in prompt:
        text = block.get("text", "") if isinstance(block, dict) else getattr(block, "text", "")
        if text:
            chunks.append(str(text))
    return "\n\n".join(chunks).strip()


def _public_models() -> tuple[tuple[str, str], ...]:
    raw_models = _clean_env("EVOLOOM_PUBLIC_MODELS")
    if not raw_models:
        return DEFAULT_PUBLIC_MODELS
    model_ids = tuple(dict.fromkeys(item.strip() for item in raw_models.split(",") if item.strip()))
    return tuple((model_id, model_id) for model_id in model_ids) or DEFAULT_PUBLIC_MODELS


def _model_option(current_model: str) -> SessionConfigOptionSelect:
    return SessionConfigOptionSelect(
        type="select",
        id="model",
        name="Model",
        description="OpenAI model used by this EvoLoom session.",
        category="model",
        current_value=current_model,
        options=[
            SessionConfigSelectOption(value=model_id, name=label)
            for model_id, label in _public_models()
        ],
    )


class EvoLoomACP(ACPAgent):
    """Expose one stateful EvoLoom agent per Agent Canvas conversation."""

    _conn: Client

    def __init__(self) -> None:
        self._sessions: dict[str, SessionState] = {}

    def on_connect(self, conn: Client) -> None:
        self._conn = conn

    async def initialize(
        self,
        protocol_version: int,
        client_capabilities: ClientCapabilities | None = None,
        client_info: Implementation | None = None,
        **kwargs: Any,
    ) -> InitializeResponse:
        return InitializeResponse(
            protocol_version=min(protocol_version, PROTOCOL_VERSION),
            agent_capabilities=AgentCapabilities(),
            # Canvas recognizes this as a Codex-compatible ACP server and enables
            # its curated model picker; EvoLoom remains the displayed title.
            agent_info=Implementation(name="codex-acp-evoloom", title="EvoLoom", version="0.3.0"),
        )

    def _create_session(self, session_id: str, cwd: str) -> SessionState:
        workspace = Path(cwd).expanduser().resolve()
        workspace.mkdir(parents=True, exist_ok=True)
        os.environ["EVOLOOM_WORKSPACE"] = str(workspace)

        output: asyncio.Queue[str] = asyncio.Queue()
        api_base = _clean_env("OPENAI_BASE_URL", "https://api.openai.com/v1")
        api_key = _clean_env("OPENAI_API_KEY")
        model = _clean_env("MODEL", "gpt-4o-mini") or "gpt-4o-mini"
        public_mode = _clean_env("EVOLOOM_PUBLIC_MODE") == "1"
        public_tools = [tool for tool in tool_definitions if tool["name"] in PUBLIC_TOOL_NAMES]
        agent = EvoLoomAgent(
            permission_mode="acceptEdits",
            model=model,
            api_base=api_base,
            api_key=api_key,
            max_cost_usd=float(_clean_env("EVOLOOM_MAX_COST_USD", "1") or "1"),
            max_turns=int(_clean_env("EVOLOOM_MAX_TURNS", "20") or "20"),
            confirm_fn=self._deny_unattended_confirmation,
            custom_tools=public_tools if public_mode else None,
            text_callback=output.put_nowait,
        )
        state = SessionState(cwd=workspace, agent=agent, output=output)
        self._sessions[session_id] = state
        return state

    @staticmethod
    async def _deny_unattended_confirmation(_: str) -> bool:
        return False

    async def new_session(
        self,
        cwd: str,
        additional_directories: list[str] | None = None,
        mcp_servers: list[HttpMcpServer | SseMcpServer | McpServerStdio] | None = None,
        **kwargs: Any,
    ) -> NewSessionResponse:
        session_id = uuid4().hex
        self._create_session(session_id, cwd)
        state = self._sessions[session_id]
        return NewSessionResponse(
            session_id=session_id,
            modes=None,
            config_options=[_model_option(state.agent.model)],
        )

    async def load_session(
        self,
        cwd: str,
        session_id: str,
        additional_directories: list[str] | None = None,
        mcp_servers: list[HttpMcpServer | SseMcpServer | McpServerStdio] | None = None,
        **kwargs: Any,
    ) -> LoadSessionResponse:
        if session_id not in self._sessions:
            self._create_session(session_id, cwd)
        state = self._sessions[session_id]
        return LoadSessionResponse(config_options=[_model_option(state.agent.model)])

    async def set_config_option(
        self,
        config_id: str,
        session_id: str,
        value: str | bool,
        **kwargs: Any,
    ) -> SetSessionConfigOptionResponse:
        state = self._sessions.get(session_id)
        if state is None:
            raise ValueError("Unknown session")
        allowed_models = {model_id for model_id, _ in _public_models()}
        if config_id != "model" or not isinstance(value, str) or value not in allowed_models:
            raise ValueError("Unsupported model")
        state.agent.set_model(value)
        return SetSessionConfigOptionResponse(config_options=[_model_option(value)])

    async def prompt(
        self,
        session_id: str,
        prompt: list[
            TextContentBlock
            | ImageContentBlock
            | AudioContentBlock
            | ResourceContentBlock
            | EmbeddedResourceContentBlock
        ],
        **kwargs: Any,
    ) -> PromptResponse:
        state = self._sessions.get(session_id)
        if state is None:
            fallback_cwd = _clean_env("EVOLOOM_WORKSPACE", "/workspace") or "/workspace"
            state = self._create_session(session_id, fallback_cwd)

        user_message = _prompt_text(prompt)
        if not user_message:
            await self._conn.session_update(
                session_id, update_agent_message(text_block("EvoLoom currently accepts text prompts."))
            )
            return PromptResponse(stop_reason="end_turn")

        task = asyncio.create_task(state.agent.chat(user_message))
        while not task.done():
            try:
                chunk = await asyncio.wait_for(state.output.get(), timeout=0.1)
            except TimeoutError:
                continue
            await self._conn.session_update(session_id, update_agent_message(text_block(chunk)))

        await task
        while not state.output.empty():
            chunk = state.output.get_nowait()
            await self._conn.session_update(session_id, update_agent_message(text_block(chunk)))
        return PromptResponse(stop_reason="end_turn")

    async def cancel(self, session_id: str, **kwargs: Any) -> None:
        state = self._sessions.get(session_id)
        if state is not None:
            state.agent.abort()


async def _main() -> None:
    logging.basicConfig(level=logging.INFO)
    await run_agent(EvoLoomACP())


def main() -> None:
    asyncio.run(_main())


if __name__ == "__main__":
    main()
