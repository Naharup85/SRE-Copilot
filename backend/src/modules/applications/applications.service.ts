import { db } from '../../db/connection';
import { applications } from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import { AppError } from '../../utils/errors';
import { logger } from '../../config/logger';
import type { CreateApplicationInput, UpdateApplicationInput } from './applications.types';
import type { Application } from '../../db/schema';

export class ApplicationsService {
  async create(userId: string, input: CreateApplicationInput): Promise<Application> {
    const [result] = await db
      .insert(applications)
      .values({
        ...input,
        createdBy: userId,
      })
      .returning();

    const app: Application = {
      id: result.id,
      name: result.name,
      description: result.description,
      createdBy: result.createdBy,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
      repositoryUrl: result.repositoryUrl,
      repositoryOwner: result.repositoryOwner,
      repositoryName: result.repositoryName,
      defaultBranch: result.defaultBranch,
    };
    logger.info({ userId, applicationId: app.id }, 'Application created');
    return app;
  }

  async list(userId: string): Promise<Application[]> {
    const result= await db
      .select()
      .from(applications)
      .where(eq(applications.createdBy, userId))
      .orderBy(applications.createdAt);
    
    return result.map((app:Application)=>{
      return {
        id: app.id,
        name: app.name,
        description: app.description,
        createdBy: app.createdBy,
        createdAt: app.createdAt,
        updatedAt: app.updatedAt,
        repositoryUrl: app.repositoryUrl,
        repositoryOwner: app.repositoryOwner,
        repositoryName: app.repositoryName,
        defaultBranch: app.defaultBranch,
      };
    });
  }

  async getById(userId: string, applicationId: string): Promise<Application> {
    const [result] = await db
      .select()
      .from(applications)
      .where(
        and(eq(applications.id, applicationId), eq(applications.createdBy, userId)),
      )
      .limit(1);

    if (!result) {
      throw new AppError('APPLICATION_NOT_FOUND', 'Application not found', 404);
    }

    const app: Application = {
      id: result.id,
      name: result.name,
      description: result.description,
      createdBy: result.createdBy,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
      repositoryUrl: result.repositoryUrl,
      repositoryOwner: result.repositoryOwner,
      repositoryName: result.repositoryName,
      defaultBranch: result.defaultBranch,
    };

    return app;
  }

  async update(
    userId: string,
    applicationId: string,
    input: UpdateApplicationInput,
  ): Promise<Application> {
    // Verify ownership
    await this.getById(userId, applicationId);

    const [result] = await db
      .update(applications)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(applications.id, applicationId))
      .returning();

    logger.info({ userId, applicationId }, 'Application updated');
    const updated: Application = {
      id: result.id,
      name: result.name,
      description: result.description,
      createdBy: result.createdBy,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
      repositoryUrl: result.repositoryUrl,
      repositoryOwner: result.repositoryOwner,
      repositoryName: result.repositoryName,
      defaultBranch: result.defaultBranch,
    };
    return updated;
  }

  async delete(userId: string, applicationId: string): Promise<void> {
    // Verify ownership
    await this.getById(userId, applicationId);

    await db.delete(applications).where(eq(applications.id, applicationId));

    logger.info({ userId, applicationId }, 'Application deleted');
  }
}

export const applicationsService = new ApplicationsService();
