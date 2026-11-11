import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { buildServer, buildTools } from '../src/server.mjs';

async function fixture(t, status = 200) {
  const requests = [];
  const api = createServer((req, res) => {
    requests.push({ url: req.url, auth: req.headers.authorization, method: req.method });
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(status === 200 ? { ok: true } : { error: 'sensitive-backend-value' }));
  });
  await new Promise(resolve => api.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { api.close(resolve); api.closeAllConnections(); }));
  return { requests, env: { PALMSCOUT_BASE_URL: `http://127.0.0.1:${api.address().port}`, PALMSCOUT_TOKEN: 'test-token' } };
}

test('all tools use actual GET routes and bearer auth against mock HTTP', async t => {
  const { env, requests } = await fixture(t);
  for (const tool of buildTools(env)) {
    const args = tool.inputSchema.required.length ? { venue_id: '12345678-1234-1234-1234-123456789abc' } : {};
    assert.deepEqual(await tool.handler(args), { ok: true });
  }
  assert.deepEqual(requests.map(r => r.url), ["/health", "/users/me", "/jobs/recruiter", "/applications", "/companies/mine", "/jobs/recruiter/candidates"]);
  assert.ok(requests.every(r => r.method === 'GET' && r.auth === 'Bearer test-token'));
});

test('default and explicit read-only list exposes no writes', async t => {
  const { env } = await fixture(t);
  for (const flag of [undefined, 'true', 'false']) {
    const server = buildServer({ ...env, PALMSCOUT_READ_ONLY: flag });
    const result = await server.handle({ id: 1, method: 'tools/list' });
    assert.ok(result.result.tools.every(t => t.annotations.readOnlyHint));
    const missing = await server.handle({ id: 2, method: 'tools/call', params: { name: 'palmscout_delete' } });
    assert.equal(missing.error.code, -32602);
  }
});

test('HTTP failures are tool errors without backend payloads', async t => {
  const { env } = await fixture(t, 403);
  const result = await buildServer(env).handle({ id: 1, method: 'tools/call', params: { name: 'palmscout_me' } });
  assert.equal(result.result.isError, true);
  assert.match(result.result.content[0].text, /HTTP 403/);
  assert.doesNotMatch(JSON.stringify(result), /sensitive-backend-value|test-token/);
});

test('unexpected arguments cannot change request routes', async t => {
  const { env, requests } = await fixture(t);
  await assert.rejects(buildTools(env)[0].handler({ url: 'https://example.com' }), /Unknown argument/);
  assert.equal(requests.length, 0);
});


test('pagination and filters are encoded and validated before HTTP', async t => {
  const { env, requests } = await fixture(t);
  const tool = buildTools(env).find(t => t.name === 'palmscout_list_candidates');
  await tool.handler({ page: 2, page_size: 10, query: 'A & B', available_only: false });
  const url = new URL(requests[0].url, env.PALMSCOUT_BASE_URL);
  assert.equal(url.searchParams.get('query'), 'A & B');
  assert.equal(url.searchParams.get('page'), '2');
  assert.equal(url.searchParams.get('available_only'), 'false');
  await assert.rejects(tool.handler({ page_size: 101 }), /Out of range/);
  assert.equal(requests.length, 1);
});
