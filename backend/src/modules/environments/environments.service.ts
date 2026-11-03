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

    const provider = input.provider || 'kubernetes';
    const sreProfile = input.sreProfile || 'basic';

    // Normalize targetConfig
    let targetConfig = input.targetConfig || {};
    if (provider === 'kubernetes') {
      targetConfig = {
        clusterName: input.clusterName || targetConfig.clusterName || 'default',
        namespace: input.namespace || targetConfig.namespace || 'default',
        deploymentName: input.deploymentName || targetConfig.deploymentName,
        containerName: input.containerName || targetConfig.containerName,
        ...targetConfig,
      };
    } else if (provider === 'docker') {
      targetConfig = {
        containerName: input.containerName || targetConfig.containerName,
        network: targetConfig.network || 'bridge',
        portBindings: targetConfig.portBindings || [],
        secretRefs: targetConfig.secretRefs || {},
        envVars: targetConfig.envVars || {},
        healthCheck: targetConfig.healthCheck,
        ...targetConfig,
      };
    }

    const [result] = await db
      .insert(environments)
      .values({
        applicationId,
        name: input.name,
        sreProfile,
        provider,
        targetConfig,
        clusterName: input.clusterName || targetConfig.clusterName || null,
        namespace: input.namespace || targetConfig.namespace || null,
        deploymentName: input.deploymentName || targetConfig.deploymentName || null,
        containerName: input.containerName || targetConfig.containerName || null,
      })
      .returning();

    logger.info({ userId, applicationId, environmentId: result.id, provider, sreProfile }, 'Environment created');

    return result;
  }

  async listByApplication(userId: string, applicationId: string): Promise<Environment[]> {
    await this.verifyApplicationOwnership(userId, applicationId);

    return db
      .select()
      .from(environments)
      .where(eq(environments.applicationId, applicationId))
      .orderBy(environments.createdAt);
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

    // Verify ownership through application
    await this.verifyApplicationOwnership(userId, result.applicationId);

    return result;
  }

  async update(
    userId: string,
    environmentId: string,
    input: UpdateEnvironmentInput,
  ): Promise<Environment> {
    const current = await this.getById(userId, environmentId);

    let targetConfig = input.targetConfig || current.targetConfig || {};

    if (input.targetConfig) {
      targetConfig = { ...current.targetConfig, ...input.targetConfig };
    }

    const [result] = await db
      .update(environments)
      .set({
        ...input,
        targetConfig,
        updatedAt: new Date(),
      })
      .where(eq(environments.id, environmentId))
      .returning();

    logger.info({ userId, environmentId }, 'Environment updated');
    return result;
  }

  async delete(userId: string, environmentId: string): Promise<void> {
    await this.getById(userId, environmentId);

    await db.delete(environments).where(eq(environments.id, environmentId));

    logger.info({ userId, environmentId }, 'Environment deleted');
  }
}

export const environmentsService = new EnvironmentsService();
