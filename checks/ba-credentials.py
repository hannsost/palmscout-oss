"""Narrow credential guard check: stdlib only, fake HTTP client, no network."""

import asyncio
import importlib.util
import os
from pathlib import Path
import sys
from types import SimpleNamespace
from unittest.mock import patch

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    'snapshot_ba_source', root / 'backend/app/jobs/sources/bundesagentur.py'
)
assert spec and spec.loader
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
calls = []


class Response:
    def raise_for_status(self):
        return None

    def json(self):
        return {'access_token': 'synthetic-fixture-token'}


class Client:
    def __init__(self, **kwargs):
        calls.append('client')

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def post(self, url, *, data):
        assert url == module._TOKEN_URL
        assert data['client_id'] == 'synthetic-client'
        assert data['client_secret'] == 'synthetic-password'
        calls.append('post')
        return Response()


async def main():
    with patch.dict(sys.modules, {'httpx': SimpleNamespace(AsyncClient=Client)}):
        for client, password in [('', ''), ('synthetic-client', ''), ('', 'synthetic-password')]:
            with patch.dict(os.environ, {'BA_CLIENT_ID': client, 'BA_CLIENT_SECRET': password}):
                assert await module._fetch_token() is None
                assert not calls
        with patch.dict(os.environ, {
            'BA_CLIENT_ID': 'synthetic-client', 'BA_CLIENT_SECRET': 'synthetic-password'
        }):
            assert await module._fetch_token() == 'synthetic-fixture-token'
            assert calls == ['client', 'post']
    print('PASS: 3 missing-credential cases made 0 HTTP-client calls; configured case made 1 mocked POST.')


asyncio.run(main())
