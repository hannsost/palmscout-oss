"""Synthetic provider responses through the real assignment, worker and review path."""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.drafts import DRAFT_CAPABILITIES, PROMPT_VERSION, model_source
from app.agents.models import AgentRun
from app.config import get_settings
from app.jobs.models import JobPosting
from app.workqueue.models import WorkItem
from tests.hr_support import HRWorkspace, body
from tests.test_agents import setup, worker


def draft_data() -> dict:
    return {
        "title": "Recruiting-Entwurf für QA Engineer",
        "sections": [
            {
                "heading": "Aufgabe",
                "body": "Softwarequalität prüfen und im Team besprechen.",
                "evidence": [{"field": "description", "quote": "Softwarequalität prüfen."}],
            },
            {
                "heading": "Arbeitsort",
                "body": "Der Arbeitsort ist Berlin.",
                "evidence": [{"field": "location", "quote": "Berlin"}],
            },
        ],
        "open_questions": ["Welche Arbeitszeit ist vorgesehen?"],
    }


def provider(monkeypatch: pytest.MonkeyPatch, *, content: str | None = None):
    response = SimpleNamespace(
        content=json.dumps(draft_data()) if content is None else content,
        response_metadata={"finish_reason": "stop", "model_name": "synthetic-drafts-model"},
        additional_kwargs={},
        usage_metadata={"input_tokens": 420, "output_tokens": 180},
    )
    model = SimpleNamespace(ainvoke=AsyncMock(return_value=response))
    model.bind = Mock(return_value=model)
    get_llm = AsyncMock(return_value=model)
    monkeypatch.setattr("app.ai.client.get_llm", get_llm)
    monkeypatch.setattr(get_settings(), "agents_external_ai_enabled", True)
    return model, response, get_llm


@pytest.mark.parametrize("capability", sorted(DRAFT_CAPABILITIES))
async def test_draft_is_source_checked_persisted_and_reviewed_without_publishing(
    client: AsyncClient,
    db_session: AsyncSession,
    hr_workspace: HRWorkspace,
    monkeypatch: pytest.MonkeyPatch,
    capability: str,
) -> None:
    model, _, llm = provider(monkeypatch)
    h = hr_workspace
    agent, data = await setup(client, db_session, h, capability=capability, max_attempts=1)
    data["authorize_ai"] = True
    run = body(
        await client.post(f'/agents/{agent["id"]}/tasks', headers=h.headers(), json=data), 201
    )
    replay = body(
        await client.post(f'/agents/{agent["id"]}/tasks', headers=h.headers(), json=data), 201
    )
    assert replay["id"] == run["id"]
    await worker(db_session, monkeypatch)
    path = f'/agents/runs/{run["id"]}'
    ready = body(await client.get(path, headers=h.headers()))
    assert ready["status"] == "awaiting_review"
    assert ready["structured_output"] == draft_data()
    assert ready["prompt_version"] == PROMPT_VERSION
    assert ready["provider_model"] == "synthetic-drafts-model"
    assert (ready["input_tokens"], ready["output_tokens"]) == (420, 180)
    assert ready["attempts"] == ready["max_attempts"] == 1
    model.ainvoke.assert_awaited_once()
    llm.assert_awaited_once_with(temperature=0.2, max_retries=0, max_tokens=2400)
    supplied = json.loads(model.ainvoke.await_args.args[0][1][1])
    assert supplied == model_source(ready["source"])
    assert "instructions" not in supplied and "task_title" not in supplied
    assert "provider_fingerprint" not in supplied and "prompt_version" not in supplied
    format_spec = model.bind.call_args.kwargs["response_format"]
    assert format_spec["json_schema"]["strict"] is True
    assert format_spec["json_schema"]["schema"]["additionalProperties"] is False
    scoped = (
        await client.get("/agents/runs", params={"job_id": data["job_id"]}, headers=h.headers())
    ).json()
    assert [item["id"] for item in scoped] == [run["id"]]
    assert (
        await client.get(
            "/agents/runs", params={"job_id": data["job_id"]}, headers=h.headers("other_hr")
        )
    ).json() == []
    assert (await client.get(path, headers=h.headers("other_hr"))).status_code == 404
    assert (await client.get(path, headers=h.headers("worker"))).status_code == 403
    approved = body(
        await client.post(
            path + "/review",
            headers=h.headers(),
            json={
                "expected_version": ready["version"],
                "decision": "approve",
                "note": "Quellen und Entwurf sachlich geprüft.",
            },
        )
    )
    assert approved["status"] == "approved" and approved["structured_output"] == draft_data()
    job = await db_session.get(JobPosting, uuid.UUID(data["job_id"]), populate_existing=True)
    assert (
        job and job.publication_status == "draft" and job.description == "Softwarequalität prüfen."
    )


