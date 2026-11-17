import request from 'supertest';
import { createApplication } from '../app';
import { cleanDb } from './setup';
import { pool } from '../db/connection';
import {
  DockerMonitoringProvider,
} from '../services/docker-monitoring.provider';
import {
  KubernetesMonitoringProvider,
  parseCpuQuantity,
  parseMemoryQuantity,
} from '../services/kubernetes-monitoring.provider';
import type { Environment } from '../db/schema';

const app = createApplication();
const api = request(app);

async function createUserAndToken(
  email = 'runtime-metrics@example.com',
  name = 'Metrics Tester',
): Promise<{ token: string; userId: string }> {
  const res = await api.post('/api/v1/auth/register').send({
    email,
    password: 'TestPassword123!',
    name,
  });
  return { token: res.body.data.token, userId: res.body.data.id };
}

describe('Phase 2.2 — Runtime Infrastructure Metrics', () => {
  let userToken: string;
  let otherUserToken: string;
  let appId: string;
  let dockerEnvId: string;
  let k8sEnvId: string;

  beforeAll(async () => {
    await cleanDb();

    const user1 = await createUserAndToken('metrics-user1@example.com', 'User 1');
    userToken = user1.token;

    const user2 = await createUserAndToken('metrics-user2@example.com', 'User 2');
    otherUserToken = user2.token;

    const appRes = await api
      .post('/api/v1/applications')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        name: 'metrics-demo-app',
        description: 'Test application for Phase 2.2 runtime metrics',
        repositoryUrl: 'https://github.com/example/metrics-demo-app',
        repositoryOwner: 'example',
        repositoryName: 'metrics-demo-app',
        defaultBranch: 'main',
      });
    appId = appRes.body.data.id;

    const dockerEnvRes = await api
      .post(`/api/v1/applications/${appId}/environments`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        name: 'docker-env',
        sreProfile: 'basic',
        provider: 'docker',
        containerName: 'mock-test-container',
        targetConfig: {
          containerName: 'mock-test-container',
          network: 'bridge',
        },
      });
    dockerEnvId = dockerEnvRes.body.data.id;

    const k8sEnvRes = await api
      .post(`/api/v1/applications/${appId}/environments`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        name: 'k8s-env',
        sreProfile: 'standard',
        provider: 'kubernetes',
        clusterName: 'kind-sre-copilot',
        namespace: 'sre-demo',
        deploymentName: 'demo-api',
        containerName: 'api',
      });
    k8sEnvId = k8sEnvRes.body.data.id;
  });

  afterAll(async () => {
    await cleanDb();
    await pool.end();
  });

  describe('1. Kubernetes Quantity Parsing Helpers', () => {
    it('should parse CPU quantities correctly (nanocores, millicores, microcores, raw numbers)', () => {
      expect(parseCpuQuantity('2500000n')).toBeCloseTo(0.0025, 6);
      expect(parseCpuQuantity('500m')).toBe(0.5);
      expect(parseCpuQuantity('2500u')).toBe(0.0025);
      expect(parseCpuQuantity('2')).toBe(2);
      expect(parseCpuQuantity('1.5')).toBe(1.5);
      expect(parseCpuQuantity(null)).toBeNull();
      expect(parseCpuQuantity(undefined)).toBeNull();
      expect(parseCpuQuantity('invalid')).toBeNull();
    });

    it('should parse Memory quantities correctly (Ki, Mi, Gi, Ti, bytes)', () => {
      expect(parseMemoryQuantity('1024Ki')).toBe(1024 * 1024);
      expect(parseMemoryQuantity('64Mi')).toBe(64 * 1024 * 1024);
      expect(parseMemoryQuantity('2Gi')).toBe(2 * 1024 * 1024 * 1024);
      expect(parseMemoryQuantity('1000k')).toBe(1000 * 1000);
      expect(parseMemoryQuantity('1048576')).toBe(1048576);
      expect(parseMemoryQuantity(null)).toBeNull();
      expect(parseMemoryQuantity(undefined)).toBeNull();
      expect(parseMemoryQuantity('not-a-number')).toBeNull();
    });
  });

  describe('2. DockerMonitoringProvider Unit & Edge Cases', () => {
    const dummyEnv: Environment = {
      id: 'env-1',
      applicationId: 'app-1',
      name: 'prod',
      sreProfile: 'basic',
      provider: 'docker',
      targetConfig: { containerName: 'test-container' },
      clusterName: null,
      namespace: null,
      deploymentName: null,
      containerName: 'test-container',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should calculate CPU percentage, memory, network and storage for running container', async () => {
      const mockContainer = {
        inspect: jest.fn().mockResolvedValue({
          State: {
            Running: true,
            StartedAt: new Date(Date.now() - 3600 * 1000).toISOString(),
            Health: { Status: 'healthy' },
            ExitCode: 0,
          },
          RestartCount: 2,
        }),
        stats: jest.fn().mockResolvedValue({
          cpu_stats: {
            cpu_usage: { total_usage: 200000000 },
            system_cpu_usage: 1000000000,
            online_cpus: 2,
          },
          precpu_stats: {
            cpu_usage: { total_usage: 100000000 },
            system_cpu_usage: 500000000,
          },
          memory_stats: {
            usage: 50 * 1024 * 1024,
            limit: 512 * 1024 * 1024,
            stats: { inactive_file: 2 * 1024 * 1024 },
          },
          networks: {
            eth0: { rx_bytes: 1250000, tx_bytes: 850000 },
            eth1: { rx_bytes: 250000, tx_bytes: 150000 },
          },
          blkio_stats: {
            io_service_bytes_recursive: [
              { op: 'Read', value: 300000 },
              { op: 'Write', value: 150000 },
            ],
          },
        }),
      };

      const mockDocker = {
        getContainer: jest.fn().mockReturnValue(mockContainer),
      } as any;

      const provider = new DockerMonitoringProvider();
      (provider as any).docker = mockDocker;

      const metrics = await provider.getMetrics(dummyEnv);

      expect(metrics.status).toBe('running');
      expect(metrics.healthStatus).toBe('healthy');
      expect(metrics.uptimeSeconds).toBeGreaterThanOrEqual(3599);
      expect(metrics.restartCount).toBe(2);

      // CPU: ((100M / 500M) * 2 * 100) = 40.00%
      expect(metrics.cpuPercent).toBe(40.0);
      expect(metrics.availability.cpu).toBe('available');

      // Memory: usage (50MB - 2MB inactive_file) = 48MB
      expect(metrics.memoryUsageBytes).toBe(48 * 1024 * 1024);
      expect(metrics.memoryLimitBytes).toBe(512 * 1024 * 1024);
      expect(metrics.memoryPercent).toBeCloseTo((48 / 512) * 100, 1);
      expect(metrics.availability.memory).toBe('available');

      // Network: rx = 1.5MB, tx = 1.0MB
      expect(metrics.network).toEqual({
        receivedBytes: 1500000,
        transmittedBytes: 1000000,
      });
      expect(metrics.availability.network).toBe('available');

      // Storage: Read = 300KB, Write = 150KB
      expect(metrics.storage).toEqual({
        readBytes: 300000,
        writeBytes: 150000,
      });
      expect(metrics.availability.storage).toBe('available');
    });

    it('should handle unlimited memory limits safely (limit > 1e16 or 0)', async () => {
      const mockContainer = {
        inspect: jest.fn().mockResolvedValue({
          State: { Running: true, StartedAt: new Date().toISOString() },
        }),
        stats: jest.fn().mockResolvedValue({
          cpu_stats: { cpu_usage: { total_usage: 100 }, system_cpu_usage: 1000 },
          precpu_stats: { cpu_usage: { total_usage: 50 }, system_cpu_usage: 500 },
          memory_stats: {
            usage: 25 * 1024 * 1024,
            limit: 9223372036854771712, // 64-bit max int
          },
        }),
      };

      const mockDocker = { getContainer: jest.fn().mockReturnValue(mockContainer) } as any;
      const provider = new DockerMonitoringProvider();
      (provider as any).docker = mockDocker;

      const metrics = await provider.getMetrics(dummyEnv);
      expect(metrics.memoryUsageBytes).toBe(25 * 1024 * 1024);
      expect(metrics.memoryLimitBytes).toBeNull();
      expect(metrics.memoryPercent).toBeNull();
    });

    it('should handle zero systemDelta without division by zero', async () => {
      const mockContainer = {
        inspect: jest.fn().mockResolvedValue({
          State: { Running: true, StartedAt: new Date().toISOString() },
        }),
        stats: jest.fn().mockResolvedValue({
          cpu_stats: { cpu_usage: { total_usage: 100 }, system_cpu_usage: 500 },
          precpu_stats: { cpu_usage: { total_usage: 100 }, system_cpu_usage: 500 }, // systemDelta = 0
        }),
      };

      const mockDocker = { getContainer: jest.fn().mockReturnValue(mockContainer) } as any;
      const provider = new DockerMonitoringProvider();
      (provider as any).docker = mockDocker;

      const metrics = await provider.getMetrics(dummyEnv);
      expect(metrics.cpuPercent).toBeNull();
      expect(metrics.availability.cpu).toBe('unavailable');
    });

    it('should report stopped container with unavailable metrics and no fabricated zeroes', async () => {
      const mockContainer = {
        inspect: jest.fn().mockResolvedValue({
          State: { Running: false, ExitCode: 137 },
          RestartCount: 4,
        }),
      };

      const mockDocker = { getContainer: jest.fn().mockReturnValue(mockContainer) } as any;
      const provider = new DockerMonitoringProvider();
      (provider as any).docker = mockDocker;

      const metrics = await provider.getMetrics(dummyEnv);
      expect(metrics.status).toBe('stopped');
      expect(metrics.uptimeSeconds).toBe(0);
      expect(metrics.restartCount).toBe(4);
      expect(metrics.cpuPercent).toBeNull();
      expect(metrics.memoryUsageBytes).toBeNull();
      expect(metrics.network).toBeNull();
      expect(metrics.storage).toBeNull();
      expect(metrics.availability.cpu).toBe('unavailable');
      expect(metrics.availability.memory).toBe('unavailable');
      expect(metrics.message).toContain('stopped');
    });

    it('should gracefully handle missing containers without throwing', async () => {
      const mockContainer = {
        inspect: jest.fn().mockRejectedValue(new Error('no such container')),
      };

      const mockDocker = { getContainer: jest.fn().mockReturnValue(mockContainer) } as any;
      const provider = new DockerMonitoringProvider();
      (provider as any).docker = mockDocker;

      const metrics = await provider.getMetrics(dummyEnv);
      expect(metrics.status).toBe('stopped');
      expect(metrics.cpuPercent).toBeNull();
      expect(metrics.message).toContain('not found');
    });
  });

  describe('3. KubernetesMonitoringProvider Unit & Workload Scenarios', () => {
    const k8sDummyEnv: Environment = {
      id: 'k8s-env-1',
      applicationId: 'app-1',
      name: 'k8s-prod',
      sreProfile: 'standard',
      provider: 'kubernetes',
      targetConfig: { deploymentName: 'test-dep', namespace: 'default' },
      clusterName: 'local-k8s',
      namespace: 'default',
      deploymentName: 'test-dep',
      containerName: 'app',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should report workload health and pod breakdown when pods are healthy', async () => {
      const provider = new KubernetesMonitoringProvider();

      (provider as any).appsV1Api = {
        readNamespacedDeployment: jest.fn().mockResolvedValue({
          body: {
            spec: {
              replicas: 2,
              selector: { matchLabels: { app: 'test-dep' } },
              template: {
                spec: {
                  containers: [
                    {
                      name: 'app',
                      resources: {
                        limits: { cpu: '500m', memory: '256Mi' },
                      },
                    },
                  ],
                },
              },
            },
            status: {
              replicas: 2,
              readyReplicas: 2,
              availableReplicas: 2,
              updatedReplicas: 2,
              unavailableReplicas: 0,
            },
          },
        }),
      };

      (provider as any).coreV1Api = {
        listNamespacedPod: jest.fn().mockResolvedValue({
          body: {
            items: [
              {
                metadata: { name: 'test-dep-pod-1' },
                status: {
                  phase: 'Running',
                  startTime: new Date(Date.now() - 1800 * 1000).toISOString(),
                  conditions: [{ type: 'Ready', status: 'True' }],
                  containerStatuses: [{ restartCount: 1 }],
                },
              },
              {
                metadata: { name: 'test-dep-pod-2' },
                status: {
                  phase: 'Running',
                  startTime: new Date(Date.now() - 1700 * 1000).toISOString(),
                  conditions: [{ type: 'Ready', status: 'True' }],
                  containerStatuses: [{ restartCount: 0 }],
                },
              },
            ],
          },
        }),
      };

      // Mock Metrics Server returning metrics
      (provider as any).metricsClient = {
        getPodMetrics: jest.fn().mockResolvedValue({
          items: [
            {
              metadata: { name: 'test-dep-pod-1' },
              containers: [{ name: 'app', usage: { cpu: '100m', memory: '64Mi' } }],
            },
            {
              metadata: { name: 'test-dep-pod-2' },
              containers: [{ name: 'app', usage: { cpu: '150m', memory: '64Mi' } }],
            },
          ],
        }),
      };

      const metrics = await provider.getMetrics(k8sDummyEnv);

      expect(metrics.status).toBe('running');
      expect(metrics.healthStatus).toBe('healthy');
      expect(metrics.restartCount).toBe(1);
      expect(metrics.uptimeSeconds).toBeGreaterThanOrEqual(1799);

      // Workload replicas
      expect(metrics.kubernetes).toBeDefined();
      expect(metrics.kubernetes?.desiredReplicas).toBe(2);
      expect(metrics.kubernetes?.readyReplicas).toBe(2);
      expect(metrics.kubernetes?.availableReplicas).toBe(2);
      expect(metrics.kubernetes?.pods).toHaveLength(2);
      expect(metrics.kubernetes?.pods[0].ready).toBe(true);
      expect(metrics.kubernetes?.pods[0].cpuUsageCores).toBe(0.1);

      // Resource metrics:
      // Total CPU = 0.25 cores. Total Limit = 0.5 * 2 = 1.0 core. CPU% = 25.0%
      expect(metrics.cpuPercent).toBe(25);
      // Total Mem = 128MB. Total Limit = 256MB * 2 = 512MB. Mem% = 25.0%
      expect(metrics.memoryUsageBytes).toBe(128 * 1024 * 1024);
      expect(metrics.memoryLimitBytes).toBe(512 * 1024 * 1024);
      expect(metrics.memoryPercent).toBe(25);

      expect(metrics.availability.cpu).toBe('available');
      expect(metrics.availability.memory).toBe('available');
      expect(metrics.availability.metricsServer).toBe('available');
    });

    it('should report degraded status when pods are partially unavailable', async () => {
      const provider = new KubernetesMonitoringProvider();

      (provider as any).appsV1Api = {
        readNamespacedDeployment: jest.fn().mockResolvedValue({
          body: {
            spec: { replicas: 3 },
            status: { readyReplicas: 1, availableReplicas: 1, updatedReplicas: 3, unavailableReplicas: 2 },
          },
        }),
      };

      (provider as any).coreV1Api = {
        listNamespacedPod: jest.fn().mockResolvedValue({ body: { items: [] } }),
      };

      (provider as any).metricsClient = {
        getPodMetrics: jest.fn().mockRejectedValue(new Error('Metrics server unreachable')),
      };

      const metrics = await provider.getMetrics(k8sDummyEnv);

      expect(metrics.status).toBe('degraded');
      expect(metrics.healthStatus).toBe('unhealthy');
      expect(metrics.kubernetes?.unavailableReplicas).toBe(2);
    });

    it('should gracefully handle missing Metrics Server with explicit unavailable explanation and null values', async () => {
      const provider = new KubernetesMonitoringProvider();

      (provider as any).appsV1Api = {
        readNamespacedDeployment: jest.fn().mockResolvedValue({
          body: {
            spec: { replicas: 1 },
            status: { readyReplicas: 1, availableReplicas: 1 },
          },
        }),
      };

      (provider as any).coreV1Api = {
        listNamespacedPod: jest.fn().mockResolvedValue({
          body: {
            items: [
              {
                metadata: { name: 'test-pod' },
                status: {
                  phase: 'Running',
                  conditions: [{ type: 'Ready', status: 'True' }],
                },
              },
            ],
          },
        }),
      };

      // Metrics server throws 404
      (provider as any).metricsClient = {
        getPodMetrics: jest.fn().mockRejectedValue({ statusCode: 404, message: 'the server could not find the requested resource' }),
      };

      const metrics = await provider.getMetrics(k8sDummyEnv);

      expect(metrics.status).toBe('running');
      expect(metrics.cpuPercent).toBeNull();
      expect(metrics.memoryUsageBytes).toBeNull();
      expect(metrics.availability.metricsServer).toBe('unavailable');
      expect(metrics.availability.cpu).toBe('unavailable');
      expect(metrics.availability.memory).toBe('unavailable');
      expect(metrics.message).toContain('Metrics Server is not available on cluster');
    });

    it('should report stopped workload when replicas is 0', async () => {
      const provider = new KubernetesMonitoringProvider();

      (provider as any).appsV1Api = {
        readNamespacedDeployment: jest.fn().mockResolvedValue({
          body: {
            spec: { replicas: 0 },
            status: { readyReplicas: 0, availableReplicas: 0 },
          },
        }),
      };

      (provider as any).coreV1Api = {
        listNamespacedPod: jest.fn().mockResolvedValue({ body: { items: [] } }),
      };

      (provider as any).metricsClient = {
        getPodMetrics: jest.fn().mockRejectedValue(new Error('not available')),
      };

      const metrics = await provider.getMetrics(k8sDummyEnv);
      expect(metrics.status).toBe('stopped');
      expect(metrics.healthStatus).toBe('none');
      expect(metrics.kubernetes?.desiredReplicas).toBe(0);
    });
  });

  describe('4. End-to-End API Integration & Tenant Protection', () => {
    it('GET /api/v1/environments/:id/metrics requires authentication', async () => {
      const res = await api.get(`/api/v1/environments/${dockerEnvId}/metrics`);
      expect(res.status).toBe(401);
    });

    it('denies access when querying another user environment (tenant isolation)', async () => {
      const res = await api
        .get(`/api/v1/environments/${dockerEnvId}/metrics`)
        .set('Authorization', `Bearer ${otherUserToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('Docker environment returns unified structure with availability and network/storage fields', async () => {
      const res = await api
        .get(`/api/v1/environments/${dockerEnvId}/metrics`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.environmentId).toBe(dockerEnvId);
      expect(res.body.data.provider).toBe('docker');
      expect(res.body.data).toHaveProperty('status');
      expect(res.body.data).toHaveProperty('availability');
      expect(res.body.data.availability).toHaveProperty('cpu');
      expect(res.body.data.availability).toHaveProperty('memory');
      expect(res.body.data.availability).toHaveProperty('network');
      expect(res.body.data.availability).toHaveProperty('storage');
      expect(res.body.data.prometheus.status).toBe('disabled'); // Basic profile
    });

    it('Kubernetes environment returns unified structure with workload replicas and pods list', async () => {
      const res = await api
        .get(`/api/v1/environments/${k8sEnvId}/metrics`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.environmentId).toBe(k8sEnvId);
      expect(res.body.data.provider).toBe('kubernetes');
      expect(res.body.data).toHaveProperty('kubernetes');
      expect(res.body.data).toHaveProperty('availability');
      expect(res.body.data.prometheus).toBeDefined(); // Standard profile
    });
  });
});
