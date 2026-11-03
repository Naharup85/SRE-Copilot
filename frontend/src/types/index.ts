// Shared API types for the frontend

export type SreProfile = 'basic' | 'standard';
export type DeploymentProviderType = 'docker' | 'kubernetes';

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

export interface DockerTargetConfig {
  containerName?: string;
  network?: string;
  portBindings?: Array<{ hostPort: number; containerPort: number }>;
  secretRefs?: Record<string, string>;
  envVars?: Record<string, string>;
  healthCheck?: {
    path?: string;
    port?: number;
    intervalSeconds?: number;
    timeoutSeconds?: number;
    retries?: number;
  };
}

export interface KubernetesTargetConfig {
  clusterName?: string;
  namespace?: string;
  deploymentName?: string;
  containerName?: string;
}

export interface Environment {
  id: string;
  applicationId: string;
  name: string;
  sreProfile: SreProfile;
  provider: DeploymentProviderType;
  targetConfig?: DockerTargetConfig | KubernetesTargetConfig | Record<string, any>;
  clusterName?: string | null;
  namespace?: string | null;
  deploymentName?: string | null;
  containerName?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EnvironmentMetrics {
  status: 'running' | 'stopped' | 'degraded' | 'unknown';
  uptimeSeconds: number;
  cpuPercent: number;
  memoryUsageBytes: number;
  memoryLimitBytes: number;
  memoryPercent: number;
  restartCount: number;
  healthStatus: 'healthy' | 'unhealthy' | 'starting' | 'none';
  httpProbe?: {
    status: 'ok' | 'failed' | 'skipped';
    statusCode?: number;
    latencyMs?: number;
    message?: string;
  };
  collectedAt: string;
}

export interface ContainerLogEntry {
  timestamp: string;
  stream: 'stdout' | 'stderr';
  message: string;
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
