import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { 
  GitFork, 
  GitBranch, 
  Plus, 
  Rocket, 
  Server, 
  Box, 
  Trash2, 
  ExternalLink, 
  Loader2,
  Layers,
  Activity,
  History,
  Container,
  Cpu,
  ShieldCheck,
  Terminal,
  X,
  Gauge,
  Radio,
  TrendingUp,
  AlertCircle,
  Database,
  Network,
  LayoutDashboard,
} from 'lucide-react';
import { applicationsApi, environmentsApi, deploymentsApi, monitoringApi } from '../services/api';
import { StatusBadge } from '../components/ui/StatusBadge';
import { CreateEnvironmentModal } from '../components/forms/CreateEnvironmentModal';
import { TriggerDeploymentModal } from '../components/forms/TriggerDeploymentModal';
import type { Environment, ContainerLogEntry } from '../types';

function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return 'N/A';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const appId = id!;

  const [isEnvModalOpen, setIsEnvModalOpen] = useState(false);
  const [deployTargetEnv, setDeployTargetEnv] = useState<Environment | null>(null);
  const [selectedEnvForHistory, setSelectedEnvForHistory] = useState<string | null>(null);
  const [logsModalEnv, setLogsModalEnv] = useState<Environment | null>(null);
  const [endpointSortField, setEndpointSortField] = useState<'requests' | 'errors' | 'latency'>('requests');

  // Fetch application details
  const { 
    data: app, 
    isLoading: appLoading, 
    error: appError 
  } = useQuery({
    queryKey: ['application', appId],
    queryFn: () => applicationsApi.get(appId),
    enabled: !!appId,
  });

  // Fetch environments for this app
  const { 
    data: environments = [], 
    isLoading: envsLoading, 
    refetch: refetchEnvs 
  } = useQuery({
    queryKey: ['environments', appId],
    queryFn: () => environmentsApi.list(appId),
    enabled: !!appId,
  });

  // Active environment selected for history (defaults to first env if available)
  const activeEnvId = selectedEnvForHistory || (environments.length > 0 ? environments[0].id : null);
  const activeEnv = environments.find((e) => e.id === activeEnvId);

  // Fetch live metrics for the active environment
  const { 
    data: metrics, 
    isLoading: metricsLoading 
  } = useQuery({
    queryKey: ['environment-metrics', activeEnvId],
    queryFn: () => (activeEnvId ? environmentsApi.getMetrics(activeEnvId) : Promise.resolve(null)),
    enabled: !!activeEnvId,
    refetchInterval: 5000,
  });

  // Fetch Prometheus server health
  const { data: prometheusHealth } = useQuery({
    queryKey: ['prometheus-health'],
    queryFn: () => monitoringApi.getPrometheusHealth(),
    refetchInterval: 10000,
  });

  // Phase 2.4: Fetch Grafana server health
  const { data: grafanaHealth } = useQuery({
    queryKey: ['grafana-health'],
    queryFn: () => monitoringApi.getGrafanaHealth(),
    refetchInterval: 10000,
  });

  // Phase 2.3: APM Data Queries
  const { data: apmOverview, isLoading: apmLoading } = useQuery({
    queryKey: ['application-apm', appId],
    queryFn: () => applicationsApi.getApm(appId),
    enabled: !!appId && activeEnv?.sreProfile === 'standard',
    refetchInterval: 10000,
  });

  const { data: apmEndpointsData } = useQuery({
    queryKey: ['application-apm-endpoints', appId],
    queryFn: () => applicationsApi.getApmEndpoints(appId),
    enabled: !!appId && activeEnv?.sreProfile === 'standard',
    refetchInterval: 10000,
  });

  const { data: apmDbData } = useQuery({
    queryKey: ['application-apm-db', appId],
    queryFn: () => applicationsApi.getApmDatabase(appId),
    enabled: !!appId && activeEnv?.sreProfile === 'standard',
    refetchInterval: 10000,
  });

  const { data: apmDepsData } = useQuery({
    queryKey: ['application-apm-deps', appId],
    queryFn: () => applicationsApi.getApmDependencies(appId),
    enabled: !!appId && activeEnv?.sreProfile === 'standard',
    refetchInterval: 10000,
  });

  // Fetch deployments for the active environment
  const { 
    data: deployments = [], 
    isLoading: depsLoading,
    refetch: refetchDeps 
  } = useQuery({
    queryKey: ['deployments', activeEnvId],
    queryFn: () => (activeEnvId ? deploymentsApi.list(activeEnvId) : Promise.resolve([])),
    enabled: !!activeEnvId,
    refetchInterval: 5000,
  });

  // Fetch container logs if modal is open
  const { 
    data: containerLogs = [], 
    isLoading: containerLogsLoading,
    refetch: refetchContainerLogs 
  } = useQuery<ContainerLogEntry[]>({
    queryKey: ['container-logs', logsModalEnv?.id],
    queryFn: () => (logsModalEnv ? environmentsApi.getContainerLogs(logsModalEnv.id, 100) : Promise.resolve([])),
    enabled: !!logsModalEnv,
    refetchInterval: 3000,
  });

  const handleDeleteEnv = async (envId: string, envName: string) => {
    if (!window.confirm(`Delete environment "${envName}"? All past deployments in this environment will be deleted.`)) {
      return;
    }

    try {
      await environmentsApi.delete(envId);
      refetchEnvs();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || err.message || 'Failed to delete environment');
    }
  };

  if (appLoading) {
    return (
      <div className="page loading-page">
        <Loader2 size={24} className="spinner" />
        <span>Loading application details...</span>
      </div>
    );
  }

  if (appError || !app) {
    return (
      <div className="page">
        <div className="alert alert-error">Application not found or access denied.</div>
      </div>
    );
  }

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-breadcrumb">
            <Link to="/">Dashboard</Link>
            <span className="page-breadcrumb-sep">/</span>
            <Link to="/applications">Applications</Link>
            <span className="page-breadcrumb-sep">/</span>
            <span>{app.name}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h1>{app.name}</h1>
            {prometheusHealth && (
              <span
                style={{
                  fontSize: '11px',
                  padding: '3px 8px',
                  borderRadius: '12px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontWeight: 500,
                  backgroundColor:
                    prometheusHealth.status === 'connected'
                      ? 'rgba(16, 185, 129, 0.15)'
                      : prometheusHealth.status === 'disabled'
                      ? 'rgba(156, 163, 175, 0.15)'
                      : 'rgba(239, 68, 68, 0.15)',
                  color:
                    prometheusHealth.status === 'connected'
                      ? '#34d399'
                      : prometheusHealth.status === 'disabled'
                      ? '#9ca3af'
                      : '#f87171',
                  border: `1px solid ${
                    prometheusHealth.status === 'connected'
                      ? 'rgba(16, 185, 129, 0.3)'
                      : prometheusHealth.status === 'disabled'
                      ? 'rgba(156, 163, 175, 0.3)'
                      : 'rgba(239, 68, 68, 0.3)'
                  }`,
                }}
              >
                <Radio size={12} />
                Prometheus: {prometheusHealth.status.toUpperCase()}
              </span>
            )}
          </div>
          <p>{app.description || 'Configured Git repository and multi-runtime target deployment environments'}</p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            type="button" 
            className="btn btn-secondary btn-sm"
            onClick={() => setIsEnvModalOpen(true)}
          >
            <Plus size={14} /> New Environment
          </button>
        </div>
      </div>

      {/* Meta Grid */}
      <div className="card mb-4">
        <div className="deployment-detail-grid" style={{ marginBottom: 0 }}>
          <div className="deployment-meta-card">
            <div className="deployment-meta-label">Git Repository</div>
            <div className="deployment-meta-value">
              <a 
                href={app.repositoryUrl} 
                target="_blank" 
                rel="noreferrer" 
                className="td-link"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <GitFork size={14} />
                {app.repositoryOwner}/{app.repositoryName}
                <ExternalLink size={12} />
              </a>
            </div>
          </div>

          <div className="deployment-meta-card">
            <div className="deployment-meta-label">Default Target Branch</div>
            <div className="deployment-meta-value" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <GitBranch size={14} style={{ color: 'var(--amber-text)' }} />
              {app.defaultBranch}
            </div>
          </div>
        </div>
      </div>

      {/* Environments Section */}
      <div className="card mb-4">
        <div className="card-header">
          <div>
            <h2 className="card-title">Configured Deployment Environments</h2>
            <p className="card-subtitle">Target workloads with independent SRE profiles & deployment runtimes</p>
          </div>
          <button 
            type="button" 
            className="btn btn-secondary btn-sm"
            onClick={() => setIsEnvModalOpen(true)}
          >
            <Plus size={14} /> New Environment
          </button>
        </div>

        {envsLoading ? (
          <div className="loading-page" style={{ padding: '24px' }}>
            <Loader2 size={18} className="spinner" />
            <span>Loading environments...</span>
          </div>
        ) : environments.length === 0 ? (
          <div className="empty-state">
            <Server className="empty-state-icon" />
            <div className="empty-state-title">No environments configured</div>
            <p className="empty-state-text">
              Configure a Docker Engine or Kubernetes target to trigger rollouts.
            </p>
            <button 
              type="button" 
              className="btn btn-primary mt-4"
              onClick={() => setIsEnvModalOpen(true)}
            >
              <Plus size={14} /> Configure Environment
            </button>
          </div>
        ) : (
          <div className="env-grid" style={{ marginTop: '0' }}>
            {environments.map((env) => {
              const isDocker = env.provider === 'docker';
              const isStandard = env.sreProfile === 'standard';
              const targetCfg = (env.targetConfig as any) || {};

              return (
                <div 
                  key={env.id} 
                  className={`env-card ${activeEnvId === env.id ? 'active' : ''}`}
                  style={activeEnvId === env.id ? { borderColor: 'var(--amber-text)', boxShadow: '0 0 0 1px var(--amber-text)' } : {}}
                >
                  <div className="env-card-header">
                    <span className="env-card-name">{env.name}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button 
                        type="button" 
                        className="logout-btn"
                        onClick={() => handleDeleteEnv(env.id, env.name)}
                        title="Delete environment"
                        aria-label="Delete environment"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Badges: SRE Profile & Deployment Provider */}
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                    <span 
                      style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontWeight: 500,
                        backgroundColor: isStandard ? 'rgba(139, 92, 246, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                        color: isStandard ? '#a78bfa' : '#fbbf24',
                        border: `1px solid ${isStandard ? 'rgba(139, 92, 246, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
                      }}
                    >
                      {isStandard ? <Cpu size={11} /> : <ShieldCheck size={11} />}
                      {isStandard ? 'Standard SRE' : 'Basic SRE'}
                    </span>

                    <span 
                      style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontWeight: 500,
                        backgroundColor: isDocker ? 'rgba(59, 130, 246, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                        color: isDocker ? '#60a5fa' : '#34d399',
                        border: `1px solid ${isDocker ? 'rgba(59, 130, 246, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
                      }}
                    >
                      {isDocker ? <Container size={11} /> : <Server size={11} />}
                      {isDocker ? 'Docker Engine' : 'Kubernetes'}
                    </span>
                  </div>

                  {/* Target configuration details */}
                  <div className="env-card-meta">
                    {isDocker ? (
                      <>
                        <div className="env-meta-row">
                          <Container size={13} />
                          <span>Container: </span>
                          <span className="text-secondary">{targetCfg.containerName || env.containerName || env.name}</span>
                        </div>
                        {targetCfg.portBindings && targetCfg.portBindings.length > 0 && (
                          <div className="env-meta-row">
                            <Activity size={13} />
                            <span>Port Mapping: </span>
                            <span className="text-secondary">
                              {targetCfg.portBindings.map((pb: any) => `${pb.hostPort}:${pb.containerPort}`).join(', ')}
                            </span>
                          </div>
                        )}
                        <div className="env-meta-row">
                          <Layers size={13} />
                          <span>Network: </span>
                          <span className="text-secondary">{targetCfg.network || 'bridge'}</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="env-meta-row">
                          <Server size={13} />
                          <span>Cluster: </span>
                          <span className="text-secondary">{env.clusterName || targetCfg.clusterName || 'default'}</span>
                        </div>
                        <div className="env-meta-row">
                          <Box size={13} />
                          <span>Namespace: </span>
                          <span className="text-secondary">{env.namespace || targetCfg.namespace || 'default'}</span>
                        </div>
                        <div className="env-meta-row">
                          <Layers size={13} />
                          <span>Deployment: </span>
                          <span className="text-secondary">{env.deploymentName || targetCfg.deploymentName}</span>
                        </div>
                        <div className="env-meta-row">
                          <Activity size={13} />
                          <span>Container: </span>
                          <span className="text-secondary">{env.containerName || targetCfg.containerName}</span>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="env-card-actions">
                    <button 
                      type="button" 
                      className="btn btn-primary btn-sm w-full"
                      onClick={() => setDeployTargetEnv(env)}
                    >
                      <Rocket size={13} /> Trigger Rollout
                    </button>
                    <button 
                      type="button" 
                      className={`btn ${activeEnvId === env.id ? 'btn-secondary' : 'btn-ghost'} btn-sm`}
                      onClick={() => setSelectedEnvForHistory(env.id)}
                      title="Select environment for telemetry and history"
                    >
                      <History size={13} />
                    </button>
                    <button 
                      type="button" 
                      className="btn btn-ghost btn-sm"
                      onClick={() => setLogsModalEnv(env)}
                      title="Live container logs"
                    >
                      <Terminal size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Active Environment Live Telemetry & Health Panel */}
      {activeEnv && (
        <div className="card mb-4">
          <div className="card-header">
            <div>
              <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Gauge size={16} style={{ color: 'var(--amber-text)' }} />
                Live Runtime Telemetry — {activeEnv.name} ({activeEnv.provider === 'docker' ? 'Docker Engine' : 'Kubernetes'})
              </h2>
              <p className="card-subtitle">Real-time health probe, uptime, CPU and memory telemetry</p>
            </div>
            <button 
              type="button" 
              className="btn btn-secondary btn-sm"
              onClick={() => setLogsModalEnv(activeEnv)}
            >
              <Terminal size={13} /> Live Container Logs
            </button>
          </div>

          {metricsLoading ? (
            <div className="loading-page" style={{ padding: '16px' }}>
              <Loader2 size={16} className="spinner" />
              <span>Polling target runtime telemetry...</span>
            </div>
          ) : metrics ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                <div className="deployment-meta-card">
                  <div className="deployment-meta-label">Runtime Status</div>
                  <div 
                    className="deployment-meta-value"
                    style={{
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      color: metrics.status === 'running' ? '#34d399' : metrics.status === 'degraded' ? '#fbbf24' : '#f87171',
                    }}
                  >
                    {metrics.status}
                  </div>
                </div>

                <div className="deployment-meta-card">
                  <div className="deployment-meta-label">Health Probe</div>
                  <div className="deployment-meta-value">
                    {metrics.httpProbe ? (
                      <span style={{ color: metrics.httpProbe.status === 'ok' ? '#34d399' : '#f87171' }}>
                        {metrics.httpProbe.status === 'ok' ? `HTTP 200 (${metrics.httpProbe.latencyMs}ms)` : 'Probe Failed'}
                      </span>
                    ) : metrics.healthStatus !== 'none' ? (
                      <span style={{ textTransform: 'capitalize' }}>{metrics.healthStatus}</span>
                    ) : (
                      <span className="text-secondary">Self-Reported Ready</span>
                    )}
                  </div>
                </div>

                <div className="deployment-meta-card">
                  <div className="deployment-meta-label">Uptime</div>
                  <div className="deployment-meta-value">
                    {metrics.uptimeSeconds > 3600
                      ? `${(metrics.uptimeSeconds / 3600).toFixed(1)} hrs`
                      : metrics.uptimeSeconds > 60
                      ? `${Math.floor(metrics.uptimeSeconds / 60)} min`
                      : `${metrics.uptimeSeconds} sec`}
                  </div>
                </div>

                <div className="deployment-meta-card">
                  <div className="deployment-meta-label">CPU Usage</div>
                  <div className="deployment-meta-value">
                    {metrics.availability?.cpu === 'available' && metrics.cpuPercent !== null ? (
                      <span>{metrics.cpuPercent.toFixed(2)}%</span>
                    ) : (
                      <span className="text-secondary" style={{ fontSize: '12px' }}>
                        {activeEnv.provider === 'kubernetes' ? 'Unavailable (Metrics Server required)' : 'Unavailable'}
                      </span>
                    )}
                  </div>
                </div>

                <div className="deployment-meta-card">
                  <div className="deployment-meta-label">Memory Usage</div>
                  <div className="deployment-meta-value">
                    {metrics.availability?.memory === 'available' && metrics.memoryUsageBytes !== null ? (
                      <span>
                        {formatBytes(metrics.memoryUsageBytes)}
                        {metrics.memoryLimitBytes ? (
                          <span className="text-secondary" style={{ fontSize: '12px' }}>
                            {' '}/ {formatBytes(metrics.memoryLimitBytes)} ({metrics.memoryPercent?.toFixed(1)}%)
                          </span>
                        ) : (
                          <span className="text-secondary" style={{ fontSize: '11px' }}> (No limit)</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-secondary" style={{ fontSize: '12px' }}>
                        {activeEnv.provider === 'kubernetes' ? 'Unavailable (Metrics Server required)' : 'Unavailable'}
                      </span>
                    )}
                  </div>
                </div>

                <div className="deployment-meta-card">
                  <div className="deployment-meta-label">Network (RX / TX)</div>
                  <div className="deployment-meta-value">
                    {metrics.availability?.network === 'available' && metrics.network ? (
                      <span style={{ fontSize: '13px' }}>
                        ↓ {formatBytes(metrics.network.receivedBytes)} / ↑ {formatBytes(metrics.network.transmittedBytes)}
                      </span>
                    ) : (
                      <span className="text-secondary" style={{ fontSize: '12px' }}>Unavailable</span>
                    )}
                  </div>
                </div>

                <div className="deployment-meta-card">
                  <div className="deployment-meta-label">Storage I/O (R / W)</div>
                  <div className="deployment-meta-value">
                    {metrics.availability?.storage === 'available' && metrics.storage ? (
                      <span style={{ fontSize: '13px' }}>
                        R: {formatBytes(metrics.storage.readBytes)} / W: {formatBytes(metrics.storage.writeBytes)}
                      </span>
                    ) : (
                      <span className="text-secondary" style={{ fontSize: '12px' }}>Unavailable</span>
                    )}
                  </div>
                </div>

                <div className="deployment-meta-card">
                  <div className="deployment-meta-label">Restarts</div>
                  <div className="deployment-meta-value">
                    {metrics.restartCount}
                  </div>
                </div>
              </div>

              {/* Kubernetes Workload Replicas & Pods Breakdown */}
              {activeEnv.provider === 'kubernetes' && metrics.kubernetes && (
                <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600 }}>
                      <Layers size={14} style={{ color: '#38bdf8' }} />
                      Kubernetes Workload Status — Replicas & Pods
                    </div>
                    <div style={{ display: 'flex', gap: '8px', fontSize: '12px' }}>
                      <span className="badge badge-info">Desired: {metrics.kubernetes.desiredReplicas}</span>
                      <span className="badge badge-success">Ready: {metrics.kubernetes.readyReplicas}</span>
                      <span className="badge badge-success">Available: {metrics.kubernetes.availableReplicas}</span>
                      {metrics.kubernetes.unavailableReplicas > 0 && (
                        <span className="badge badge-error">Unavailable: {metrics.kubernetes.unavailableReplicas}</span>
                      )}
                    </div>
                  </div>

                  {metrics.message && (
                    <div 
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '6px', 
                        fontSize: '12px', 
                        padding: '8px 12px', 
                        backgroundColor: 'rgba(251, 191, 36, 0.1)', 
                        border: '1px solid rgba(251, 191, 36, 0.25)', 
                        borderRadius: '6px', 
                        color: '#fbbf24',
                        marginBottom: '12px'
                      }}
                    >
                      <AlertCircle size={14} />
                      <span>{metrics.message}</span>
                    </div>
                  )}

                  {metrics.kubernetes.pods.length > 0 && (
                    <div style={{ overflowX: 'auto', border: '1px solid var(--border-subtle)', borderRadius: '6px' }}>
                      <table className="w-full text-left" style={{ fontSize: '12px', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ backgroundColor: 'var(--surface-hover)', borderBottom: '1px solid var(--border-subtle)' }}>
                            <th style={{ padding: '8px 12px' }}>Pod Name</th>
                            <th style={{ padding: '8px 12px' }}>Phase</th>
                            <th style={{ padding: '8px 12px' }}>Ready</th>
                            <th style={{ padding: '8px 12px' }}>Restarts</th>
                            <th style={{ padding: '8px 12px' }}>CPU (Cores)</th>
                            <th style={{ padding: '8px 12px' }}>Memory</th>
                          </tr>
                        </thead>
                        <tbody>
                          {metrics.kubernetes.pods.map((p) => (
                            <tr key={p.podName} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                              <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{p.podName}</td>
                              <td style={{ padding: '8px 12px' }}>
                                <span className={p.phase === 'Running' ? 'text-success' : 'text-warning'}>
                                  {p.phase}
                                </span>
                              </td>
                              <td style={{ padding: '8px 12px' }}>{p.ready ? '✓ True' : '✗ False'}</td>
                              <td style={{ padding: '8px 12px' }}>{p.restartCount}</td>
                              <td style={{ padding: '8px 12px' }}>
                                {p.cpuUsageCores !== null && p.cpuUsageCores !== undefined
                                  ? `${p.cpuUsageCores} cores`
                                  : '—'}
                              </td>
                              <td style={{ padding: '8px 12px' }}>
                                {p.memoryUsageBytes !== null && p.memoryUsageBytes !== undefined
                                  ? formatBytes(p.memoryUsageBytes)
                                  : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Standard SRE APM (Application Performance Monitoring) */}
              {activeEnv.sreProfile === 'standard' ? (
                <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600 }}>
                      <TrendingUp size={14} style={{ color: '#a78bfa' }} />
                      Standard SRE — Application Performance Monitoring (APM)
                    </div>
                    {apmOverview?.collectedAt && (
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        Collected: {new Date(apmOverview.collectedAt).toLocaleTimeString()}
                      </span>
                    )}
                  </div>

                  {apmLoading ? (
                    <div className="loading-page" style={{ padding: '12px' }}>
                      <Loader2 size={14} className="spinner" />
                      <span>Querying APM telemetry from Prometheus...</span>
                    </div>
                  ) : apmOverview?.status === 'available' ? (
                    <>
                      {/* APM Overview KPI Grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                        <div className="deployment-meta-card">
                          <div className="deployment-meta-label">Throughput</div>
                          <div className="deployment-meta-value">
                            {apmOverview.requestRate !== null ? (
                              <span>
                                {apmOverview.requestRate.toFixed(2)} req/s
                                {apmOverview.requestsPerMinute !== null && (
                                  <span className="text-secondary" style={{ fontSize: '11px', display: 'block' }}>
                                    {apmOverview.requestsPerMinute.toFixed(0)} RPM
                                  </span>
                                )}
                              </span>
                            ) : (
                              'N/A'
                            )}
                          </div>
                        </div>

                        <div className="deployment-meta-card">
                          <div className="deployment-meta-label">Error Rate</div>
                          <div className="deployment-meta-value">
                            {apmOverview.errorRate !== null ? (
                              <span style={{ color: apmOverview.errorRate > 5 ? '#f87171' : apmOverview.errorRate > 0 ? '#fbbf24' : '#34d399' }}>
                                {apmOverview.errorRate.toFixed(2)}%
                              </span>
                            ) : (
                              'N/A'
                            )}
                          </div>
                        </div>

                        <div className="deployment-meta-card">
                          <div className="deployment-meta-label">Avg Latency</div>
                          <div className="deployment-meta-value">
                            {apmOverview.averageLatencyMs !== null ? `${apmOverview.averageLatencyMs.toFixed(1)} ms` : 'N/A'}
                          </div>
                        </div>

                        <div className="deployment-meta-card">
                          <div className="deployment-meta-label">P95 Latency</div>
                          <div className="deployment-meta-value">
                            {apmOverview.latencyP95Ms !== null ? `${apmOverview.latencyP95Ms.toFixed(1)} ms` : 'N/A'}
                          </div>
                        </div>

                        <div className="deployment-meta-card">
                          <div className="deployment-meta-label">P99 Latency</div>
                          <div className="deployment-meta-value">
                            {apmOverview.latencyP99Ms !== null ? `${apmOverview.latencyP99Ms.toFixed(1)} ms` : 'N/A'}
                          </div>
                        </div>

                        <div className="deployment-meta-card">
                          <div className="deployment-meta-label">Total Requests</div>
                          <div className="deployment-meta-value">
                            {apmOverview.totalRequests !== null ? apmOverview.totalRequests.toLocaleString() : 'N/A'}
                          </div>
                        </div>
                      </div>

                      {/* Endpoint Performance Table */}
                      {apmEndpointsData && apmEndpointsData.endpoints.length > 0 && (
                        <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600 }}>
                              <Activity size={14} style={{ color: '#38bdf8' }} />
                              Endpoint Performance Breakdown
                            </div>
                            <div style={{ display: 'flex', gap: '6px', fontSize: '11px' }}>
                              <span>Sort by:</span>
                              <button 
                                type="button" 
                                className={`btn btn-xs ${endpointSortField === 'requests' ? 'btn-secondary' : 'btn-ghost'}`}
                                onClick={() => setEndpointSortField('requests')}
                              >
                                Requests
                              </button>
                              <button 
                                type="button" 
                                className={`btn btn-xs ${endpointSortField === 'errors' ? 'btn-secondary' : 'btn-ghost'}`}
                                onClick={() => setEndpointSortField('errors')}
                              >
                                Error Rate
                              </button>
                              <button 
                                type="button" 
                                className={`btn btn-xs ${endpointSortField === 'latency' ? 'btn-secondary' : 'btn-ghost'}`}
                                onClick={() => setEndpointSortField('latency')}
                              >
                                Latency
                              </button>
                            </div>
                          </div>

                          <div style={{ overflowX: 'auto', border: '1px solid var(--border-subtle)', borderRadius: '6px' }}>
                            <table className="w-full text-left" style={{ fontSize: '12px', borderCollapse: 'collapse' }}>
                              <thead>
                                <tr style={{ backgroundColor: 'var(--surface-hover)', borderBottom: '1px solid var(--border-subtle)' }}>
                                  <th style={{ padding: '8px 12px' }}>Method</th>
                                  <th style={{ padding: '8px 12px' }}>Endpoint</th>
                                  <th style={{ padding: '8px 12px' }}>Requests</th>
                                  <th style={{ padding: '8px 12px' }}>Errors</th>
                                  <th style={{ padding: '8px 12px' }}>Error Rate</th>
                                  <th style={{ padding: '8px 12px' }}>Avg Latency</th>
                                  <th style={{ padding: '8px 12px' }}>P95 Latency</th>
                                </tr>
                              </thead>
                              <tbody>
                                {[...apmEndpointsData.endpoints]
                                  .sort((a, b) => {
                                    if (endpointSortField === 'errors') return b.errorRate - a.errorRate;
                                    if (endpointSortField === 'latency') return (b.latencyP95Ms ?? 0) - (a.latencyP95Ms ?? 0);
                                    return b.requestCount - a.requestCount;
                                  })
                                  .map((ep) => (
                                    <tr key={`${ep.method}-${ep.endpoint}`} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                      <td style={{ padding: '8px 12px' }}>
                                        <span className={`badge ${ep.method === 'GET' ? 'badge-info' : ep.method === 'POST' ? 'badge-success' : 'badge-warning'}`}>
                                          {ep.method}
                                        </span>
                                      </td>
                                      <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{ep.endpoint}</td>
                                      <td style={{ padding: '8px 12px' }}>{ep.requestCount.toLocaleString()}</td>
                                      <td style={{ padding: '8px 12px' }}>{ep.errorCount}</td>
                                      <td style={{ padding: '8px 12px' }}>
                                        <span style={{ color: ep.errorRate > 0 ? '#fbbf24' : '#34d399' }}>
                                          {ep.errorRate.toFixed(2)}%
                                        </span>
                                      </td>
                                      <td style={{ padding: '8px 12px' }}>
                                        {ep.avgLatencyMs !== null ? `${ep.avgLatencyMs} ms` : '—'}
                                      </td>
                                      <td style={{ padding: '8px 12px' }}>
                                        {ep.latencyP95Ms !== null ? `${ep.latencyP95Ms} ms` : '—'}
                                      </td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Database & External Dependencies Performance Grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', marginTop: '16px' }}>
                        {/* Database Operations */}
                        <div className="card" style={{ padding: '16px', backgroundColor: 'var(--surface-card)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>
                            <Database size={14} style={{ color: '#fb923c' }} />
                            Database Operations (PostgreSQL)
                          </div>
                          {apmDbData?.status === 'available' ? (
                            <>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '12px' }}>
                                <div>
                                  <div className="deployment-meta-label">Total Queries</div>
                                  <div className="deployment-meta-value">{apmDbData.queryCount?.toLocaleString() ?? 0}</div>
                                </div>
                                <div>
                                  <div className="deployment-meta-label">Avg Execution</div>
                                  <div className="deployment-meta-value">
                                    {apmDbData.averageDurationMs !== null ? `${apmDbData.averageDurationMs} ms` : '—'}
                                  </div>
                                </div>
                                <div>
                                  <div className="deployment-meta-label">Slow Queries (&gt;100ms)</div>
                                  <div className="deployment-meta-value" style={{ color: (apmDbData.slowQueryCount ?? 0) > 0 ? '#fbbf24' : 'inherit' }}>
                                    {apmDbData.slowQueryCount ?? 0}
                                  </div>
                                </div>
                                <div>
                                  <div className="deployment-meta-label">Query Failures</div>
                                  <div className="deployment-meta-value" style={{ color: (apmDbData.queryFailureCount ?? 0) > 0 ? '#f87171' : 'inherit' }}>
                                    {apmDbData.queryFailureCount ?? 0}
                                  </div>
                                </div>
                              </div>
                              {apmDbData.operations.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                  {apmDbData.operations.map((op) => (
                                    <span key={op.operation} className="badge badge-secondary" style={{ fontSize: '11px' }}>
                                      {op.operation}: {op.count}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </>
                          ) : (
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                              No database telemetry recorded yet for this application context.
                            </div>
                          )}
                        </div>

                        {/* External Dependencies */}
                        <div className="card" style={{ padding: '16px', backgroundColor: 'var(--surface-card)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>
                            <Network size={14} style={{ color: '#4ade80' }} />
                            External Dependencies
                          </div>
                          {apmDepsData && apmDepsData.dependencies.length > 0 ? (
                            <div style={{ overflowX: 'auto' }}>
                              <table className="w-full text-left" style={{ fontSize: '12px', borderCollapse: 'collapse' }}>
                                <thead>
                                  <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                    <th style={{ padding: '6px 8px' }}>Service</th>
                                    <th style={{ padding: '6px 8px' }}>Calls</th>
                                    <th style={{ padding: '6px 8px' }}>Avg Latency</th>
                                    <th style={{ padding: '6px 8px' }}>Status</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {apmDepsData.dependencies.map((dep) => (
                                    <tr key={dep.dependency} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                      <td style={{ padding: '6px 8px', fontWeight: 500 }}>{dep.dependency}</td>
                                      <td style={{ padding: '6px 8px' }}>{dep.requestCount}</td>
                                      <td style={{ padding: '6px 8px' }}>
                                        {dep.avgLatencyMs !== null ? `${dep.avgLatencyMs} ms` : '—'}
                                      </td>
                                      <td style={{ padding: '6px 8px' }}>
                                        <span className={`badge ${dep.status === 'healthy' ? 'badge-success' : dep.status === 'degraded' ? 'badge-warning' : 'badge-error'}`} style={{ textTransform: 'capitalize' }}>
                                          {dep.status}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                              No external service dependency calls recorded yet.
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div 
                      style={{ 
                        padding: '16px', 
                        backgroundColor: 'rgba(56, 189, 248, 0.08)', 
                        border: '1px solid rgba(56, 189, 248, 0.2)', 
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '10px'
                      }}
                    >
                      <AlertCircle size={16} style={{ color: '#38bdf8', marginTop: '2px', flexShrink: 0 }} />
                      <div style={{ fontSize: '12px' }}>
                        <div style={{ fontWeight: 600, color: '#38bdf8', marginBottom: '2px' }}>
                          APM Telemetry Unavailable for This Workload
                        </div>
                        <div style={{ color: 'var(--text-secondary)' }}>
                          {apmOverview?.message || 'No APM metrics recorded for this application. Ensure the application exposes Prometheus metrics or includes the x-application-id header on HTTP requests.'}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    <ShieldCheck size={13} style={{ color: '#fbbf24' }} />
                    <span>Basic SRE Profile active: native runtime monitoring only. Advanced APM (throughput, latency, endpoints, DB, and external dependencies) is enabled under the Standard SRE profile.</span>
                  </div>
                </div>
              )}

              {/* Phase 2.4: Grafana Dashboards Section */}
              <div style={{ marginTop: '20px', borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600 }}>
                    <LayoutDashboard size={15} style={{ color: '#f59e0b' }} />
                    Grafana Dashboards
                    <span 
                      style={{
                        fontSize: '10px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontWeight: 600,
                        backgroundColor: grafanaHealth?.connected ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        color: grafanaHealth?.connected ? '#22c55e' : '#ef4444',
                        border: `1px solid ${grafanaHealth?.connected ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                      }}
                    >
                      {grafanaHealth?.connected ? `CONNECTED (v${grafanaHealth.version || '11.1.0'})` : 'UNREACHABLE'}
                    </span>
                  </div>
                  {grafanaHealth?.url && (
                    <a
                      href={grafanaHealth.url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontSize: '11px', color: 'var(--text-accent)', display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}
                    >
                      Open Grafana Server <ExternalLink size={11} />
                    </a>
                  )}
                </div>

                {activeEnv.sreProfile === 'standard' ? (
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                      Contextual production dashboards provisioned automatically for Standard SRE workloads:
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
                      {/* Dashboard 1: Infrastructure Overview */}
                      <a
                        href={grafanaHealth?.dashboards?.infrastructure || 'http://localhost:3000/d/sre-copilot-infra/infrastructure-overview'}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-secondary"
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '10px 12px', gap: '4px', textDecoration: 'none', textAlign: 'left' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                          <span style={{ fontWeight: 600, fontSize: '12px', color: 'var(--text-primary)' }}>Infrastructure Overview</span>
                          <ExternalLink size={12} style={{ color: 'var(--text-muted)' }} />
                        </div>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                          Prometheus TSDB, scrapers & platform node health
                        </span>
                      </a>

                      {/* Dashboard 4: Application APM */}
                      <a
                        href={`${grafanaHealth?.dashboards?.applicationApm || 'http://localhost:3000/d/sre-copilot-apm/application-performance-monitoring'}?var-app_id=${appId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-secondary"
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '10px 12px', gap: '4px', textDecoration: 'none', textAlign: 'left' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                          <span style={{ fontWeight: 600, fontSize: '12px', color: 'var(--text-primary)' }}>Application APM</span>
                          <ExternalLink size={12} style={{ color: 'var(--text-muted)' }} />
                        </div>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                          HTTP Golden Signals, routes, database & external APIs
                        </span>
                      </a>

                      {/* Dashboard 2: Docker Runtime (if Docker) */}
                      {activeEnv.provider === 'docker' && (
                        <a
                          href={`${grafanaHealth?.dashboards?.dockerRuntime || 'http://localhost:3000/d/sre-copilot-docker/docker-runtime'}?var-app_id=${appId}&var-environment_id=${activeEnv.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-secondary"
                          style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '10px 12px', gap: '4px', textDecoration: 'none', textAlign: 'left' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                            <span style={{ fontWeight: 600, fontSize: '12px', color: 'var(--text-primary)' }}>Docker Runtime</span>
                            <ExternalLink size={12} style={{ color: 'var(--text-muted)' }} />
                          </div>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                            Container CPU %, memory limit %, network RX/TX & I/O
                          </span>
                        </a>
                      )}

                      {/* Dashboard 3: Kubernetes Runtime (if Kubernetes) */}
                      {activeEnv.provider === 'kubernetes' && (
                        <a
                          href={`${grafanaHealth?.dashboards?.kubernetesRuntime || 'http://localhost:3000/d/sre-copilot-k8s/kubernetes-runtime'}?var-app_id=${appId}&var-environment_id=${activeEnv.id}&var-namespace=${activeEnv.namespace || 'default'}`}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-secondary"
                          style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '10px 12px', gap: '4px', textDecoration: 'none', textAlign: 'left' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                            <span style={{ fontWeight: 600, fontSize: '12px', color: 'var(--text-primary)' }}>Kubernetes Runtime</span>
                            <ExternalLink size={12} style={{ color: 'var(--text-muted)' }} />
                          </div>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                            Replica state, pod CPU/memory, restarts & phase lifecycle
                          </span>
                        </a>
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    <ShieldCheck size={13} style={{ color: '#fbbf24' }} />
                    <span>Basic SRE Profile active: native runtime monitoring is active without requiring Grafana. Dashboards are pre-configured for environments upgraded to Standard SRE.</span>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div style={{ color: 'var(--text-secondary)', padding: '12px' }}>
              Telemetry unavailable for current target.
            </div>
          )}
        </div>
      )}

      {/* Deployment History for selected environment */}
      {environments.length > 0 && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">
                Deployment History — {environments.find((e) => e.id === activeEnvId)?.name || 'Environment'}
              </h2>
              <p className="card-subtitle">Past releases, status, execution time, and audit log links</p>
            </div>
            {activeEnvId && (
              <button 
                type="button" 
                className="btn btn-primary btn-sm"
                onClick={() => {
                  const currentEnv = environments.find((e) => e.id === activeEnvId);
                  if (currentEnv) setDeployTargetEnv(currentEnv);
                }}
              >
                <Rocket size={13} /> Deploy Now
              </button>
            )}
          </div>

          {depsLoading ? (
            <div className="loading-page" style={{ padding: '32px' }}>
              <Loader2 size={18} className="spinner" />
              <span>Loading deployment records...</span>
            </div>
          ) : deployments.length === 0 ? (
            <div className="empty-state" style={{ padding: '32px' }}>
              <History className="empty-state-icon" />
              <div className="empty-state-title">No deployments recorded</div>
              <p className="empty-state-text">
                Trigger a rollout above to deploy this application to the {environments.find((e) => e.id === activeEnvId)?.name} environment.
              </p>
            </div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Version</th>
                    <th>Commit</th>
                    <th>Status</th>
                    <th>Started</th>
                    <th>Duration</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {deployments.map((dep) => {
                    const started = dep.startedAt ? new Date(dep.startedAt) : null;
                    const finished = dep.finishedAt ? new Date(dep.finishedAt) : null;
                    const durationSec = started && finished 
                      ? Math.round((finished.getTime() - started.getTime()) / 1000) 
                      : null;

                    return (
                      <tr key={dep.id}>
                        <td>
                          <Link to={`/deployments/${dep.id}`} className="td-link font-medium">
                            {dep.version}
                          </Link>
                        </td>
                        <td>
                          <span className="td-mono text-secondary">
                            {dep.commitSha.slice(0, 7)}
                          </span>
                        </td>
                        <td>
                          <StatusBadge status={dep.status} />
                        </td>
                        <td className="text-secondary">
                          {started ? started.toLocaleString() : '—'}
                        </td>
                        <td className="text-secondary">
                          {durationSec !== null ? `${durationSec}s` : dep.status === 'RUNNING' ? 'Running...' : '—'}
                        </td>
                        <td>
                          <Link to={`/deployments/${dep.id}`} className="btn btn-ghost btn-sm">
                            View Logs
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Live Container Logs Modal */}
      {logsModalEnv && (
        <div className="modal-overlay" onClick={() => setLogsModalEnv(null)}>
          <div className="modal" style={{ maxWidth: '800px', width: '90%' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Terminal size={16} />
                  Container Live Logs — {logsModalEnv.name}
                </h2>
                <p className="modal-subtitle">
                  Streaming logs from {logsModalEnv.provider === 'docker' ? 'Docker container' : 'Kubernetes pod'}
                </p>
              </div>
              <button 
                type="button" 
                className="modal-close" 
                onClick={() => setLogsModalEnv(null)} 
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              {containerLogsLoading && containerLogs.length === 0 ? (
                <div className="loading-page" style={{ padding: '24px' }}>
                  <Loader2 size={18} className="spinner" />
                  <span>Fetching runtime logs...</span>
                </div>
              ) : containerLogs.length === 0 ? (
                <div style={{ color: 'var(--text-secondary)', padding: '24px', textAlign: 'center' }}>
                  No container log entries found.
                </div>
              ) : (
                <div 
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                    padding: '12px',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    maxHeight: '400px',
                    overflowY: 'auto',
                    lineHeight: '1.5',
                  }}
                >
                  {containerLogs.map((log, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '10px' }}>
                      <span style={{ color: 'var(--text-muted)', userSelect: 'none' }}>
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                      <span style={{ color: log.stream === 'stderr' ? '#f87171' : 'var(--text-primary)' }}>
                        {log.message}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button 
                type="button" 
                className="btn btn-secondary btn-sm"
                onClick={() => refetchContainerLogs()}
              >
                Refresh
              </button>
              <button 
                type="button" 
                className="btn btn-primary btn-sm"
                onClick={() => setLogsModalEnv(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Trigger Deployment Modal */}
      {deployTargetEnv && (
        <TriggerDeploymentModal
          isOpen={!!deployTargetEnv}
          environment={deployTargetEnv}
          applicationName={app.name}
          onClose={() => setDeployTargetEnv(null)}
          onTriggered={() => {
            refetchDeps();
            setDeployTargetEnv(null);
          }}
        />
      )}

      {/* Create Environment Modal */}
      <CreateEnvironmentModal
        isOpen={isEnvModalOpen}
        applicationId={appId}
        applicationName={app.name}
        onClose={() => setIsEnvModalOpen(false)}
        onCreated={() => {
          refetchEnvs();
          setIsEnvModalOpen(false);
        }}
      />
    </div>
  );
}
