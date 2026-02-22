'use client';

import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { addEndpoint, deleteEndpoint, listEndpoints } from '@/lib/endpointRepository';
import { createRunRepository } from '@/lib/runRepository';
import type { McpEndpoint, StoredRun } from '@/lib/types';

const repository = createRunRepository('local');

export default function HomePage() {
  const [runs, setRuns] = useState<StoredRun[]>([]);
  const [endpoints, setEndpoints] = useState<McpEndpoint[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [endpointName, setEndpointName] = useState('');
  const [endpointTransport, setEndpointTransport] = useState<McpEndpoint['transport']>('sse');
  const [endpointUrlOrCommand, setEndpointUrlOrCommand] = useState('');
  const [endpointAuthEnvVar, setEndpointAuthEnvVar] = useState('');
  const [endpointNotes, setEndpointNotes] = useState('');

  const totals = useMemo(() => {
    const count = runs.length;
    const avgScore = count === 0
      ? 0
      : runs.reduce((acc, item) => acc + item.report.summary.score, 0) / count;
    return { count, avgScore };
  }, [runs]);

  useEffect(() => {
    void refreshRuns();
    void refreshEndpoints();
  }, []);

  async function refreshRuns(): Promise<void> {
    const items = await repository.listRuns();
    setRuns(items);
  }

  async function refreshEndpoints(): Promise<void> {
    const items = await listEndpoints();
    setEndpoints(items);
  }

  async function handleCreateEndpoint(): Promise<void> {
    if (!endpointName.trim() || !endpointUrlOrCommand.trim()) {
      setMessage('Endpoint name and URL/command are required.');
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
      setMessage('Endpoint saved in local dashboard settings.');
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
      setMessage('Endpoint removed.');
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
      anchor.download = `arduino-mcp-runs-${new Date().toISOString().slice(0, 19)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage('JSON export downloaded.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setIsBusy(false);
    }
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setIsBusy(true);
    setMessage('');

    try {
      const content = await file.text();
      const payload = JSON.parse(content) as unknown;
      const imported = await repository.importPayload(payload);
      setRuns(imported);
      setMessage(`Imported ${imported.length} run(s) from JSON.`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      event.target.value = '';
      setIsBusy(false);
    }
  }

  return (
    <main>
      <h1>Arduino MCP Eval Runs</h1>
      <p>Local mode stores runs in browser localStorage with JSON import/export for sharing.</p>

      <h2>MCP Endpoints</h2>
      <p>Create endpoint profiles for the MCP servers you want to test.</p>

      <div className="endpoint-grid">
        <input
          type="text"
          placeholder="Endpoint name (e.g. lab-mcp-sse)"
          value={endpointName}
          onChange={(event) => setEndpointName(event.target.value)}
          disabled={isBusy}
        />
        <select
          value={endpointTransport}
          onChange={(event) => setEndpointTransport(event.target.value as McpEndpoint['transport'])}
          disabled={isBusy}
        >
          <option value="sse">sse</option>
          <option value="streamable-http">streamable-http</option>
          <option value="stdio">stdio</option>
        </select>
        <input
          type="text"
          placeholder="URL or command"
          value={endpointUrlOrCommand}
          onChange={(event) => setEndpointUrlOrCommand(event.target.value)}
          disabled={isBusy}
        />
        <input
          type="text"
          placeholder="Auth env var (optional, e.g. MCP_API_KEY)"
          value={endpointAuthEnvVar}
          onChange={(event) => setEndpointAuthEnvVar(event.target.value)}
          disabled={isBusy}
        />
        <input
          type="text"
          placeholder="Notes (optional)"
          value={endpointNotes}
          onChange={(event) => setEndpointNotes(event.target.value)}
          disabled={isBusy}
        />
        <button type="button" onClick={() => void handleCreateEndpoint()} disabled={isBusy}>Create Endpoint</button>
      </div>

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Transport</th>
            <th>URL / Command</th>
            <th>Auth Env</th>
            <th>Notes</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {endpoints.length === 0 ? (
            <tr>
              <td colSpan={6}>No endpoints yet. Create one above.</td>
            </tr>
          ) : (
            endpoints.map((endpoint) => (
              <tr key={endpoint.id}>
                <td>{endpoint.name}</td>
                <td>{endpoint.transport}</td>
                <td className="code">{endpoint.urlOrCommand}</td>
                <td className="code">{endpoint.authEnvVar ?? '-'}</td>
                <td>{endpoint.notes ?? '-'}</td>
                <td>
                  <button type="button" onClick={() => void handleDeleteEndpoint(endpoint.id)} disabled={isBusy}>Delete</button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <div className="toolbar">
        <button type="button" onClick={() => void refreshRuns()} disabled={isBusy}>Refresh</button>
        <button type="button" onClick={() => void handleExport()} disabled={isBusy || runs.length === 0}>Download JSON</button>
        <label className="upload-label">
          Upload JSON
          <input type="file" accept="application/json" onChange={(event) => void handleImport(event)} disabled={isBusy} />
        </label>
      </div>

      <p>
        <strong>Runs:</strong> {totals.count} &nbsp;|&nbsp; <strong>Avg Score:</strong> {totals.avgScore.toFixed(3)}
      </p>

      {message ? <p className="message">{message}</p> : null}

      <table>
        <thead>
          <tr>
            <th>Created</th>
            <th>Team</th>
            <th>Submitted By</th>
            <th>Run ID</th>
            <th>Server</th>
            <th>Model</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          {runs.length === 0 ? (
            <tr>
              <td colSpan={7}>No runs in local storage yet. Upload JSON or ingest into this browser session.</td>
            </tr>
          ) : (
            runs.map((run) => (
              <tr key={run.id}>
                <td>{new Date(run.createdAt).toLocaleString()}</td>
                <td>{run.team}</td>
                <td>{run.submittedBy}</td>
                <td className="code">{run.report.runId}</td>
                <td>{run.report.server}</td>
                <td>{run.report.model}</td>
                <td>{run.report.summary.score.toFixed(3)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </main>
  );
}
