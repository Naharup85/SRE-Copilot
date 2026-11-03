import { env } from '../config/env';
import type { Environment } from '../db/schema';
import type { LoggingProvider } from './logging-provider.interface';
import { MockLoggingProvider } from './mock-logging.provider';
import { KubernetesLoggingProvider } from './kubernetes-logging.provider';
import { DockerLoggingProvider } from './docker-logging.provider';

let mockLoggingProvider: MockLoggingProvider | null = null;
let k8sLoggingProvider: KubernetesLoggingProvider | null = null;
let dockerLoggingProvider: DockerLoggingProvider | null = null;

export function resolveLoggingProvider(environment?: Environment | null): LoggingProvider {
  if (env.DEPLOYMENT_PROVIDER === 'mock') {
    if (!mockLoggingProvider) mockLoggingProvider = new MockLoggingProvider();
    return mockLoggingProvider;
  }

  const providerType = environment?.provider || 'kubernetes';

  if (providerType === 'docker') {
    if (!dockerLoggingProvider) dockerLoggingProvider = new DockerLoggingProvider();
    return dockerLoggingProvider;
  }

  if (!k8sLoggingProvider) k8sLoggingProvider = new KubernetesLoggingProvider();
  return k8sLoggingProvider;
}

