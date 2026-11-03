import { env } from '../config/env';
import type { Environment } from '../db/schema';
import type { MonitoringProvider } from './monitoring-provider.interface';
import { MockMonitoringProvider } from './mock-monitoring.provider';
import { KubernetesMonitoringProvider } from './kubernetes-monitoring.provider';
import { DockerMonitoringProvider } from './docker-monitoring.provider';

let mockMonitoringProvider: MockMonitoringProvider | null = null;
let k8sMonitoringProvider: KubernetesMonitoringProvider | null = null;
let dockerMonitoringProvider: DockerMonitoringProvider | null = null;

export function resolveMonitoringProvider(environment?: Environment | null): MonitoringProvider {
  if (env.DEPLOYMENT_PROVIDER === 'mock') {
    if (!mockMonitoringProvider) mockMonitoringProvider = new MockMonitoringProvider();
    return mockMonitoringProvider;
  }

  const providerType = environment?.provider || 'kubernetes';

  if (providerType === 'docker') {
    if (!dockerMonitoringProvider) dockerMonitoringProvider = new DockerMonitoringProvider();
    return dockerMonitoringProvider;
  }

  if (!k8sMonitoringProvider) k8sMonitoringProvider = new KubernetesMonitoringProvider();
  return k8sMonitoringProvider;
}

