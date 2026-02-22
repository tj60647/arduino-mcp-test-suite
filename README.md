# MCP Agent Eval Suite (TypeScript)

A test suite for evaluating MCP-enabled agent systems with mechanistic and epistemic scoring.

## Purpose

This project evaluates two classes of behavior:

1. **Mechanistic performance**: Can the model + MCP server/API complete tasks correctly (tool calls, dependency recovery, retries, schema-valid outputs)?
2. **Epistemic quality**: Does the model reason safely under uncertainty (ask clarifying questions, track constraints, avoid fabrication, defer when needed)?

The primary benchmark target is **MCP + API workflows**.
The repository includes a **general benchmark pack** with API-oriented scenarios (for example letter-writing and calendar apps).

## Why this exists

MCP server ecosystems vary heavily in tool naming, capability depth, and safety defaults. This suite creates a repeatable, model-agnostic evaluation harness so educators and prototyping teams can compare:

- MCP server reliability
- agent/model quality
- safety and uncertainty handling
- regression over time

## MVP Deliverables

- TypeScript runner for MCP-connected scenarios
- Eval case schema (JSON)
- Scoring engine with weighted rubric (task + epistemic)
- Web control plane for remote runs + worker execution plane
- Baseline benchmark pack (10 scenarios)

See [docs/roadmap.md](docs/roadmap.md) and [docs/eval-spec.md](docs/eval-spec.md).

## Hosting model (Vercel)

- **Vercel-hosted control plane**: UI, API, report storage, auth, scheduling metadata
- **Worker execution plane**: runners execute MCP/API jobs and push results back

## Suggested stack

- TypeScript (Node 20+)
- `@modelcontextprotocol/sdk` for MCP client transport
- `zod` for schema validation
- `vitest` for internal runner tests
- `commander` for CLI
- Vercel (Next.js API routes) for control plane
- Postgres/Supabase for result persistence

## Initial success criteria

- Run a full 10-case suite against one MCP server in <15 minutes
- Mechanistic (deterministic) pass/fail for objective checks
- Epistemic rubric scores from structured judge prompts + rule checks
- Produce a single JSON + HTML report artifact per run

## Quickstart (web-first remote flow)

1. Install dependencies:

	`npm install`

2. Build TypeScript workspaces:

	`npm run build`

3. Start web control plane:

	`npm run web:dev`

4. Start a worker (local dev):

	`npm run run-worker -- --control-plane http://localhost:3000`

5. Open dashboard:

	`http://localhost:3000`

6. In **Managed workers**, register an approved worker and confirm it is online.
7. In **Queue a remote run**, pick your endpoint and click **Queue quick test**.

## Register approved workers (recommended)

Preferred path: use the **Managed workers** section in the dashboard to register worker IDs and issue tokens.
When a token is issued, copy/store it immediately (it is treated as one-time display output).
The same panel supports token rotation and revocation.

Use per-worker tokens so only approved workers can claim jobs and report results.

1. Register a worker (admin key required):

```bash
curl -X POST http://localhost:3000/api/workers/registry \
	-H "authorization: Bearer <INGEST_API_KEY>" \
	-H "content-type: application/json" \
	-d '{"workerId":"worker-1"}'
```

2. Start worker with token:

	`npm run run-worker -- --control-plane http://localhost:3000 --worker-id worker-1 --worker-token <TOKEN>`

`INGEST_API_KEY` bearer auth still works for admin operations.

## CLI (advanced / fallback)

Use CLI directly only when you need terminal-driven workflows.

1. Run the general API suite in dry-run mode:

	`npm run run-suite:dry -- --pack general`

2. Open the generated report:

	`reports/run-report.json`

## Collaborative web app (multi-user)

This repo now includes a web control plane at `apps/web` using browser local storage for MVP collaboration.

2. Start the web app:

	`npm run --workspace @mcp-agent-eval/web dev`

2. Open dashboard:

	`http://localhost:3000`

3. (Optional) Generate and import a run report JSON from CLI:

	`npm run run-suite:dry -- --team prototyping-lab --submitted-by alice`

4. Upload JSON in the dashboard using **Import report JSON**.

