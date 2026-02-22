'use client';

import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { addEndpoint, deleteEndpoint, listEndpoints } from '@/lib/endpointRepository';
import { createRunRepository } from '@/lib/runRepository';
import type { EvalJob, McpEndpoint, StoredRun } from '@/lib/types';

const repository = createRunRepository('local');

function scoreClass(score: number): string {
  if (score >= 0.8) return 'score-high';
  if (score >= 0.6) return 'score-mid';
  return 'score-low';
}

function urlOrCommandPlaceholder(transport: McpEndpoint['transport']): string {
  if (transport === 'stdio') return 'e.g. mcp-server --config ./server.json';
  if (transport === 'sse') return 'e.g. https://your-server.example.com/sse';
  return 'e.g. https://your-server.example.com/mcp';
}

function transportLabel(transport: McpEndpoint['transport']): string {
  if (transport === 'stdio') return 'stdio';
  if (transport === 'sse') return 'SSE';
  return 'HTTP';
}

function parseStdioCommand(input: string): { command: string; args: string[] } {
  const parts = input
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);

  const [command = '', ...args] = parts;
  return { command, args };
}

function statusBadgeClass(status: EvalJob['status']): string {
  if (status === 'completed') return 'badge-pass';
  if (status === 'failed') return 'badge-fail';
  return 'badge-neutral';
}

