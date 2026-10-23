import React, { useState } from 'react';
import { X, Plus, AlertCircle, Loader2 } from 'lucide-react';
import { applicationsApi } from '../../services/api';
import type { Application } from '../../types';

interface CreateAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (app: Application) => void;
}

export function CreateAppModal({ isOpen, onClose, onCreated }: CreateAppModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [repositoryOwner, setRepositoryOwner] = useState('');
  const [repositoryName, setRepositoryName] = useState('');
  const [defaultBranch, setDefaultBranch] = useState('main');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Auto-fill owner and repo name from GitHub/GitLab URL
  const handleUrlChange = (url: string) => {
    setRepositoryUrl(url);
    try {
      const parsed = new URL(url);
      const parts = parsed.pathname.replace(/^\/|\.git$/g, '').split('/');
      if (parts.length >= 2) {
        if (!repositoryOwner) setRepositoryOwner(parts[0]);
        if (!repositoryName) setRepositoryName(parts[1]);
        if (!name) setName(parts[1]);
      }
    } catch {
      // not a full URL yet
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Application name is required');
      return;
    }
    if (!repositoryUrl.trim()) {
      setError('Repository URL is required');
      return;
    }
    if (!repositoryOwner.trim() || !repositoryName.trim()) {
      setError('Repository owner and name are required');
      return;
    }

    setLoading(true);
    try {
      const newApp = await applicationsApi.create({
        name: name.trim(),
        description: description.trim() || undefined,
        repositoryUrl: repositoryUrl.trim(),
        repositoryOwner: repositoryOwner.trim(),
        repositoryName: repositoryName.trim(),
        defaultBranch: defaultBranch.trim() || 'main',
      });
      onCreated(newApp);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || err.message || 'Failed to create application');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">New Application</h2>
            <p className="modal-subtitle">Connect a Git repository for continuous SRE deployment</p>
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
              <label className="form-label form-label-required">Repository URL</label>
              <input
                type="text"
                className="form-input"
                placeholder="https://github.com/acme/order-service"
                value={repositoryUrl}
                onChange={(e) => handleUrlChange(e.target.value)}
                required
              />
              <span className="form-help">HTTPS or SSH Git clone URL</span>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label form-label-required">Owner / Org</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="acme"
                  value={repositoryOwner}
                  onChange={(e) => setRepositoryOwner(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label form-label-required">Repository Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="order-service"
                  value={repositoryName}
                  onChange={(e) => setRepositoryName(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label form-label-required">App Display Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Order Service"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label form-label-required">Default Branch</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="main"
                  value={defaultBranch}
                  onChange={(e) => setDefaultBranch(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Description (Optional)</label>
              <input
                type="text"
                className="form-input"
                placeholder="Core payment and order checkout backend"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <Loader2 size={14} className="spinner" /> : <Plus size={14} />}
              {loading ? 'Registering...' : 'Register Application'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