5. Share state between people via **Download JSON** and re-upload on another browser.

## Add MCP endpoint in UI

1. Open the dashboard (`http://localhost:3000`).
2. In **MCP Endpoints**, fill in:
	- name
	- transport (`sse`, `streamable-http`, or `stdio`)
	- URL/command
	- optional auth env var + notes
3. Click **Create Endpoint**.
4. Use the endpoint name in queued web jobs or CLI runs:

	`npm run run-suite:dry -- --server <endpoint-name> --model claude-sonnet`

Endpoint profiles are currently stored in browser localStorage and are per-browser.

The repository abstraction and DB stub are in [apps/web/lib/runRepository.ts](apps/web/lib/runRepository.ts) (`DatabaseRunRepository`).
Switching to DB later means implementing that class and changing `createRunRepository('database')`.

## Job queue + worker execution

You can run suites through a control-plane job queue and a worker process.

1. Start the web control plane:

	`npm run web:dev`

2. Start a worker:

	`npm run run-worker -- --control-plane http://localhost:3000`

3. Create a dry-run job:

```bash
curl -X POST http://localhost:3000/api/jobs \
	-H "content-type: application/json" \
	-d '{
		"team": "prototyping-lab",
		"submittedBy": "alice",
		"config": {
			"suiteName": "general",
			"benchmarkPack": "general",
			"serverName": "mcp-local",
			"modelName": "claude-sonnet",
			"dryRun": true,
			"deterministicWeight": 0.7
		}
	}'
```

4. Track the job:

	`curl http://localhost:3000/api/jobs/<job-id>`

Completed jobs automatically persist their report to the runs store (`/api/runs`).

For non-technical users, this queue-based web flow is the recommended default.

## Current CLI options

- `--suite` suite name (default `general`)
- `--pack` benchmark pack id (default `general`)
- `--server` MCP server id label
- `--model` model label for report metadata
- `--cases` path to case JSON files (defaults to selected pack path)
- `--out` output path (default `reports/run-report.json`)
- `--team` team label used by web dashboard
- `--submitted-by` who submitted the run
- `--ingest-url` POST endpoint to publish report
- `--ingest-key` bearer token for ingest endpoint
- `--dry-run` runs against the current stub MCP adapter
- `--transport` MCP transport (`stdio`, `sse`, `streamable-http`)
- `--mcp-command` stdio server command
- `--mcp-args` stdio server command args
- `--mcp-url` MCP server URL for `sse`/`streamable-http`

## Worker CLI options

- `--control-plane` control plane base URL
- `--api-key` bearer token (or set `INGEST_API_KEY`)
- `--poll-interval-ms` queue poll interval in milliseconds
- `--worker-id` worker identity label
- `--once` process one job then exit

## Starter general API scenarios

- `101-letter-api-compose-send`: letter draft + send workflow with Bearer auth checks
- `102-calendar-api-event-sync`: calendar create + sync with retry/idempotency checks
- `103-calendar-timezone-ambiguity`: epistemic clarification case for timezone ambiguity

## Note on Vercel persistence

Current web MVP uses browser localStorage + JSON import/export. For production multi-user usage on Vercel, implement `DatabaseRunRepository` in [apps/web/lib/runRepository.ts](apps/web/lib/runRepository.ts) with managed persistence (for example Vercel Postgres or Supabase).

## Push to Git + deploy to Vercel

### 1) Initialize and push to GitHub

```bash
git init
git add .
git commit -m "Initial MCP agent eval suite MVP"
git branch -M main
git remote add origin <YOUR_GITHUB_REPO_URL>
git push -u origin main
```

### 2) Deploy on Vercel (monorepo)

1. In Vercel, import your GitHub repository.
2. Set **Root Directory** to `apps/web`.
3. Keep framework detection as Next.js.
4. Deploy.

### 3) Optional Vercel CLI deploy

```bash
npm i -g vercel
vercel
```

When prompted, choose the current repo and set project root to `apps/web`.

## Next step

Implement worker orchestration hardening from [docs/roadmap.md](docs/roadmap.md): managed worker pools, auth, and richer run observability.
