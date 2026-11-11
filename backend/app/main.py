import os
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import get_settings
from app.sentry import init_sentry

settings = get_settings()

# ── Sentry (Sprint 0.8 – no-op if DSN not set) ───────────────────────────────
init_sentry(dsn=settings.sentry_dsn, environment=settings.app_env)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # Startup
    from sqlalchemy import text

    from app.database import engine

    async with engine.begin() as conn:
        if settings.is_production:
            vector_ready = await conn.scalar(
                text("SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector')")
            )
            result = await conn.execute(text("SELECT version_num FROM alembic_version"))
            revisions = result.scalars().all()
            if not vector_ready or revisions != ["054"]:
                raise RuntimeError("Production startup requires pgvector and migration 054.")
        else:
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))

    yield

    # Shutdown
    from app.cache import close_redis_pool

    await engine.dispose()
    await close_redis_pool()


app = FastAPI(
    title="palmscout API",
    description="KI-gestütztes Workforce Operating System – Recruiting, Zeitarbeit & Partner-Ökosystem",
    version=settings.app_version,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    # ALLOWED_ORIGINS (.env) is the single source of truth for CORS — keep it
    # in sync with HIREOS_FRONTEND_PORT in docker-compose.yml. A permissive
    # dev regex was tried here before but was reverted: it silently masks
    # exactly the kind of .env/port drift that caused blocker B-1.
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.exceptions import register_exception_handlers  # noqa: E402
from app.logging_config import configure_logging  # noqa: E402
from app.middleware import (  # noqa: E402
    RequestIDMiddleware,
    TenantFromHostMiddleware,
    TimingMiddleware,
)

configure_logging()
app.add_middleware(RequestIDMiddleware)
app.add_middleware(TimingMiddleware)
app.add_middleware(TenantFromHostMiddleware)
register_exception_handlers(app)

# ── Rate limiting (Sprint 0.8) ────────────────────────────────────────────────
try:
    from slowapi import Limiter, _rate_limit_exceeded_handler
    from slowapi.errors import RateLimitExceeded
    from slowapi.middleware import SlowAPIMiddleware
    from slowapi.util import get_remote_address

    limiter = Limiter(
        key_func=get_remote_address,
        default_limits=[f"{settings.rate_limit_per_minute}/minute"],
    )
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]
    app.add_middleware(SlowAPIMiddleware)
except ImportError:
    pass  # slowapi optional – no rate limiting without it

# ── Routers ───────────────────────────────────────────────────────────────────
from app.absences.hr_router import router as hr_absences_router  # noqa: E402
from app.absences.worker_router import router as worker_absences_router  # noqa: E402
from app.admin.router import router as admin_router  # noqa: E402
from app.agents.router import router as agents_router  # noqa: E402
from app.ai.router import router as ai_router  # noqa: E402
from app.applications.router import router as applications_router  # noqa: E402
from app.auth.router import router as auth_router  # noqa: E402
from app.automation.router import router as automation_router  # noqa: E402
from app.billing.router import router as billing_router  # noqa: E402
from app.companies.router import router as companies_router  # noqa: E402
from app.dms.router import bulk_router as dms_bulk_router  # noqa: E402
from app.dms.router import categories_router as dms_categories_router  # noqa: E402
from app.dms.router import router as dms_router  # noqa: E402
from app.equipment.hr_router import router as equipment_hr_router  # noqa: E402
from app.equipment.worker_router import router as equipment_worker_router  # noqa: E402
from app.feedback.router import router as feedback_router  # noqa: E402
from app.finance.router import router as finance_router  # noqa: E402
from app.interviews.room_router import router as interview_rooms_router  # noqa: E402
from app.interviews.router import router as interviews_router  # noqa: E402
from app.jobs.router import router as jobs_router  # noqa: E402
from app.maps.router import router as maps_router  # noqa: E402
from app.messages.hr_router import router as hr_messages_router  # noqa: E402
from app.messages.worker_router import router as worker_messages_router  # noqa: E402
from app.mobility.router import router as mobility_router  # noqa: E402
from app.notifications.router import router as notifications_router  # noqa: E402
from app.observability.router import router as observability_router  # noqa: E402
from app.orgcharts.router import router as orgcharts_router  # noqa: E402
from app.partners.router import router as partners_router  # noqa: E402
from app.payroll.hr_router import router as payroll_hr_router  # noqa: E402
from app.payroll.worker_router import router as payroll_worker_router  # noqa: E402
from app.pipeline.router import router as pipeline_router  # noqa: E402
from app.placements.router import router as placements_router  # noqa: E402
from app.profiles.router import router as profiles_router  # noqa: E402
from app.public.router import router as public_router  # noqa: E402
from app.support.router import router as support_router  # noqa: E402
from app.tasks.hr_router import router as tasks_hr_router  # noqa: E402
from app.tasks.worker_router import router as tasks_worker_router  # noqa: E402
from app.teams.router import router as teams_router  # noqa: E402
from app.users.router import router as users_router  # noqa: E402
from app.vermerke.router import router as vermerke_router  # noqa: E402
from app.worker.assignment_hr_router import router as worker_assignments_hr_router  # noqa: E402
from app.worker.assignment_router import router as worker_schedule_router  # noqa: E402
from app.worker.docs_router import router as worker_docs_router  # noqa: E402
from app.worker.hr_router import router as worker_hr_router  # noqa: E402
from app.worker.profile_router import router as worker_profile_router  # noqa: E402
from app.worker.router import router as worker_router  # noqa: E402
from app.worker.time_hr_router import router as worker_time_hr_router  # noqa: E402
from app.worker.time_router import router as worker_time_router  # noqa: E402
from app.ws.router import router as ws_router  # noqa: E402
from app.zeitarbeit.router import router as zeitarbeit_router  # noqa: E402

