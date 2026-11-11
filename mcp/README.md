# Palmscout MCP server

Dependency-free Node.js 20+ stdio server adapted from FireFlint. Package `@palmscout/mcp`,
executable `palmscout-mcp` (`npm link` for local installation); the package is not published to npm.
Run `node src/server.mjs` with `PALMSCOUT_BASE_URL`, `PALMSCOUT_TOKEN` and
`PALMSCOUT_READ_ONLY=true` (default). Base URL is the API origin without `/api`.
Use an existing bearer access token; replace expired tokens manually. API tenant/role checks apply.
All tools are read-only even when the flag is false. No arbitrary HTTP proxy or writes are exposed.
Future writes must be hidden in read-only mode; destructive/publish actions additionally require
literal `confirmed=true` and human approval in the skill.

| Tool | FastAPI route |
| --- | --- |
| `palmscout_health` | `GET /health` |
| `palmscout_me` | `GET /users/me` |
| `palmscout_list_jobs` | `GET /jobs/recruiter` |
| `palmscout_list_applications` | `GET /applications` |
| `palmscout_my_company` | `GET /companies/mine` |
| `palmscout_list_candidates` | `GET /jobs/recruiter/candidates` |


Jobs and candidates accept `page` (1+) and `page_size` (1–100). Candidates also accept
`query`, `location` and `available_only`. Other tools take no arguments. Results retain
the API response shape; follow its pagination metadata to retrieve further pages. Recruiter routes require the matching role.
`npm test` runs mock HTTP tests without a live backend. stdout is newline-delimited JSON-RPC only.
HTTP failures expose status, not backend payloads; redirects are rejected and timeout is 30 seconds.
Use trusted local clients and least-privilege credentials.
See [client configurations](../docs/MCP-AND-SKILLS.md) and [skill](../skills/palmscout/SKILL.md).
