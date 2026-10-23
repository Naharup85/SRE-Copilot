import { db, pool } from './connection';
import { users, applications, environments, deployments, deploymentLogs } from './schema';
import { logger } from '../config/logger';
import argon2 from 'argon2';

async function seed(): Promise<void> {
  logger.info('🌱 Starting database seed (DEVELOPMENT ONLY)...');

  try {
    // Clean existing data
    await db.delete(deploymentLogs);
    await db.delete(deployments);
    await db.delete(environments);
    await db.delete(applications);
    await db.delete(users);

    // Create demo user
    const passwordHash = await argon2.hash('Demo1234!');
    const [demoUser] = await db
      .insert(users)
      .values({
        email: 'demo@example.com',
        passwordHash,
        name: 'Demo User',
      })
      .returning();

    logger.info(`Created demo user: ${demoUser.email}`);

    // Create demo application
    const [demoApp] = await db
      .insert(applications)
      .values({
        name: 'demo-api',
        description: 'A demo REST API application for SRE Copilot development',
        repositoryUrl: 'https://github.com/example/demo-api',
        repositoryOwner: 'example',
        repositoryName: 'demo-api',
        defaultBranch: 'main',
        createdBy: demoUser.id,
      })
      .returning();

    logger.info(`Created demo application: ${demoApp.name}`);

    // Create development environment
    const [devEnv] = await db
      .insert(environments)
      .values({
        applicationId: demoApp.id,
        name: 'development',
        clusterName: 'local-cluster',
        namespace: 'sre-demo',
        deploymentName: 'demo-api',
        containerName: 'api',
      })
      .returning();

    // Create staging environment
    const [stagingEnv] = await db
      .insert(environments)
      .values({
        applicationId: demoApp.id,
        name: 'staging',
        clusterName: 'staging-cluster',
        namespace: 'sre-demo-staging',
        deploymentName: 'demo-api',
        containerName: 'api',
      })
      .returning();

    logger.info(`Created environments: ${devEnv.name}, ${stagingEnv.name}`);

    // Create some demo deployments
    const [dep1] = await db
      .insert(deployments)
      .values({
        applicationId: demoApp.id,
        environmentId: devEnv.id,
        version: 'v1.0.0',
        commitSha: 'abc1234567890def1234567890abcdef12345678',
        status: 'SUCCESS',
        triggeredBy: demoUser.id,
        startedAt: new Date(Date.now() - 3600000),
        finishedAt: new Date(Date.now() - 3540000),
      })
      .returning();

    await db.insert(deploymentLogs).values([
      {
        deploymentId: dep1.id,
        level: 'INFO',
        message: 'Deployment started',
        timestamp: new Date(Date.now() - 3600000),
      },
      {
        deploymentId: dep1.id,
        level: 'INFO',
        message: 'Updating Kubernetes deployment: demo-api in namespace: sre-demo',
        timestamp: new Date(Date.now() - 3595000),
      },
      {
        deploymentId: dep1.id,
        level: 'INFO',
        message: 'Container image updated to: ghcr.io/example/demo-api:v1.0.0',
        timestamp: new Date(Date.now() - 3580000),
      },
      {
        deploymentId: dep1.id,
        level: 'INFO',
        message: 'Waiting for rollout to complete...',
        timestamp: new Date(Date.now() - 3570000),
      },
      {
        deploymentId: dep1.id,
        level: 'INFO',
        message: 'Rollout completed successfully. 2/2 replicas available.',
        timestamp: new Date(Date.now() - 3545000),
      },
      {
        deploymentId: dep1.id,
        level: 'INFO',
        message: 'Deployment completed successfully',
        timestamp: new Date(Date.now() - 3540000),
      },
    ]);

    const [dep2] = await db
      .insert(deployments)
      .values({
        applicationId: demoApp.id,
        environmentId: devEnv.id,
        version: 'v1.1.0',
        commitSha: 'def4567890abcdef1234567890abcdef12345678',
        status: 'FAILED',
        triggeredBy: demoUser.id,
        startedAt: new Date(Date.now() - 1800000),
        finishedAt: new Date(Date.now() - 1740000),
      })
      .returning();

    await db.insert(deploymentLogs).values([
      {
        deploymentId: dep2.id,
        level: 'INFO',
        message: 'Deployment started',
        timestamp: new Date(Date.now() - 1800000),
      },
      {
        deploymentId: dep2.id,
        level: 'INFO',
        message: 'Updating Kubernetes deployment: demo-api in namespace: sre-demo',
        timestamp: new Date(Date.now() - 1795000),
      },
      {
        deploymentId: dep2.id,
        level: 'ERROR',
        message: 'Rollout failed: Pod demo-api-xxx CrashLoopBackOff - Exit code 1',
        timestamp: new Date(Date.now() - 1750000),
      },
      {
        deploymentId: dep2.id,
        level: 'ERROR',
        message: 'Deployment failed: rollout did not complete within timeout',
        timestamp: new Date(Date.now() - 1740000),
      },
    ]);

    logger.info(`Created ${2} demo deployments with logs`);
    logger.info('✅ Seed completed successfully');
    logger.info('');
    logger.info('Demo credentials:');
    logger.info('  Email: demo@example.com');
    logger.info('  Password: Demo1234!');
  } catch (error) {
    logger.error('❌ Seed failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
