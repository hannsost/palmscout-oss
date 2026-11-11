# Palmscout MCP and skills

The local dependency-free Node.js server wraps existing FastAPI read routes.
[Tool reference](../mcp/README.md). No writes are exposed in this version.
`PALMSCOUT_READ_ONLY=true` is the default and hides any future write tools.
An API bearer token is supplied by the operator; the server does not store credentials or bypass roles.

## Claude Desktop, Cursor and generic MCP JSON

Place this entry in your client's MCP configuration (for Cursor, `.cursor/mcp.json`).
Replace the absolute path and token locally, never in committed files.

```json
{
  "mcpServers": {
    "palmscout": {
      "command": "node",
      "args": [
        "/absolute/path/to/palmscout-oss/mcp/src/server.mjs"
      ],
      "env": {
        "PALMSCOUT_BASE_URL": "http://127.0.0.1:8001",
        "PALMSCOUT_TOKEN": "<access-token>",
        "PALMSCOUT_READ_ONLY": "true"
      }
    }
  }
}
```

## Claude Code

```sh
claude mcp add Palmscout --env PALMSCOUT_BASE_URL=http://127.0.0.1:8001 --env PALMSCOUT_TOKEN='<access-token>' --env PALMSCOUT_READ_ONLY=true -- node /absolute/path/to/palmscout-oss/mcp/src/server.mjs
```

## Codex

Add to your local MCP configuration:

```toml
[mcp_servers.palmscout]
command = "node"
args = ["/absolute/path/to/palmscout-oss/mcp/src/server.mjs"]
env = { PALMSCOUT_BASE_URL = "http://127.0.0.1:8001", PALMSCOUT_TOKEN = "<access-token>", PALMSCOUT_READ_ONLY = "true" }
```

## Agent skill

Copy [skills/palmscout](../skills/palmscout/SKILL.md) into your agent's skill directory
(e.g. `~/.claude/skills/palmscout` or `~/.codex/skills/palmscout`). Other agents can load
`SKILL.md` as instructions alongside the MCP tool definitions. A local model uses the same tools.
The skill establishes identity and scope before reading, minimizes personal data, and requires
explicit human approval before any future destructive/publish operation plus `confirmed=true`.

Test without a backend: `cd mcp && npm test`. For direct use from the repository root:

```sh
PALMSCOUT_BASE_URL=http://127.0.0.1:8001 PALMSCOUT_READ_ONLY=true node mcp/src/server.mjs
```

The process speaks newline-delimited JSON-RPC on stdio; it is not a web server.
