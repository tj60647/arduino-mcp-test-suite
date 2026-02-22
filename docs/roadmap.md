# Roadmap: MCP Agent Mechanistic + Epistemic Eval Suite (TS)

## 1) Product scope (MVP)

Build a tool that can:

- connect to an MCP server
- execute evaluation scenarios end-to-end
- score both task outcomes and epistemic behavior
- export reproducible reports for model/server comparison

Initial benchmark pack: **general MCP/API workflows**.

### In-scope (MVP)

- MCP capability discovery and compatibility checks
- Scenario execution engine with step traces
- Objective checkers (tool-use correctness, schema-valid output, compile status)
- Epistemic rubric scoring (uncertainty handling, clarification behavior, constraint adherence)
- Web control plane for non-technical users + worker execution backend
- CLI as optional operator/debug tool
- Vercel-hosted API/UI to view runs and compare results

### Out-of-scope (MVP)

- Physical device orchestration and flashing pipelines
- Universal support for every model provider on day one

---

## 2) Reference workflow fit (API/agent systems)

1. **Prompt hypothesis** (e.g., compose/send a business letter)
2. **Plan tool/API usage** through an MCP-enabled agent
3. **Execute MCP tool calls** (HTTP endpoints, build/run/test, file operations)
4. **Validate outputs** (schema validity, retries, idempotency, status handling)
5. **Observe behavior** (trace quality, error recovery, clarification behavior)
6. **Score** task + epistemic quality
7. **Compare** model/server variants and iterate prompt/process

This keeps AI in a copilot role and preserves human verification gates.

---

## 3) High-level architecture

## Components

- **Runner Core (`packages/runner`)**
  - loads eval cases
  - establishes MCP session
  - executes turn loop (agent ↔ tools)
  - emits structured trace

- **MCP Adapter Layer (`packages/mcp-adapters`)**
  - normalizes tool naming differences across servers
  - declares capability map (`http_request`, `build`, `run`, `test`, etc.)

- **Scoring Engine (`packages/scoring`)**
  - objective checks (mechanistic/deterministic)
  - epistemic rubric checks (LLM judge + heuristic guards)
  - weighted aggregate score

- **Case Pack (`cases/`)**
  - JSON scenarios + fixtures + expected outcomes

- **Control Plane (`apps/web`)**
  - run orchestration API
  - historical trend dashboards
  - report explorer and diff views

- **Execution Workers (`apps/worker`)**
  - trusted hosts for MCP/API job execution
  - push run events/results to control plane

## Execution model for Vercel

- Vercel runs control plane only (auth, metadata, reports)
- workers execute MCP/API tasks where benchmark-pack credentials and toolchains exist
- workers call Vercel API with signed run tokens

---

## 4) Evaluation model

## A. Mechanistic (deterministic) dimensions

- Tool call validity
- Tool argument correctness
- Output schema validity
- Build/run/test success/failure handling
- Constraint satisfaction (API contracts, required params, expected state transitions)
- Recovery after induced tool/runtime error

## B. Epistemic dimensions

- **Uncertainty calibration**: avoids false certainty when specs are missing
- **Clarification behavior**: asks for key missing constraints before finalizing
- **Evidence tracking**: cites tool outputs rather than fabricating readings
- **Conflict handling**: detects contradictory constraints and resolves/defer
- **Safety posture**: flags high-risk operations, destructive actions, or missing approval gates

## Suggested weights (MVP)

- Mechanistic (stored as `deterministicWeight`): 70%
- Epistemic: 30%

For educational use, optionally invert to 50/50 to emphasize reasoning quality.

---

## 5) Milestones

## Phase 0 — Foundations (1 week)

- initialize monorepo (pnpm + Turborepo or npm workspaces)
- define case schema with Zod + JSON schema export
- build basic MCP client session + capability discovery

**Exit criteria**
- can connect to one MCP server and list tools
- can run one no-op scenario and store trace

## Phase 1 — Execution engine MVP (2 weeks)

- scenario runner with retries/timeouts
- objective checker module
- 5 mechanistic cases
- JSON report output + worker-readable progress state

**Exit criteria**
- repeatable run with stable pass/fail on same environment

## Phase 2 — Epistemic scoring (2 weeks)

- rubric schema and judge prompts
- heuristics to penalize hallucinated measurements/unsupported claims
- 10-case benchmark pack total

**Exit criteria**
- per-case epistemic subscores and rationale available in report

## Phase 3 — Vercel control plane (2 weeks)

- Next.js app with auth
- run ingestion API
- dashboard for comparing model/server/prompt template

**Exit criteria**
- historical run browser with filter and diff

## Phase 4 — Worker hardening (2–3 weeks)

- deploy worker agent for trusted local benches
- signed job dispatch and callback
- optional detailed artifact capture + upload

**Exit criteria**
- can execute long-running MCP/API scenarios from control plane job queue

---

## 6) Data contracts

Define stable contracts early:

- `EvalCase`
- `RunConfig`
- `RunTraceEvent`
- `CheckResult`
- `EpistemicScore`
- `RunReport`

Use semantic versioning in schema (`schemaVersion`) to avoid breaking historical reports.

---

## 7) Risk register + mitigations

- **Tool heterogeneity across MCP servers**
  - mitigate with adapter capability map and fallback labels

- **Non-determinism from LLMs**
  - mitigate with fixed seeds/temperature where possible + multiple trials

- **Execution-environment drift**
  - use tagged benchmarks (`api`, `compile-only`) and stable worker images/tooling

- **Security exposure**
  - require trusted worker hosts, signed run tokens, scoped credentials

---

## 8) Definition of done (MVP)

- one command runs full benchmark pack against selected server/model
- generates machine-readable report + human-readable summary
- supports at least one ChatGPT path and one Claude path
- includes epistemic scoring and failure explanations
- can be viewed in Vercel-hosted dashboard

---

## 9) Suggested repo structure

```text
/apps
  /web            # Vercel Next.js control plane
  /worker         # trusted execution worker
/packages
  /runner
  /mcp-adapters
  /scoring
  /schemas
/cases
  /deterministic
  /epistemic
/docs
```

---

## 10) Immediate next implementation tasks

1. Create schema package with Zod definitions and JSON schema generation.
2. Implement minimal runner loop (`load case -> connect MCP -> execute -> trace`).
3. Add 3 mechanistic and 2 epistemic pilot cases.
4. Emit `run-report.json` with aggregate and per-dimension scores.
5. Add GitHub Actions to run compile-only benchmark on PR.
