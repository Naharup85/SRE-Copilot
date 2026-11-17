import request from 'supertest';
import { createApplication } from '../app';
import { cleanDb } from './setup';
import { pool } from '../db/connection';
import { normalizeRoute } from '../metrics';
import { PrometheusService } from '../services/prometheus.service';
import axios from 'axios';

jest.mock('axios');

const app = createApplication();
const api = request(app);

async function createUserAndToken(
  email = 'prom-user@example.com',
  name = 'Prometheus Tester',
): Promise<{ token: string; userId: string }> {
  const res = await api.post('/api/v1/auth/register').send({
    email,
    password: 'TestPassword123!',
    name,
  });
  return { token: res.body.data.token, userId: res.body.data.id };
}

describe('Prometheus Integration & Metrics', () => {
  let userToken: string;
  let otherUserToken: string;
  let appId: string;
  let basicDockerEnvId: string;
  let standardDockerEnvId: string;
  let standardK8sEnvId: string;

  beforeAll(async () => {
    await cleanDb();

    // Create primary test user
    const user1 = await createUserAndToken('prom-user1@example.com', 'Prom User 1');
    userToken = user1.token;

    // Create secondary test user for tenant isolation tests
    const user2 = await createUserAndToken('prom-user2@example.com', 'Prom User 2');
    otherUserToken = user2.token;

    // Create an application
    const appRes = await api
      .post('/api/v1/applications')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        name: 'prom-app',
        description: 'Test application for Prometheus',
        repositoryUrl: 'https://github.com/example/prom-app',
        repositoryOwner: 'example',
        repositoryName: 'prom-app',
        defaultBranch: 'main',
      });
    appId = appRes.body.data.id;

    // Create Basic Docker Environment
    const basicDockerRes = await api
      .post(`/api/v1/applications/${appId}/environments`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        name: 'basic-docker',
        sreProfile: 'basic',
        provider: 'docker',
        containerName: 'prom-basic-container',
        targetConfig: {
          containerName: 'prom-basic-container',
          network: 'bridge',
          portBindings: [{ hostPort: 8081, containerPort: 80 }],
        },
      });
    basicDockerEnvId = basicDockerRes.body.data.id;

    // Create Standard Docker Environment
    const standardDockerRes = await api
      .post(`/api/v1/applications/${appId}/environments`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        name: 'standard-docker',
        sreProfile: 'standard',
        provider: 'docker',
        containerName: 'prom-standard-container',
        targetConfig: {
          containerName: 'prom-standard-container',
          network: 'bridge',
          portBindings: [{ hostPort: 8082, containerPort: 80 }],
        },
      });
    standardDockerEnvId = standardDockerRes.body.data.id;

    // Create Standard Kubernetes Environment
    const standardK8sRes = await api
      .post(`/api/v1/applications/${appId}/environments`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        name: 'standard-k8s',
        sreProfile: 'standard',
        provider: 'kubernetes',
        clusterName: 'kind-sre-copilot',
        namespace: 'sre-demo',
        deploymentName: 'prom-k8s-dep',
        containerName: 'app',
      });
    standardK8sEnvId = standardK8sRes.body.data.id;
  });

  afterAll(async () => {
    await cleanDb();
    await pool.end();
  });

  describe('Route Normalization & Cardinality Bounding', () => {
    it('should normalize UUIDs and numeric IDs to prevent metric cardinality explosion', () => {
      expect(
        normalizeRoute('/api/v1/applications/d0967e66-30c2-4126-a90b-4209f8f1cfc9'),
      ).toBe('/api/v1/applications/:id');

      expect(
        normalizeRoute(
          '/api/v1/environments/12345678-abcd-1234-abcd-123456789abc/metrics',
        ),
      ).toBe('/api/v1/environments/:id/metrics');

      expect(normalizeRoute('/api/v1/items/42')).toBe('/api/v1/items/:id');
      expect(normalizeRoute('/api/v1/items/42?filter=active&sort=desc')).toBe(
        '/api/v1/items/:id',
      );
      expect(normalizeRoute('')).toBe('unknown');
    });
  });

  describe('GET /metrics Endpoint', () => {
    it('should return valid Prometheus exposition format with correct Content-Type', async () => {
      const res = await api.get('/metrics');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/plain');
      expect(res.text).toContain('sre_copilot_http_requests_total');
      expect(res.text).toContain('sre_copilot_http_request_duration_seconds');
      expect(res.text).toContain('sre_copilot_http_errors_total');
      expect(res.text).toContain('process_cpu_user_seconds_total');
    });

    it('should increment request count and duration observations when requests execute', async () => {
      // Trigger a GET request on health check
      await api.get('/health');

      const metricsRes = await api.get('/metrics');
      expect(metricsRes.text).toContain('sre_copilot_http_requests_total{');
      expect(metricsRes.text).toContain('method="GET"');
      expect(metricsRes.text).toContain('route="/health"');
      expect(metricsRes.text).toContain('status_code="200"');
    });

    it('should record error count when requests fail with status >= 400', async () => {
      // Trigger a 404 request
      await api.get('/api/v1/nonexistent-route-for-testing');

      const metricsRes = await api.get('/metrics');
      expect(metricsRes.text).toContain('sre_copilot_http_errors_total');
      expect(metricsRes.text).toContain('status_code="404"');
    });

    it('should not contain high-cardinality or sensitive data in labels', async () => {
      // Trigger a request with a UUID and auth header
      await api
        .get(`/api/v1/applications/${appId}`)
        .set('Authorization', `Bearer ${userToken}`);

      const metricsRes = await api.get('/metrics');
      // Must not contain raw user ID or token
      expect(metricsRes.text).not.toContain(userToken);
      expect(metricsRes.text).not.toContain('Authorization');
      expect(metricsRes.text).not.toContain('password');
    });

    it('should not record /metrics endpoint itself to avoid recursive inflation', async () => {
      const beforeRes = await api.get('/metrics');
      const lines = beforeRes.text.split('\n');
      const metricsScrapeRecorded = lines.some((l) =>
        l.startsWith('sre_copilot_http_requests_total{') && l.includes('route="/metrics"'),
      );
      expect(metricsScrapeRecorded).toBe(false);
    });
  });

  describe('PrometheusService Client Layer', () => {
    let mockClient: any;
    let service: PrometheusService;

    beforeEach(() => {
      mockClient = {
        get: jest.fn(),
      };
      (axios.create as jest.Mock).mockReturnValue(mockClient);
      service = new PrometheusService('http://mock-prometheus:9090');
    });

    it('should report connected when GET /-/healthy returns status 200', async () => {
      mockClient.get.mockResolvedValueOnce({ status: 200, data: 'Prometheus Server is Healthy.' });

      const health = await service.checkHealth();
      expect(health.enabled).toBe(true);
      expect(health.connected).toBe(true);
      expect(health.status).toBe('connected');
      expect(health.lastSuccessfulCheck).toBeDefined();
    });

    it('should report unavailable gracefully when Prometheus is down or network times out', async () => {
      mockClient.get.mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:9090'));

      const health = await service.checkHealth();
      expect(health.enabled).toBe(true);
      expect(health.connected).toBe(false);
      expect(health.status).toBe('unavailable');
      expect(health.error).toContain('ECONNREFUSED');
    });

    it('should parse instant query results correctly', async () => {
      mockClient.get.mockResolvedValueOnce({
        status: 200,
        data: {
          status: 'success',
          data: {
            resultType: 'vector',
            result: [{ metric: {}, value: [1700000000, '42.5'] }],
          },
        },
      });

      const val = await service.queryInstant('sum(rate(sre_copilot_http_requests_total[5m]))');
      expect(val).toBe(42.5);
    });

    it('should return null when instant query has empty results or returns no data', async () => {
      mockClient.get.mockResolvedValueOnce({
        status: 200,
        data: {
          status: 'success',
          data: {
            resultType: 'vector',
            result: [],
          },
        },
      });

      const val = await service.queryInstant('sum(rate(sre_copilot_http_requests_total[5m]))');
      expect(val).toBeNull();
    });

    it('should parse range query results and convert to time-series points', async () => {
      mockClient.get.mockResolvedValueOnce({
        status: 200,
        data: {
          status: 'success',
          data: {
            resultType: 'matrix',
            result: [
              {
                metric: {},
                values: [
                  [1700000000, '10.5'],
                  [1700000060, '12.0'],
                ],
              },
            ],
          },
        },
      });

      const points = await service.queryRange('rate(http_requests[1m])', 1700000000, 1700000100, '60s');
      expect(points).toHaveLength(2);
      expect(points[0]).toEqual({ timestamp: 1700000000, value: 10.5 });
      expect(points[1]).toEqual({ timestamp: 1700000060, value: 12.0 });
    });

    it('should compute aggregated application metrics with latency percentiles and error rate', async () => {
      // Mock health check
      mockClient.get.mockResolvedValueOnce({ status: 200, data: 'Healthy' });

      // Mock 8 instant queries (requestRate, errorRateRaw, p50, p95, p99, avgLatency, totalRequests, totalErrors)
      mockClient.get.mockResolvedValueOnce({
        status: 200,
        data: { status: 'success', data: { result: [{ value: [1, '15.2'] }] } },
      });
      mockClient.get.mockResolvedValueOnce({
        status: 200,
        data: { status: 'success', data: { result: [{ value: [1, '1.5'] }] } },
      });
      mockClient.get.mockResolvedValueOnce({
        status: 200,
        data: { status: 'success', data: { result: [{ value: [1, '0.012'] }] } },
      });
      mockClient.get.mockResolvedValueOnce({
        status: 200,
        data: { status: 'success', data: { result: [{ value: [1, '0.045'] }] } },
      });
      mockClient.get.mockResolvedValueOnce({
        status: 200,
        data: { status: 'success', data: { result: [{ value: [1, '0.090'] }] } },
      });
      mockClient.get.mockResolvedValueOnce({
        status: 200,
        data: { status: 'success', data: { result: [{ value: [1, '0.020'] }] } },
      });
      mockClient.get.mockResolvedValueOnce({
        status: 200,
        data: { status: 'success', data: { result: [{ value: [1, '1500'] }] } },
      });
      mockClient.get.mockResolvedValueOnce({
        status: 200,
        data: { status: 'success', data: { result: [{ value: [1, '10'] }] } },
      });

      const result = await service.getApplicationMetrics('app-1', 'demo-service');
      expect(result.status).toBe('available');
      expect(result.requestRate).toBe(15.2);
      expect(result.errorRate).toBe(1.5);
      expect(result.latencyP50Ms).toBe(12);
      expect(result.latencyP95Ms).toBe(45);
      expect(result.latencyP99Ms).toBe(90);
      expect(result.totalRequests).toBe(1500);
      expect(result.totalErrors).toBe(10);
    });
  });

  describe('Prometheus Health Endpoint', () => {
    it('should require authentication for GET /api/v1/monitoring/prometheus/health', async () => {
      const res = await api.get('/api/v1/monitoring/prometheus/health');
      expect(res.status).toBe(401);
    });

    it('should return health status for authenticated user', async () => {
      const res = await api
        .get('/api/v1/monitoring/prometheus/health')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('enabled');
      expect(res.body.data).toHaveProperty('connected');
      expect(res.body.data).toHaveProperty('status');
    });
  });

  describe('Application Metrics API & Tenant Isolation', () => {
    it('should return 401 when unauthenticated', async () => {
      const res = await api.get(`/api/v1/applications/${appId}/metrics`);
      expect(res.status).toBe(401);
    });

    it('should return 404/deny access when querying another user application metrics', async () => {
      const res = await api
        .get(`/api/v1/applications/${appId}/metrics`)
        .set('Authorization', `Bearer ${otherUserToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should return application metrics structure for authorized owner', async () => {
      const res = await api
        .get(`/api/v1/applications/${appId}/metrics`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.applicationId).toBe(appId);
      expect(res.body.data).toHaveProperty('status');
      expect(res.body.data).toHaveProperty('collectedAt');
    });
  });

  describe('SRE Profile Behavior on GET /api/v1/environments/:id/metrics', () => {
    it('Basic SRE (Docker): returns native metrics with Prometheus marked disabled without requiring connection', async () => {
      const res = await api
        .get(`/api/v1/environments/${basicDockerEnvId}/metrics`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('status');
      expect(res.body.data).toHaveProperty('uptimeSeconds');
      expect(res.body.data).toHaveProperty('cpuPercent');
      expect(res.body.data).toHaveProperty('memoryPercent');

      // Basic SRE: prometheus must be disabled and never crash
      expect(res.body.data.prometheus).toEqual({
        enabled: false,
        connected: false,
        status: 'disabled',
        metrics: null,
      });
    });

    it('Standard SRE (Docker): returns native metrics with Prometheus status and metrics structure', async () => {
      const res = await api
        .get(`/api/v1/environments/${standardDockerEnvId}/metrics`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('status');
      expect(res.body.data.prometheus).toBeDefined();
      expect(res.body.data.prometheus).toHaveProperty('status');
    });

    it('Standard SRE (Kubernetes): supports advanced observability without crashing if Prometheus is down', async () => {
      const res = await api
        .get(`/api/v1/environments/${standardK8sEnvId}/metrics`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('status');
      expect(res.body.data.prometheus).toBeDefined();
      expect(['connected', 'disconnected', 'unavailable']).toContain(res.body.data.prometheus.status);
    });

    it('Tenant Isolation: cannot query another user environment metrics', async () => {
      const res = await api
        .get(`/api/v1/environments/${standardDockerEnvId}/metrics`)
        .set('Authorization', `Bearer ${otherUserToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Historical Metrics API & Validation', () => {
    it('should reject invalid query range where start >= end', async () => {
      const res = await api
        .get(`/api/v1/environments/${standardDockerEnvId}/metrics/history`)
        .query({ start: 1700005000, end: 1700000000 })
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_QUERY_RANGE');
    });

    it('should reject query range exceeding 30 days', async () => {
      const start = 1700000000;
      const end = start + 31 * 24 * 3600; // 31 days

      const res = await api
        .get(`/api/v1/environments/${standardDockerEnvId}/metrics/history`)
        .query({ start, end })
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_QUERY_RANGE');
    });

    it('should reject invalid step duration format', async () => {
      const res = await api
        .get(`/api/v1/environments/${standardDockerEnvId}/metrics/history`)
        .query({ start: 1700000000, end: 1700003600, step: 'invalid_step' })
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_STEP');
    });

    it('should deny unauthorized user access to historical metrics', async () => {
      const res = await api
        .get(`/api/v1/environments/${standardDockerEnvId}/metrics/history`)
        .set('Authorization', `Bearer ${otherUserToken}`);

      expect(res.status).toBe(404);
    });

    it('should return historical series format for authorized owner', async () => {
      const res = await api
        .get(`/api/v1/environments/${standardDockerEnvId}/metrics/history`)
        .query({ step: '60s' })
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.environmentId).toBe(standardDockerEnvId);
      expect(res.body.data).toHaveProperty('series');
      expect(res.body.data).toHaveProperty('status');
      expect(res.body.data).toHaveProperty('collectedAt');
    });
  });
});
