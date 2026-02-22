'use client';

import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { createRunRepository } from '@/lib/runRepository';
import type { StoredRun } from '@/lib/types';

const repository = createRunRepository('local');

export default function HomePage() {
  const [runs, setRuns] = useState<StoredRun[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState('');

  const totals = useMemo(() => {
    const count = runs.length;
    const avgScore = count === 0
      ? 0
      : runs.reduce((acc, item) => acc + item.report.summary.score, 0) / count;
    return { count, avgScore };
  }, [runs]);

  useEffect(() => {
    void refreshRuns();
  }, []);

  async function refreshRuns(): Promise<void> {
    const items = await repository.listRuns();
    setRuns(items);
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
