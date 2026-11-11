"""Dependency readiness, with no settings-file reads or credential output."""

import asyncio
import os
import sys

import asyncpg
from redis.asyncio import from_url
from redis.exceptions import RedisError


async def ready() -> None:
    url = os.environ["DATABASE_URL"].replace("postgresql+asyncpg://", "postgresql://", 1)
    connection = await asyncpg.connect(url, timeout=3)
    try:
        revisions = await connection.fetch("SELECT version_num FROM alembic_version")
        if [row["version_num"] for row in revisions] != [os.environ["EXPECTED_MIGRATION"]]:
            raise ValueError("migration pending")
    finally:
        await connection.close()
    async with from_url(os.environ["REDIS_URL"], socket_timeout=3) as client:
        if not await client.ping():
            raise ValueError("redis unavailable")


try:
    asyncio.run(asyncio.wait_for(ready(), timeout=7))
except (KeyError, ValueError, OSError, TimeoutError, asyncpg.PostgresError, RedisError):
    print("dependencies not ready", file=sys.stderr)
    raise SystemExit(1) from None