export default function HomePage() {
  const [runs, setRuns] = useState<StoredRun[]>([]);
  const [endpoints, setEndpoints] = useState<McpEndpoint[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [endpointName, setEndpointName] = useState('');
  const [endpointTransport, setEndpointTransport] = useState<McpEndpoint['transport']>('sse');
  const [endpointUrlOrCommand, setEndpointUrlOrCommand] = useState('');
  const [endpointAuthEnvVar, setEndpointAuthEnvVar] = useState('');
  const [endpointNotes, setEndpointNotes] = useState('');
  const [jobs, setJobs] = useState<EvalJob[]>([]);
  const [isJobBusy, setIsJobBusy] = useState(false);
  const [jobEndpointId, setJobEndpointId] = useState('');
  const [jobServerName, setJobServerName] = useState('mcp-local');
  const [jobTransport, setJobTransport] = useState<McpEndpoint['transport']>('sse');
  const [jobUrlOrCommand, setJobUrlOrCommand] = useState('');
  const [jobModelName, setJobModelName] = useState('claude-sonnet');
  const [jobSuiteName, setJobSuiteName] = useState('pilot');
  const [jobBenchmarkPack, setJobBenchmarkPack] = useState<'arduino' | 'general'>('arduino');
  const [jobTeam, setJobTeam] = useState('default');
  const [jobSubmittedBy, setJobSubmittedBy] = useState('local-user');
  const [jobDryRun, setJobDryRun] = useState(true);

  const totals = useMemo(() => {
    const count = runs.length;
    const avgScore =
      count === 0
        ? 0
        : runs.reduce((acc, item) => acc + item.report.summary.score, 0) / count;
    return { count, avgScore };
  }, [runs]);

  useEffect(() => {
    void refreshRuns();
    void refreshEndpoints();
    void refreshJobs();
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refreshJobs();
      void refreshRuns();
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, []);

  async function refreshRuns(): Promise<void> {
    const localRuns = await repository.listRuns();
    try {
      const response = await fetch('/api/runs', { cache: 'no-store' });
      if (!response.ok) {
        setRuns(localRuns);
        return;
      }

      const payload = (await response.json()) as { runs: StoredRun[] };
      const deduped = new Map<string, StoredRun>();

      for (const item of payload.runs) {
        deduped.set(item.id, item);
      }
      for (const item of localRuns) {
        deduped.set(item.id, item);
      }

      const merged = [...deduped.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setRuns(merged);
    } catch {
      setRuns(localRuns);
    }
  }

  async function refreshEndpoints(): Promise<void> {
    const items = await listEndpoints();
    setEndpoints(items);
  }

  async function refreshJobs(): Promise<void> {
    try {
      const response = await fetch('/api/jobs', { cache: 'no-store' });
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as { jobs: EvalJob[] };
      setJobs(payload.jobs);
    } catch {
      // ignore temporary fetch failures during polling
    }
  }

  async function handleCreateEndpoint(): Promise<void> {
    if (!endpointName.trim() || !endpointUrlOrCommand.trim()) {
      setMessage('Server name and URL / command are required.');
      return;
    }
    setIsBusy(true);
    setMessage('');
    try {
      await addEndpoint({
        name: endpointName,
        transport: endpointTransport,
        urlOrCommand: endpointUrlOrCommand,
        authEnvVar: endpointAuthEnvVar,
        notes: endpointNotes
      });
      await refreshEndpoints();
      setEndpointName('');
      setEndpointUrlOrCommand('');
      setEndpointAuthEnvVar('');
      setEndpointNotes('');
      setMessage('Server profile saved.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDeleteEndpoint(id: string): Promise<void> {
    setIsBusy(true);
    setMessage('');
    try {
      await deleteEndpoint(id);
      await refreshEndpoints();
      setMessage('Server profile removed.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setIsBusy(false);
    }
  }

  async function handleExport(): Promise<void> {
    setIsBusy(true);
    setMessage('');
    try {
      const payload = await repository.exportPayload();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `mcp-agent-eval-runs-${new Date().toISOString().slice(0, 19)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage('Results exported.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setIsBusy(false);
    }
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsBusy(true);
    setMessage('');
    try {
      const content = await file.text();
      const payload = JSON.parse(content) as unknown;
      const imported = await repository.importPayload(payload);
      setRuns(imported);
      setMessage(`Imported ${imported.length} run(s).`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      event.target.value = '';
      setIsBusy(false);
    }
  }

  function handleSelectJobEndpoint(id: string): void {
    setJobEndpointId(id);
    if (!id) {
      return;
    }

    const endpoint = endpoints.find((item) => item.id === id);
    if (!endpoint) {
      return;
    }

    setJobServerName(endpoint.name);
    setJobTransport(endpoint.transport);
    setJobUrlOrCommand(endpoint.urlOrCommand);
    setJobDryRun(false);
  }

  async function handleCreateJob(): Promise<void> {
    if (!jobServerName.trim()) {
      setMessage('Server name is required to queue a job.');
      return;
    }

    if (!jobDryRun && !jobUrlOrCommand.trim()) {
      setMessage('URL / command is required unless dry-run is enabled.');
      return;
    }

    setIsJobBusy(true);
    setMessage('');

    try {
      const payload: {
        team: string;
        submittedBy: string;
        config: {
          suiteName: string;
          benchmarkPack: 'arduino' | 'general';
          serverName: string;
          modelName: string;
          dryRun: boolean;
          deterministicWeight: number;
          mcpTransportConfig?:
            | { type: 'stdio'; command: string; args: string[] }
            | { type: 'sse' | 'streamable-http'; url: string };
        };
      } = {
        team: jobTeam.trim() || 'default',
        submittedBy: jobSubmittedBy.trim() || 'local-user',
        config: {
          suiteName: jobSuiteName.trim() || 'pilot',
          benchmarkPack: jobBenchmarkPack,
          serverName: jobServerName.trim(),
          modelName: jobModelName.trim() || 'claude-sonnet',
          dryRun: jobDryRun,
          deterministicWeight: 0.7
        }
      };

      if (!jobDryRun) {
        if (jobTransport === 'stdio') {
          const parsed = parseStdioCommand(jobUrlOrCommand);
          if (!parsed.command) {
            setMessage('For stdio transport, enter a launch command.');
            setIsJobBusy(false);
            return;
          }

          payload.config.mcpTransportConfig = {
            type: 'stdio',
            command: parsed.command,
            args: parsed.args
          };
        } else {
          payload.config.mcpTransportConfig = {
            type: jobTransport,
            url: jobUrlOrCommand.trim()
          };
        }
      }

      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const failure = await response.text();
        throw new Error(`Job creation failed (${response.status}): ${failure}`);
      }

      const created = (await response.json()) as { id: string };
      await refreshJobs();
      setMessage(`Job queued: ${created.id}`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setIsJobBusy(false);
    }
  }

  function handleCopyCommand(): void {
    void navigator.clipboard
      .writeText('npm run run-suite:dry -- --team my-team --submitted-by me')
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
  }

  return (
    <main>
      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <div className="hero">
        <div className="hero-badge">MCP Agent Eval Suite</div>
        <h1>Does your MCP server handle agent tasks correctly?</h1>
        <p className="hero-sub">
          Run a standardized benchmark suite against any MCP server and get scores for mechanistic
          execution and epistemic reasoning quality — so you can compare servers and models
          side-by-side.
        </p>
      </div>

      {/* ── How it works ──────────────────────────────────────────────── */}
      <div className="workflow">
        <div className="workflow-step">
          <div className="step-number">1</div>
          <h3>Register your MCP server</h3>
          <p>
            Enter connection details for the server you want to test — a URL for network servers or
            a command for locally-launched ones.
          </p>
        </div>
        <div className="workflow-step">
          <div className="step-number">2</div>
          <h3>Run the evaluator</h3>
          <p>
            Execute one CLI command on your machine. It sends benchmark scenarios to your server,
            records every response, and writes a results file.
          </p>
        </div>
        <div className="workflow-step">
          <div className="step-number">3</div>
          <h3>Review the results</h3>
          <p>
            Import the results file here to see pass/fail outcomes and scores — or share the JSON
            with your team.
          </p>
        </div>
      </div>

      {/* ── Step 1: Register server ────────────────────────────────────── */}
      <div className="section-card">
        <h2>
          <span className="step-number small">1</span>
          Register your MCP server
        </h2>
        <p className="section-desc">
          Add one profile per MCP server. Profiles are stored in your browser and referenced when
          you run the evaluator CLI.
        </p>

        <div className="form-row">
          <div className="form-field">
            <label htmlFor="ep-name">Server name</label>
            <input
              id="ep-name"
              type="text"
              placeholder="e.g. my-mcp-server"
              value={endpointName}
              onChange={(e) => setEndpointName(e.target.value)}
              disabled={isBusy}
            />
            <p className="help-text">A short memorable label to identify this server.</p>
          </div>
          <div className="form-field">
            <label htmlFor="ep-transport">Connection type</label>
            <select
              id="ep-transport"
              value={endpointTransport}
              onChange={(e) =>
                setEndpointTransport(e.target.value as McpEndpoint['transport'])
              }
              disabled={isBusy}
            >
              <option value="sse">SSE — HTTP streaming (most common)</option>
              <option value="streamable-http">Streamable HTTP</option>
              <option value="stdio">Command-line (stdio)</option>
            </select>
            <p className="help-text">How the evaluator connects to your server.</p>
          </div>
        </div>

        <div className="form-row">
          <div className="form-field full-width">
            <label htmlFor="ep-url">
              {endpointTransport === 'stdio' ? 'Launch command' : 'Server URL'}
            </label>
            <input
              id="ep-url"
              type="text"
              placeholder={urlOrCommandPlaceholder(endpointTransport)}
              value={endpointUrlOrCommand}
              onChange={(e) => setEndpointUrlOrCommand(e.target.value)}
              disabled={isBusy}
            />
            {endpointTransport === 'stdio' ? (
              <p className="help-text">
                The shell command that starts your MCP server process.
              </p>
            ) : (
              <p className="help-text">
                Full URL including path, e.g.{' '}
                <code>https://server.example.com/mcp</code>
              </p>
            )}
          </div>
        </div>

        <div className="form-row">
          <div className="form-field">
            <label htmlFor="ep-auth">API key env var (optional)</label>
            <input
              id="ep-auth"
              type="text"
              placeholder="e.g. MCP_API_KEY"
              value={endpointAuthEnvVar}
              onChange={(e) => setEndpointAuthEnvVar(e.target.value)}
              disabled={isBusy}
            />
            <p className="help-text">
              The <em>name</em> of the environment variable holding your auth token — not
              the token itself.
            </p>
          </div>
          <div className="form-field">
            <label htmlFor="ep-notes">Notes (optional)</label>
            <input
              id="ep-notes"
              type="text"
              placeholder="e.g. staging build, v1.2"
              value={endpointNotes}
              onChange={(e) => setEndpointNotes(e.target.value)}
              disabled={isBusy}
            />
          </div>
        </div>

        <button
          type="button"
          className="btn-primary"
          onClick={() => void handleCreateEndpoint()}
          disabled={isBusy}
        >
          Save server profile
        </button>

        {endpoints.length > 0 ? (
          <table style={{ marginTop: 24 }}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>URL / Command</th>
                <th>Auth env var</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {endpoints.map((ep) => (
                <tr key={ep.id}>
                  <td>
                    <strong>{ep.name}</strong>
                  </td>
                  <td>
                    <span className="badge-neutral">{transportLabel(ep.transport)}</span>
                  </td>
                  <td className="code">{ep.urlOrCommand}</td>
                  <td className="code">{ep.authEnvVar ?? '—'}</td>
                  <td>{ep.notes ?? '—'}</td>
                  <td>
                    <button
                      type="button"
                      className="btn-danger"
                      onClick={() => void handleDeleteEndpoint(ep.id)}
                      disabled={isBusy}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="empty-state">
            No servers registered yet — fill in the form above to add one.
          </p>
        )}
      </div>

      {/* ── Step 2: Run the CLI ────────────────────────────────────────── */}
      <div className="section-card">
        <h2>
          <span className="step-number small">2</span>
          Run the evaluator
        </h2>
        <p className="section-desc">
          The evaluator runs entirely on your local machine. It sends the test cases to your MCP
          server, scores every response, and writes a <code>reports/run-report.json</code> file
          you can import below.
        </p>

        <p className="cmd-label">
          Try it now — offline dry run (no server required, uses stub responses):
        </p>
        <div className="cli-block">
          <span className="cli-prompt">$</span>
          {' npm run run-suite:dry -- --team my-team --submitted-by me'}
          <button type="button" className="cli-copy" onClick={handleCopyCommand}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>

        <p className="cmd-label" style={{ marginTop: 20 }}>
          Live mode — test a real MCP server over SSE:
        </p>
        <div className="cli-block">
          <span className="cli-prompt">$</span>
          {' npm run run-suite -- --server my-mcp-server \\'}
          <br />
          {'    --transport sse --mcp-url https://your-server.example.com/mcp'}
        </div>

        <p className="help-text" style={{ marginTop: 12 }}>
          Add <code>--ingest-url http://localhost:3000/api/runs</code> to push results directly
          to this dashboard instead of importing the JSON manually.
        </p>

        <div className="queue-panel">
          <p className="cmd-label" style={{ marginTop: 20 }}>
            Queue runs directly from web (worker must be running):
          </p>

          <div className="form-row" style={{ marginTop: 10 }}>
            <div className="form-field">
              <label htmlFor="job-endpoint-select">Use registered endpoint (optional)</label>
              <select
                id="job-endpoint-select"
                value={jobEndpointId}
                onChange={(e) => handleSelectJobEndpoint(e.target.value)}
                disabled={isBusy || isJobBusy}
              >
                <option value="">Custom endpoint</option>
                {endpoints.map((ep) => (
                  <option key={ep.id} value={ep.id}>
                    {ep.name} ({transportLabel(ep.transport)})
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="job-server-name">Server label</label>
              <input
                id="job-server-name"
                type="text"
                value={jobServerName}
                onChange={(e) => setJobServerName(e.target.value)}
                disabled={isBusy || isJobBusy}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label htmlFor="job-transport">Connection type</label>
              <select
                id="job-transport"
                value={jobTransport}
                onChange={(e) => setJobTransport(e.target.value as McpEndpoint['transport'])}
                disabled={isBusy || isJobBusy || jobDryRun}
              >
                <option value="sse">SSE</option>
                <option value="streamable-http">Streamable HTTP</option>
                <option value="stdio">stdio</option>
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="job-url-command">
                {jobTransport === 'stdio' ? 'Launch command' : 'Server URL'}
              </label>
              <input
                id="job-url-command"
                type="text"
                value={jobUrlOrCommand}
                onChange={(e) => setJobUrlOrCommand(e.target.value)}
                placeholder={urlOrCommandPlaceholder(jobTransport)}
                disabled={isBusy || isJobBusy || jobDryRun}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label htmlFor="job-pack">Benchmark pack</label>
              <select
                id="job-pack"
                value={jobBenchmarkPack}
                onChange={(e) => setJobBenchmarkPack(e.target.value as 'arduino' | 'general')}
                disabled={isBusy || isJobBusy}
              >
                <option value="arduino">arduino</option>
                <option value="general">general</option>
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="job-suite">Suite name</label>
              <input
                id="job-suite"
                type="text"
                value={jobSuiteName}
                onChange={(e) => setJobSuiteName(e.target.value)}
                disabled={isBusy || isJobBusy}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label htmlFor="job-model">Model label</label>
              <input
                id="job-model"
                type="text"
                value={jobModelName}
                onChange={(e) => setJobModelName(e.target.value)}
                disabled={isBusy || isJobBusy}
              />
            </div>
            <div className="form-field">
              <label htmlFor="job-team">Team</label>
              <input
                id="job-team"
                type="text"
                value={jobTeam}
                onChange={(e) => setJobTeam(e.target.value)}
                disabled={isBusy || isJobBusy}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label htmlFor="job-submitted-by">Submitted by</label>
              <input
                id="job-submitted-by"
                type="text"
                value={jobSubmittedBy}
                onChange={(e) => setJobSubmittedBy(e.target.value)}
                disabled={isBusy || isJobBusy}
              />
            </div>
            <div className="form-field checkbox-field">
              <label className="checkbox-label" htmlFor="job-dry-run">
                <input
                  id="job-dry-run"
                  type="checkbox"
                  checked={jobDryRun}
                  onChange={(e) => setJobDryRun(e.target.checked)}
                  disabled={isBusy || isJobBusy}
                />
                Dry run (no live MCP connection)
              </label>
              <p className="help-text" style={{ marginTop: 6 }}>
                When disabled, a running worker will connect using the selected transport.
              </p>
            </div>
          </div>

          <div className="toolbar">
            <button
              type="button"
              className="btn-primary"
              onClick={() => void handleCreateJob()}
              disabled={isBusy || isJobBusy}
            >
              Queue run
            </button>
            <button type="button" onClick={() => void refreshJobs()} disabled={isBusy || isJobBusy}>
              Refresh jobs
            </button>
          </div>

          <table style={{ marginTop: 14 }}>
            <thead>
              <tr>
                <th>Created</th>
                <th>Server</th>
                <th>Pack</th>
                <th>Status</th>
                <th>Worker</th>
                <th>Latest event</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty-cell">
                    No queued jobs yet.
                  </td>
                </tr>
              ) : (
                jobs.map((job) => (
                  <tr key={job.id}>
                    <td>{new Date(job.createdAt).toLocaleString()}</td>
                    <td>{job.config.serverName}</td>
                    <td>{job.config.benchmarkPack}</td>
                    <td>
                      <span className={statusBadgeClass(job.status)}>{job.status}</span>
                    </td>
                    <td>{job.workerId ?? '—'}</td>
                    <td>{job.events[job.events.length - 1]?.message ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Step 3: Results ───────────────────────────────────────────── */}
      <div className="section-card">
        <h2>
          <span className="step-number small">3</span>
          Test results
        </h2>
        <p className="section-desc">
          Import a <code>run-report.json</code> to add results, or export everything as JSON to
          share with your team. Results are stored in your browser.
        </p>

        <div className="toolbar">
          <button type="button" onClick={() => void refreshRuns()} disabled={isBusy}>
            Refresh
          </button>
          <label className="upload-label">
            Import report JSON
            <input
              type="file"
              accept="application/json"
              onChange={(e) => void handleImport(e)}
              disabled={isBusy}
            />
          </label>
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={isBusy || runs.length === 0}
          >
            Export all runs
          </button>
        </div>

        {message ? <p className="message">{message}</p> : null}

        {totals.count > 0 && (
          <div className="stats-row">
            <div className="stat">
              <span className="stat-value">{totals.count}</span>
              <span className="stat-label">total runs</span>
            </div>
            <div className="stat">
              <span className={`stat-value ${scoreClass(totals.avgScore)}`}>
                {totals.avgScore.toFixed(3)}
              </span>
              <span className="stat-label">avg score</span>
            </div>
          </div>
        )}

        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Team</th>
              <th>Server tested</th>
              <th>Model</th>
              <th>Cases</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty-cell">
                  No results yet — run the evaluator and import the report above.
                </td>
              </tr>
            ) : (
              runs.map((run) => (
                <tr key={run.id}>
                  <td>{new Date(run.createdAt).toLocaleString()}</td>
                  <td>{run.team}</td>
                  <td>
                    <strong>{run.report.server}</strong>
                  </td>
                  <td>{run.report.model}</td>
                  <td>
                    <span className="badge-pass">
                      {run.report.summary.passed} passed
                    </span>
                    {run.report.summary.failed > 0 && (
                      <>
                        {' '}
                        <span className="badge-fail">
                          {run.report.summary.failed} failed
                        </span>
                      </>
                    )}
                  </td>
                  <td>
                    <span className={scoreClass(run.report.summary.score)}>
                      {run.report.summary.score.toFixed(3)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
