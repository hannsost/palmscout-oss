"""Beta-release smoke tests – Sprint 0.8.

Feedback integration and SolveIT transport coverage lives in test_feedback.py;
this module keeps the lightweight authentication boundary smoke test here.
"""

from __future__ import annotations

from httpx import AsyncClient

# ── Feedback: authentication boundary ────────────────────────────────────────


async def test_feedback_requires_authentication(client: AsyncClient) -> None:
    response = await client.post(
        "/feedback",
        json={
            "category": "general",
            "message": "Das Produkt ist super! Weiter so.",
        },
    )
    assert response.status_code == 401


# ── Health check ──────────────────────────────────────────────────────────────


async def test_health_endpoint(client: AsyncClient) -> None:
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "version" in data


# ── OpenAPI docs live ─────────────────────────────────────────────────────────


async def test_openapi_docs_accessible(client: AsyncClient) -> None:
    response = await client.get("/docs")
    assert response.status_code == 200
    assert "text/html" in response.headers.get("content-type", "")


async def test_redoc_accessible(client: AsyncClient) -> None:
    response = await client.get("/redoc")
    assert response.status_code == 200
    assert "text/html" in response.headers.get("content-type", "")


async def test_openapi_schema_has_all_routers(client: AsyncClient) -> None:
    """Smoke test: OpenAPI schema includes all major route prefixes."""
    response = await client.get("/openapi.json")
    assert response.status_code == 200
    schema = response.json()
    paths = schema.get("paths", {})
    for prefix in [
        "/auth/register",
        "/profiles/me",
        "/ai/cover-letter",
        "/jobs/recommended",
        "/applications",
        "/feedback",
    ]:
        assert any(
            p.startswith(prefix) for p in paths
        ), f"Route prefix {prefix!r} missing from OpenAPI schema"
