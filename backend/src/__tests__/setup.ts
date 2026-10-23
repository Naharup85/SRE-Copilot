import request from 'supertest';
import app from '../index';
import { db } from '../db/connection';
import { users, applications, environments, deployments, deploymentLogs } from '../db/schema';

// Test database cleanup helpers
export async function cleanDb(): Promise<void> {
  await db.delete(deploymentLogs);
  await db.delete(deployments);
  await db.delete(environments);
  await db.delete(applications);
  await db.delete(users);
}

export const testApi = request(app);
