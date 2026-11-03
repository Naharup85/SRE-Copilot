import Docker from 'dockerode';
import http from 'http';
import type { Environment } from '../db/schema';
import type {
  MonitoringProvider,
  EnvironmentMetrics,
  HttpProbeResult,
} from './monitoring-provider.interface';
import { logger } from '../config/logger';

export class DockerMonitoringProvider implements MonitoringProvider {
  private readonly docker: Docker;

  constructor(options?: Docker.DockerOptions) {
    this.docker = new Docker(
      options || {
        socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock',
      },
    );
  }

  async getMetrics(environment: Environment): Promise<EnvironmentMetrics> {
    const cfg = (environment.targetConfig as any) || {};
    const containerName =
      cfg.containerName ||
      environment.containerName ||
      environment.name;

    const collectedAt = new Date().toISOString();

    try {
      const container = this.docker.getContainer(containerName);
      const inspect = await container.inspect().catch(() => null);

      if (!inspect) {
        return {
          status: 'stopped',
          uptimeSeconds: 0,
          cpuPercent: 0,
          memoryUsageBytes: 0,
          memoryLimitBytes: 0,
          memoryPercent: 0,
          restartCount: 0,
          healthStatus: 'none',
          collectedAt,
        };
      }

      const isRunning = inspect.State?.Running ?? false;
      const startedAt = inspect.State?.StartedAt ? new Date(inspect.State.StartedAt).getTime() : 0;
      const uptimeSeconds =
        isRunning && startedAt > 0 ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0;
      const restartCount = inspect.RestartCount || 0;

      let healthStatus: 'healthy' | 'unhealthy' | 'starting' | 'none' = 'none';
      if (inspect.State?.Health) {
        const rawHealth = inspect.State.Health.Status;
        if (rawHealth === 'healthy' || rawHealth === 'unhealthy' || rawHealth === 'starting') {
          healthStatus = rawHealth;
        }
      }

      let cpuPercent = 0;
      let memoryUsageBytes = 0;
      let memoryLimitBytes = 0;
      let memoryPercent = 0;

      if (isRunning) {
        try {
          const stats = await container.stats({ stream: false });
          const cpuDelta =
            (stats.cpu_stats?.cpu_usage?.total_usage || 0) -
            (stats.precpu_stats?.cpu_usage?.total_usage || 0);
          const systemDelta =
            (stats.cpu_stats?.system_cpu_usage || 0) - (stats.precpu_stats?.system_cpu_usage || 0);
          const onlineCpus =
            stats.cpu_stats?.online_cpus ||
            stats.cpu_stats?.cpu_usage?.percpu_usage?.length ||
            1;

          if (systemDelta > 0 && cpuDelta > 0) {
            cpuPercent = Number(((cpuDelta / systemDelta) * onlineCpus * 100).toFixed(2));
          }

          memoryUsageBytes = stats.memory_stats?.usage || 0;
          memoryLimitBytes = stats.memory_stats?.limit || 0;
          if (memoryLimitBytes > 0) {
            memoryPercent = Number(((memoryUsageBytes / memoryLimitBytes) * 100).toFixed(2));
          }
        } catch (statsErr: any) {
          logger.warn({ containerName, error: statsErr.message }, 'Could not fetch container stats');
        }
      }

      let httpProbe: HttpProbeResult | undefined;
      const probePath = cfg.healthCheck?.path;
      const probePort = cfg.healthCheck?.port || cfg.portBindings?.[0]?.hostPort;

      if (probePath && probePort) {
        httpProbe = await this.performHttpProbe('127.0.0.1', probePort, probePath);
      }

      let status: 'running' | 'stopped' | 'degraded' | 'unknown' = 'stopped';
      if (isRunning) {
        if (healthStatus === 'unhealthy' || (httpProbe && httpProbe.status === 'failed')) {
          status = 'degraded';
        } else {
          status = 'running';
        }
      }

      return {
        status,
        uptimeSeconds,
        cpuPercent,
        memoryUsageBytes,
        memoryLimitBytes,
        memoryPercent,
        restartCount,
        healthStatus,
        httpProbe,
        collectedAt,
      };
    } catch (error: any) {
      logger.error(
        { containerName, error: error.message },
        'DockerMonitoringProvider: failed to get metrics',
      );
      return {
        status: 'unknown',
        uptimeSeconds: 0,
        cpuPercent: 0,
        memoryUsageBytes: 0,
        memoryLimitBytes: 0,
        memoryPercent: 0,
        restartCount: 0,
        healthStatus: 'none',
        collectedAt,
      };
    }
  }

  private performHttpProbe(host: string, port: number, path: string): Promise<HttpProbeResult> {
    const start = Date.now();
    return new Promise((resolve) => {
      const req = http.get({ host, port, path, timeout: 3000 }, (res) => {
        const latencyMs = Date.now() - start;
        const statusCode = res.statusCode || 0;
        const ok = statusCode >= 200 && statusCode < 400;
        resolve({
          status: ok ? 'ok' : 'failed',
          statusCode,
          latencyMs,
          message: ok ? 'Probe succeeded' : `HTTP status ${statusCode}`,
        });
      });
      req.on('error', (err) => {
        resolve({
          status: 'failed',
          latencyMs: Date.now() - start,
          message: err.message,
        });
      });
      req.on('timeout', () => {
        req.destroy();
        resolve({
          status: 'failed',
          latencyMs: Date.now() - start,
          message: 'Probe timeout (3000ms)',
        });
      });
    });
  }
}

