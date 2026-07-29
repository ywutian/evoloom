from __future__ import annotations

import pytest

from agents.agent import Agent


def _tool_call(index: int) -> dict:
    return {
        "id": f"call-{index}",
        "type": "function",
        "function": {"name": "read_file", "arguments": '{"file_path":"README.md"}'},
    }


@pytest.mark.asyncio
async def test_openai_multi_tool_calls_execute_exactly_once(monkeypatch: pytest.MonkeyPatch) -> None:
    agent = Agent(
        permission_mode="bypassPermissions",
        model="test-model",
        api_base="https://example.invalid/v1",
        api_key="test-key",
        is_sub_agent=True,
        custom_system_prompt="test",
    )
    response_queue = iter(
        [
            {
                "choices": [
                    {"message": {"role": "assistant", "content": None, "tool_calls": [_tool_call(i) for i in range(3)]}}
                ],
                "usage": {"prompt_tokens": 10, "completion_tokens": 3},
            },
            {
                "choices": [{"message": {"role": "assistant", "content": "done", "tool_calls": None}}],
                "usage": {"prompt_tokens": 4, "completion_tokens": 1},
            },
        ]
    )
    executions: list[str] = []

    async def fake_stream() -> dict:
        return next(response_queue)

    async def fake_execute(name: str, inp: dict) -> str:
        executions.append(name)
        return "ok"

    async def no_compact() -> None:
        return None

    monkeypatch.setattr(agent, "_call_openai_stream", fake_stream)
    monkeypatch.setattr(agent, "_execute_tool_call", fake_execute)
    monkeypatch.setattr(agent, "_check_and_compact", no_compact)
    monkeypatch.setattr(agent, "_run_compression_pipeline", lambda: None)
    monkeypatch.setattr(agent, "_refresh_runtime_system_prompt", lambda: None)
    monkeypatch.setattr(agent, "_persist_large_result", lambda _name, result: result)
    monkeypatch.setattr(agent, "_record_tool_outcome", lambda _name, _success: None)

    await agent._chat_openai("read three files")

    assert executions == ["read_file", "read_file", "read_file"]
    tool_messages = [message for message in agent._openai_messages if message.get("role") == "tool"]
    assert [message["tool_call_id"] for message in tool_messages] == ["call-0", "call-1", "call-2"]
