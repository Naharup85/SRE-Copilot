// Shared API types for the frontend

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Application {
  id: string;
  name: string;
  description?: string;
  repositoryUrl: string;
  repositoryOwner: string;
  repositoryName: string;
  defaultBranch: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Environment {
  id: string;
  applicationId: string;
  name: string;
  clusterName: string;
  namespace: string;
  deploymentName: string;
  containerName: string;
  createdAt: string;
  updatedAt: string;
}

export type DeploymentStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export interface Deployment {
  id: string;
  applicationId: string;
  environmentId: string;
  version: string;
  commitSha: string;
  status: DeploymentStatus;
  triggeredBy: string;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  // Joined fields
  applicationName?: string;
  environmentName?: string;
  triggeredByName?: string;
}

export interface DeploymentLog {
  id: string;
  deploymentId: string;
  level: LogLevel;
  message: string;
  timestamp: string;
}

export interface DashboardStats {
  totalApplications: number;
  runningDeployments: number;
  successfulDeployments: number;
  failedDeployments: number;
  recentDeployments: Deployment[];
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: { code: string; message: string };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;
