import Docker from 'dockerode';
import http from 'http';
import type { Environment } from '../db/schema';
import type {
  MonitoringProvider,
  EnvironmentMetrics,
  HttpProbeResult,
  NetworkMetrics,
  StorageMetrics,
  MetricAvailability,
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
          environmentId: environment.id,
          provider: 'docker',
          status: 'stopped',
          uptimeSeconds: 0,
          cpuPercent: null,
          memoryUsageBytes: null,
          memoryLimitBytes: null,
          memoryPercent: null,
          restartCount: 0,
          healthStatus: 'none',
          network: null,
          storage: null,
          availability: {
            cpu: 'unavailable',
            memory: 'unavailable',
            network: 'unavailable',
            storage: 'unavailable',
            metricsServer: 'not_applicable',
          },
          collectedAt,
          message: `Container '${containerName}' not found or stopped`,
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

      if (!isRunning) {
        return {
          environmentId: environment.id,
          provider: 'docker',
          status: 'stopped',
          uptimeSeconds: 0,
          cpuPercent: null,
          memoryUsageBytes: null,
          memoryLimitBytes: null,
          memoryPercent: null,
          restartCount,
          healthStatus,
          network: null,
          storage: null,
          availability: {
            cpu: 'unavailable',
            memory: 'unavailable',
            network: 'unavailable',
            storage: 'unavailable',
            metricsServer: 'not_applicable',
          },
          collectedAt,
          message: `Container '${containerName}' is stopped (ExitCode: ${inspect.State?.ExitCode ?? 0})`,
        };
      }

      // Container is running: collect live stats
      let cpuPercent: number | null = null;
      let memoryUsageBytes: number | null = null;
      let memoryLimitBytes: number | null = null;
      let memoryPercent: number | null = null;
      let network: NetworkMetrics | null = null;
      let storage: StorageMetrics | null = null;

      const availability: MetricAvailability = {
        cpu: 'unavailable',
        memory: 'unavailable',
        network: 'unavailable',
        storage: 'unavailable',
        metricsServer: 'not_applicable',
      };

      try {
        const stats = await container.stats({ stream: false });

        // 1. CPU calculation
        const cpuStats = stats.cpu_stats;
        const preCpuStats = stats.precpu_stats;
        if (cpuStats && preCpuStats) {
          const cpuDelta =
            (cpuStats.cpu_usage?.total_usage || 0) -
            (preCpuStats.cpu_usage?.total_usage || 0);
          const systemDelta =
            (cpuStats.system_cpu_usage || 0) -
            (preCpuStats.system_cpu_usage || 0);
          const onlineCpus =
            cpuStats.online_cpus ||
            cpuStats.cpu_usage?.percpu_usage?.length ||
            1;

          if (systemDelta > 0 && cpuDelta >= 0) {
            cpuPercent = Number(
              Math.min(100 * onlineCpus, ((cpuDelta / systemDelta) * onlineCpus * 100)).toFixed(2),
            );
            availability.cpu = 'available';
          } else if (systemDelta > 0 && cpuDelta === 0) {
            cpuPercent = 0.0;
            availability.cpu = 'available';
          }
        }

        // 2. Memory calculation
        if (stats.memory_stats) {
          const cache =
            stats.memory_stats.stats?.inactive_file ??
            stats.memory_stats.stats?.cache ??
            0;
          const rawUsage = stats.memory_stats.usage || 0;
          const usedMemory = Math.max(0, rawUsage - cache);
          memoryUsageBytes = usedMemory;
          availability.memory = 'available';

          const rawLimit = stats.memory_stats.limit || 0;
          // An unlimited container on Linux often has a limit > 1e16 (e.g. 0x7ffffffffffff000)
          const isUnlimited = rawLimit <= 0 || rawLimit > 1e16;
          if (!isUnlimited) {
            memoryLimitBytes = rawLimit;
            memoryPercent = Number(
              Math.min(100, (usedMemory / rawLimit) * 100).toFixed(2),
            );
          } else {
            memoryLimitBytes = null;
            memoryPercent = null;
          }
        }

        // 3. Network calculation
        if (stats.networks && typeof stats.networks === 'object') {
          let rxTotal = 0;
          let txTotal = 0;
          for (const iface of Object.values<any>(stats.networks)) {
            rxTotal += iface.rx_bytes || 0;
            txTotal += iface.tx_bytes || 0;
          }
          network = {
            receivedBytes: rxTotal,
            transmittedBytes: txTotal,
          };
          availability.network = 'available';
        }

        // 4. Block I/O (Storage) calculation
        if (stats.blkio_stats) {
          const blkioEntries =
            stats.blkio_stats.io_service_bytes_recursive ||
            (stats.blkio_stats as any).io_service_bytes ||
            [];
          let readTotal = 0;
          let writeTotal = 0;
          let foundEntries = false;

          if (Array.isArray(blkioEntries)) {
            for (const entry of blkioEntries) {
              const op = (entry.op || '').toLowerCase();
              if (op === 'read' || op === 'r') {
                readTotal += entry.value || 0;
                foundEntries = true;
              } else if (op === 'write' || op === 'w') {
                writeTotal += entry.value || 0;
                foundEntries = true;
              }
            }
          }

          storage = {
            readBytes: foundEntries ? readTotal : 0,
            writeBytes: foundEntries ? writeTotal : 0,
          };
          availability.storage = 'available';
        }
      } catch (statsErr: any) {
        logger.warn({ containerName, error: statsErr.message }, 'Could not fetch container stats');
      }

      // 5. Optional HTTP Health Probe
      let httpProbe: HttpProbeResult | undefined;
      const probePath = cfg.healthCheck?.path;
      const probePort = cfg.healthCheck?.port || cfg.portBindings?.[0]?.hostPort;

      if (probePath && probePort) {
        httpProbe = await this.performHttpProbe('127.0.0.1', probePort, probePath);
      }

      let status: 'running' | 'stopped' | 'degraded' | 'unknown' = 'running';
      if (healthStatus === 'unhealthy' || (httpProbe && httpProbe.status === 'failed')) {
        status = 'degraded';
      }

      return {
        environmentId: environment.id,
        provider: 'docker',
        status,
        uptimeSeconds,
        cpuPercent,
        memoryUsageBytes,
        memoryLimitBytes,
        memoryPercent,
        restartCount,
        healthStatus,
        network,
        storage,
        availability,
        httpProbe,
        collectedAt,
      };
    } catch (error: any) {
      logger.error(
        { containerName, error: error.message },
        'DockerMonitoringProvider: failed to get metrics',
      );
      return {
        environmentId: environment.id,
        provider: 'docker',
        status: 'unknown',
        uptimeSeconds: 0,
        cpuPercent: null,
        memoryUsageBytes: null,
        memoryLimitBytes: null,
        memoryPercent: null,
        restartCount: 0,
        healthStatus: 'none',
        network: null,
        storage: null,
        availability: {
          cpu: 'unavailable',
          memory: 'unavailable',
          network: 'unavailable',
          storage: 'unavailable',
          metricsServer: 'not_applicable',
        },
        collectedAt,
        message: error.message,
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
