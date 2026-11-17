// Shared API types for the frontend

export type SreProfile = 'basic' | 'standard';
export type DeploymentProviderType = 'docker' | 'kubernetes';
export type PrometheusHealthStatus = 'connected' | 'disconnected' | 'disabled' | 'unavailable';

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

export interface PrometheusHealth {
  enabled: boolean;
  connected: boolean;
  status: PrometheusHealthStatus;
  lastSuccessfulCheck: string | null;
  error?: string;
}

export interface ApplicationMetrics {
  applicationId: string;
  applicationName: string;
  requestRate: number | null;
  errorRate: number | null;
  latencyP50Ms: number | null;
  latencyP95Ms: number | null;
  latencyP99Ms: number | null;
  totalRequests: number | null;
  totalErrors: number | null;
  status: 'available' | 'partial' | 'unavailable';
  collectedAt: string;
}

export interface ApmOverview {
  applicationId: string;
  applicationName: string;
  requestRate: number | null;
  requestsPerMinute: number | null;
  errorRate: number | null;
  averageLatencyMs: number | null;
  latencyP50Ms: number | null;
  latencyP95Ms: number | null;
  latencyP99Ms: number | null;
  totalRequests: number | null;
  totalErrors: number | null;
  status: 'available' | 'unavailable';
  collectedAt: string;
  message?: string;
}

export interface ApmEndpointMetric {
  endpoint: string;
  method: string;
  requestCount: number;
  errorCount: number;
  errorRate: number;
  avgLatencyMs: number | null;
  latencyP95Ms: number | null;
}

export interface ApmDatabaseMetrics {
  applicationId: string;
  status: 'available' | 'unavailable';
  queryCount: number | null;
  queryRatePerSec: number | null;
  averageDurationMs: number | null;
  slowQueryCount: number | null;
  queryFailureCount: number | null;
  operations: Array<{ operation: string; count: number }>;
  collectedAt: string;
  message?: string;
}

export interface ApmDependencyMetric {
  dependency: string;
  requestCount: number;
  errorCount: number;
  avgLatencyMs: number | null;
  status: 'healthy' | 'degraded' | 'unavailable';
}

export interface HistoricalMetricPoint {
  timestamp: number;
  value: number;
}

export interface HistoricalMetricsSeries {
  metric: string;
  points: HistoricalMetricPoint[];
}

export interface HistoricalMetricsResult {
  environmentId: string;
  start: number;
  end: number;
  step: string;
  series: HistoricalMetricsSeries[];
  status: 'available' | 'empty' | 'unavailable';
  collectedAt: string;
}

export interface MetricAvailability {
  cpu: 'available' | 'unavailable';
  memory: 'available' | 'unavailable';
  network: 'available' | 'unavailable';
  storage: 'available' | 'unavailable';
  metricsServer?: 'available' | 'unavailable' | 'not_applicable';
}

export interface NetworkMetrics {
  receivedBytes: number | null;
  transmittedBytes: number | null;
}

export interface StorageMetrics {
  readBytes: number | null;
  writeBytes: number | null;
}

export interface KubernetesPodMetrics {
  podName: string;
  phase: string;
  ready: boolean;
  restartCount: number;
  startTime?: string;
  cpuUsageCores?: number | null;
  memoryUsageBytes?: number | null;
}

export interface KubernetesWorkloadMetrics {
  desiredReplicas: number;
  availableReplicas: number;
  readyReplicas: number;
  unavailableReplicas: number;
  pods: KubernetesPodMetrics[];
}

export interface EnvironmentMetrics {
  environmentId?: string;
  provider?: DeploymentProviderType;
  status: 'running' | 'stopped' | 'degraded' | 'unknown';
  uptimeSeconds: number;
  cpuPercent: number | null;
  memoryUsageBytes: number | null;
  memoryLimitBytes: number | null;
  memoryPercent: number | null;
  restartCount: number;
  healthStatus: 'healthy' | 'unhealthy' | 'starting' | 'none';
  network?: NetworkMetrics | null;
  storage?: StorageMetrics | null;
  kubernetes?: KubernetesWorkloadMetrics | null;
  availability: MetricAvailability;
  httpProbe?: {
    status: 'ok' | 'failed' | 'skipped';
    statusCode?: number;
    latencyMs?: number;
    message?: string;
  };
  prometheus?: {
    enabled: boolean;
    connected: boolean;
    status: PrometheusHealthStatus;
    metrics?: {
      requestRate: number | null;
      errorRate: number | null;
      latencyP95Ms: number | null;
      totalRequests: number | null;
    } | null;
  };
  collectedAt: string;
  message?: string;
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
