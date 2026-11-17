import * as k8s from '@kubernetes/client-node';
import type { Environment } from '../db/schema';
import type {
  MonitoringProvider,
  EnvironmentMetrics,
  KubernetesWorkloadMetrics,
  KubernetesPodMetrics,
  MetricAvailability,
} from './monitoring-provider.interface';
import { env } from '../config/env';
import { logger } from '../config/logger';

export function parseCpuQuantity(val?: string | null): number | null {
  if (!val || typeof val !== 'string') return null;
  val = val.trim();
  if (val.endsWith('n')) {
    return Number(val.slice(0, -1)) / 1e9;
  }
  if (val.endsWith('u')) {
    return Number(val.slice(0, -1)) / 1e6;
  }
  if (val.endsWith('m')) {
    return Number(val.slice(0, -1)) / 1e3;
  }
  const num = Number(val);
  return isNaN(num) ? null : num;
}

export function parseMemoryQuantity(val?: string | null): number | null {
  if (!val || typeof val !== 'string') return null;
  val = val.trim();
  const suffixes: Record<string, number> = {
    Ki: 1024,
    Mi: 1024 ** 2,
    Gi: 1024 ** 3,
    Ti: 1024 ** 4,
    Pi: 1024 ** 5,
    Ei: 1024 ** 6,
    k: 1000,
    M: 1000 ** 2,
    G: 1000 ** 3,
    T: 1000 ** 4,
    P: 1000 ** 5,
    E: 1000 ** 6,
  };

  for (const [suffix, multiplier] of Object.entries(suffixes)) {
    if (val.endsWith(suffix)) {
      const num = Number(val.slice(0, -suffix.length));
      return isNaN(num) ? null : num * multiplier;
    }
  }

  const num = Number(val);
  return isNaN(num) ? null : num;
}

export class KubernetesMonitoringProvider implements MonitoringProvider {
  private readonly kc: k8s.KubeConfig;
  private readonly appsV1Api: k8s.AppsV1Api;
  private readonly coreV1Api: k8s.CoreV1Api;
  private readonly metricsClient: k8s.Metrics;

  constructor(customKc?: k8s.KubeConfig) {
    if (customKc) {
      this.kc = customKc;
    } else {
      this.kc = new k8s.KubeConfig();
      try {
        if (env.KUBERNETES_CONTEXT) {
          this.kc.loadFromFile(process.env.KUBECONFIG || `${process.env.HOME}/.kube/config`);
          this.kc.setCurrentContext(env.KUBERNETES_CONTEXT);
        } else {
          this.kc.loadFromDefault();
        }
      } catch {
        this.kc.loadFromDefault();
      }
    }

    this.appsV1Api = this.kc.makeApiClient(k8s.AppsV1Api);
    this.coreV1Api = this.kc.makeApiClient(k8s.CoreV1Api);
    this.metricsClient = new k8s.Metrics(this.kc);
  }

