# Arduino MCP Eval Suite (TypeScript)

A test suite for evaluating Arduino-focused MCP servers with ChatGPT/Claude-style agent workflows.

## Purpose

This project evaluates two classes of behavior:

1. **Task performance**: Can the model + MCP server complete Arduino prototyping tasks (tool calls, compile, simulate/upload workflows)?
2. **Epistemic quality**: Does the model reason safely under uncertainty (ask clarifying questions, track constraints, avoid fabrication, defer when needed)?

## Why this exists

Arduino MCP servers are emerging quickly and vary heavily in tool naming, capability depth, and safety defaults. This suite creates a repeatable, model-agnostic evaluation harness so educators and prototyping teams can compare:

- MCP server reliability
- agent/model quality
- safety and uncertainty handling
- regression over time

## MVP Deliverables

- TypeScript runner for MCP-connected scenarios
- Eval case schema (JSON)
- Scoring engine with weighted rubric (task + epistemic)
- CLI + optional web dashboard endpoint for reports
- Baseline benchmark pack (10 scenarios)

See [docs/roadmap.md](docs/roadmap.md) and [docs/eval-spec.md](docs/eval-spec.md).

## Hosting model (Vercel)

- **Vercel-hosted control plane**: UI, API, report storage, auth, scheduling metadata
- **Worker execution plane**: local/bench runners execute hardware/toolchain-dependent evals and push results back

> Note: direct hardware flashing and local toolchain operations should run on trusted workers, not serverless functions.

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
- Deterministic pass/fail for objective checks
- Epistemic rubric scores from structured judge prompts + rule checks
- Produce a single JSON + HTML report artifact per run

## Quickstart (scaffolded MVP)

1. Install dependencies:

	`npm install`

2. Build TypeScript workspaces:

	`npm run build`

3. Run the pilot suite in dry-run mode:

	`npm run run-suite:dry`

4. Open the generated report:

	`reports/run-report.json`

## Collaborative web app (multi-user)

This repo now includes a web control plane at `apps/web` using browser local storage for MVP collaboration.

1. Start the web app:

	`npm run --workspace @arduino-mcp/web dev`

2. Open dashboard:

	`http://localhost:3000`

3. Generate a run report JSON from CLI:

	`npm run run-suite:dry -- --team prototyping-lab --submitted-by alice`

4. Upload JSON in the dashboard using **Upload JSON**.

5. Share state between people via **Download JSON** and re-upload on another browser.

The repository abstraction and DB stub are in [apps/web/lib/runRepository.ts](apps/web/lib/runRepository.ts) (`DatabaseRunRepository`).
Switching to DB later means implementing that class and changing `createRunRepository('database')`.

## Current CLI options

- `--suite` suite name (default `pilot`)
- `--server` MCP server id label
- `--model` model label for report metadata
- `--cases` path to case JSON files (default `cases/pilot`)
- `--out` output path (default `reports/run-report.json`)
- `--team` team label used by web dashboard
- `--submitted-by` who submitted the run
- `--ingest-url` POST endpoint to publish report
- `--ingest-key` bearer token for ingest endpoint
- `--dry-run` runs against the current stub MCP adapter

## Note on Vercel persistence

Current web MVP uses browser localStorage + JSON import/export. For production multi-user usage on Vercel, implement `DatabaseRunRepository` in [apps/web/lib/runRepository.ts](apps/web/lib/runRepository.ts) with managed persistence (for example Vercel Postgres or Supabase).

## Push to Git + deploy to Vercel

### 1) Initialize and push to GitHub

```bash
git init
git add .
git commit -m "Initial Arduino MCP eval suite MVP"
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

Implement Phase 1 from [docs/roadmap.md](docs/roadmap.md): local CLI runner + schema validation + 5 deterministic cases.
