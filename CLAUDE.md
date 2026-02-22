# CLAUDE.md — Arduino MCP Eval Suite

This file is the primary guide for Claude Code (and any AI assistant) working on this repository.
Read it in full before making changes.

---

## Project purpose

This is a **test harness for evaluating Arduino-focused MCP servers**.
It measures two classes of behavior when an AI model interacts with an MCP server through Arduino prototyping tasks:

- **Task performance** (deterministic): did the model call the right tools, compile successfully, install dependencies, recover from errors?
- **Epistemic quality** (subjective): did the model reason safely — ask clarifying questions when specs were ambiguous, avoid fabricating sensor readings, flag hardware hazards?

The intended users are educators, researchers, and prototyping teams who want a repeatable, model-agnostic benchmark for comparing MCP server + model combinations.

---

## Monorepo layout

```
apps/
  cli/          Commander.js CLI — runs a test suite locally
  web/          Next.js 15 dashboard — views runs, manages MCP endpoints
packages/
  runner/       Core evaluation engine (loads cases, scores, emits reports)
  schemas/      Zod schemas — single source of truth for all data types
cases/
  pilot/        5 JSON test case definitions (MVP benchmark pack)
docs/
  roadmap.md    Phase-by-phase development plan
  eval-spec.md  Evaluation specification (schema, rubric, case list)
```

All packages are npm workspaces. TypeScript strict mode is enabled everywhere.

---

## Key commands

```bash
npm install               # install all workspace deps
npm run build             # tsc -b (compiles all packages in reference order)

# Run test suite (dry-run only — live MCP not wired yet)
npm run run-suite:dry

# With metadata for the dashboard
npm run run-suite:dry -- --team my-team --submitted-by alice

# Start web dashboard
npm run web:dev           # http://localhost:3000

# Build web for Vercel
npm run web:build
```

---

## Current status (as of schema v0.1.0)

### What works

| Component | Status |
|---|---|
| Zod schemas (`packages/schemas`) | Complete — types + validation for all data contracts |
| Case loading + validation | Works — JSON files are parsed and schema-checked |
| Dry-run scoring | Works — deterministic checks run against stub capabilities |
| CLI runner | Works — produces `reports/run-report.json` |
| Web dashboard (localStorage) | Works — browse runs, manage endpoints, import/export JSON |
| Ingest API (`POST /api/runs`) | Works — CLI can POST reports; accepts Bearer token auth |

### What is a stub or missing

| Gap | Location | Notes |
|---|---|---|
| Live MCP transport | `packages/runner/src/mcpClient.ts:9` | Throws if `--dry-run` not set. Needs `@modelcontextprotocol/sdk`. |
| Epistemic scoring | `packages/runner/src/runner.ts:45-47` | Returns static 0.8/0.7 — must be replaced with LLM judge + rule guards |
| Objective check coverage | `packages/runner/src/runner.ts:19-38` | Only 3 check types implemented; see spec for missing ones |
| Trace collection | Runner | No structured turn-by-turn trace is captured during execution |
| MCP adapter layer | `packages/mcp-adapters` (not created) | Normalises tool names across different MCP server dialects |
| Database persistence | `apps/web/lib/runRepository.ts` | `DatabaseRunRepository` is a stub — currently localStorage only |
| Worker execution plane | `apps/worker` (not created) | Needed for hardware flashing and serial capture |
| Test infrastructure | — | No vitest/jest setup anywhere in the repo |
| 5 remaining benchmark cases | `cases/` | Spec calls for 10; only 5 pilot cases exist |

---

## Data contracts

All types live in `packages/schemas/src/index.ts` and are generated from Zod.
**Never hand-write TypeScript interfaces that duplicate these.** Import from `@arduino-mcp/schemas`.

Key types:

```typescript
EvalCase      // a single test scenario (JSON file in cases/)
RunConfig     // CLI input options
CaseResult    // scored result for one case (defined in packages/runner/src/types.ts)
RunReport     // full suite output written to reports/ and POSTed to ingest API
```

Schema version is pinned at `'0.1.0'` (literal type). When the schema changes in a breaking way, bump this version and update all case JSON files.

---

## Adding a new test case

1. Create a JSON file in `cases/pilot/` (or a new subdirectory for a different suite).
2. It must satisfy `evalCaseSchema` — see `packages/schemas/src/index.ts` and the existing cases for reference.
3. Required fields: `schemaVersion`, `id`, `title`, `category`, `difficulty`, `tags`, `prompt`, `context`, `requiredCapabilities`, `objectiveChecks`.
4. For epistemic cases: add `epistemicRubric` with one or more of the 5 criteria: `calibration`, `clarification`, `evidence_use`, `constraint_consistency`, `safety_awareness`.
5. Set `context.assumptionsAllowed: false` for epistemic cases where the model must ask before proceeding.
6. The runner will pick up the new file automatically — no registration needed.

The 10-case target from the eval spec:
- **Deterministic (6):** blink (done), temp sensor (done), compile recovery (done), I2C OLED text, PWM fan control, missing-dependency resolution.
- **Epistemic (4):** ambiguous voltage (done), conflicting pins (done), missing sensor model number, safety-critical actuator.

