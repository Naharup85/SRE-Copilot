import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { 
  Rocket, 
  Search, 
  RefreshCw, 
  ExternalLink, 
  GitCommit, 
  Loader2
} from 'lucide-react';
import { deploymentsApi } from '../services/api';
import { StatusBadge } from '../components/ui/StatusBadge';
import type { DeploymentStatus } from '../types';

export function DeploymentsPage() {
  const [statusFilter, setStatusFilter] = useState<DeploymentStatus | 'ALL'>('ALL');
  const [search, setSearch] = useState('');

  const { 
    data: deployments = [], 
    isLoading, 
    isFetching,
    refetch 
  } = useQuery({
    queryKey: ['all-deployments'],
    queryFn: deploymentsApi.listAll,
    refetchInterval: 4000,
  });

  const filteredDeployments = deployments.filter((d) => {
    const matchesStatus = statusFilter === 'ALL' || d.status === statusFilter;
    const q = search.toLowerCase();
    const matchesSearch =
      (d.applicationName && d.applicationName.toLowerCase().includes(q)) ||
      (d.environmentName && d.environmentName.toLowerCase().includes(q)) ||
      d.version.toLowerCase().includes(q) ||
      d.commitSha.toLowerCase().includes(q);

    return matchesStatus && matchesSearch;
  });

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + 
        ' · ' + d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const calculateDuration = (start: string | null, finish: string | null) => {
    if (!start || !finish) return null;
    const diff = Math.round((new Date(finish).getTime() - new Date(start).getTime()) / 1000);
    if (diff < 60) return `${diff}s`;
    const mins = Math.floor(diff / 60);
    const secs = diff % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-breadcrumb">
            <Link to="/">Dashboard</Link>
            <span className="page-breadcrumb-sep">/</span>
            <span>Deployments</span>
          </div>
          <h1>Deployment Audit & Activity</h1>
          <p>Global history of release rollouts, execution states, and audit trails</p>
        </div>

        <button 
          type="button" 
          className="btn btn-secondary btn-sm"
          onClick={() => refetch()}
          title="Refresh rollouts"
        >
          <RefreshCw size={13} className={isFetching ? 'spinner' : ''} />
          Refresh
        </button>
      </div>

      {/* Filters & Search */}
      <div className="card mb-4" style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Status Tabs */}
          <div style={{ display: 'flex', gap: '6px' }}>
            {(['ALL', 'RUNNING', 'SUCCESS', 'FAILED', 'PENDING'] as const).map((status) => (
              <button
                key={status}
                type="button"
                className={`btn btn-sm ${statusFilter === status ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setStatusFilter(status)}
              >
                {status === 'ALL' ? 'All Deployments' : status}
              </button>
            ))}
          </div>

          {/* Search box */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '260px' }}>
            <Search size={15} style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="form-input"
              style={{ padding: '6px 10px', fontSize: '0.8rem' }}
              placeholder="Filter by app, env, version, commit..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Deployments Table */}
      {isLoading ? (
        <div className="loading-page">
          <Loader2 size={24} className="spinner" />
          <span>Fetching deployment records...</span>
        </div>
      ) : filteredDeployments.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <Rocket className="empty-state-icon" />
            <div className="empty-state-title">
              {statusFilter !== 'ALL' || search ? 'No deployments match your criteria' : 'No deployments initiated yet'}
            </div>
            <p className="empty-state-text">
              {search || statusFilter !== 'ALL'
                ? 'Try clearing the search or switching filters.'
                : 'Select an application and trigger a release to see live rollouts.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Application</th>
                <th>Target Environment</th>
                <th>Release Version</th>
                <th>Commit SHA</th>
                <th>Duration</th>
                <th>Initiated</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDeployments.map((dep) => {
                const duration = calculateDuration(dep.startedAt, dep.finishedAt);
                return (
                  <tr key={dep.id}>
                    <td>
                      <StatusBadge status={dep.status} />
                    </td>
                    <td>
                      <Link to={`/applications/${dep.applicationId}`} className="td-link td-primary">
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
                      <span className="text-mono text-sm text-secondary">
                        {duration || (dep.status === 'RUNNING' ? 'Running...' : '-')}
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
