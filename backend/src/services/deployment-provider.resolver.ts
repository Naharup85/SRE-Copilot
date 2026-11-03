import { env } from '../config/env';
import type { Environment } from '../db/schema';
import type { DeploymentProvider } from './deployment-provider.interface';
import { MockDeploymentProvider } from './mock-deployment.provider';
import { KubernetesDeploymentProvider } from './kubernetes-deployment.provider';
import { DockerDeploymentProvider } from './docker-deployment.provider';
import { logger } from '../config/logger';

let mockProvider: MockDeploymentProvider | null = null;
let k8sProvider: KubernetesDeploymentProvider | null = null;
let dockerProvider: DockerDeploymentProvider | null = null;

function getMockProvider(): MockDeploymentProvider {
  if (!mockProvider) mockProvider = new MockDeploymentProvider();
  return mockProvider;
}

function getKubernetesProvider(): KubernetesDeploymentProvider {
  if (!k8sProvider) k8sProvider = new KubernetesDeploymentProvider();
  return k8sProvider;
}

function getDockerProvider(): DockerDeploymentProvider {
  if (!dockerProvider) dockerProvider = new DockerDeploymentProvider();
  return dockerProvider;
}

/**
 * Resolves the appropriate DeploymentProvider for a given environment.
 * If DEPLOYMENT_PROVIDER=mock (e.g. in automated tests), MockDeploymentProvider is used.
 * Otherwise, resolves according to environment.provider ('docker' or 'kubernetes').
 */
export function resolveDeploymentProvider(environment?: Environment | null): DeploymentProvider {
  if (env.DEPLOYMENT_PROVIDER === 'mock') {
    return getMockProvider();
  }

  if (env.DEPLOYMENT_PROVIDER === 'kubernetes') {
    return getKubernetesProvider();
  }

  if (env.DEPLOYMENT_PROVIDER === 'docker') {
    return getDockerProvider();
  }

  // Dynamic mode: check environment runtime provider
  const providerType = environment?.provider || 'kubernetes';

  if (providerType === 'docker') {
    logger.debug({ environmentId: environment?.id }, 'Resolved DockerDeploymentProvider');
    return getDockerProvider();
  }

  logger.debug({ environmentId: environment?.id }, 'Resolved KubernetesDeploymentProvider');
  return getKubernetesProvider();
}

