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

export interface EnvironmentMetrics {
  status: 'running' | 'stopped' | 'degraded' | 'unknown';
  uptimeSeconds: number;
  cpuPercent: number;
  memoryUsageBytes: number;
  memoryLimitBytes: number;
  memoryPercent: number;
  restartCount: number;
  healthStatus: 'healthy' | 'unhealthy' | 'starting' | 'none';
  httpProbe?: HttpProbeResult;
  prometheus?: PrometheusEnvironmentMetrics;
  collectedAt: string;
}

export interface MonitoringProvider {
  getMetrics(environment: Environment): Promise<EnvironmentMetrics>;
}
