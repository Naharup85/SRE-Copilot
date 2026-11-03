import { db } from '../db/connection';
import { deployments } from '../db/schema';
import { eq } from 'drizzle-orm';
import { resolveDeploymentProvider } from './deployment-provider.resolver';
import { DatabaseLogEmitter } from './log-emitter';
import { logger } from '../config/logger';
import type { Application, Environment, Deployment } from '../db/schema';

/**
 * DeploymentWorker handles async job execution for deployments.
 *
 * Phase 1: Simple in-process job runner.
 * Future phases can replace this with BullMQ/RabbitMQ/Kafka by:
 *   1. Publishing the job to a queue instead of running in-process
 *   2. Implementing a worker process that consumes and executes jobs
 *   3. Keeping the same status/log database contract
 */
export class DeploymentWorker {
  private readonly logEmitter = new DatabaseLogEmitter();

  async execute(
    deployment: Deployment,
    application: Application,
    environment: Environment,
  ): Promise<void> {
    const { id: deploymentId } = deployment;

    logger.info({ deploymentId }, 'DeploymentWorker: starting execution');

    try {
      // Mark as RUNNING
      await db
        .update(deployments)
        .set({ status: 'RUNNING', startedAt: new Date() })
        .where(eq(deployments.id, deploymentId));

      const provider = resolveDeploymentProvider(environment);
      const result = await provider.deploy({
        deploymentId,
        application,
        environment,
        version: deployment.version,
        commitSha: deployment.commitSha,
      });

      // Update final status
      await db
        .update(deployments)
        .set({
          status: result.success ? 'SUCCESS' : 'FAILED',
          finishedAt: new Date(),
        })
        .where(eq(deployments.id, deploymentId));

      logger.info(
        { deploymentId, success: result.success, error: result.error },
        'DeploymentWorker: execution complete',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ deploymentId, error }, 'DeploymentWorker: unexpected error');

      await this.logEmitter.emit(deploymentId, 'ERROR', `Worker error: ${message}`);
      await db
        .update(deployments)
        .set({ status: 'FAILED', finishedAt: new Date() })
        .where(eq(deployments.id, deploymentId));
    }
  }
}

export const deploymentWorker = new DeploymentWorker();
