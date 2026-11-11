"""Small live compatibility/quality sample; synthetic vacancies only, no database writes.

Requires --live and the operator's existing AI configuration. Never enables agent
AI globally. Reports are local and never contain keys, provider URLs or raw errors.
"""

from __future__ import annotations

import argparse
import asyncio
import json
from datetime import UTC, datetime
from pathlib import Path

from app import model_registry  # noqa: F401
from app.agents.drafts import DRAFT_CAPABILITIES, PROMPT_VERSION
from app.agents.execution import ProviderUnavailable, prepare, provider_fingerprint
from app.agents.models import AgentVersion
from app.config import get_settings


async def evaluate(report: Path, capabilities: list[str]) -> int:
    report.mkdir(parents=True, exist_ok=False)
    source = {
        "title": "QA Engineer",
        "company": "Synthetische Beispiel GmbH",
        "description": "Webanwendungen testen, reproduzierbare Fehlerberichte schreiben und automatisierte Regressionstests mit Playwright pflegen. Zusammenarbeit mit Entwicklung und Produktteam.",
        "location": "Berlin",
        "skills": "Softwaretests, Playwright, verständliche Fehlerberichte",
        "salary_min": "",
        "salary_max": "",
        "prompt_version": PROMPT_VERSION,
        "provider_fingerprint": provider_fingerprint(),
    }
    results: list[dict[str, object]] = []
    for capability in capabilities:
        try:
            artifact = await prepare(AgentVersion(capability=capability), source)
        except (ProviderUnavailable, ValueError) as exc:
            cause = exc.__cause__
            results.append(
                {
                    "capability": capability,
                    "status": "failed",
                    "error_code": type(exc).__name__,
                    "reason": str(exc) if isinstance(exc, ProviderUnavailable) else "Invalid input",
                    "cause_type": type(cause).__name__ if cause else None,
                    "provider_http_status": getattr(cause, "status_code", None),
                }
            )
        else:
            results.append(
                {
                    "capability": capability,
                    "status": "passed",
                    "model": artifact.model,
                    "draft": artifact.draft.model_dump() if artifact.draft else None,
                    "input_tokens": artifact.input_tokens,
                    "output_tokens": artifact.output_tokens,
                }
            )
    passed = all(item["status"] == "passed" for item in results)
    summary = {
        "status": "passed" if passed else "failed",
        "finished_at": datetime.now(UTC).isoformat(),
        "scope": "Synthetic compatibility samples; human quality review required; no production quality certification.",
        "source": {key: value for key, value in source.items() if key != "provider_fingerprint"},
        "results": results,
    }
    (report / "results.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2))
    print(json.dumps({"status": summary["status"], "cases": len(results)}, ensure_ascii=False))
    return 0 if passed else 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--live", action="store_true", help="Make bounded calls to the configured provider"
    )
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--capability", action="append", choices=sorted(DRAFT_CAPABILITIES))
    args = parser.parse_args()
    settings = get_settings()
    if (
        not args.live
        or not settings.agents_external_ai_enabled
        or settings.ai_mock_mode
        or not settings.openai_api_key
    ):
        parser.error(
            "Explicit --live and an enabled, configured non-mock AI provider are required."
        )
    return asyncio.run(evaluate(args.report, sorted(set(args.capability or DRAFT_CAPABILITIES))))


if __name__ == "__main__":
    raise SystemExit(main())
