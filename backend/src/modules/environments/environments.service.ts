import { db } from '../../db/connection';
import { environments, applications } from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import { AppError } from '../../utils/errors';
import { logger } from '../../config/logger';
import type { CreateEnvironmentInput, UpdateEnvironmentInput } from './environments.types';
import type { Environment } from '../../db/schema';

export class EnvironmentsService {
  private async verifyApplicationOwnership(userId: string, applicationId: string): Promise<void> {
    const [app] = await db
      .select({ id: applications.id })
      .from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.createdBy, userId)))
      .limit(1);

    if (!app) {
      throw new AppError('APPLICATION_NOT_FOUND', 'Application not found', 404);
    }
  }

  async create(userId: string, applicationId: string, input: CreateEnvironmentInput): Promise<Environment> {
    await this.verifyApplicationOwnership(userId, applicationId);

    const [result] = await db
      .insert(environments)
      .values({ ...input, applicationId })
      .returning();

    logger.info({ userId, applicationId, environmentId: result.id }, 'Environment created');

    const env: Environment = {
      id: result.id,
      name: result.name,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
      applicationId: result.applicationId,
      clusterName: result.clusterName,
      namespace: result.namespace,
      deploymentName: result.deploymentName,
      containerName: result.containerName,
    };
    return env;
  }

  async listByApplication(userId: string, applicationId: string): Promise<Environment[]> {
    await this.verifyApplicationOwnership(userId, applicationId);

    const result = await db
      .select()
      .from(environments)
      .where(eq(environments.applicationId, applicationId))
      .orderBy(environments.createdAt);

    return result.map((env: Environment) => {
      return {
        id: env.id,
        name: env.name,
        createdAt: env.createdAt,
        updatedAt: env.updatedAt,
        applicationId: env.applicationId,
        clusterName: env.clusterName,
        namespace: env.namespace,
        deploymentName: env.deploymentName,
        containerName: env.containerName,
      };
    });
  }

  async getById(userId: string, environmentId: string): Promise<Environment> {
    const [result] = await db
      .select()
      .from(environments)
      .where(eq(environments.id, environmentId))
      .limit(1);

    if (!result) {
      throw new AppError('ENVIRONMENT_NOT_FOUND', 'Environment not found', 404);
    }
    const env: Environment = {
      id: result.id,
      name: result.name,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
      applicationId: result.applicationId,
      clusterName: result.clusterName,
      namespace: result.namespace,
      deploymentName: result.deploymentName,
      containerName: result.containerName,
    };
    // Verify ownership through application
    await this.verifyApplicationOwnership(userId, env.applicationId);

    return env;
  }

  async update(
    userId: string,
    environmentId: string,
    input: UpdateEnvironmentInput,
  ): Promise<Environment> {
    await this.getById(userId, environmentId);

    const [result] = await db
      .update(environments)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(environments.id, environmentId))
      .returning();

    const env: Environment = {
      id: result.id,
      name: result.name,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
      applicationId: result.applicationId,
      clusterName: result.clusterName,
      namespace: result.namespace,
      deploymentName: result.deploymentName,
      containerName: result.containerName,
    };
    logger.info({ userId, environmentId }, 'Environment updated');
    return env;
  }

  async delete(userId: string, environmentId: string): Promise<void> {
    await this.getById(userId, environmentId);

    await db.delete(environments).where(eq(environments.id, environmentId));

    logger.info({ userId, environmentId }, 'Environment deleted');
  }
}

export const environmentsService = new EnvironmentsService();
