import { db } from '../../db/connection';
import { applications } from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import { AppError } from '../../utils/errors';
import { logger } from '../../config/logger';
import type { CreateApplicationInput, UpdateApplicationInput } from './applications.types';
import type { Application } from '../../db/schema';

export class ApplicationsService {
  async create(userId: string, input: CreateApplicationInput): Promise<Application> {
    const [app] = await db
      .insert(applications)
      .values({
        ...input,
        createdBy: userId,
      })
      .returning();

    logger.info({ userId, applicationId: app.id }, 'Application created');
    return app;
  }

  async list(userId: string): Promise<Application[]> {
    return db
      .select()
      .from(applications)
      .where(eq(applications.createdBy, userId))
      .orderBy(applications.createdAt);
  }

  async getById(userId: string, applicationId: string): Promise<Application> {
    const [app] = await db
      .select()
      .from(applications)
      .where(
        and(eq(applications.id, applicationId), eq(applications.createdBy, userId)),
      )
      .limit(1);

    if (!app) {
      throw new AppError('APPLICATION_NOT_FOUND', 'Application not found', 404);
    }

    return app;
  }

  async update(
    userId: string,
    applicationId: string,
    input: UpdateApplicationInput,
  ): Promise<Application> {
    // Verify ownership
    await this.getById(userId, applicationId);

    const [updated] = await db
      .update(applications)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(applications.id, applicationId))
      .returning();

    logger.info({ userId, applicationId }, 'Application updated');
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
