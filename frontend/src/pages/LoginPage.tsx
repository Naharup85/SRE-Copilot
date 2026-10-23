import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Terminal, AlertCircle, Loader2, ArrowRight } from 'lucide-react';
import { authApi } from '../services/api';
import { useAuth } from '../hooks/useAuth';

export function LoginPage() {
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleFillDemo = () => {
    setEmail('sre.admin@company.com');
    setPassword('SreAdmin2026!');
    setName('Staff SRE');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      let res;
      if (isRegister) {
        if (!name.trim()) {
          setError('Name is required');
          setLoading(false);
          return;
        }
        res = await authApi.register({
          name: name.trim(),
          email: email.trim(),
          password,
        });
      } else {
        res = await authApi.login({
          email: email.trim(),
          password,
        });
      }

      login(res.token, res.user);
      navigate('/');
    } catch (err: any) {
      const msg =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        err.message ||
        'Authentication failed. Please check your credentials.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-layout">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-icon">
            <Terminal size={20} />
          </div>
          <div className="auth-logo-text">SRE Copilot</div>
        </div>

        <h1 className="auth-heading">{isRegister ? 'Create an account' : 'Welcome back'}</h1>
        <p className="auth-subheading">
          {isRegister
            ? 'Set up your SRE workspace to orchestrate Kubernetes deployments'
            : 'Sign in to monitor applications and execute deployments'}
        </p>

        {error && (
          <div className="alert alert-error mb-4">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          {isRegister && (
            <div className="form-group">
              <label className="form-label form-label-required">Full Name</label>
              <input
                type="text"
                className="form-input"
                placeholder="Jane Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label form-label-required">Work Email</label>
            <input
              type="email"
              className="form-input"
              placeholder="engineer@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label form-label-required">Password</label>
            <input
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {isRegister && (
              <span className="form-help">Minimum 8 characters with at least 1 uppercase and 1 number</span>
            )}
          </div>

          <button type="submit" className="btn btn-primary w-full mt-2" disabled={loading}>
            {loading ? <Loader2 size={15} className="spinner" /> : <ArrowRight size={15} />}
            {loading ? 'Authenticating...' : isRegister ? 'Create SRE Account' : 'Sign In'}
          </button>
        </form>

        <div className="auth-divider" />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button
            type="button"
            className="btn btn-secondary w-full btn-sm"
            onClick={handleFillDemo}
          >
            Fill Demo Credentials
          </button>

          <p className="auth-link-text">
            {isRegister ? 'Already have an account? ' : "Don't have an account? "}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setIsRegister(!isRegister);
                setError(null);
              }}
            >
              {isRegister ? 'Sign in' : 'Register'}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