@pytest.mark.parametrize("invalidation", ["cancel", "expired", "replaced"])
async def test_invalidated_claim_never_calls_provider(
    client: AsyncClient,
    db_session: AsyncSession,
    hr_workspace: HRWorkspace,
    monkeypatch: pytest.MonkeyPatch,
    invalidation: str,
) -> None:
    from app.agents.execution import execute
    from app.workqueue.service import claim_next, complete, current_claim

    model, _, llm = provider(monkeypatch)
    h = hr_workspace
    agent, data = await setup(client, db_session, h, capability="ai_job_ad", max_attempts=1)
    data["authorize_ai"] = True
    run = body(
        await client.post(f'/agents/{agent["id"]}/tasks', headers=h.headers(), json=data), 201
    )
    claim = None
    for _ in range(3):
        candidate = await claim_next(db_session)
        assert candidate
        if candidate.kind == "agent_task":
            claim = candidate
            break
        # The vacancy also enqueues independent embedding work.
        item = await current_claim(db_session, candidate)
        assert item
        complete(item)
        await db_session.flush()
    assert claim and claim.payload["run_id"] == run["id"]
    await db_session.commit()

    if invalidation == "cancel":
        cancelled = body(
            await client.post(
                f'/agents/runs/{run["id"]}/cancel',
                headers=h.headers(),
                json={"expected_version": run["version"]},
            )
        )
        assert cancelled["status"] == "cancelled"
    else:
        item = await db_session.get(WorkItem, claim.id, populate_existing=True)
        assert item
        if invalidation == "expired":
            item.lease_until = datetime.now(UTC) - timedelta(seconds=1)
        else:
            item.claim_token = uuid.uuid4()
    await db_session.commit()

    def sessions() -> AsyncSession:
        return AsyncSession(
            bind=db_session.bind, expire_on_commit=False, join_transaction_mode="create_savepoint"
        )

    monkeypatch.setattr("app.agents.execution.AsyncSessionLocal", sessions)
    await execute(claim)

    llm.assert_not_awaited()
    model.ainvoke.assert_not_awaited()
    stored = await db_session.get(AgentRun, uuid.UUID(run["id"]), populate_existing=True)
    assert stored and stored.output is None and stored.structured_output is None
    assert stored.status == ("cancelled" if invalidation == "cancel" else "queued")


@pytest.mark.parametrize("capability", sorted(DRAFT_CAPABILITIES))
async def test_new_capabilities_require_single_attempt_operator_and_data_permission(
    client: AsyncClient,
    db_session: AsyncSession,
    hr_workspace: HRWorkspace,
    monkeypatch: pytest.MonkeyPatch,
    capability: str,
) -> None:
    h = hr_workspace
    agent, data = await setup(client, db_session, h, capability=capability, max_attempts=1)
    path = f'/agents/{agent["id"]}/tasks'
    assert (await client.post(path, headers=h.headers(), json=data)).status_code == 422
    data["authorize_ai"] = True
    monkeypatch.setattr(get_settings(), "agents_external_ai_enabled", False)
    assert (await client.post(path, headers=h.headers(), json=data)).status_code == 403
    assert (
        await client.post(
            "/agents",
            headers=h.headers(),
            json={
                "name": "Invalid retry",
                "owner_id": str(h.hr.id),
                "capability": capability,
                "max_attempts": 2,
            },
        )
    ).status_code == 422
    assert (await client.get("/agents/runs", headers=h.headers())).json() == []


