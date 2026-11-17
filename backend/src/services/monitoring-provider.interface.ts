import type { Environment } from '../db/schema';

export interface HttpProbeResult {
  status: 'ok' | 'failed' | 'skipped';
  statusCode?: number;
  latencyMs?: number;
  message?: string;
}

export interface PrometheusEnvironmentMetrics {
  enabled: boolean;
  connected: boolean;
  status: 'connected' | 'disconnected' | 'disabled' | 'unavailable';
  metrics?: {
    requestRate: number | null;
    errorRate: number | null;
    latencyP95Ms: number | null;
    totalRequests: number | null;
  } | null;
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
  provider?: 'docker' | 'kubernetes';
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
  httpProbe?: HttpProbeResult;
  prometheus?: PrometheusEnvironmentMetrics;
  collectedAt: string;
  message?: string;
}

export interface MonitoringProvider {
  getMetrics(environment: Environment): Promise<EnvironmentMetrics>;
}
