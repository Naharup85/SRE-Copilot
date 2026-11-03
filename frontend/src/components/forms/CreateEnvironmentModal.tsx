import React, { useState } from 'react';
import { X, Plus, AlertCircle, Loader2, Container, Cpu, ShieldCheck } from 'lucide-react';
import { environmentsApi } from '../../services/api';
import type { Environment, SreProfile, DeploymentProviderType } from '../../types';

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
  const [sreProfile, setSreProfile] = useState<SreProfile>('basic');
  const [provider, setProvider] = useState<DeploymentProviderType>('docker');

  // Docker-specific fields
  const [dockerContainerName, setDockerContainerName] = useState(
    applicationName ? `${applicationName.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}-web` : 'app-web'
  );
  const [hostPort, setHostPort] = useState(8080);
  const [containerPort, setContainerPort] = useState(80);
  const [network, setNetwork] = useState('bridge');
  const [healthCheckPath, setHealthCheckPath] = useState('/');

  // Kubernetes-specific fields
  const [clusterName, setClusterName] = useState('kind-sre-copilot');
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

    if (provider === 'kubernetes') {
      if (!clusterName.trim() || !namespace.trim()) {
        setError('Cluster name and namespace are required');
        return;
      }
      if (!deploymentName.trim() || !containerName.trim()) {
        setError('Kubernetes deployment and container names are required');
        return;
      }
    } else {
      if (!dockerContainerName.trim()) {
        setError('Docker container name is required');
        return;
      }
    }

    setLoading(true);
    try {
      let payload: Partial<Environment>;

      if (provider === 'docker') {
        payload = {
          name: name.trim().toLowerCase(),
          sreProfile,
          provider: 'docker',
          containerName: dockerContainerName.trim(),
          targetConfig: {
            containerName: dockerContainerName.trim(),
            network: network.trim() || 'bridge',
            portBindings: [
              {
                hostPort: Number(hostPort),
                containerPort: Number(containerPort),
              },
            ],
            healthCheck: healthCheckPath.trim()
              ? {
                  path: healthCheckPath.trim(),
                  port: Number(hostPort),
                }
              : undefined,
          },
        };
      } else {
        payload = {
          name: name.trim().toLowerCase(),
          sreProfile,
          provider: 'kubernetes',
          clusterName: clusterName.trim(),
          namespace: namespace.trim().toLowerCase(),
          deploymentName: deploymentName.trim(),
          containerName: containerName.trim(),
          targetConfig: {
            clusterName: clusterName.trim(),
            namespace: namespace.trim().toLowerCase(),
            deploymentName: deploymentName.trim(),
            containerName: containerName.trim(),
          },
        };
      }

      const newEnv = await environmentsApi.create(applicationId, payload);
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
      <div className="modal" style={{ maxWidth: '580px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Configure Environment</h2>
            <p className="modal-subtitle">Choose SRE profile and container target runtime</p>
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

            {/* SRE Profile Selection (Independent Dimension) */}
            <div className="form-group">
              <label className="form-label form-label-required">SRE Profile</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div
                  onClick={() => setSreProfile('basic')}
                  style={{
                    padding: '12px',
                    borderRadius: '6px',
                    border: `1px solid ${sreProfile === 'basic' ? 'var(--amber-text)' : 'var(--border-subtle)'}`,
                    backgroundColor: sreProfile === 'basic' ? 'rgba(245, 158, 11, 0.08)' : 'var(--bg-surface)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                    <ShieldCheck size={15} style={{ color: 'var(--amber-text)' }} />
                    Basic SRE
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Standard host & container metrics, native health probes, safe rollback.
                  </div>
                </div>

                <div
                  onClick={() => setSreProfile('standard')}
                  style={{
                    padding: '12px',
                    borderRadius: '6px',
                    border: `1px solid ${sreProfile === 'standard' ? 'var(--amber-text)' : 'var(--border-subtle)'}`,
                    backgroundColor: sreProfile === 'standard' ? 'rgba(245, 158, 11, 0.08)' : 'var(--bg-surface)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                    <Cpu size={15} style={{ color: 'var(--amber-text)' }} />
                    Standard SRE
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Production-grade observability, telemetry hooks, incident readiness.
                  </div>
                </div>
              </div>
            </div>

            {/* Deployment Provider Selection (Independent Dimension) */}
            <div className="form-group">
              <label className="form-label form-label-required">Target Deployment Runtime</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div
                  onClick={() => setProvider('docker')}
                  style={{
                    padding: '12px',
                    borderRadius: '6px',
                    border: `1px solid ${provider === 'docker' ? 'var(--text-primary)' : 'var(--border-subtle)'}`,
                    backgroundColor: provider === 'docker' ? 'rgba(255, 255, 255, 0.05)' : 'var(--bg-surface)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                    <Container size={15} />
                    Docker Engine
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Local or remote Docker daemon, container port binding, and health checks.
                  </div>
                </div>

                <div
                  onClick={() => setProvider('kubernetes')}
                  style={{
                    padding: '12px',
                    borderRadius: '6px',
                    border: `1px solid ${provider === 'kubernetes' ? 'var(--text-primary)' : 'var(--border-subtle)'}`,
                    backgroundColor: provider === 'kubernetes' ? 'rgba(255, 255, 255, 0.05)' : 'var(--bg-surface)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                    <Cpu size={15} />
                    Kubernetes
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Kubernetes cluster, namespace, deployment rollout, and replica sets.
                  </div>
                </div>
              </div>
            </div>

            {/* Provider-specific fields */}
            {provider === 'docker' ? (
              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '16px', marginTop: '16px' }}>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label form-label-required">Container Name</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="app-web"
                      value={dockerContainerName}
                      onChange={(e) => setDockerContainerName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Docker Network</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="bridge"
                      value={network}
                      onChange={(e) => setNetwork(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label form-label-required">Host Port</label>
                    <input
                      type="number"
                      className="form-input"
                      placeholder="8080"
                      value={hostPort}
                      onChange={(e) => setHostPort(Number(e.target.value))}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label form-label-required">Container Port</label>
                    <input
                      type="number"
                      className="form-input"
                      placeholder="80"
                      value={containerPort}
                      onChange={(e) => setContainerPort(Number(e.target.value))}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Health Check Path</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="/healthz or /"
                    value={healthCheckPath}
                    onChange={(e) => setHealthCheckPath(e.target.value)}
                  />
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    HTTP GET probe validated during rollout and continuous monitoring
                  </span>
                </div>
              </div>
            ) : (
              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '16px', marginTop: '16px' }}>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label form-label-required">Kubernetes Cluster</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="kind-sre-copilot"
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
            )}
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
