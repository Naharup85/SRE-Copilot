import apiClient from '../lib/axios';
import type {
  AuthResponse,
  Application,
  Environment,
  Deployment,
  DeploymentLog,
  DashboardStats,
  EnvironmentMetrics,
  ContainerLogEntry,
} from '../types';

// ─── Auth ─────────────────────────────────────────────────
export const authApi = {
  register: async (data: { email: string; password: string; name: string }): Promise<AuthResponse> => {
    const res = await apiClient.post('/auth/register', data);
    return res.data.data;
  },

  login: async (data: { email: string; password: string }): Promise<AuthResponse> => {
    const res = await apiClient.post('/auth/login', data);
    return res.data.data;
  },

  me: async (): Promise<AuthResponse['user']> => {
    const res = await apiClient.get('/auth/me');
    return res.data.data;
  },
};

// ─── Applications ──────────────────────────────────────────
export const applicationsApi = {
  list: async (): Promise<Application[]> => {
    const res = await apiClient.get('/applications');
    return res.data.data;
  },

  get: async (id: string): Promise<Application> => {
    const res = await apiClient.get(`/applications/${id}`);
    return res.data.data;
  },

  create: async (data: Partial<Application>): Promise<Application> => {
    const res = await apiClient.post('/applications', data);
    return res.data.data;
  },

  update: async (id: string, data: Partial<Application>): Promise<Application> => {
    const res = await apiClient.patch(`/applications/${id}`, data);
    return res.data.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/applications/${id}`);
  },
};

// ─── Environments ──────────────────────────────────────────
export const environmentsApi = {
  list: async (applicationId: string): Promise<Environment[]> => {
    const res = await apiClient.get(`/applications/${applicationId}/environments`);
    return res.data.data;
  },

  get: async (id: string): Promise<Environment> => {
    const res = await apiClient.get(`/environments/${id}`);
    return res.data.data;
  },

  create: async (applicationId: string, data: Partial<Environment>): Promise<Environment> => {
    const res = await apiClient.post(`/applications/${applicationId}/environments`, data);
    return res.data.data;
  },

  update: async (id: string, data: Partial<Environment>): Promise<Environment> => {
    const res = await apiClient.patch(`/environments/${id}`, data);
    return res.data.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/environments/${id}`);
  },

  getMetrics: async (id: string): Promise<EnvironmentMetrics> => {
    const res = await apiClient.get(`/environments/${id}/metrics`);
    return res.data.data;
  },

  getContainerLogs: async (id: string, lines = 100): Promise<ContainerLogEntry[]> => {
    const res = await apiClient.get(`/environments/${id}/container-logs?lines=${lines}`);
    return res.data.data;
  },
};

// ─── Deployments ───────────────────────────────────────────
export const deploymentsApi = {
  listAll: async (): Promise<Deployment[]> => {
    const res = await apiClient.get('/deployments');
    return res.data.data;
  },

  list: async (environmentId: string): Promise<Deployment[]> => {
    const res = await apiClient.get(`/environments/${environmentId}/deployments`);
    return res.data.data;
  },

  get: async (id: string): Promise<Deployment> => {
    const res = await apiClient.get(`/deployments/${id}`);
    return res.data.data;
  },

  create: async (environmentId: string, data: { version: string; commitSha: string }): Promise<Deployment> => {
    const res = await apiClient.post(`/environments/${environmentId}/deployments`, data);
    return res.data.data;
  },

  getLogs: async (id: string): Promise<DeploymentLog[]> => {
    const res = await apiClient.get(`/deployments/${id}/logs`);
    return res.data.data;
  },

  getDashboard: async (): Promise<DashboardStats> => {
    const res = await apiClient.get('/deployments/dashboard');
    return res.data.data;
  },
};