  async getMetrics(environment: Environment): Promise<EnvironmentMetrics> {
    const cfg = (environment.targetConfig as any) || {};
    const namespace = environment.namespace || cfg.namespace || 'default';
    const deploymentName = environment.deploymentName || cfg.deploymentName;
    const collectedAt = new Date().toISOString();

    const emptyAvailability: MetricAvailability = {
      cpu: 'unavailable',
      memory: 'unavailable',
      network: 'unavailable',
      storage: 'unavailable',
      metricsServer: 'unavailable',
    };

    if (!deploymentName) {
      return {
        environmentId: environment.id,
        provider: 'kubernetes',
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
        kubernetes: null,
        availability: emptyAvailability,
        collectedAt,
        message: 'No Kubernetes deployment name specified for environment',
      };
    }

    try {
      const depRes = await this.appsV1Api.readNamespacedDeployment(deploymentName, namespace);
      const dep = depRes.body;
      const desiredReplicas = dep.spec?.replicas ?? 1;
      const readyReplicas = dep.status?.readyReplicas ?? 0;
      const availableReplicas = dep.status?.availableReplicas ?? 0;
      const updatedReplicas = dep.status?.updatedReplicas ?? 0;
      const unavailableReplicas = dep.status?.unavailableReplicas ?? Math.max(0, desiredReplicas - readyReplicas);

      // Fetch pods to calculate uptime, pod readiness and restart counts
      const labelSelector = dep.spec?.selector?.matchLabels
        ? Object.entries(dep.spec.selector.matchLabels)
            .map(([k, v]) => `${k}=${v}`)
            .join(',')
        : undefined;

      let restartCount = 0;
      let oldestStartTime = 0;
      const pods: KubernetesPodMetrics[] = [];
      const podNameSet = new Set<string>();

      if (labelSelector) {
        const podsRes = await this.coreV1Api.listNamespacedPod(
          namespace,
          undefined,
          undefined,
          undefined,
          undefined,
          labelSelector,
        );

        for (const pod of podsRes.body.items) {
          const podName = pod.metadata?.name || 'unknown-pod';
          podNameSet.add(podName);

          const startTime = pod.status?.startTime ? new Date(pod.status.startTime).getTime() : 0;
          if (startTime > 0 && (oldestStartTime === 0 || startTime < oldestStartTime)) {
            oldestStartTime = startTime;
          }

          let podRestarts = 0;
          let isPodReady = false;

          const containerStatuses = pod.status?.containerStatuses || [];
          for (const cs of containerStatuses) {
            podRestarts += cs.restartCount || 0;
          }
          restartCount += podRestarts;

          // Pod condition: Ready
          const readyCond = pod.status?.conditions?.find((c) => c.type === 'Ready');
          isPodReady = readyCond?.status === 'True';

          pods.push({
            podName,
            phase: pod.status?.phase || 'Unknown',
            ready: isPodReady,
            restartCount: podRestarts,
            startTime: pod.status?.startTime ? new Date(pod.status.startTime).toISOString() : undefined,
            cpuUsageCores: null,
            memoryUsageBytes: null,
          });
        }
      }

      const uptimeSeconds =
        oldestStartTime > 0 ? Math.max(0, Math.floor((Date.now() - oldestStartTime) / 1000)) : 0;

      // Workload health determination
      let status: 'running' | 'stopped' | 'degraded' | 'unknown' = 'unknown';
      let healthStatus: 'healthy' | 'unhealthy' | 'starting' | 'none' = 'none';

      if (desiredReplicas === 0) {
        status = 'stopped';
        healthStatus = 'none';
      } else if (readyReplicas >= desiredReplicas && desiredReplicas > 0) {
        status = 'running';
        healthStatus = 'healthy';
      } else if (readyReplicas > 0 && readyReplicas < desiredReplicas) {
        status = 'degraded';
        healthStatus = 'unhealthy';
      } else {
        status = updatedReplicas > 0 ? 'degraded' : 'stopped';
        healthStatus = 'starting';
      }

      // Read configured resource limits from deployment template spec
      let totalConfiguredCpuLimitCores: number | null = null;
      let totalConfiguredMemoryLimitBytes: number | null = null;

      const containers = dep.spec?.template?.spec?.containers || [];
      for (const c of containers) {
        const cpuLimit = parseCpuQuantity(c.resources?.limits?.cpu);
        if (cpuLimit !== null) {
          totalConfiguredCpuLimitCores = (totalConfiguredCpuLimitCores || 0) + cpuLimit * desiredReplicas;
        }
        const memLimit = parseMemoryQuantity(c.resources?.limits?.memory);
        if (memLimit !== null) {
          totalConfiguredMemoryLimitBytes = (totalConfiguredMemoryLimitBytes || 0) + memLimit * desiredReplicas;
        }
      }

      // Query Kubernetes Metrics Server (if installed/available)
      let cpuPercent: number | null = null;
      let memoryUsageBytes: number | null = null;
      let memoryLimitBytes: number | null = totalConfiguredMemoryLimitBytes;
      let memoryPercent: number | null = null;
      let metricsServerAvailable = false;
      let metricsMessage: string | undefined;

      try {
        const podMetricsList = await this.metricsClient.getPodMetrics(namespace);
        metricsServerAvailable = true;

        let totalCpuUsageCores = 0;
        let totalMemoryUsageBytes = 0;
        let matchedWorkloadPods = 0;

        for (const item of (podMetricsList as any).items || []) {
          const itemPodName = item.metadata?.name;
          if (podNameSet.has(itemPodName)) {
            matchedWorkloadPods++;
            let podCpu = 0;
            let podMem = 0;

            for (const container of item.containers || []) {
              const cCpu = parseCpuQuantity(container.usage?.cpu) || 0;
              const cMem = parseMemoryQuantity(container.usage?.memory) || 0;
              podCpu += cCpu;
              podMem += cMem;
            }

            totalCpuUsageCores += podCpu;
            totalMemoryUsageBytes += podMem;

            const targetPod = pods.find((p) => p.podName === itemPodName);
            if (targetPod) {
              targetPod.cpuUsageCores = Number(podCpu.toFixed(4));
              targetPod.memoryUsageBytes = podMem;
            }
          }
        }

        if (matchedWorkloadPods > 0) {
          memoryUsageBytes = totalMemoryUsageBytes;
          if (memoryLimitBytes && memoryLimitBytes > 0) {
            memoryPercent = Number(
              Math.min(100, (memoryUsageBytes / memoryLimitBytes) * 100).toFixed(2),
            );
          }

          if (totalConfiguredCpuLimitCores && totalConfiguredCpuLimitCores > 0) {
            cpuPercent = Number(
              Math.min(100, (totalCpuUsageCores / totalConfiguredCpuLimitCores) * 100).toFixed(2),
            );
          } else {
            // Express as percentage of 1 core (e.g. 0.05 cores = 5.0%)
            cpuPercent = Number((totalCpuUsageCores * 100).toFixed(2));
          }
        }
      } catch (metricsErr: any) {
        logger.debug(
          { deploymentName, namespace, error: metricsErr.message },
          'Metrics Server unavailable or pod metrics failed to load',
        );
        metricsServerAvailable = false;
        metricsMessage = 'Metrics Server is not available on cluster. Install metrics-server to view real-time pod CPU and memory usage.';
      }

      const workloadMetrics: KubernetesWorkloadMetrics = {
        desiredReplicas,
        availableReplicas,
        readyReplicas,
        unavailableReplicas,
        pods,
      };

      const availability: MetricAvailability = {
        cpu: metricsServerAvailable && cpuPercent !== null ? 'available' : 'unavailable',
        memory: metricsServerAvailable && memoryUsageBytes !== null ? 'available' : 'unavailable',
        network: 'unavailable',
        storage: 'unavailable',
        metricsServer: metricsServerAvailable ? 'available' : 'unavailable',
      };

      return {
        environmentId: environment.id,
        provider: 'kubernetes',
        status,
        uptimeSeconds,
        cpuPercent,
        memoryUsageBytes,
        memoryLimitBytes,
        memoryPercent,
        restartCount,
        healthStatus,
        network: null,
        storage: null,
        kubernetes: workloadMetrics,
        availability,
        collectedAt,
        message: metricsMessage,
      };
    } catch (err: any) {
      logger.warn(
        { deploymentName, namespace, error: err.message },
        'Failed to fetch Kubernetes metrics',
      );
      return {
        environmentId: environment.id,
        provider: 'kubernetes',
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
        kubernetes: null,
        availability: emptyAvailability,
        collectedAt,
        message: err.message || 'Failed to query Kubernetes workload metrics',
      };
    }
  }
}
