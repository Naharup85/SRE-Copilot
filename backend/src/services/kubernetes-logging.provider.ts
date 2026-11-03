import * as k8s from '@kubernetes/client-node';
import type { Environment } from '../db/schema';
import type { LoggingProvider, ContainerLogEntry } from './logging-provider.interface';
import { env } from '../config/env';
import { logger } from '../config/logger';

export class KubernetesLoggingProvider implements LoggingProvider {
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

  async getContainerLogs(environment: Environment, lines = 100): Promise<ContainerLogEntry[]> {
    const cfg = (environment.targetConfig as any) || {};
    const namespace = environment.namespace || cfg.namespace || 'default';
    const deploymentName = environment.deploymentName || cfg.deploymentName;
    const containerName = environment.containerName || cfg.containerName;

    if (!deploymentName) return [];

    try {
      const depRes = await this.appsV1Api.readNamespacedDeployment(deploymentName, namespace);
      const matchLabels = depRes.body.spec?.selector?.matchLabels;
      if (!matchLabels) return [];

      const labelSelector = Object.entries(matchLabels)
        .map(([k, v]) => `${k}=${v}`)
        .join(',');

      const podsRes = await this.coreV1Api.listNamespacedPod(
        namespace,
        undefined,
        undefined,
        undefined,
        undefined,
        labelSelector,
      );

      const pods = podsRes.body.items;
      if (pods.length === 0) return [];

      const activePod = pods.find((p) => p.status?.phase === 'Running') || pods[0];
      const podName = activePod.metadata?.name;
      if (!podName) return [];

      const logRes = await this.coreV1Api.readNamespacedPodLog(
        podName,
        namespace,
        containerName || undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        lines,
        true, // timestamps
      );

      const rawLogs = String(logRes.body || '');
      const entries: ContainerLogEntry[] = [];

      for (const line of rawLogs.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const spaceIdx = trimmed.indexOf(' ');
        if (spaceIdx > 19) {
          const possibleTs = trimmed.slice(0, spaceIdx);
          if (!isNaN(Date.parse(possibleTs))) {
            entries.push({
              timestamp: possibleTs,
              stream: 'stdout',
              message: trimmed.slice(spaceIdx + 1),
            });
            continue;
          }
        }

        entries.push({
          timestamp: new Date().toISOString(),
          stream: 'stdout',
          message: trimmed,
        });
      }

      return entries;
    } catch (err: any) {
      logger.warn({ deploymentName, namespace, error: err.message }, 'Failed to read Kubernetes pod logs');
      return [];
    }
  }
}
