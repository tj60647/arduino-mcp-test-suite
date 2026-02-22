'use client';

import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { addEndpoint, deleteEndpoint, listEndpoints } from '@/lib/endpointRepository';
import { createRunRepository } from '@/lib/runRepository';
import type {
  EvalJob,
  McpEndpoint,
  RegisteredWorker,
  StoredRun,
  WorkerInfo
} from '@/lib/types';

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

function endpointNameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/[^a-zA-Z0-9-]/g, '-');
    return `mcp-${host}`;
  } catch {
    return 'mcp-endpoint';
  }
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

function isWorkerOnline(lastSeenAt: string): boolean {
  return Date.now() - new Date(lastSeenAt).getTime() < 15_000;
}

function workerStatusBadge(worker: WorkerInfo): string {
  return isWorkerOnline(worker.lastSeenAt)
    ? worker.status === 'busy'
      ? 'badge-neutral'
      : 'badge-pass'
    : 'badge-fail';
}

function workerStatusLabel(worker: WorkerInfo): string {
  if (!isWorkerOnline(worker.lastSeenAt)) {
    return 'offline';
  }

  return worker.status;
}

export default function HomePage() {
  const [runs, setRuns] = useState<StoredRun[]>([]);
  const [endpoints, setEndpoints] = useState<McpEndpoint[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [quickEndpointUrl, setQuickEndpointUrl] = useState('');
  const [showEndpointAdvanced, setShowEndpointAdvanced] = useState(false);
  const [endpointName, setEndpointName] = useState('');
  const [endpointTransport, setEndpointTransport] = useState<McpEndpoint['transport']>('sse');
  const [endpointUrlOrCommand, setEndpointUrlOrCommand] = useState('');
  const [endpointAuthEnvVar, setEndpointAuthEnvVar] = useState('');
  const [endpointNotes, setEndpointNotes] = useState('');
  const [denseMode, setDenseMode] = useState(false);
  const [jobs, setJobs] = useState<EvalJob[]>([]);
  const [workers, setWorkers] = useState<WorkerInfo[]>([]);
  const [registeredWorkers, setRegisteredWorkers] = useState<RegisteredWorker[]>([]);
  const [adminApiKey, setAdminApiKey] = useState('');
  const [newWorkerId, setNewWorkerId] = useState('');
  const [issuedWorkerToken, setIssuedWorkerToken] = useState<string | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [isWorkerAdminBusy, setIsWorkerAdminBusy] = useState(false);
  const [isJobBusy, setIsJobBusy] = useState(false);
  const [jobEndpointId, setJobEndpointId] = useState('');
  const [jobServerName, setJobServerName] = useState('mcp-api-server');
  const [jobTransport, setJobTransport] = useState<McpEndpoint['transport']>('sse');
  const [jobUrlOrCommand, setJobUrlOrCommand] = useState('');
  const [jobModelName, setJobModelName] = useState('claude-sonnet');
  const [jobSuiteName, setJobSuiteName] = useState('general');
  const [jobTeam, setJobTeam] = useState('default');
  const [jobSubmittedBy, setJobSubmittedBy] = useState('local-user');
  const [jobDryRun, setJobDryRun] = useState(true);
  const [singleInputText, setSingleInputText] = useState('');
  const [singleInputResult, setSingleInputResult] = useState('');
  const [singleInputTool, setSingleInputTool] = useState('');
  const [isSingleInputBusy, setIsSingleInputBusy] = useState(false);
  const [showAdvancedJobOptions, setShowAdvancedJobOptions] = useState(false);
  const [showWorkerSetup, setShowWorkerSetup] = useState(false);
  const [showAdvancedControls, setShowAdvancedControls] = useState(false);

  const totals = useMemo(() => {
    const count = runs.length;
    const avgScore =
      count === 0
        ? 0
        : runs.reduce((acc, item) => acc + item.report.summary.score, 0) / count;
    return { count, avgScore };
  }, [runs]);

  const onlineWorkerCount = useMemo(() => {
    return workers.filter((worker) => isWorkerOnline(worker.lastSeenAt)).length;
  }, [workers]);

  useEffect(() => {
    void refreshRuns();
    void refreshEndpoints();
    void refreshJobs();
    void refreshWorkers();
  }, []);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem('mcp-ui-density-mode');
      if (stored === 'dense') {
        setDenseMode(true);
      }
    } catch {
      // ignore storage read issues
    }
  }, []);

  useEffect(() => {
    document.body.classList.toggle('density-dense', denseMode);
    try {
      window.localStorage.setItem('mcp-ui-density-mode', denseMode ? 'dense' : 'comfortable');
    } catch {
      // ignore storage write issues
    }

    return () => {
      document.body.classList.remove('density-dense');
    };
  }, [denseMode]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refreshJobs();
      void refreshRuns();
      void refreshWorkers();
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (endpoints.length === 1 && !jobEndpointId) {
      handleSelectJobEndpoint(endpoints[0].id);
      return;
    }

    if (jobEndpointId && !endpoints.some((endpoint) => endpoint.id === jobEndpointId)) {
      setJobEndpointId('');
    }
  }, [endpoints, jobEndpointId]);

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

  async function refreshWorkers(): Promise<void> {
    try {
      const response = await fetch('/api/workers', { cache: 'no-store' });
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as { workers: WorkerInfo[] };
      setWorkers(payload.workers);
    } catch {
      // ignore temporary fetch failures during polling
    }
  }

  async function refreshRegisteredWorkers(): Promise<void> {
    if (!adminApiKey.trim()) {
      setMessage('Enter admin API key to load registered workers.');
      return;
    }

    setIsWorkerAdminBusy(true);
    try {
      const response = await fetch('/api/workers/registry', {
        headers: { authorization: `Bearer ${adminApiKey.trim()}` },
        cache: 'no-store'
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to load registered workers (${response.status}): ${text}`);
      }

      const payload = (await response.json()) as { workers: RegisteredWorker[] };
      setRegisteredWorkers(payload.workers);
      setMessage(`Loaded ${payload.workers.length} registered worker(s).`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setIsWorkerAdminBusy(false);
    }
  }

  async function handleRegisterWorker(): Promise<void> {
    if (!adminApiKey.trim()) {
      setMessage('Admin API key is required to register workers.');
      return;
    }

    if (!newWorkerId.trim()) {
      setMessage('Worker ID is required.');
      return;
    }

    setIsWorkerAdminBusy(true);
    setIssuedWorkerToken(null);
    setTokenCopied(false);
    try {
      const response = await fetch('/api/workers/registry', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${adminApiKey.trim()}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({ workerId: newWorkerId.trim() })
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Registration failed (${response.status}): ${text}`);
      }

      const payload = (await response.json()) as { workerId: string; token: string };
      setIssuedWorkerToken(payload.token);
      setNewWorkerId(payload.workerId);
      await refreshRegisteredWorkers();
      setMessage(`Worker registered: ${payload.workerId}`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setIsWorkerAdminBusy(false);
    }
  }

  async function handleRotateWorkerToken(workerId: string): Promise<void> {
    if (!adminApiKey.trim()) {
      setMessage('Admin API key is required to rotate worker tokens.');
      return;
    }

    setIsWorkerAdminBusy(true);
    setIssuedWorkerToken(null);
    setTokenCopied(false);
    try {
      const response = await fetch(`/api/workers/registry/${encodeURIComponent(workerId)}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${adminApiKey.trim()}` }
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Token rotation failed (${response.status}): ${text}`);
      }

      const payload = (await response.json()) as { workerId: string; token: string };
      setIssuedWorkerToken(payload.token);
      setNewWorkerId(payload.workerId);
      await refreshRegisteredWorkers();
      setMessage(`Token rotated for worker: ${payload.workerId}`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setIsWorkerAdminBusy(false);
    }
  }

  async function handleRevokeWorkerToken(workerId: string): Promise<void> {
    if (!adminApiKey.trim()) {
      setMessage('Admin API key is required to revoke worker tokens.');
      return;
    }

    setIsWorkerAdminBusy(true);
    try {
      const response = await fetch(`/api/workers/registry/${encodeURIComponent(workerId)}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${adminApiKey.trim()}` }
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Token revoke failed (${response.status}): ${text}`);
      }

      await refreshRegisteredWorkers();
      setMessage(`Token revoked for worker: ${workerId}`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setIsWorkerAdminBusy(false);
    }
  }

  async function handleCopyWorkerToken(): Promise<void> {
    if (!issuedWorkerToken) {
      return;
    }

    try {
      await navigator.clipboard.writeText(issuedWorkerToken);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 2000);
    } catch {
      setMessage('Failed to copy token. Copy it manually from the text block.');
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

  async function handleQuickEndpointConnect(): Promise<void> {
    const endpointUrl = quickEndpointUrl.trim();
    if (!endpointUrl) {
      setMessage('Paste an MCP endpoint URL first.');
      return;
    }

    try {
      new URL(endpointUrl);
    } catch {
      setMessage('Enter a valid URL, e.g. https://your-server.example.com/mcp');
      return;
    }

    setIsBusy(true);
    setMessage('');

    try {
      const existingByUrl = endpoints.find((ep) => ep.urlOrCommand.trim() === endpointUrl);
      if (existingByUrl) {
        setJobEndpointId(existingByUrl.id);
        setJobServerName(existingByUrl.name);
        setJobTransport(existingByUrl.transport);
        setJobUrlOrCommand(existingByUrl.urlOrCommand);
        setJobDryRun(false);
        setMessage(`Endpoint selected: ${existingByUrl.name}`);
        return;
      }

      const baseName = endpointNameFromUrl(endpointUrl);
      const usedNames = new Set(endpoints.map((ep) => ep.name.toLowerCase()));
      let candidate = baseName;
      let suffix = 2;
      while (usedNames.has(candidate.toLowerCase())) {
        candidate = `${baseName}-${suffix}`;
        suffix += 1;
      }

      await addEndpoint({
        name: candidate,
        transport: 'streamable-http',
        urlOrCommand: endpointUrl,
        notes: 'Quick connect'
      });

      const updated = await listEndpoints();
      setEndpoints(updated);

      const created = updated.find(
        (ep) => ep.name === candidate && ep.urlOrCommand.trim() === endpointUrl
      );

      if (created) {
        setJobEndpointId(created.id);
        setJobServerName(created.name);
        setJobTransport(created.transport);
        setJobUrlOrCommand(created.urlOrCommand);
        setJobDryRun(false);
      }

      setQuickEndpointUrl('');
      setMessage(`Endpoint connected: ${candidate}. You can now click Queue quick test.`);
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

  function buildTransportConfigFromCurrentSelection():
    | { type: 'stdio'; command: string; args: string[] }
    | { type: 'sse' | 'streamable-http'; url: string }
    | undefined {
    if (jobDryRun) {
      return undefined;
    }

    const selectedEndpoint = endpoints.find((item) => item.id === jobEndpointId);
    const effectiveTransport = selectedEndpoint?.transport ?? jobTransport;
    const effectiveUrlOrCommand = selectedEndpoint?.urlOrCommand ?? jobUrlOrCommand;

    if (!effectiveUrlOrCommand.trim()) {
      throw new Error('URL / command is required unless dry-run is enabled.');
    }

    if (effectiveTransport === 'stdio') {
      const parsed = parseStdioCommand(effectiveUrlOrCommand);
      if (!parsed.command) {
        throw new Error('For stdio transport, enter a launch command.');
      }

      return {
        type: 'stdio',
        command: parsed.command,
        args: parsed.args
      };
    }

    return {
      type: effectiveTransport,
      url: effectiveUrlOrCommand.trim()
    };
  }

  function buildLiveTransportConfigFromCurrentSelection():
    | { type: 'stdio'; command: string; args: string[] }
    | { type: 'sse' | 'streamable-http'; url: string } {
    const selectedEndpoint = endpoints.find((item) => item.id === jobEndpointId);
    const effectiveTransport = selectedEndpoint?.transport ?? jobTransport;
    const effectiveUrlOrCommand = selectedEndpoint?.urlOrCommand ?? jobUrlOrCommand;

    if (!effectiveUrlOrCommand.trim()) {
      throw new Error('Select an endpoint first.');
    }

    if (effectiveTransport === 'stdio') {
      const parsed = parseStdioCommand(effectiveUrlOrCommand);
      if (!parsed.command) {
        throw new Error('For stdio transport, enter a launch command.');
      }

      return {
        type: 'stdio',
        command: parsed.command,
        args: parsed.args
      };
    }

    return {
      type: effectiveTransport,
      url: effectiveUrlOrCommand.trim()
    };
  }

  async function handleRunSingleInputTest(): Promise<void> {
    const input = singleInputText.trim();
    if (!input) {
      setMessage('Enter input text first.');
      return;
    }

    setIsSingleInputBusy(true);
    setMessage('');
    setSingleInputTool('');

    try {
      const selectedEndpoint = endpoints.find((item) => item.id === jobEndpointId);
      const serverName = (selectedEndpoint?.name ?? jobServerName).trim() || 'mcp-endpoint';
      const transportConfig = buildLiveTransportConfigFromCurrentSelection();

      const response = await fetch('/api/input-test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          serverName,
          input,
          mcpTransportConfig: transportConfig
        })
      });

      const payload = (await response.json()) as {
        connected?: boolean;
        toolUsed?: string;
        result?: unknown;
        availableTools?: string[];
        error?: string;
      };

      if (!response.ok) {
        const detail = payload.error ?? `Input test failed (${response.status})`;
        const toolList = payload.availableTools && payload.availableTools.length > 0
          ? ` Available tools: ${payload.availableTools.join(', ')}`
          : '';
        throw new Error(`${detail}${toolList}`);
      }

      setSingleInputTool(payload.toolUsed ?? 'unknown');
      setSingleInputResult(JSON.stringify(payload.result ?? payload, null, 2));
      setMessage(`Connected and ran tool: ${payload.toolUsed ?? 'unknown'}`);
    } catch (error) {
      setSingleInputResult('');
      setMessage((error as Error).message);
    } finally {
      setIsSingleInputBusy(false);
    }
  }

  async function queueJob(mode: 'quick' | 'advanced'): Promise<void> {
    const selectedEndpoint = endpoints.find((item) => item.id === jobEndpointId);

    const serverName =
      mode === 'quick'
        ? ((selectedEndpoint?.name ?? jobServerName.trim()) || 'mcp-endpoint')
        : jobServerName.trim();

    if (!serverName) {
      setMessage('Server name is required to queue a job.');
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
          benchmarkPack: 'general';
          serverName: string;
          modelName: string;
          dryRun: boolean;
          deterministicWeight: number;
          mcpTransportConfig?:
            | { type: 'stdio'; command: string; args: string[] }
            | { type: 'sse' | 'streamable-http'; url: string };
        };
      } = {
        team: mode === 'quick' ? 'default' : jobTeam.trim() || 'default',
        submittedBy: mode === 'quick' ? 'web-quick-test' : jobSubmittedBy.trim() || 'local-user',
        config: {
          suiteName: mode === 'quick' ? 'general' : jobSuiteName.trim() || 'general',
          benchmarkPack: 'general',
          serverName,
          modelName: mode === 'quick' ? 'quick-mcp-check' : jobModelName.trim() || 'claude-sonnet',
          dryRun: jobDryRun,
          deterministicWeight: 0.7
        }
      };

      const transportConfig = buildTransportConfigFromCurrentSelection();
      if (transportConfig) {
        payload.config.mcpTransportConfig = transportConfig;
      }

      if (mode === 'quick' && onlineWorkerCount === 0) {
        const quickRunResponse = await fetch('/api/quick-run', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!quickRunResponse.ok) {
          const failure = await quickRunResponse.text();
          throw new Error(`Quick run failed (${quickRunResponse.status}): ${failure}`);
        }

        const quickResult = (await quickRunResponse.json()) as {
          runId: string;
          summary?: { score?: number };
          connectivity?:
            | { mode: 'dry-run' }
            | { mode: 'live'; connected: boolean; discoveredCapabilities: string[] };
        };

        await refreshRuns();
        const score = quickResult.summary?.score;
        const scoreLabel = typeof score === 'number' ? ` (score ${score.toFixed(3)})` : '';
        if (quickResult.connectivity?.mode === 'live') {
          const discovered = quickResult.connectivity.discoveredCapabilities.length;
          setMessage(`Connected to endpoint. Discovered ${discovered} capability(s). Quick test finished${scoreLabel}`);
        } else {
          setMessage(`Quick test finished${scoreLabel}`);
        }
        return;
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
      if (mode === 'quick') {
        const queuedMessage = onlineWorkerCount > 0
          ? `Test started: ${created.id}`
          : `Test queued: ${created.id}. No runner is online yet, so it will start when a runner connects.`;
        setMessage(queuedMessage);
      } else {
        setMessage(`Job queued: ${created.id}`);
      }
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setIsJobBusy(false);
    }
  }

  async function handleCreateJob(): Promise<void> {
    await queueJob('advanced');
  }

  async function handleCreateQuickJob(): Promise<void> {
    await queueJob('quick');
  }

  return (
    <main>
      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <div className="hero">
        <div className="hero-badge">MCP Agent Eval Suite</div>
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => setShowAdvancedControls((current) => !current)}
            style={{ marginLeft: 'auto' }}
          >
            {showAdvancedControls ? 'Hide advanced controls' : 'Show advanced controls'}
          </button>
          <button
            type="button"
            onClick={() => setDenseMode((current) => !current)}
          >
            {denseMode ? 'Comfortable mode' : 'High-density mode'}
          </button>
        </div>
        <h1>Test your MCP in 2 steps</h1>
        <p className="hero-sub">
          Paste your MCP URL, click run, and check the result table. Advanced benchmark and worker
          controls stay hidden unless you open them.
        </p>
      </div>

      {/* ── How it works ──────────────────────────────────────────────── */}
      <p className="help-text" style={{ margin: '0 0 16px' }}>
        1) Paste MCP URL and connect. 2) Run quick test. 3) See results below.
      </p>

      {/* ── Step 1: Register server ────────────────────────────────────── */}
      <div className="section-card">
        <h2>
          <span className="step-number small">1</span>
          Paste your MCP URL
        </h2>
        <p className="section-desc">
          This is the only required setup. Your endpoint is saved in this browser for reuse.
        </p>

        <div className="form-row" style={{ marginTop: 4 }}>
          <div className="form-field full-width">
            <label htmlFor="quick-endpoint-url">Quick connect MCP endpoint URL</label>
            <input
              id="quick-endpoint-url"
              type="text"
              placeholder="https://late-cloud-eqizx.run.mcp-use.com/mcp"
              value={quickEndpointUrl}
              onChange={(e) => setQuickEndpointUrl(e.target.value)}
              disabled={isBusy}
            />
            <p className="help-text">
              Paste one URL and click Connect endpoint.
            </p>
          </div>
        </div>

        <div className="toolbar">
          <button
            type="button"
            className="btn-primary"
            onClick={() => void handleQuickEndpointConnect()}
            disabled={isBusy}
          >
            Connect endpoint
          </button>
          {showAdvancedControls ? (
            <button
              type="button"
              onClick={() => setShowEndpointAdvanced((current) => !current)}
              disabled={isBusy}
            >
              {showEndpointAdvanced ? 'Hide advanced endpoint options' : 'Show advanced endpoint options'}
            </button>
          ) : null}
        </div>

        {showEndpointAdvanced ? (
          <>
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
          </>
        ) : null}

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

      {showAdvancedControls ? (
      <div className="section-card">
        <h2>
          <span className="step-number small">2</span>
          Runner status (optional)
        </h2>
        <p className="section-desc">
          You can ignore this unless tests stay queued. A runner must be online to execute tests.
        </p>

        <div className="toolbar">
          <button
            type="button"
            onClick={() => setShowWorkerSetup((current) => !current)}
            disabled={isBusy || isJobBusy || isWorkerAdminBusy}
          >
            {showWorkerSetup ? 'Hide worker details' : 'Show worker details'}
          </button>
        </div>

        <p className="help-text" style={{ marginTop: 0 }}>
          Workers online: <strong>{onlineWorkerCount}</strong> / {workers.length}
        </p>

        {showWorkerSetup ? (
          <>
            <div className="toolbar">
              <button type="button" onClick={() => void refreshWorkers()} disabled={isBusy || isJobBusy}>
                Refresh workers
              </button>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Worker</th>
                  <th>Status</th>
                  <th>Current job</th>
                  <th>Host</th>
                  <th>Last seen</th>
                </tr>
              </thead>
              <tbody>
                {workers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="empty-cell">
                      No workers reporting yet. Start at least one worker to process queued runs.
                    </td>
                  </tr>
                ) : (
                  workers.map((worker) => (
                    <tr key={worker.workerId}>
                      <td className="code">{worker.workerId}</td>
                      <td>
                        <span className={workerStatusBadge(worker)}>{workerStatusLabel(worker)}</span>
                      </td>
                      <td className="code">{worker.currentJobId ?? '—'}</td>
                      <td>{worker.host ?? '—'}</td>
                      <td>{new Date(worker.lastSeenAt).toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            <div className="queue-panel" style={{ marginTop: 14 }}>
              <p className="cmd-label">Advanced worker setup</p>
              <div className="form-row" style={{ marginTop: 10 }}>
                <div className="form-field">
                  <label htmlFor="admin-api-key">Admin API key</label>
                  <input
                    id="admin-api-key"
                    type="password"
                    placeholder="INGEST_API_KEY"
                    value={adminApiKey}
                    onChange={(e) => setAdminApiKey(e.target.value)}
                    disabled={isBusy || isJobBusy || isWorkerAdminBusy}
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="new-worker-id">Worker ID</label>
                  <input
                    id="new-worker-id"
                    type="text"
                    placeholder="worker-1"
                    value={newWorkerId}
                    onChange={(e) => setNewWorkerId(e.target.value)}
                    disabled={isBusy || isJobBusy || isWorkerAdminBusy}
                  />
                </div>
              </div>

              <div className="toolbar">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => void handleRegisterWorker()}
                  disabled={isBusy || isJobBusy || isWorkerAdminBusy}
                >
                  Register worker
                </button>
                <button
                  type="button"
                  onClick={() => void refreshRegisteredWorkers()}
                  disabled={isBusy || isJobBusy || isWorkerAdminBusy}
                >
                  Load registered workers
                </button>
              </div>

              {issuedWorkerToken ? (
                <div className="token-block">
                  <strong>Worker token (shown once — save now):</strong>
                  <div className="code" style={{ marginTop: 6 }}>{issuedWorkerToken}</div>
                  <div className="toolbar" style={{ marginTop: 10, marginBottom: 0 }}>
                    <button
                      type="button"
                      onClick={() => void handleCopyWorkerToken()}
                      disabled={isBusy || isJobBusy || isWorkerAdminBusy}
                    >
                      {tokenCopied ? 'Copied' : 'Copy token'}
                    </button>
                  </div>
                </div>
              ) : null}

              <table style={{ marginTop: 14 }}>
                <thead>
                  <tr>
                    <th>Registered worker</th>
                    <th>Created</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {registeredWorkers.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="empty-cell">
                        No registered workers loaded.
                      </td>
                    </tr>
                  ) : (
                    registeredWorkers.map((worker) => (
                      <tr key={`${worker.workerId}-${worker.createdAt}`}>
                        <td className="code">{worker.workerId}</td>
                        <td>{new Date(worker.createdAt).toLocaleString()}</td>
                        <td>
                          {worker.revokedAt ? (
                            <span className="badge-fail">revoked</span>
                          ) : (
                            <span className="badge-pass">active</span>
                          )}
                        </td>
                        <td>
                          <div className="toolbar" style={{ marginBottom: 0 }}>
                            <button
                              type="button"
                              onClick={() => void handleRotateWorkerToken(worker.workerId)}
                              disabled={isBusy || isJobBusy || isWorkerAdminBusy || Boolean(worker.revokedAt)}
                            >
                              Rotate token
                            </button>
                            <button
                              type="button"
                              className="btn-danger"
                              onClick={() => void handleRevokeWorkerToken(worker.workerId)}
                              disabled={isBusy || isJobBusy || isWorkerAdminBusy || Boolean(worker.revokedAt)}
                            >
                              Revoke
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>
      ) : null}

      {/* ── Step 2: Queue a remote run ─────────────────────────────────── */}
      <div className="section-card">
        <h2>
          <span className="step-number small">3</span>
          Run test
        </h2>
        <p className="section-desc">
          Pick your endpoint and run a quick test.
        </p>

        <div className="queue-panel">
          <p className="cmd-label" style={{ marginTop: 20 }}>
            Single input test (live):
          </p>
          <p className="help-text" style={{ marginTop: 0, marginBottom: 10 }}>
            Type one input and click <strong>Run input test</strong>. The app connects to your MCP,
            discovers tools, sends your input, and shows the raw response.
          </p>

          <div className="form-row" style={{ marginTop: 10 }}>
            <div className="form-field full-width">
              <label htmlFor="single-input-test">Your input</label>
              <input
                id="single-input-test"
                type="text"
                value={singleInputText}
                onChange={(e) => setSingleInputText(e.target.value)}
                placeholder="e.g. summarize today's key incidents"
                disabled={isBusy || isJobBusy || isSingleInputBusy}
              />
            </div>
          </div>

          <div className="toolbar">
            <button
              type="button"
              className="btn-primary"
              onClick={() => void handleRunSingleInputTest()}
              disabled={isBusy || isJobBusy || isSingleInputBusy}
            >
              {isSingleInputBusy ? 'Running input test...' : 'Run input test'}
            </button>
          </div>

          {singleInputResult ? (
            <div className="token-block" style={{ marginTop: 10 }}>
              <strong>Tool used: {singleInputTool || 'unknown'}</strong>
              <div className="code" style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>
                {singleInputResult}
              </div>
            </div>
          ) : null}

          <p className="cmd-label" style={{ marginTop: 20 }}>
            Quick MCP test:
          </p>
          <p className="help-text" style={{ marginTop: 0, marginBottom: 10 }}>
            Pick an endpoint and click <strong>Run quick test</strong>. If no runner is online, your
            test waits in queue until one connects.
          </p>
          <p className="help-text" style={{ marginTop: 0, marginBottom: 10 }}>
            Run quick test performs a real MCP initialize + tool discovery call (live mode), then stores
            the result summary below.
          </p>

          {onlineWorkerCount === 0 ? (
            <p className="help-text" style={{ marginTop: 0, marginBottom: 12 }}>
              No runner online right now. Quick test will run directly from web. To use queue mode, start a runner with:
              {' '}
              <code>npm run run-worker -- --control-plane http://localhost:3000</code>
            </p>
          ) : null}

          <div className="form-row" style={{ marginTop: 10 }}>
            <div className="form-field">
              <label htmlFor="job-endpoint-select">Endpoint</label>
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

          <div className="toolbar">
            <button
              type="button"
              className="btn-primary"
              onClick={() => void handleCreateQuickJob()}
              disabled={isBusy || isJobBusy}
            >
              Run quick test
            </button>
            {showAdvancedControls ? (
              <button
                type="button"
                onClick={() => setShowAdvancedJobOptions((current) => !current)}
                disabled={isBusy || isJobBusy}
              >
                {showAdvancedJobOptions ? 'Hide advanced options' : 'Show advanced options'}
              </button>
            ) : null}
            <button type="button" onClick={() => void refreshJobs()} disabled={isBusy || isJobBusy}>
              Refresh jobs
            </button>
          </div>

          {showAdvancedControls && showAdvancedJobOptions ? (
            <>
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
              <input id="job-pack" type="text" value="general" disabled />
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
                When disabled, a running worker connects to the selected MCP/API endpoint.
              </p>
            </div>
          </div>

          <div className="toolbar">
            <button
              type="button"
              onClick={() => void handleCreateJob()}
              disabled={isBusy || isJobBusy}
            >
              Queue advanced run
            </button>
          </div>
            </>
          ) : null}

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
          <span className="step-number small">4</span>
          Test results
        </h2>
        <p className="section-desc">
          Your completed tests appear here automatically.
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
