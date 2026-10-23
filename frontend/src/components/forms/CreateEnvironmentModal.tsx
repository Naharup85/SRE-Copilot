import React, { useState } from 'react';
import { X, Plus, AlertCircle, Loader2 } from 'lucide-react';
import { environmentsApi } from '../../services/api';
import type { Environment } from '../../types';

interface CreateEnvironmentModalProps {
  isOpen: boolean;
  applicationId: string;
  applicationName?: string;
  onClose: () => void;
  onCreated: (env: Environment) => void;
}

export function CreateEnvironmentModal({
  isOpen,
  applicationId,
  applicationName,
  onClose,
  onCreated,
}: CreateEnvironmentModalProps) {
  const [name, setName] = useState('production');
  const [clusterName, setClusterName] = useState('k8s-cluster-primary');
  const [namespace, setNamespace] = useState('production');
  const [deploymentName, setDeploymentName] = useState(
    applicationName ? `${applicationName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-deployment` : 'app-deployment'
  );
  const [containerName, setContainerName] = useState(
    applicationName ? applicationName.toLowerCase().replace(/[^a-z0-9]/g, '-') : 'app'
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Environment name is required');
      return;
    }
    if (!clusterName.trim() || !namespace.trim()) {
      setError('Cluster name and namespace are required');
      return;
    }
    if (!deploymentName.trim() || !containerName.trim()) {
      setError('Kubernetes deployment and container names are required');
      return;
    }

    setLoading(true);
    try {
      const newEnv = await environmentsApi.create(applicationId, {
        name: name.trim().toLowerCase(),
        clusterName: clusterName.trim(),
        namespace: namespace.trim().toLowerCase(),
        deploymentName: deploymentName.trim(),
        containerName: containerName.trim(),
      });
      onCreated(newEnv);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || err.message || 'Failed to create environment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Configure Environment</h2>
            <p className="modal-subtitle">Define Kubernetes cluster target & deployment spec</p>
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

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label form-label-required">Environment Name</label>
              <select
                className="form-input"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setNamespace(e.target.value);
                }}
              >
                <option value="production">Production</option>
                <option value="staging">Staging</option>
                <option value="qa">QA</option>
                <option value="development">Development</option>
              </select>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label form-label-required">Kubernetes Cluster</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="production-us-east-1"
                  value={clusterName}
                  onChange={(e) => setClusterName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label form-label-required">K8s Namespace</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="production"
                  value={namespace}
                  onChange={(e) => setNamespace(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label form-label-required">K8s Deployment Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="order-service"
                  value={deploymentName}
                  onChange={(e) => setDeploymentName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label form-label-required">Container Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="order-service"
                  value={containerName}
                  onChange={(e) => setContainerName(e.target.value)}
                  required
                />
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <Loader2 size={14} className="spinner" /> : <Plus size={14} />}
              {loading ? 'Creating...' : 'Create Environment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
