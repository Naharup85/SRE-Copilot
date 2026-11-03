import * as k8s from '@kubernetes/client-node';
import type { Environment } from '../db/schema';
import type { MonitoringProvider, EnvironmentMetrics } from './monitoring-provider.interface';
import { env } from '../config/env';
import { logger } from '../config/logger';

export class KubernetesMonitoringProvider implements MonitoringProvider {
  private readonly kc: k8s.KubeConfig;
  private readonly appsV1Api: k8s.AppsV1Api;
  private readonly coreV1Api: k8s.CoreV1Api;

  constructor() {
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

    this.appsV1Api = this.kc.makeApiClient(k8s.AppsV1Api);
    this.coreV1Api = this.kc.makeApiClient(k8s.CoreV1Api);
  }

  async getMetrics(environment: Environment): Promise<EnvironmentMetrics> {
    const cfg = (environment.targetConfig as any) || {};
    const namespace = environment.namespace || cfg.namespace || 'default';
    const deploymentName = environment.deploymentName || cfg.deploymentName;
    const collectedAt = new Date().toISOString();

    if (!deploymentName) {
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

    try {
      const depRes = await this.appsV1Api.readNamespacedDeployment(deploymentName, namespace);
      const dep = depRes.body;
      const desiredReplicas = dep.spec?.replicas ?? 1;
      const readyReplicas = dep.status?.readyReplicas ?? 0;
      const updatedReplicas = dep.status?.updatedReplicas ?? 0;

      // Fetch pods to calculate uptime and restart counts
      const labelSelector = dep.spec?.selector?.matchLabels
        ? Object.entries(dep.spec.selector.matchLabels)
            .map(([k, v]) => `${k}=${v}`)
            .join(',')
        : undefined;

      let restartCount = 0;
      let oldestStartTime = 0;

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
          const startTime = pod.status?.startTime ? new Date(pod.status.startTime).getTime() : 0;
          if (startTime > 0 && (oldestStartTime === 0 || startTime < oldestStartTime)) {
            oldestStartTime = startTime;
          }

          for (const cs of pod.status?.containerStatuses || []) {
            restartCount += cs.restartCount || 0;
          }
        }
      }

      const uptimeSeconds =
        oldestStartTime > 0 ? Math.max(0, Math.floor((Date.now() - oldestStartTime) / 1000)) : 0;

      let status: 'running' | 'stopped' | 'degraded' | 'unknown' = 'unknown';
      let healthStatus: 'healthy' | 'unhealthy' | 'starting' | 'none' = 'none';

      if (readyReplicas >= desiredReplicas && desiredReplicas > 0) {
        status = 'running';
        healthStatus = 'healthy';
      } else if (readyReplicas > 0 && readyReplicas < desiredReplicas) {
        status = 'degraded';
        healthStatus = 'unhealthy';
      } else if (desiredReplicas === 0) {
        status = 'stopped';
        healthStatus = 'none';
      } else {
        status = updatedReplicas > 0 ? 'degraded' : 'stopped';
        healthStatus = 'starting';
      }

      return {
        status,
        uptimeSeconds,
        cpuPercent: 0,
        memoryUsageBytes: 0,
        memoryLimitBytes: 0,
        memoryPercent: 0,
        restartCount,
        healthStatus,
        collectedAt,
      };
    } catch (err: any) {
      logger.warn({ deploymentName, namespace, error: err.message }, 'Failed to fetch Kubernetes metrics');
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
}

