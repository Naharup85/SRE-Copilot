import type { DeploymentProvider, DeploymentInput, DeploymentResult } from './deployment-provider.interface';
import { DatabaseLogEmitter } from './log-emitter';
import { logger } from '../config/logger';

/**
 * MockDeploymentProvider simulates a Kubernetes deployment for local development.
 * This allows the full deployment flow to be tested without a real cluster.
 * In production, replace with KubernetesDeploymentProvider.
 */
export class MockDeploymentProvider implements DeploymentProvider {
  private readonly logEmitter = new DatabaseLogEmitter();

  async deploy(input: DeploymentInput): Promise<DeploymentResult> {
    const { deploymentId, application, environment, version, commitSha } = input;
    const log = (level: 'INFO' | 'WARN' | 'ERROR', message: string) =>
      this.logEmitter.emit(deploymentId, level, message);

    logger.info(
      { deploymentId, applicationName: application.name, version },
      '[MockProvider] Starting mock deployment',
    );

    try {
      await log('INFO', `[MOCK] Deployment started for commit ${commitSha.slice(0, 7)}`);
      await this.sleep(500);

      await log(
        'INFO',
        `[MOCK] Fetching deployment: ${environment.deploymentName} in namespace: ${environment.namespace}`,
      );
      await this.sleep(800);

      const imageTag = `ghcr.io/${application.repositoryOwner}/${application.repositoryName}:${version}`;
      await log('INFO', `[MOCK] Updating container '${environment.containerName}' image to: ${imageTag}`);
      await this.sleep(600);

      await log('INFO', `[MOCK] Applying deployment update...`);
      await this.sleep(1000);

      await log('INFO', `[MOCK] Waiting for rollout to complete...`);
      await this.sleep(2000);

      // Simulate occasional failure (10% chance) for realistic demo
      if (Math.random() < 0.1) {
        await log('ERROR', `[MOCK] Rollout failed: Pod ${environment.deploymentName}-xxx CrashLoopBackOff - Exit code 1`);
        await log('ERROR', `[MOCK] Deployment failed: rollout did not complete within timeout`);
        return { success: false, error: 'Rollout failed: CrashLoopBackOff' };
      }

      await log('INFO', `[MOCK] Rollout completed successfully. 2/2 replicas available.`);
      await this.sleep(300);

      await log('INFO', `[MOCK] Deployment completed successfully`);

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await log('ERROR', `[MOCK] Unexpected error: ${message}`);
      return { success: false, error: message };
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
