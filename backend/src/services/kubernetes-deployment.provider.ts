import * as k8s from '@kubernetes/client-node';
import type { DeploymentProvider, DeploymentInput, DeploymentResult } from './deployment-provider.interface';
import { DatabaseLogEmitter } from './log-emitter';
import { logger } from '../config/logger';
import { env } from '../config/env';

/**
 * KubernetesDeploymentProvider performs actual Kubernetes deployments using
 * the official @kubernetes/client-node library.
 *
 * Structured operations only - no arbitrary shell commands.
 */
export class KubernetesDeploymentProvider implements DeploymentProvider {
  private readonly kc: k8s.KubeConfig;
  private readonly appsV1Api: k8s.AppsV1Api;
  private readonly logEmitter = new DatabaseLogEmitter();

  constructor() {
    this.kc = new k8s.KubeConfig();

    if (env.KUBERNETES_CONTEXT) {
      this.kc.loadFromDefault();
      this.kc.setCurrentContext(env.KUBERNETES_CONTEXT);
    } else {
      // Try in-cluster config first (when running inside Kubernetes), fallback to default
      try {
        this.kc.loadFromCluster();
      } catch {
        this.kc.loadFromDefault();
      }
    }

    this.appsV1Api = this.kc.makeApiClient(k8s.AppsV1Api);
  }

  async deploy(input: DeploymentInput): Promise<DeploymentResult> {
    const { deploymentId, application, environment, version } = input;
    const { namespace, deploymentName, containerName, clusterName } = environment;

    const log = (level: 'INFO' | 'WARN' | 'ERROR', message: string) =>
      this.logEmitter.emit(deploymentId, level, message);

    const imageTag = `ghcr.io/${application.repositoryOwner}/${application.repositoryName}:${version}`;

    logger.info(
      { deploymentId, namespace, deploymentName, imageTag },
      'Starting Kubernetes deployment',
    );

    try {
      await log('INFO', `Fetching deployment: ${deploymentName} in namespace: ${namespace} (cluster: ${clusterName})`);

      // Step 1: Get current deployment
      let currentDeployment: k8s.V1Deployment;
      try {
        const response = await this.appsV1Api.readNamespacedDeployment(deploymentName, namespace);
        currentDeployment = response.body;
      } catch {
        const message = `Deployment '${deploymentName}' not found in namespace '${namespace}'`;
        await log('ERROR', message);
        return { success: false, error: message };
      }

      // Step 2: Update container image
      await log('INFO', `Updating container '${containerName}' image to: ${imageTag}`);

      const containers = currentDeployment.spec?.template?.spec?.containers;
      if (!containers) {
        const message = 'No containers found in deployment spec';
        await log('ERROR', message);
        return { success: false, error: message };
      }

      const containerIndex = containers.findIndex((c) => c.name === containerName);
      if (containerIndex === -1) {
        const message = `Container '${containerName}' not found in deployment`;
        await log('ERROR', message);
        return { success: false, error: message };
      }

      containers[containerIndex].image = imageTag;

      // Step 3: Apply the update
      await log('INFO', 'Applying deployment update...');
      await this.appsV1Api.replaceNamespacedDeployment(deploymentName, namespace, currentDeployment);

      // Step 4: Wait for rollout
      await log('INFO', 'Waiting for rollout to complete...');
      const success = await this.waitForRollout(deploymentName, namespace, log);

      if (success) {
        await log('INFO', 'Deployment completed successfully');
        return { success: true };
      } else {
        await log('ERROR', 'Rollout did not complete within timeout');
        return { success: false, error: 'Rollout timeout' };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Kubernetes error';
      logger.error({ deploymentId, error }, 'Kubernetes deployment error');
      await log('ERROR', `Kubernetes error: ${message}`);
      return { success: false, error: message };
    }
  }

  private async waitForRollout(
    deploymentName: string,
    namespace: string,
    log: (level: 'INFO' | 'WARN' | 'ERROR', message: string) => Promise<void>,
    timeoutMs = 300000,
    pollIntervalMs = 5000,
  ): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const response = await this.appsV1Api.readNamespacedDeployment(deploymentName, namespace);
      const deployment = response.body;

      const status = deployment.status;
      const spec = deployment.spec;
      const desired = spec?.replicas ?? 0;
      const ready = status?.readyReplicas ?? 0;
      const updated = status?.updatedReplicas ?? 0;
      const available = status?.availableReplicas ?? 0;

      await log('INFO', `Rollout status: ${ready}/${desired} ready, ${updated} updated, ${available} available`);

      if (
        updated >= desired &&
        available >= desired &&
        ready >= desired &&
        (status?.unavailableReplicas ?? 0) === 0
      ) {
        return true;
      }

      // Check for failure conditions in conditions array
      const conditions: k8s.V1DeploymentCondition[] = status?.conditions ?? [];
      const progressingCondition = conditions.find((c) => c.type === 'Progressing');
      if (progressingCondition?.status === 'False') {
        await log('ERROR', `Rollout failed: ${progressingCondition.message ?? 'Unknown reason'}`);
        return false;
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    return false;
  }
}
