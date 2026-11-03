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
  private readonly coreV1Api: k8s.CoreV1Api;
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
    this.coreV1Api = this.kc.makeApiClient(k8s.CoreV1Api);
  }

  async deploy(input: DeploymentInput): Promise<DeploymentResult> {
    const { deploymentId, application, environment, version } = input;
    const { namespace, deploymentName, containerName, clusterName } = environment;

    const log = (level: 'INFO' | 'WARN' | 'ERROR', message: string) =>
      this.logEmitter.emit(deploymentId, level, message);

    const imageTag = version.includes('/')
      ? version
      : `ghcr.io/${application.repositoryOwner}/${application.repositoryName}:${version}`;

    logger.info(
      { deploymentId, namespace, deploymentName, imageTag },
      'Starting Kubernetes deployment',
    );

    try {
      await log('INFO', `Fetching deployment: ${deploymentName} in namespace: ${namespace} (cluster: ${clusterName})`);

      // Step 1: Verify deployment and container exist
      let currentDeployment: k8s.V1Deployment;
      try {
        const response = await this.appsV1Api.readNamespacedDeployment(deploymentName, namespace);
        currentDeployment = response.body;
      } catch (err: any) {
        const message = `Deployment '${deploymentName}' not found in namespace '${namespace}': ${err?.body?.message || err.message}`;
        await log('ERROR', message);
        return { success: false, error: message };
      }

      const containers = currentDeployment.spec?.template?.spec?.containers;
      if (!containers || containers.length === 0) {
        const message = 'No containers found in deployment spec';
        await log('ERROR', message);
        return { success: false, error: message };
      }

      const targetContainer = containers.find((c) => c.name === containerName);
      if (!targetContainer) {
        const message = `Container '${containerName}' not found in deployment`;
        await log('ERROR', message);
        return { success: false, error: message };
      }

      const oldImage = targetContainer.image;
      await log('INFO', `Updating container '${containerName}' image from '${oldImage}' to: ${imageTag}`);

      // Step 2: Apply the update using Strategic Merge Patch (avoids 409 resourceVersion conflicts)
      await log('INFO', 'Applying deployment update via strategic-merge-patch...');
      const patch = {
        spec: {
          template: {
            spec: {
              containers: [
                {
                  name: containerName,
                  image: imageTag,
                },
              ],
            },
          },
        },
      };

      const options = { headers: { 'Content-Type': 'application/strategic-merge-patch+json' } };
      let patchedDeployment: k8s.V1Deployment;

      try {
        const patchRes = await this.appsV1Api.patchNamespacedDeployment(
          deploymentName,
          namespace,
          patch,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          options,
        );
        patchedDeployment = patchRes.body;
      } catch (patchErr: any) {
        // Fallback to replaceNamespacedDeployment if patch is unsupported
        logger.warn({ error: patchErr?.message }, 'Strategic merge patch failed, trying replace');
        targetContainer.image = imageTag;
        const replaceRes = await this.appsV1Api.replaceNamespacedDeployment(
          deploymentName,
          namespace,
          currentDeployment,
        );
        patchedDeployment = replaceRes.body;
      }

      const targetGeneration = patchedDeployment.metadata?.generation ?? 1;
      await log('INFO', `Deployment spec updated to generation ${targetGeneration}. Waiting for rollout...`);

      // Step 3: Wait for rollout to complete or fail
      const rolloutResult = await this.waitForRollout(
        deploymentName,
        namespace,
        containerName,
        imageTag,
        targetGeneration,
        log,
      );

      if (rolloutResult.success) {
        await log('INFO', 'Deployment completed successfully. All replicas are healthy and ready.');
        return { success: true };
      } else {
        const errMessage = rolloutResult.error || 'Rollout did not complete within timeout';
        await log('ERROR', `Deployment failed: ${errMessage}`);
        return { success: false, error: errMessage };
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
    containerName: string,
    imageTag: string,
    targetGeneration: number,
    log: (level: 'INFO' | 'WARN' | 'ERROR', message: string) => Promise<void>,
    timeoutMs = env.KUBERNETES_ROLLOUT_TIMEOUT_MS,
    pollIntervalMs = env.KUBERNETES_POLL_INTERVAL_MS,
  ): Promise<{ success: boolean; error?: string }> {
    const deadline = Date.now() + timeoutMs;
    let imagePullBackOffStreak = 0;
    let crashLoopStreak = 0;

    while (Date.now() < deadline) {
      let deployment: k8s.V1Deployment;
      try {
        const response = await this.appsV1Api.readNamespacedDeployment(deploymentName, namespace);
        deployment = response.body;
      } catch (err: any) {
        await log('WARN', `Transient error reading deployment: ${err?.body?.message || err.message}`);
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        continue;
      }

      const status = deployment.status;
      const spec = deployment.spec;
      const observedGeneration = status?.observedGeneration ?? 0;

      // Crucial: The deployment controller must observe the new generation before checking replicas
      if (observedGeneration < targetGeneration) {
        await log(
          'INFO',
          `Waiting for deployment controller to observe generation ${targetGeneration} (current: ${observedGeneration})...`,
        );
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        continue;
      }

      const desired = spec?.replicas ?? 0;
      const ready = status?.readyReplicas ?? 0;
      const updated = status?.updatedReplicas ?? 0;
      const available = status?.availableReplicas ?? 0;
      const unavailable = status?.unavailableReplicas ?? 0;

      await log(
        'INFO',
        `Rollout status: ${ready}/${desired} ready, ${updated} updated, ${available} available (generation ${observedGeneration})`,
      );

      // Rollout is complete if desired replicas are updated, available, ready, and none unavailable
      if (
        updated >= desired &&
        available >= desired &&
        ready >= desired &&
        unavailable === 0
      ) {
        return { success: true };
      }

      // Check Progressing condition
      const conditions: k8s.V1DeploymentCondition[] = status?.conditions ?? [];
      const progressingCondition = conditions.find((c) => c.type === 'Progressing');
      if (progressingCondition?.status === 'False') {
        const reason = progressingCondition.message ?? 'Progress deadline exceeded';
        await log('ERROR', `Rollout failed: ${reason}`);
        return { success: false, error: reason };
      }

      // Inspect underlying pods and events
      try {
        const matchLabels = spec?.selector?.matchLabels || {};
        const labelSelector = Object.entries(matchLabels).map(([k, v]) => `${k}=${v}`).join(',');

        if (labelSelector) {
          const podRes = await this.coreV1Api.listNamespacedPod(
            namespace,
            undefined,
            undefined,
            undefined,
            undefined,
            labelSelector,
          );

          let hasImagePullBackOff = false;
          let hasCrashLoop = false;

          for (const pod of podRes.body.items) {
            const podName = pod.metadata?.name ?? 'unknown';

            // Check container statuses
            for (const cs of pod.status?.containerStatuses || []) {
              if (cs.name !== containerName && podRes.body.items.length > 1) {
                // Focus on the updated container
              }

              if (cs.state?.waiting) {
                const reason = cs.state.waiting.reason;
                const msg = cs.state.waiting.message;

                if (reason === 'ImagePullBackOff' || reason === 'ErrImagePull') {
                  hasImagePullBackOff = true;
                  await log('ERROR', `Pod ${podName} image pull error: ${reason} for image '${imageTag}'${msg ? ' - ' + msg : ''}`);
                } else if (reason === 'CrashLoopBackOff') {
                  hasCrashLoop = true;
                  const exitCode = cs.lastState?.terminated?.exitCode;
                  await log('ERROR', `Pod ${podName} container '${cs.name}' crashed: CrashLoopBackOff (exit code: ${exitCode ?? 1})`);
                }
              }

              if (cs.state?.terminated && cs.state.terminated.exitCode !== 0) {
                const exitCode = cs.state.terminated.exitCode;
                if (cs.state.terminated.reason === 'Error' || exitCode === 1) {
                  hasCrashLoop = true;
                }
                await log('WARN', `Pod ${podName} container '${cs.name}' terminated with exit code ${exitCode}: ${cs.state.terminated.reason || 'Error'}`);
              }
            }

            // Check unready pod conditions
            for (const cond of pod.status?.conditions || []) {
              if (cond.type === 'Ready' && cond.status === 'False' && cond.message) {
                await log('WARN', `Pod ${podName} not ready: ${cond.message}`);
              }
            }
          }

          if (hasImagePullBackOff) {
            imagePullBackOffStreak++;
            if (imagePullBackOffStreak >= 2) {
              return { success: false, error: `ImagePullBackOff: Failed to pull image '${imageTag}'` };
            }
          } else {
            imagePullBackOffStreak = 0;
          }

          if (hasCrashLoop) {
            crashLoopStreak++;
            if (crashLoopStreak >= 2) {
              return { success: false, error: 'CrashLoopBackOff: Container crashed continuously on startup' };
            }
          } else {
            crashLoopStreak = 0;
          }

          // Check namespace events for probe warnings
          try {
            const eventRes = await this.coreV1Api.listNamespacedEvent(namespace);
            const recentEvents = eventRes.body.items.filter((e) => {
              if (e.type !== 'Warning') return false;
              if (!e.involvedObject.name?.startsWith(deploymentName)) return false;
              const eventTime = new Date(e.lastTimestamp || e.eventTime || Date.now()).getTime();
              return Date.now() - eventTime < 15000;
            });

            for (const evt of recentEvents.slice(-2)) {
              if (evt.reason === 'Unhealthy') {
                await log('WARN', `Health check failure on ${evt.involvedObject.name}: ${evt.message}`);
              }
            }
          } catch {
            // Best effort event check
          }
        }
      } catch (err: any) {
        logger.warn({ error: err?.message }, 'Failed to inspect pods for diagnostic logs');
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    return {
      success: false,
      error: `Rollout timeout: pods did not reach ready state within ${Math.round(timeoutMs / 1000)}s`,
    };
  }
}
