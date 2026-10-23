import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Rocket, AlertCircle, Loader2, GitCommit, Tag } from 'lucide-react';
import { deploymentsApi } from '../../services/api';
import type { Environment, Deployment } from '../../types';

interface TriggerDeploymentModalProps {
  isOpen: boolean;
  environment: Environment | null;
  applicationName?: string;
  onClose: () => void;
  onTriggered?: (deployment: Deployment) => void;
}

export function TriggerDeploymentModal({
  isOpen,
  environment,
  applicationName,
  onClose,
  onTriggered,
}: TriggerDeploymentModalProps) {
  const navigate = useNavigate();
  const [version, setVersion] = useState(`v1.0.${Math.floor(Math.random() * 90 + 10)}`);
  const [commitSha, setCommitSha] = useState(
    Array.from({ length: 7 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !environment) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!version.trim()) {
      setError('Release version is required');
      return;
    }
    if (!commitSha.trim()) {
      setError('Git commit SHA is required');
      return;
    }

    setLoading(true);
    try {
      const deployment = await deploymentsApi.create(environment.id, {
        version: version.trim(),
        commitSha: commitSha.trim(),
      });
      if (onTriggered) onTriggered(deployment);
      onClose();
      // Navigate to the deployment detail/logs page
      navigate(`/deployments/${deployment.id}`);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || err.message || 'Failed to trigger deployment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Trigger Deployment</h2>
            <p className="modal-subtitle">
              Deploy {applicationName ? <strong>{applicationName}</strong> : 'application'} to{' '}
              <span className="badge badge-pending" style={{ textTransform: 'capitalize' }}>
                {environment.name}
              </span>
            </p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="alert alert-error mb-4">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="card mb-4" style={{ padding: '12px 14px', background: 'var(--bg-elevated)' }}>
          <div className="modal-detail-row">
            <span className="modal-detail-label">Cluster</span>
            <span className="modal-detail-value text-mono">{environment.clusterName}</span>
          </div>
          <div className="modal-detail-row">
            <span className="modal-detail-label">Namespace</span>
            <span className="modal-detail-value text-mono">{environment.namespace}</span>
          </div>
          <div className="modal-detail-row">
            <span className="modal-detail-label">Deployment</span>
            <span className="modal-detail-value text-mono">{environment.deploymentName}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label form-label-required">
                <Tag size={12} style={{ display: 'inline', marginRight: '4px' }} />
                Target Release Version / Image Tag
              </label>
              <input
                type="text"
                className="form-input text-mono"
                placeholder="v1.2.0"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                required
              />
              <span className="form-help">Docker image tag or semantic version to roll out</span>
            </div>

            <div className="form-group">
              <label className="form-label form-label-required">
                <GitCommit size={12} style={{ display: 'inline', marginRight: '4px' }} />
                Git Commit SHA
              </label>
              <input
                type="text"
                className="form-input text-mono"
                placeholder="4a9f1b2"
                value={commitSha}
                onChange={(e) => setCommitSha(e.target.value)}
                required
              />
              <span className="form-help">7 to 40 characters Git commit hash</span>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <Loader2 size={14} className="spinner" /> : <Rocket size={14} />}
              {loading ? 'Initiating Rollout...' : 'Deploy to Environment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