app.include_router(agents_router, prefix="/agents", tags=["agents"])
app.include_router(automation_router, prefix="/processes", tags=["processes"])
app.include_router(finance_router, prefix="/finance", tags=["finance"])
app.include_router(auth_router, prefix="/auth", tags=["auth"])
app.include_router(users_router, prefix="/users", tags=["users"])
app.include_router(profiles_router, prefix="/profiles", tags=["profiles"])
app.include_router(ai_router, prefix="/ai", tags=["ai"])
app.include_router(jobs_router, prefix="/jobs", tags=["jobs"])
app.include_router(applications_router, prefix="/applications", tags=["applications"])
app.include_router(interviews_router, prefix="/applications", tags=["interviews"])
app.include_router(placements_router, prefix="/recruiter/placements", tags=["placements"])
app.include_router(feedback_router, prefix="/feedback", tags=["feedback"])
app.include_router(notifications_router, prefix="/notifications", tags=["notifications"])
app.include_router(ws_router, tags=["realtime"])
app.include_router(companies_router, prefix="/companies", tags=["companies"])
# The HR Einsatzplanung router owns /zeitarbeit/assignments.  Register it
# before the legacy Zeitarbeit order router, which has the same paths.
app.include_router(
    worker_assignments_hr_router, prefix="/zeitarbeit/assignments", tags=["assignments"]
)
app.include_router(zeitarbeit_router, prefix="/zeitarbeit", tags=["zeitarbeit"])
app.include_router(observability_router, prefix="/ai/traces", tags=["observability"])
app.include_router(vermerke_router, prefix="/vermerke", tags=["vermerke"])
app.include_router(partners_router, prefix="/partners", tags=["partners"])
app.include_router(pipeline_router, prefix="/pipeline", tags=["pipeline"])
app.include_router(mobility_router, prefix="/mobility", tags=["mobility"])
app.include_router(maps_router, prefix="/maps", tags=["maps"])
app.include_router(admin_router, prefix="/admin", tags=["admin"])
app.include_router(billing_router, prefix="/billing", tags=["billing"])
app.include_router(public_router, prefix="/public", tags=["public"])
app.include_router(orgcharts_router, prefix="/org-charts", tags=["org-charts"])
# DMS: categories + bulk-download registered BEFORE /{doc_id} to avoid route conflict
app.include_router(dms_categories_router, prefix="/documents/categories", tags=["dms"])
app.include_router(dms_bulk_router, prefix="/documents", tags=["dms"])
app.include_router(dms_router, prefix="/documents", tags=["dms"])
app.include_router(worker_router, prefix="/worker", tags=["worker"])
app.include_router(worker_time_router, prefix="/worker/time", tags=["worker-time"])
app.include_router(worker_hr_router, prefix="/zeitarbeit/workers", tags=["worker-management"])
# time-entries sub-routes BEFORE /workers/{id} to avoid conflict
app.include_router(worker_time_hr_router, prefix="/zeitarbeit/time-entries", tags=["time-approval"])
app.include_router(worker_schedule_router, prefix="/worker/schedule", tags=["worker-schedule"])
app.include_router(teams_router, prefix="/teams", tags=["teams"])
app.include_router(worker_messages_router, prefix="/worker/messages", tags=["worker-messages"])
app.include_router(hr_messages_router, prefix="/zeitarbeit/messages", tags=["messages"])
app.include_router(worker_absences_router, prefix="/worker/absences", tags=["worker-absences"])
app.include_router(hr_absences_router, prefix="/zeitarbeit/absences", tags=["absences"])
app.include_router(worker_docs_router, prefix="/worker/documents", tags=["worker-documents"])
app.include_router(equipment_worker_router, prefix="/worker/equipment", tags=["worker-equipment"])
app.include_router(equipment_hr_router, prefix="/zeitarbeit/equipment", tags=["equipment"])
app.include_router(tasks_worker_router, prefix="/worker/tasks", tags=["worker-tasks"])
app.include_router(tasks_hr_router, prefix="/zeitarbeit/tasks", tags=["tasks"])
app.include_router(payroll_worker_router, prefix="/worker/payroll", tags=["worker-payroll"])
app.include_router(payroll_hr_router, prefix="/zeitarbeit/payroll", tags=["payroll"])
app.include_router(worker_profile_router, prefix="/worker/profile", tags=["worker-profile"])
app.include_router(support_router, prefix="/support", tags=["support"])
app.include_router(interview_rooms_router, prefix="/interview-rooms", tags=["interview-rooms"])


@app.get("/health", tags=["system"])
async def health() -> dict[str, str]:
    return {"status": "ok", "version": settings.app_version}


# ── Static files (seed demo PDFs etc.) ───────────────────────────────────────
_static_dir = "/app/static"
os.makedirs(_static_dir, exist_ok=True)
app.mount("/static", StaticFiles(directory=_static_dir), name="static")