@pytest.mark.parametrize(
    "failure",
    [
        "malformed",
        "fabricated_quote",
        "unknown_source",
        "extra_field",
        "empty_sections",
        "oversized_section",
        "truncated",
        "refused",
        "timeout",
        "missing_finish",
        "missing_provider",
    ],
)
async def test_invalid_provider_results_fail_once_without_reviewable_artifact(
    client: AsyncClient,
    db_session: AsyncSession,
    hr_workspace: HRWorkspace,
    monkeypatch: pytest.MonkeyPatch,
    failure: str,
) -> None:
    model, response, llm = provider(monkeypatch)
    data_out = draft_data()
    if failure == "fabricated_quote":
        data_out["sections"][0]["evidence"][0]["quote"] = "30 Tage Urlaub"
    elif failure == "unknown_source":
        data_out["sections"][0]["evidence"][0]["field"] = "instructions"
    elif failure == "extra_field":
        data_out["publish"] = True
    elif failure == "empty_sections":
        data_out["sections"] = []
    elif failure == "oversized_section":
        data_out["sections"][0]["body"] = "x" * 2501
    response.content = "not JSON" if failure == "malformed" else json.dumps(data_out)
    if failure == "truncated":
        response.response_metadata["finish_reason"] = "length"
    elif failure == "refused":
        response.additional_kwargs["refusal"] = "Synthetic refusal"
    elif failure == "timeout":
        model.ainvoke.side_effect = TimeoutError()
    elif failure == "missing_finish":
        response.response_metadata = {}
    elif failure == "missing_provider":
        llm.return_value = None
    h = hr_workspace
    agent, data = await setup(client, db_session, h, capability="ai_job_ad", max_attempts=1)
    data["authorize_ai"] = True
    run = body(
        await client.post(f'/agents/{agent["id"]}/tasks', headers=h.headers(), json=data), 201
    )
    await worker(db_session, monkeypatch)
    path = f'/agents/runs/{run["id"]}'
    failed = body(await client.get(path, headers=h.headers()))
    assert failed["status"] == "failed" and failed["attempts"] == 1
    assert failed["structured_output"] is None and failed["output"] is None
    await worker(db_session, monkeypatch)
    assert model.ainvoke.await_count == (0 if failure == "missing_provider" else 1)
    assert (
        await client.post(
            path + "/review",
            headers=h.headers(),
            json={
                "expected_version": failed["version"],
                "decision": "approve",
                "note": "Cannot approve failure",
            },
        )
    ).status_code == 409


@pytest.mark.parametrize("change", ["job", "prompt", "provider"])
async def test_changed_source_or_configuration_blocks_prepared_draft(
    client: AsyncClient,
    db_session: AsyncSession,
    hr_workspace: HRWorkspace,
    monkeypatch: pytest.MonkeyPatch,
    change: str,
) -> None:
    model, response, _ = provider(monkeypatch)
    h = hr_workspace
    agent, data = await setup(client, db_session, h, capability="ai_interview_kit", max_attempts=1)
    data["authorize_ai"] = True
    run = body(
        await client.post(f'/agents/{agent["id"]}/tasks', headers=h.headers(), json=data), 201
    )

    async def change_during_call(*args, **kwargs):
        if change == "job":
            job = await db_session.get(JobPosting, uuid.UUID(data["job_id"]))
            assert job
            job.version += 1
        elif change == "prompt":
            stored = await db_session.get(AgentRun, uuid.UUID(run["id"]))
            assert stored
            stored.source = {**stored.source, "prompt_version": "superseded"}
        else:
            monkeypatch.setattr(get_settings(), "openai_model", "changed-provider-model")
        await db_session.commit()
        return response

    model.ainvoke.side_effect = change_during_call
    await worker(db_session, monkeypatch)
    blocked = body(await client.get(f'/agents/runs/{run["id"]}', headers=h.headers()))
    assert blocked["status"] == "blocked"
    assert blocked["output"] is None and blocked["structured_output"] is None


async def test_missing_usage_is_not_invented_and_input_size_is_bounded(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.agents.execution import prepare, provider_fingerprint
    from app.agents.models import AgentVersion

    _, response, _ = provider(monkeypatch)
    response.usage_metadata = None
    source = {
        "description": "Softwarequalität prüfen.",
        "location": "Berlin",
        "provider_fingerprint": provider_fingerprint(),
        "prompt_version": PROMPT_VERSION,
    }
    result = await prepare(AgentVersion(capability="ai_job_ad"), source)
    assert result.input_tokens is None and result.output_tokens is None
    with pytest.raises(ValueError, match="input limit"):
        model_source({"skills": "x" * 20001})
