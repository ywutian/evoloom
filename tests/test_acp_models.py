from __future__ import annotations

from pathlib import Path

import pytest

from agents import acp_server


class FakeAgent:
    def __init__(self, *, model: str, **kwargs: object) -> None:
        self.model = model

    def set_model(self, model: str) -> None:
        self.model = model


@pytest.mark.asyncio
async def test_acp_advertises_and_switches_verified_model(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(acp_server, "EvoLoomAgent", FakeAgent)
    monkeypatch.setenv("MODEL", "gpt-5.6-terra")
    monkeypatch.setenv("EVOLOOM_PUBLIC_MODELS", "gpt-5.6-sol,gpt-5.6-terra")
    adapter = acp_server.EvoLoomACP()

    created = await adapter.new_session(str(tmp_path))
    model_option = created.config_options[0]
    assert "gpt-5.6-sol" in {option.value for option in model_option.options}
    assert "gpt-5.5" not in {option.value for option in model_option.options}

    switched = await adapter.set_config_option("model", created.session_id, "gpt-5.6-sol")
    assert switched.config_options[0].current_value == "gpt-5.6-sol"
    assert adapter._sessions[created.session_id].agent.model == "gpt-5.6-sol"


@pytest.mark.asyncio
async def test_acp_rejects_model_outside_allowlist(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(acp_server, "EvoLoomAgent", FakeAgent)
    monkeypatch.setenv("MODEL", "gpt-5.6-terra")
    monkeypatch.setenv("EVOLOOM_PUBLIC_MODELS", "gpt-5.6-sol,gpt-5.6-terra")
    adapter = acp_server.EvoLoomACP()
    created = await adapter.new_session(str(tmp_path))

    with pytest.raises(ValueError, match="Unsupported model"):
        await adapter.set_config_option("model", created.session_id, "attacker/model")


@pytest.mark.asyncio
async def test_agent_identity_enables_canvas_codex_catalog() -> None:
    adapter = acp_server.EvoLoomACP()
    response = await adapter.initialize(acp_server.PROTOCOL_VERSION)
    assert response.agent_info.name == "codex-acp-evoloom"
    assert response.agent_info.title == "EvoLoom"
