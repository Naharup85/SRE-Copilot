import type { Environment } from '../db/schema';
import type { MonitoringProvider, EnvironmentMetrics } from './monitoring-provider.interface';

export class MockMonitoringProvider implements MonitoringProvider {
  async getMetrics(environment: Environment): Promise<EnvironmentMetrics> {
    return {
      environmentId: environment.id,
      provider: environment.provider as any,
      status: 'running',
      uptimeSeconds: 3600,
      cpuPercent: 1.25,
      memoryUsageBytes: 32 * 1024 * 1024,
      memoryLimitBytes: 512 * 1024 * 1024,
      memoryPercent: 6.25,
      restartCount: 0,
      healthStatus: 'healthy',
      network: {
        receivedBytes: 1024000,
        transmittedBytes: 2048000,
      },
      storage: {
        readBytes: 512000,
        writeBytes: 256000,
      },
      availability: {
        cpu: 'available',
        memory: 'available',
        network: 'available',
        storage: 'available',
        metricsServer: 'not_applicable',
      },
      httpProbe: {
        status: 'ok',
        statusCode: 200,
        latencyMs: 12,
        message: 'Mock health probe OK',
      },
      collectedAt: new Date().toISOString(),
    };
  }
}
