import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { 
  Rocket, 
  Layers, 
  Plus, 
  RefreshCw,
  GitCommit,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { deploymentsApi, applicationsApi } from '../services/api';
import { StatusBadge } from '../components/ui/StatusBadge';
import { CreateAppModal } from '../components/forms/CreateAppModal';

export function DashboardPage() {
  const [isAppModalOpen, setIsAppModalOpen] = useState(false);

  // Poll dashboard stats every 4s to track running deployments
  const { 
    data: stats, 
    isLoading: statsLoading, 
    isFetching,
    refetch: refetchStats 
  } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: deploymentsApi.getDashboard,
    refetchInterval: 4000,
  });

  const { data: apps = [], refetch: refetchApps } = useQuery({
    queryKey: ['applications'],
    queryFn: applicationsApi.list,
  });

  const handleAppCreated = () => {
    refetchApps();
    refetchStats();
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + 
        ' · ' + d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="page">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-breadcrumb">
            <span>SRE Copilot</span>
            <span className="page-breadcrumb-sep">/</span>
            <span>Deployment Foundation</span>
          </div>
          <h1>Platform Operations</h1>
          <p>Real-time Kubernetes release status, health metrics, and audit logs</p>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button 
            type="button" 
            className="btn btn-secondary btn-sm"
            onClick={() => { refetchStats(); refetchApps(); }}
            title="Refresh metrics"
          >
            <RefreshCw size={13} className={isFetching ? 'spinner' : ''} />
            Refresh
          </button>
          <button 
            type="button" 
            className="btn btn-primary"
            onClick={() => setIsAppModalOpen(true)}
          >
            <Plus size={15} />
            Register Application
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-card-label">Applications</span>
          <div className="stat-card-value">
            {statsLoading ? '-' : stats?.totalApplications ?? 0}
          </div>
          <span className="text-sm text-muted">Configured git repos</span>
        </div>

        <div className="stat-card">
          <span className="stat-card-label">Active Deployments</span>
          <div className="stat-card-value amber">
            {statsLoading ? '-' : stats?.runningDeployments ?? 0}
          </div>
          <span className="text-sm text-muted">Running rollouts</span>
        </div>

        <div className="stat-card">
          <span className="stat-card-label">Successful Rollouts</span>
          <div className="stat-card-value green">
            {statsLoading ? '-' : stats?.successfulDeployments ?? 0}
          </div>
          <span className="text-sm text-muted">Healthy deployments</span>
        </div>

        <div className="stat-card">
          <span className="stat-card-label">Failed Rollouts</span>
          <div className="stat-card-value red">
            {statsLoading ? '-' : stats?.failedDeployments ?? 0}
          </div>
          <span className="text-sm text-muted">Alerted / rolled back</span>
        </div>
      </div>

      {/* Applications Quick Overview */}
      <div className="card mb-4">
        <div className="card-header">
          <div>
            <h2 className="card-title">Managed Applications</h2>
            <p className="card-subtitle">Select an application to view its environments and trigger releases</p>
          </div>
          <Link to="/applications" className="btn btn-ghost btn-sm">
            View All Applications <ChevronRight size={14} />
          </Link>
        </div>

        {apps.length === 0 ? (
          <div className="empty-state">
            <Layers className="empty-state-icon" />
            <div className="empty-state-title">No applications registered</div>
            <p className="empty-state-text">
              Add your first Git repository to configure Kubernetes environments and automated rollouts.
            </p>
            <button 
              type="button" 
              className="btn btn-primary mt-4"
              onClick={() => setIsAppModalOpen(true)}
            >
              <Plus size={14} /> Register Application
            </button>
          </div>
        ) : (
          <div className="env-grid" style={{ marginTop: '0' }}>
            {apps.slice(0, 3).map((app) => (
              <Link 
                key={app.id} 
                to={`/applications/${app.id}`} 
                className="env-card" 
                style={{ textDecoration: 'none' }}
              >
                <div className="env-card-header">
                  <span className="env-card-name">{app.name}</span>
                  <span className="text-mono text-muted text-sm">{app.defaultBranch}</span>
                </div>
                <div className="env-card-meta">
                  <div className="env-meta-row">
                    <span>{app.repositoryOwner}/{app.repositoryName}</span>
                  </div>
                  {app.description && (
                    <div className="text-sm text-muted truncate" style={{ marginTop: '4px' }}>
                      {app.description}
                    </div>
                  )}
                </div>
                <div className="env-card-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="text-sm text-secondary">Environments & Deploys</span>
                  <ChevronRight size={15} style={{ color: 'var(--text-muted)' }} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Recent Deployments Activity */}
      <div className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Recent Rollout Activity</h2>
            <p className="card-subtitle">Live stream of triggered deployments and status changes</p>
          </div>
          <Link to="/deployments" className="btn btn-ghost btn-sm">
            All Deployments <ChevronRight size={14} />
          </Link>
        </div>

        {stats?.recentDeployments && stats.recentDeployments.length > 0 ? (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Application</th>
                  <th>Environment</th>
                  <th>Version</th>
                  <th>Commit</th>
                  <th>Timestamp</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentDeployments.map((dep) => (
                  <tr key={dep.id}>
                    <td>
                      <StatusBadge status={dep.status} />
                    </td>
                    <td>
                      <Link to={`/applications/${dep.applicationId}`} className="td-link">
                        {dep.applicationName || 'Application'}
                      </Link>
                    </td>
                    <td>
                      <span className="badge badge-pending" style={{ textTransform: 'capitalize' }}>
                        {dep.environmentName || 'default'}
                      </span>
                    </td>
                    <td>
                      <span className="td-mono td-primary">{dep.version}</span>
                    </td>
                    <td>
                      <span className="td-mono text-muted">
                        <GitCommit size={12} style={{ display: 'inline', marginRight: '3px' }} />
                        {dep.commitSha.slice(0, 7)}
                      </span>
                    </td>
                    <td>
                      <span className="text-muted text-sm">{formatDate(dep.createdAt)}</span>
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
        ) : (
          <div className="empty-state">
            <Rocket className="empty-state-icon" />
            <div className="empty-state-title">No deployments recorded yet</div>
            <p className="empty-state-text">
              Deployments will show here once you trigger a release from an application's environment.
            </p>
          </div>
        )}
      </div>

      {/* Create Application Modal */}
      <CreateAppModal 
        isOpen={isAppModalOpen}
        onClose={() => setIsAppModalOpen(false)}
        onCreated={handleAppCreated}
      />
    </div>
  );
}