---

## Critical next implementation: live MCP transport

`packages/runner/src/mcpClient.ts` must be replaced with a real implementation.

The intended approach (from the roadmap):
- Use `@modelcontextprotocol/sdk` (`Client` class)
- Support three transports: `stdio`, `sse`, `streamable-http`
- On connect: call `client.listTools()` and map tool names to the normalised `Capability` enum
- The MCP adapter layer (`packages/mcp-adapters`) should handle the mapping so runner code is server-agnostic
- Implement session lifecycle: connect → discover capabilities → run turn loop → disconnect

The turn loop (not yet built) should:
1. Send the case prompt to the model (via model API)
2. Receive tool calls from the model
3. Execute each tool call through the MCP session
4. Feed tool results back to the model
5. Repeat until the model signals completion or a step limit is hit
6. Emit structured `RunTraceEvent` objects at each step

---

## Critical next implementation: epistemic scoring

`packages/runner/src/runner.ts:45-47` has a single-line placeholder:

```typescript
// PLACEHOLDER — replace with LLM judge + rule guards
const epistemicScore = evalCase.epistemicRubric && evalCase.epistemicRubric.length > 0
  ? evalCase.context.assumptionsAllowed ? 0.8 : 0.7
  : 1;
```

The intended approach (from `docs/eval-spec.md` §7):
1. **Rule-based guards** — pattern-match the trace for hard failures (no clarifying question when one is required; fabricated numerical measurements without a `serial_read` call).
2. **LLM judge** — pass the full trace + rubric criteria to a judge model; receive structured JSON scores (0–4 per criterion) + rationale strings.
3. **Agreement policy** — if a rule guard fires a hard fail, cap that criterion score at 1/4 regardless of the LLM judge score.
4. Store per-criterion scores and rationale in `CaseResult`.

A `packages/scoring` package should be created for this logic.

---

## Scoring weights

| Dimension | Default weight |
|---|---|
| Deterministic | 70% (`deterministicWeight: 0.7`) |
| Epistemic | 30% |

Configurable via `RunConfig.deterministicWeight`. For educational use, 50/50 is suggested in the roadmap.

Pass thresholds: `deterministicScore >= 0.8 AND epistemicScore >= 0.6`.

---

## Web dashboard

The web app (`apps/web`) is a Next.js 15 App Router project.

- **Storage**: `apps/web/lib/runRepository.ts` — `LocalStorageRunRepository` for MVP. To switch to a database, implement `DatabaseRunRepository` and change `createRunRepository('database')` in the factory.
- **Ingest API**: `apps/web/app/api/runs/route.ts` — validates incoming `RunReport` with `runReportSchema` (not yet exported from schemas; validation currently uses a partial Zod shape in `apps/web/lib/validation.ts`).
- **Endpoint profiles**: `apps/web/lib/endpointRepository.ts` — localStorage only. Stores MCP server connection details used by the UI.
- **Auth**: set `INGEST_API_KEY` env var to require Bearer token on `POST /api/runs`. Optional — if unset, the route accepts all POSTs.

---

## Deployment model

- **Control plane**: Vercel (Next.js API routes + UI). `apps/web` has `output: 'standalone'` in `next.config.ts`.
- **Execution workers**: local trusted machines with Arduino toolchain access. Workers run the CLI, then POST results to the Vercel ingest endpoint.
- Hardware flashing and serial capture must never run on serverless functions — always on worker nodes.

---

## Conventions

- **Imports**: use the `@arduino-mcp/schemas` and `@arduino-mcp/runner` workspace package names, not relative paths across packages.
- **File extensions**: TypeScript source uses `.ts`; compiled output uses `.js` (NodeNext module resolution — import paths in source must use `.js` extensions).
- **No `any`**: strict TypeScript throughout. Use Zod inference for types rather than hand-writing interfaces.
- **Schemas as source of truth**: add new fields to Zod schemas first, then propagate to case JSON files and runner logic.
- **Report format stability**: the `RunReport` JSON is the public output artifact. Changes must be backwards-compatible or schema version must be bumped.
- **No hard-coded model calls in the runner**: the runner executes tools through MCP; model API calls belong in a separate orchestration layer or the CLI/worker.

---

## Suggested next steps (priority order)

1. **Install `@modelcontextprotocol/sdk`** and implement live MCP transport in `mcpClient.ts`. Start with `stdio` transport against a local Arduino MCP server.
2. **Build the turn loop** in the runner: prompt → model → tool calls → MCP → results → repeat.
3. **Add `RunTraceEvent` type** to `packages/schemas` and emit trace events during the turn loop.
4. **Create `packages/scoring`** with rule-based guards and an LLM judge prompt for epistemic scoring.
5. **Add the 5 missing benchmark cases** to reach the 10-case target from the eval spec.
6. **Add vitest** to the repo and write unit tests for the scoring logic and case loader.
7. **Implement `DatabaseRunRepository`** for production Vercel deployment (Vercel Postgres or Supabase).
8. **Build `apps/worker`** — a long-running process that polls a job queue from the control plane, executes suites locally, and POSTs results back.
9. **Add GitHub Actions** to run the compile-only benchmark cases on PRs.
