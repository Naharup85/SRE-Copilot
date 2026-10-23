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
  History
} from 'lucide-react';
import { applicationsApi, environmentsApi, deploymentsApi } from '../services/api';
import { StatusBadge } from '../components/ui/StatusBadge';
import { CreateEnvironmentModal } from '../components/forms/CreateEnvironmentModal';
import { TriggerDeploymentModal } from '../components/forms/TriggerDeploymentModal';
import type { Environment } from '../types';

export function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const appId = id!;

  const [isEnvModalOpen, setIsEnvModalOpen] = useState(false);
  const [deployTargetEnv, setDeployTargetEnv] = useState<Environment | null>(null);
  const [selectedEnvForHistory, setSelectedEnvForHistory] = useState<string | null>(null);

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

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + 
        ' · ' + d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr;
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
        <div className="alert alert-error">
          Application not found or you do not have permission to access it.
        </div>
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
          <h1>{app.name}</h1>
          <p>{app.description || 'Configured Git repository for continuous Kubernetes deployment'}</p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            type="button" 
            className="btn btn-primary"
            onClick={() => setIsEnvModalOpen(true)}
          >
            <Plus size={15} />
            Add Environment
          </button>
        </div>
      </div>

      {/* App Git Info Card */}
      <div className="card mb-4">
        <div className="card-header">
          <h2 className="card-title">Repository & Git Source</h2>
        </div>
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
            <h2 className="card-title">Configured Kubernetes Environments</h2>
            <p className="card-subtitle">Clusters, namespaces, and target deployment workloads</p>
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
              Configure a Kubernetes target (e.g., Staging, Production) to trigger releases.
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
            {environments.map((env) => (
              <div 
                key={env.id} 
                className={`env-card ${activeEnvId === env.id ? 'active' : ''}`}
                style={activeEnvId === env.id ? { borderColor: 'var(--text-primary)' } : {}}
              >
                <div className="env-card-header">
                  <span className="env-card-name">{env.name}</span>
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

                <div className="env-card-meta">
                  <div className="env-meta-row">
                    <Server size={13} />
                    <span>Cluster: </span>
                    <span className="text-secondary">{env.clusterName}</span>
                  </div>
                  <div className="env-meta-row">
                    <Box size={13} />
                    <span>Namespace: </span>
                    <span className="text-secondary">{env.namespace}</span>
                  </div>
                  <div className="env-meta-row">
                    <Layers size={13} />
                    <span>Deployment: </span>
                    <span className="text-secondary">{env.deploymentName}</span>
                  </div>
                  <div className="env-meta-row">
                    <Activity size={13} />
                    <span>Container: </span>
                    <span className="text-secondary">{env.containerName}</span>
                  </div>
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
                    title="View deployment history for this environment"
                  >
                    <History size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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
              <Loader2 size={20} className="spinner" />
              <span>Fetching deployment history...</span>
            </div>
          ) : deployments.length === 0 ? (
            <div className="empty-state">
              <Rocket className="empty-state-icon" />
              <div className="empty-state-title">No deployments in this environment</div>
              <p className="empty-state-text">
                Trigger your first deployment to build manifests and roll out to Kubernetes.
              </p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Release Version</th>
                    <th>Commit SHA</th>
                    <th>Started</th>
                    <th>Completed</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {deployments.map((dep) => (
                    <tr key={dep.id}>
                      <td>
                        <StatusBadge status={dep.status} />
                      </td>
                      <td>
                        <span className="td-mono td-primary">{dep.version}</span>
                      </td>
                      <td>
                        <span className="td-mono text-muted">{dep.commitSha.slice(0, 7)}</span>
                      </td>
                      <td>
                        <span className="text-sm text-muted">
                          {dep.startedAt ? formatDate(dep.startedAt) : 'Pending'}
                        </span>
                      </td>
                      <td>
                        <span className="text-sm text-muted">
                          {dep.finishedAt ? formatDate(dep.finishedAt) : dep.status === 'RUNNING' ? 'In Progress...' : '-'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Link 
                          to={`/deployments/${dep.id}`} 
                          className="btn btn-secondary btn-sm"
                        >
                          <ExternalLink size={12} />
                          View Logs
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <CreateEnvironmentModal 
        isOpen={isEnvModalOpen}
        applicationId={appId}
        applicationName={app.name}
        onClose={() => setIsEnvModalOpen(false)}
        onCreated={() => refetchEnvs()}
      />

      <TriggerDeploymentModal 
        isOpen={!!deployTargetEnv}
        environment={deployTargetEnv}
        applicationName={app.name}
        onClose={() => setDeployTargetEnv(null)}
        onTriggered={() => refetchDeps()}
      />
    </div>
  );
}
