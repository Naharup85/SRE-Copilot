import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { 
  Terminal, 
  Copy, 
  Download, 
  GitCommit, 
  Clock, 
  RefreshCw, 
  Loader2, 
  ArrowLeft
} from 'lucide-react';
import { deploymentsApi } from '../services/api';
import { StatusBadge } from '../components/ui/StatusBadge';
import type { LogLevel } from '../types';

export function DeploymentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const deploymentId = id!;

  const [logFilter, setLogFilter] = useState<LogLevel | 'ALL'>('ALL');
  const [logSearch, setLogSearch] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Fetch deployment details
  const { 
    data: deployment, 
    isLoading: depLoading, 
    refetch: refetchDep 
  } = useQuery({
    queryKey: ['deployment', deploymentId],
    queryFn: () => deploymentsApi.get(deploymentId),
    enabled: !!deploymentId,
    // Poll every 1.5s while active
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data || data.status === 'PENDING' || data.status === 'RUNNING') {
        return 1500;
      }
      return false;
    },
  });

  // Fetch logs
  const { 
    data: logs = [], 
    isLoading: logsLoading, 
    refetch: refetchLogs 
  } = useQuery({
    queryKey: ['deployment-logs', deploymentId],
    queryFn: () => deploymentsApi.getLogs(deploymentId),
    enabled: !!deploymentId,
    refetchInterval: () => {
      // Keep fetching while deployment is active
      if (!deployment || deployment.status === 'PENDING' || deployment.status === 'RUNNING') {
        return 1200;
      }
      return false;
    },
  });

  // Auto scroll to bottom of logs on update if autoScroll is enabled
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleCopyLogs = () => {
    const text = logs
      .map((l) => `[${new Date(l.timestamp).toISOString()}] [${l.level}] ${l.message}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadLogs = () => {
    const text = logs
      .map((l) => `[${new Date(l.timestamp).toISOString()}] [${l.level}] ${l.message}`)
      .join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deployment-${deploymentId.slice(0, 8)}-logs.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredLogs = logs.filter((log) => {
    const matchesLevel = logFilter === 'ALL' || log.level === logFilter;
    const matchesSearch = !logSearch || log.message.toLowerCase().includes(logSearch.toLowerCase());
    return matchesLevel && matchesSearch;
  });

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + 
        ' · ' + d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const calculateDuration = (start: string | null, finish: string | null) => {
    if (!start) return '-';
    const end = finish ? new Date(finish).getTime() : Date.now();
    const diff = Math.round((end - new Date(start).getTime()) / 1000);
    if (diff < 0) return '0s';
    if (diff < 60) return `${diff}s`;
    const mins = Math.floor(diff / 60);
    const secs = diff % 60;
    return `${mins}m ${secs}s`;
  };

  // Determine stage progress from log messages
  const hasStep1 = logs.some((l) => l.message.includes('Deployment started'));
  const hasStep2 = logs.some((l) => l.message.includes('Fetching deployment'));
  const hasStep3 = logs.some((l) => l.message.includes('image to:'));
  const hasStep4 = logs.some((l) => l.message.includes('Applying deployment'));
  const hasStep5 = logs.some((l) => l.message.includes('Rollout completed'));
  const isFailed = deployment?.status === 'FAILED';
  const isSuccess = deployment?.status === 'SUCCESS' || hasStep5;

  if (depLoading) {
    return (
      <div className="page loading-page">
        <Loader2 size={24} className="spinner" />
        <span>Loading deployment rollout...</span>
      </div>
    );
  }

  if (!deployment) {
    return (
      <div className="page">
        <div className="alert alert-error">Deployment not found.</div>
      </div>
    );
  }

  return (
    <div className="page">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-breadcrumb">
            <Link to="/">Dashboard</Link>
            <span className="page-breadcrumb-sep">/</span>
            <Link to="/deployments">Deployments</Link>
            <span className="page-breadcrumb-sep">/</span>
            <span className="text-mono">{deployment.id.slice(0, 8)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h1>Rollout Details</h1>
            <StatusBadge status={deployment.status} />
          </div>
          <p>Execution audit trail, Kubernetes container logs, and rollout status</p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            type="button" 
            className="btn btn-secondary btn-sm"
            onClick={() => { refetchDep(); refetchLogs(); }}
          >
            <RefreshCw size={13} />
            Refresh
          </button>
          <Link 
            to={deployment.applicationId ? `/applications/${deployment.applicationId}` : '/applications'} 
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft size={13} />
            Back to App
          </Link>
        </div>
      </div>

      {/* Deployment Metadata Cards */}
      <div className="deployment-detail-grid">
        <div className="deployment-meta-card">
          <div className="deployment-meta-label">Release Version</div>
          <div className="deployment-meta-value large td-primary">{deployment.version}</div>
        </div>

        <div className="deployment-meta-card">
          <div className="deployment-meta-label">Git Commit SHA</div>
          <div className="deployment-meta-value" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <GitCommit size={14} style={{ color: 'var(--amber-text)' }} />
            {deployment.commitSha}
          </div>
        </div>

        <div className="deployment-meta-card">
          <div className="deployment-meta-label">Target Application & Env</div>
          <div className="deployment-meta-value">
            {deployment.applicationName || 'Application'} ·{' '}
            <span className="badge badge-pending" style={{ textTransform: 'capitalize' }}>
              {deployment.environmentName || 'Environment'}
            </span>
          </div>
        </div>

        <div className="deployment-meta-card">
          <div className="deployment-meta-label">Total Execution Time</div>
          <div className="deployment-meta-value" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Clock size={14} style={{ color: 'var(--text-muted)' }} />
            {calculateDuration(deployment.startedAt, deployment.finishedAt)}
          </div>
          <div className="text-sm text-muted" style={{ marginTop: '4px' }}>
            Started: {formatDate(deployment.startedAt)}
          </div>
        </div>
      </div>

      {/* Deployment Stages Timeline */}
      <div className="card mb-4">
        <div className="card-header">
          <h2 className="card-title">Rollout Progression Stages</h2>
          <span className="text-sm text-muted">Kubernetes deployment pipeline lifecycle</span>
        </div>

        <div className="timeline">
          {/* Step 1 */}
          <div className={`timeline-step ${hasStep1 ? 'done' : ''}`}>
            <div className={`timeline-dot ${hasStep1 ? 'done' : deployment.status === 'PENDING' ? 'active' : 'waiting'}`}>
              {hasStep1 ? '✓' : '1'}
            </div>
            <div className="timeline-content">
              <div className={`timeline-label ${hasStep1 ? 'done' : 'active'}`}>
                Initialization & Validation
              </div>
              <div className="timeline-time">
                {hasStep1 ? 'Verified parameters and container spec' : 'Waiting...'}
              </div>
            </div>
          </div>

          {/* Step 2 */}
          <div className={`timeline-step ${hasStep2 ? 'done' : ''}`}>
            <div className={`timeline-dot ${hasStep2 ? 'done' : hasStep1 ? 'active' : 'waiting'}`}>
              {hasStep2 ? '✓' : '2'}
            </div>
            <div className="timeline-content">
              <div className={`timeline-label ${hasStep2 ? 'done' : hasStep1 ? 'active' : ''}`}>
                Target Workload Resolution
              </div>
              <div className="timeline-time">
                {hasStep2 ? 'Located Kubernetes deployment and namespace target' : 'Pending cluster sync'}
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div className={`timeline-step ${hasStep3 ? 'done' : ''}`}>
            <div className={`timeline-dot ${hasStep3 ? 'done' : hasStep2 ? 'active' : 'waiting'}`}>
              {hasStep3 ? '✓' : '3'}
            </div>
            <div className="timeline-content">
              <div className={`timeline-label ${hasStep3 ? 'done' : hasStep2 ? 'active' : ''}`}>
                Image Tag & Container Patching
              </div>
              <div className="timeline-time">
                {hasStep3 ? `Applied release image tag ${deployment.version}` : 'Pending patch'}
              </div>
            </div>
          </div>

          {/* Step 4 */}
          <div className={`timeline-step ${hasStep4 ? 'done' : ''}`}>
            <div className={`timeline-dot ${hasStep4 ? 'done' : hasStep3 ? 'active' : 'waiting'}`}>
              {hasStep4 ? '✓' : '4'}
            </div>
            <div className="timeline-content">
              <div className={`timeline-label ${hasStep4 ? 'done' : hasStep3 ? 'active' : ''}`}>
                Kubernetes Pod Rollout & Health Check
              </div>
              <div className="timeline-time">
                {hasStep4 ? 'Triggered rolling update across replicas' : 'Pending replica rotation'}
              </div>
            </div>
          </div>

          {/* Step 5 */}
          <div className={`timeline-step ${isSuccess ? 'done' : isFailed ? 'failed' : ''}`}>
            <div className={`timeline-dot ${isSuccess ? 'done' : isFailed ? 'failed' : hasStep4 ? 'active' : 'waiting'}`}>
              {isSuccess ? '✓' : isFailed ? '✕' : '5'}
            </div>
            <div className="timeline-content" style={{ paddingBottom: 0 }}>
              <div className={`timeline-label ${isSuccess ? 'done' : isFailed ? 'failed' : ''}`}>
                {isSuccess ? 'Deployment Succeeded' : isFailed ? 'Deployment Failed' : 'Rollout Completion'}
              </div>
              <div className="timeline-time">
                {isSuccess
                  ? 'All pods healthy and serving production traffic'
                  : isFailed
                  ? 'Rollout failed or terminated with error'
                  : 'Awaiting container readiness probes'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Live Logs Terminal */}
      <div className="card">
        <div className="card-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Terminal size={16} />
              <h2 className="card-title">Deployment Execution Logs</h2>
              {deployment.status === 'RUNNING' && (
                <span className="badge badge-running" style={{ marginLeft: '4px' }}>
                  Streaming Live
                </span>
              )}
            </div>
            <p className="card-subtitle">Real-time STDOUT & STDERR emitted from the deployment orchestrator</p>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Log level filter */}
            <div style={{ display: 'flex', gap: '4px' }}>
              {(['ALL', 'INFO', 'WARN', 'ERROR'] as const).map((level) => (
                <button
                  key={level}
                  type="button"
                  className={`btn btn-sm ${logFilter === level ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setLogFilter(level)}
                >
                  {level}
                </button>
              ))}
            </div>

            {/* Filter search */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input
                type="text"
                className="form-input"
                style={{ padding: '4px 8px', fontSize: '0.75rem', width: '140px' }}
                placeholder="Search logs..."
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
              />
            </div>

            {/* Auto scroll toggle */}
            <button
              type="button"
              className={`btn btn-sm ${autoScroll ? 'btn-secondary' : 'btn-ghost'}`}
              onClick={() => setAutoScroll(!autoScroll)}
              title="Toggle automatic scrolling to latest log line"
            >
              Auto-scroll: {autoScroll ? 'ON' : 'OFF'}
            </button>

            {/* Copy & Download */}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleCopyLogs}
              title="Copy entire log output to clipboard"
            >
              <Copy size={13} />
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleDownloadLogs}
              title="Download logs as text file"
            >
              <Download size={13} />
            </button>
          </div>
        </div>

        {/* Terminal Window */}
        <div className="log-container" ref={logContainerRef}>
          {logsLoading && logs.length === 0 ? (
            <div className="log-empty">
              <Loader2 size={16} className="spinner" style={{ margin: '0 auto 8px' }} />
              Connecting to log stream...
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="log-empty">
              {logSearch || logFilter !== 'ALL'
                ? 'No log entries match your filter.'
                : 'No log output has been emitted yet.'}
            </div>
          ) : (
            filteredLogs.map((log) => {
              const time = new Date(log.timestamp).toLocaleTimeString([], {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              });

              return (
                <div key={log.id} className="log-line">
                  <span className="log-time">{time}</span>
                  <span className={`log-level log-level-${log.level}`}>{log.level}</span>
                  <span className={`log-msg-${log.level}`} style={{ wordBreak: 'break-all' }}>
                    {log.message}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
