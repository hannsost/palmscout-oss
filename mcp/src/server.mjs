#!/usr/bin/env node
// Adapted from the FireFlint dependency-free stdio server.
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer, createHttpClient, seg } from './mcp-stdio.mjs';

const routes = [
  [
    "health",
    "/health",
    {},
    []
  ],
  [
    "me",
    "/users/me",
    {},
    []
  ],
  [
    "list_jobs",
    "/jobs/recruiter",
    {
      "page": {
        "type": "integer",
        "minimum": 1
      },
      "page_size": {
        "type": "integer",
        "minimum": 1,
        "maximum": 100
      }
    },
    []
  ],
  [
    "list_applications",
    "/applications",
    {},
    []
  ],
  [
    "my_company",
    "/companies/mine",
    {},
    []
  ],
  [
    "list_candidates",
    "/jobs/recruiter/candidates",
    {
      "page": {
        "type": "integer",
        "minimum": 1
      },
      "page_size": {
        "type": "integer",
        "minimum": 1,
        "maximum": 100
      },
      "query": {
        "type": "string"
      },
      "location": {
        "type": "string"
      },
      "available_only": {
        "type": "boolean"
      }
    },
    []
  ]
];

export function buildTools(env = process.env) {
  const http = createHttpClient({
    baseUrl: env.PALMSCOUT_BASE_URL,
    headers: () => env.PALMSCOUT_TOKEN ? { authorization: `Bearer ${env.PALMSCOUT_TOKEN}` } : {},
  });
  const tools = routes.map(([name, path, properties, required]) => ({
    name: 'palmscout_' + name,
    description: `Palmscout: ${name.replaceAll('_', ' ')}. Backend role and tenant permissions apply.`,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    inputSchema: { type: 'object', properties, required, additionalProperties: false },
    handler: async (args) => {
      if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Expected an object');
      for (const key of Object.keys(args)) {
        const prop = properties[key];
        if (!prop) throw new Error(`Unknown argument: ${key}`);
        if (prop.type === 'integer' ? !Number.isInteger(args[key]) : typeof args[key] !== prop.type) throw new Error(`Invalid ${key}`);
        if (prop.minimum !== undefined && args[key] < prop.minimum || prop.maximum !== undefined && args[key] > prop.maximum) throw new Error(`Out of range: ${key}`);
      }
      const route = path.replace(/\{(\w+)\}/g, (_, key) => {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(args[key] || '')) throw new Error(`Invalid ${key} UUID`);
        return seg(args[key], key);
      });
      const query = Object.fromEntries(Object.entries(args).filter(([key]) => !required.includes(key)));
      return (await http('GET', route, { query })).data;
    },
  }));
  // Read-only by default. This release deliberately exposes no mutation tools.
  const readOnly = String(env.PALMSCOUT_READ_ONLY ?? 'true').toLowerCase() !== 'false';
  return tools.filter(tool => !(readOnly && tool.write));
}

export function buildServer(env = process.env) {
  return createServer({ name: 'palmscout-mcp', version: '0.1.0',
    instructions: 'Palmscout: inspect health and current user first. Read only the data needed for the task. No write tools are exposed.',
    tools: buildTools(env) });
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { buildServer().listen(); }
  catch { process.stderr.write('palmscout-mcp: configure PALMSCOUT_BASE_URL\n'); process.exitCode = 1; }
}
