import { db } from '../db/connection';
import { deploymentLogs } from '../db/schema';
import type { LogEmitter } from './deployment-provider.interface';
import type { LogLevel } from '../db/schema';

export class DatabaseLogEmitter implements LogEmitter {
  async emit(deploymentId: string, level: LogLevel, message: string): Promise<void> {
    await db.insert(deploymentLogs).values({
      deploymentId,
      level,
      message,
      timestamp: new Date(),
    });
  }
}
