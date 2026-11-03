import { db } from '../../db/connection';
import { deployments, environments, applications, deploymentLogs, users } from '../../db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { AppError } from '../../utils/errors';
import { logger } from '../../config/logger';
import { deploymentWorker } from '../../services/deployment-worker';
import type { CreateDeploymentInput } from './deployments.types';
import type { Application,Environment,Deployment,DeploymentLog } from '../../db/schema';

export class DeploymentsService {
  private async verifyEnvironmentOwnership(userId: string, environmentId: string) {
    const [result] = await db
      .select({
        env: environments,
        app: applications,
      })
      .from(environments)
      .innerJoin(applications, eq(environments.applicationId, applications.id))
      .where(
        and(eq(environments.id, environmentId), eq(applications.createdBy, userId)),
      )
      .limit(1);

    if (!result) {
      throw new AppError('ENVIRONMENT_NOT_FOUND', 'Environment not found', 404);
    }

    const environment: Environment = result.env;
    
    const application: Application = {
        id: result.app.id,
        name: result.app.name,
        createdAt: result.app.createdAt,
        updatedAt: result.app.updatedAt,
        description: result.app.description,
        repositoryUrl: result.app.repositoryUrl,
        repositoryOwner: result.app.repositoryOwner,
        repositoryName: result.app.repositoryName,
        defaultBranch: result.app.defaultBranch,
        createdBy: result.app.createdBy,
    };

    return { environment, application };
  }

  async create(
    userId: string,
    environmentId: string,
    input: CreateDeploymentInput,
  ): Promise<Deployment> {
    const { environment, application } = await this.verifyEnvironmentOwnership(userId, environmentId);

    const [result] = await db
      .insert(deployments)
      .values({
        applicationId: application.id,
        environmentId: environment.id,
        version: input.version,
        commitSha: input.commitSha,
        status: 'PENDING',
        triggeredBy: userId,
      })
      .returning();

    const deployment: Deployment = {
        status: result.status,
        id: result.id,
        createdAt: result.createdAt,
        applicationId: result.applicationId,
        environmentId: result.environmentId,
        version: result.version,
        commitSha: result.commitSha,
        triggeredBy: result.triggeredBy,
        startedAt: result.startedAt,
        finishedAt: result.finishedAt,
    };

    logger.info(
      { userId, deploymentId: deployment.id, applicationId: application.id, version: input.version },
      'Deployment created, scheduling execution',
    );

    // Fire and forget - the HTTP request returns immediately
    // Future: replace this with a queue push (BullMQ, RabbitMQ, Kafka)
    setImmediate(() => {
      deploymentWorker.execute(deployment, application, environment).catch((err) => {
        logger.error({ deploymentId: deployment.id, err }, 'Worker execution error');
      });
    });

    return deployment;
  }

  async listByEnvironment(userId: string, environmentId: string): Promise<Deployment[]> {
    await this.verifyEnvironmentOwnership(userId, environmentId);

    const result = await db
      .select()
      .from(deployments)
      .where(eq(deployments.environmentId, environmentId))
      .orderBy(desc(deployments.createdAt));

    return result.map((r) => ({
        status: r.status,
        id: r.id,
        createdAt: r.createdAt,
        applicationId: r.applicationId,
        environmentId: r.environmentId,
        version: r.version,
        commitSha: r.commitSha,
        triggeredBy: r.triggeredBy,
        startedAt: r.startedAt,
        finishedAt: r.finishedAt,
    }));
  }

  async listAll(userId: string): Promise<Array<Deployment & { applicationName: string; environmentName: string }>> {
    const results = await db
      .select({
        deployment: deployments,
        applicationName: applications.name,
        environmentName: environments.name,
      })
      .from(deployments)
      .innerJoin(applications, eq(deployments.applicationId, applications.id))
      .innerJoin(environments, eq(deployments.environmentId, environments.id))
      .where(eq(applications.createdBy, userId))
      .orderBy(desc(deployments.createdAt))
      .limit(100);

    return results.map((r) => ({
      ...r.deployment,
      applicationName: r.applicationName,
      environmentName: r.environmentName,
    }));
  }

  async getById(userId: string, deploymentId: string): Promise<Deployment & { applicationName: string; environmentName: string; triggeredByName: string }> {
    const [result] = await db
      .select({
        deployment: deployments,
        applicationName: applications.name,
        environmentName: environments.name,
        triggeredByName: users.name,
      })
      .from(deployments)
      .innerJoin(applications, eq(deployments.applicationId, applications.id))
      .innerJoin(environments, eq(deployments.environmentId, environments.id))
      .innerJoin(users, eq(deployments.triggeredBy, users.id))
      .where(
        and(eq(deployments.id, deploymentId), eq(applications.createdBy, userId)),
      )
      .limit(1);

    if (!result) {
      throw new AppError('DEPLOYMENT_NOT_FOUND', 'Deployment not found', 404);
    }

    return {
      ...result.deployment,
      applicationName: result.applicationName,
      environmentName: result.environmentName,
      triggeredByName: result.triggeredByName,
    };
  }

  async getLogs(userId: string, deploymentId: string): Promise<DeploymentLog[]> {
    // Verify ownership first
    await this.getById(userId, deploymentId);

    const result = await db
      .select()
      .from(deploymentLogs)
      .where(eq(deploymentLogs.deploymentId, deploymentId))
      .orderBy(deploymentLogs.timestamp);

    return result.map((r) => ({
        message: r.message,
        id: r.id,
        deploymentId: r.deploymentId,
        level: r.level,
        timestamp: r.timestamp,
    }));
  }

  async getDashboardStats(userId: string): Promise<{
    totalApplications: number;
    runningDeployments: number;
    successfulDeployments: number;
    failedDeployments: number;
    recentDeployments: Array<Deployment & { applicationName: string; environmentName: string }>;
  }> {
    const [apps, allDeps] = await Promise.all([
      db
        .select({ count: applications.id })
        .from(applications)
        .where(eq(applications.createdBy, userId)),
      db
        .select({
          deployment: deployments,
          applicationName: applications.name,
          environmentName: environments.name,
        })
        .from(deployments)
        .innerJoin(applications, eq(deployments.applicationId, applications.id))
        .innerJoin(environments, eq(deployments.environmentId, environments.id))
        .where(eq(applications.createdBy, userId))
        .orderBy(desc(deployments.createdAt))
        .limit(50),
    ]);

    const totalApplications = apps.length;
    const runningDeployments = allDeps.filter((d) => d.deployment.status === 'RUNNING').length;
    const successfulDeployments = allDeps.filter((d) => d.deployment.status === 'SUCCESS').length;
    const failedDeployments = allDeps.filter((d) => d.deployment.status === 'FAILED').length;
    const recentDeployments = allDeps.slice(0, 10).map((d) => ({
      ...d.deployment,
      applicationName: d.applicationName,
      environmentName: d.environmentName,
    }));

    return {
      totalApplications,
      runningDeployments,
      successfulDeployments,
      failedDeployments,
      recentDeployments,
    };
  }
}

export const deploymentsService = new DeploymentsService();
