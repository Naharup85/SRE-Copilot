import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { 
  Layers, 
  Plus, 
  Search, 
  GitBranch, 
  GitFork, 
  Trash2, 
  Loader2,
  Calendar
} from 'lucide-react';
import { applicationsApi } from '../services/api';
import { CreateAppModal } from '../components/forms/CreateAppModal';

export function ApplicationsPage() {
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: apps = [], isLoading, refetch } = useQuery({
    queryKey: ['applications'],
    queryFn: applicationsApi.list,
  });

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"? This removes all associated environments and deployments.`)) {
      return;
    }

    setDeletingId(id);
    try {
      await applicationsApi.delete(id);
      refetch();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || err.message || 'Failed to delete application');
    } finally {
      setDeletingId(null);
    }
  };

  const filteredApps = apps.filter((app) => {
    const q = search.toLowerCase();
    return (
      app.name.toLowerCase().includes(q) ||
      app.repositoryOwner.toLowerCase().includes(q) ||
      app.repositoryName.toLowerCase().includes(q) ||
      (app.description && app.description.toLowerCase().includes(q))
    );
  });

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString([], {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-breadcrumb">
            <Link to="/">Dashboard</Link>
            <span className="page-breadcrumb-sep">/</span>
            <span>Applications</span>
          </div>
          <h1>Managed Applications</h1>
          <p>Git-backed services and microservices registered for SRE deployment pipelines</p>
        </div>

        <button 
          type="button" 
          className="btn btn-primary"
          onClick={() => setIsModalOpen(true)}
        >
          <Plus size={15} />
          Register Application
        </button>
      </div>

      {/* Search Bar */}
      <div className="card mb-4" style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Search size={16} style={{ color: 'var(--text-muted)' }} />
          <input 
            type="text" 
            className="form-input" 
            style={{ border: 'none', background: 'transparent', padding: '4px 0' }}
            placeholder="Search by name, repo owner, or repository..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Applications List */}
      {isLoading ? (
        <div className="loading-page">
          <Loader2 size={24} className="spinner" />
          <span>Loading applications...</span>
        </div>
      ) : filteredApps.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <Layers className="empty-state-icon" />
            <div className="empty-state-title">
              {search ? 'No applications match your search' : 'No applications registered yet'}
            </div>
            <p className="empty-state-text">
              {search
                ? 'Try a different search keyword.'
                : 'Connect your first GitHub or GitLab repository to start deploying.'}
            </p>
            {!search && (
              <button 
                type="button" 
                className="btn btn-primary mt-4"
                onClick={() => setIsModalOpen(true)}
              >
                <Plus size={14} /> Register Application
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Application</th>
                <th>Git Repository</th>
                <th>Default Branch</th>
                <th>Created</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredApps.map((app) => (
                <tr key={app.id}>
                  <td>
                    <div>
                      <Link to={`/applications/${app.id}`} className="td-link td-primary">
                        {app.name}
                      </Link>
                      {app.description && (
                        <div className="text-sm text-muted truncate" style={{ maxWidth: '320px', marginTop: '2px' }}>
                          {app.description}
                        </div>
                      )}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <GitFork size={13} style={{ color: 'var(--text-muted)' }} />
                      <a 
                        href={app.repositoryUrl} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="td-mono td-link"
                        style={{ fontSize: '0.8rem' }}
                      >
                        {app.repositoryOwner}/{app.repositoryName}
                      </a>
                    </div>
                  </td>
                  <td>
                    <span className="td-mono text-muted text-sm" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <GitBranch size={13} />
                      {app.defaultBranch}
                    </span>
                  </td>
                  <td>
                    <span className="text-muted text-sm" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Calendar size={13} />
                      {formatDate(app.createdAt)}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                      <Link 
                        to={`/applications/${app.id}`} 
                        className="btn btn-secondary btn-sm"
                      >
                        Environments
                      </Link>
                      <button 
                        type="button" 
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(app.id, app.name)}
                        disabled={deletingId === app.id}
                        title="Delete application"
                        aria-label="Delete application"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      <CreateAppModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreated={() => refetch()}
      />
    </div>
  );
}
