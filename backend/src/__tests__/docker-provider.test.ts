import { DockerDeploymentProvider } from '../services/docker-deployment.provider';
import { DockerMonitoringProvider } from '../services/docker-monitoring.provider';
import { DockerLoggingProvider } from '../services/docker-logging.provider';
import { resolveDeploymentProvider } from '../services/deployment-provider.resolver';
import { resolveMonitoringProvider } from '../services/monitoring-provider.resolver';
import { resolveLoggingProvider } from '../services/logging-provider.resolver';
import { cleanDb } from './setup';
import { db } from '../db/connection';
import { users, applications, environments, deployments } from '../db/schema';
import type { Environment, Application, Deployment } from '../db/schema';
import Docker from 'dockerode';

describe('Docker Providers and Resolvers', () => {
  const docker = new Docker({ socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock' });
  let testUser: any;
  let testApp: Application;
  let testEnv: Environment;
  let testDep: Deployment;

  beforeAll(async () => {
    await cleanDb();

    [testUser] = await db
      .insert(users)
      .values({
        email: 'docker-test@example.com',
        name: 'Docker Tester',
        passwordHash: 'dummyhash',
      })
      .returning();

    [testApp] = await db
      .insert(applications)
      .values({
        name: 'docker-app',
        repositoryUrl: 'https://github.com/org/docker-app',
        repositoryOwner: 'org',
        repositoryName: 'docker-app',
        defaultBranch: 'main',
        createdBy: testUser.id,
      })
      .returning();

    [testEnv] = await db
      .insert(environments)
      .values({
        applicationId: testApp.id,
        name: 'docker-prod',
        sreProfile: 'basic',
        provider: 'docker',
        targetConfig: {
          containerName: 'sre-test-web-container',
          network: 'bridge',
          portBindings: [{ hostPort: 18080, containerPort: 80 }],
          healthCheck: {
            path: '/',
            port: 18080,
          },
        },
      })
      .returning();

    [testDep] = await db
      .insert(deployments)
      .values({
        applicationId: testApp.id,
        environmentId: testEnv.id,
        version: 'v1.0.0',
        commitSha: 'a'.repeat(40),
        status: 'PENDING',
        triggeredBy: testUser.id,
      })
      .returning();
  });

  afterAll(async () => {
    // Cleanup any created containers
    try {
      const container = docker.getContainer('sre-test-web-container');
      await container.stop({ t: 1 }).catch(() => {});
      await container.remove({ force: true }).catch(() => {});
    } catch {}
    await cleanDb();
  });

  const dummyK8sEnv: Environment = {
    id: '33333333-3333-3333-3333-333333333333',
    applicationId: '11111111-1111-1111-1111-111111111111',
    name: 'k8s-prod',
    sreProfile: 'standard',
    provider: 'kubernetes',
    targetConfig: {
      clusterName: 'kind-sre-copilot',
      namespace: 'sre-demo',
      deploymentName: 'demo-app',
      containerName: 'app',
    },
    clusterName: 'kind-sre-copilot',
    namespace: 'sre-demo',
    deploymentName: 'demo-app',
    containerName: 'app',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe('Provider Resolvers', () => {
    it('should resolve DockerDeploymentProvider when provider is docker and DEPLOYMENT_PROVIDER is dynamic', () => {
      const provider = resolveDeploymentProvider(testEnv);
      expect(provider).toBeInstanceOf(DockerDeploymentProvider);
    });

    it('should resolve KubernetesDeploymentProvider when provider is kubernetes and DEPLOYMENT_PROVIDER is dynamic', () => {
      const provider = resolveDeploymentProvider(dummyK8sEnv);
      expect(provider.constructor.name).toBe('KubernetesDeploymentProvider');
    });

    it('should resolve DockerMonitoringProvider for docker environment', () => {
      const provider = resolveMonitoringProvider(testEnv);
      expect(provider).toBeInstanceOf(DockerMonitoringProvider);
    });

    it('should resolve KubernetesMonitoringProvider for kubernetes environment', () => {
      const provider = resolveMonitoringProvider(dummyK8sEnv);
      expect(provider.constructor.name).toBe('KubernetesMonitoringProvider');
    });

    it('should resolve DockerLoggingProvider for docker environment', () => {
      const provider = resolveLoggingProvider(testEnv);
      expect(provider).toBeInstanceOf(DockerLoggingProvider);
    });

    it('should resolve KubernetesLoggingProvider for kubernetes environment', () => {
      const provider = resolveLoggingProvider(dummyK8sEnv);
      expect(provider.constructor.name).toBe('KubernetesLoggingProvider');
    });
  });

  describe('DockerLoggingProvider Parser', () => {
    it('should parse multiplexed Docker stream buffer into structured entries', async () => {
      const loggingProvider = new DockerLoggingProvider();

      const msg1 = '2026-11-03T12:00:00.000Z Starting web server on port 8080\n';
      const msg1Buf = Buffer.from(msg1, 'utf-8');
      const header1 = Buffer.alloc(8);
      header1.writeUInt8(1, 0); // stdout
      header1.writeUInt32BE(msg1Buf.length, 4);

      const msg2 = '2026-11-03T12:00:01.000Z [WARN] Cache miss for key user:10\n';
      const msg2Buf = Buffer.from(msg2, 'utf-8');
      const header2 = Buffer.alloc(8);
      header2.writeUInt8(2, 0); // stderr
      header2.writeUInt32BE(msg2Buf.length, 4);

      const fullBuffer = Buffer.concat([header1, msg1Buf, header2, msg2Buf]);

      const entries = (loggingProvider as any).parseDockerLogs(fullBuffer);
      expect(entries).toHaveLength(2);
      expect(entries[0].stream).toBe('stdout');
      expect(entries[0].message).toBe('Starting web server on port 8080');
      expect(entries[0].timestamp).toBe('2026-11-03T12:00:00.000Z');

      expect(entries[1].stream).toBe('stderr');
      expect(entries[1].message).toBe('[WARN] Cache miss for key user:10');
      expect(entries[1].timestamp).toBe('2026-11-03T12:00:01.000Z');
    });

    it('should parse plain string logs if container is non-multiplexed', () => {
      const loggingProvider = new DockerLoggingProvider();
      const raw = '2026-11-03T12:05:00.000Z Connected to database\n2026-11-03T12:05:01.000Z Ready to accept traffic\n';
      const entries = (loggingProvider as any).parseDockerLogs(raw);
      expect(entries).toHaveLength(2);
      expect(entries[0].message).toBe('Connected to database');
      expect(entries[1].message).toBe('Ready to accept traffic');
    });
  });

  describe('DockerMonitoringProvider', () => {
    it('should return stopped metrics gracefully when container does not exist', async () => {
      const monitoringProvider = new DockerMonitoringProvider();
      const nonexistentEnv: Environment = {
        ...testEnv,
        targetConfig: { containerName: 'non-existent-container-xyz-999' },
      };

      const metrics = await monitoringProvider.getMetrics(nonexistentEnv);
      expect(metrics.status).toBe('stopped');
      expect(metrics.uptimeSeconds).toBe(0);
      expect(metrics.cpuPercent).toBeNull();
      expect(metrics.memoryPercent).toBeNull();
      expect(metrics.healthStatus).toBe('none');
      expect(metrics.collectedAt).toBeDefined();
    });
  });

  describe('Docker Deployment Lifecycle & Rollback', () => {
    it('should fail fast with descriptive error if image cannot be pulled', async () => {
      const deploymentProvider = new DockerDeploymentProvider();
      const result = await deploymentProvider.deploy({
        deploymentId: testDep.id,
        application: testApp,
        environment: {
          ...testEnv,
          targetConfig: {
            containerName: 'test-invalid-pull-container',
          },
        },
        version: 'bad:::invalid:::image:::tag',
        commitSha: 'a'.repeat(40),
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to pull image');
    }, 5000);

    it('should successfully deploy an nginx container, verify readiness, and inspect live metrics', async () => {
      const deploymentProvider = new DockerDeploymentProvider();
      const result = await deploymentProvider.deploy({
        deploymentId: testDep.id,
        application: testApp,
        environment: testEnv,
        version: 'nginx:alpine',
        commitSha: 'b'.repeat(40),
      });

      expect(result.success).toBe(true);

      // Now verify metrics through DockerMonitoringProvider
      const monitoringProvider = new DockerMonitoringProvider();
      const metrics = await monitoringProvider.getMetrics(testEnv);
      expect(metrics.status).toBe('running');
      expect(metrics.uptimeSeconds).toBeGreaterThanOrEqual(0);
      expect(metrics.httpProbe?.status).toBe('ok');
      expect(metrics.httpProbe?.statusCode).toBe(200);

      // Verify logs through DockerLoggingProvider
      const loggingProvider = new DockerLoggingProvider();
      const logs = await loggingProvider.getContainerLogs(testEnv, 20);
      expect(Array.isArray(logs)).toBe(true);
    }, 45000);

    it('should trigger automatic rollback if replacement container fails readiness or crashes', async () => {
      // Current running container is nginx (sre-test-web-container)
      // Attempt deploying a crashing container with the same name
      const deploymentProvider = new DockerDeploymentProvider();
      const result = await deploymentProvider.deploy({
        deploymentId: testDep.id,
        application: testApp,
        environment: {
          ...testEnv,
          targetConfig: {
            ...testEnv.targetConfig,
            containerName: 'sre-test-web-container',
            healthCheck: {
              path: '/nonexistent-health-endpoint-fail',
              port: 18080,
            },
          },
        },
        // Alpine with exit 1 immediately crashes
        version: 'alpine:latest',
        commitSha: 'c'.repeat(40),
      });

      // Rollout must fail
      expect(result.success).toBe(false);

      // Previous healthy container (nginx) should be automatically rolled back and running!
      const monitoringProvider = new DockerMonitoringProvider();
      const metrics = await monitoringProvider.getMetrics(testEnv);
      expect(metrics.status).toBe('running');
      expect(metrics.httpProbe?.status).toBe('ok');
    }, 45000);
  });
});
