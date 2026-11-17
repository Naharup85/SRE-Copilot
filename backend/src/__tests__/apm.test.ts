import request from 'supertest';
import { createApplication } from '../app';
import { cleanDb } from './setup';
import { pool } from '../db/connection';
import {
  normalizeRoute,
  extractSqlOperation,
  instrumentExternalCall,
} from '../metrics';
import { PrometheusService } from '../services/prometheus.service';
import axios from 'axios';

jest.mock('axios');

const app = createApplication();
const api = request(app);

async function createUserAndToken(
  email = 'apm-user@example.com',
  name = 'APM Tester',
): Promise<{ token: string; userId: string }> {
  const res = await api.post('/api/v1/auth/register').send({
    email,
    password: 'TestPassword123!',
    name,
  });
  return { token: res.body.data.token, userId: res.body.data.id };
}

describe('Phase 2.3 — Application Performance Monitoring (APM)', () => {
  let userToken: string;
  let otherUserToken: string;
  let appId: string;

  beforeAll(async () => {
    await cleanDb();

    const user1 = await createUserAndToken('apm-owner@example.com', 'APM Owner');
    userToken = user1.token;

    const user2 = await createUserAndToken('apm-intruder@example.com', 'Intruder');
    otherUserToken = user2.token;

    const appRes = await api
      .post('/api/v1/applications')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        name: 'apm-monitored-app',
        description: 'Application for APM testing',
        repositoryUrl: 'https://github.com/example/apm-monitored-app',
        repositoryOwner: 'example',
        repositoryName: 'apm-monitored-app',
        defaultBranch: 'main',
      });
    appId = appRes.body.data.id;
  });

  afterAll(async () => {
    await cleanDb();
    await pool.end();
  });

  describe('1. Route Normalization & SQL Operation Extraction', () => {
    it('should normalize dynamic route parameters avoiding cardinality explosion', () => {
      expect(normalizeRoute('/api/v1/applications/d0967e66-30c2-4126-a90b-4209f8f1cfc9/apm')).toBe(
        '/api/v1/applications/:id/apm',
      );
      expect(normalizeRoute('/api/v1/orders/12345/items/99')).toBe('/api/v1/orders/:id/items/:id');
      expect(normalizeRoute('/api/v1/search?query=secret-token&page=2')).toBe('/api/v1/search');
      expect(normalizeRoute('')).toBe('unknown');
    });

    it('should extract SQL operation bounded to SELECT, INSERT, UPDATE, DELETE, OTHER', () => {
      expect(extractSqlOperation('SELECT * FROM users WHERE id = $1')).toBe('SELECT');
      expect(extractSqlOperation('  select id from apps')).toBe('SELECT');
      expect(extractSqlOperation('INSERT INTO deployments (id) VALUES ($1)')).toBe('INSERT');
      expect(extractSqlOperation('UPDATE environments SET status = $1')).toBe('UPDATE');
      expect(extractSqlOperation('DELETE FROM logs WHERE id = $1')).toBe('DELETE');
      expect(extractSqlOperation('BEGIN')).toBe('OTHER');
      expect(extractSqlOperation('')).toBe('OTHER');
    });
  });

  describe('2. HTTP Metrics & Application Attribution', () => {
    it('should distinguish platform requests from attributed application requests', async () => {
      // Platform request (no x-application-id header)
      await api.get('/health');

      // Attributed application request
      await api
        .get('/health')
        .set('x-application-id', appId);

      const metricsRes = await api.get('/metrics');
      expect(metricsRes.status).toBe(200);

      // Verify platform attribution label
      expect(metricsRes.text).toContain('app_id="sre-copilot-backend"');

      // Verify tenant application attribution label
      expect(metricsRes.text).toContain(`app_id="${appId}"`);
    });

    it('should record 4xx and 5xx errors under attributed application', async () => {
      // Trigger a 404 with attribution
      await api
        .get('/api/v1/nonexistent-route-for-apm-test')
        .set('x-application-id', appId);

      const metricsRes = await api.get('/metrics');
      expect(metricsRes.text).toContain('sre_copilot_http_errors_total');
      expect(metricsRes.text).toContain(`app_id="${appId}"`);
      expect(metricsRes.text).toContain('status_code="404"');
    });

    it('should exclude /metrics endpoint itself from metric counters', async () => {
      const beforeRes = await api.get('/metrics');
      const lines = beforeRes.text.split('\n');
      const metricsScrapeRecorded = lines.some(
        (l) => l.startsWith('sre_copilot_http_requests_total{') && l.includes('route="/metrics"'),
      );
      expect(metricsScrapeRecorded).toBe(false);
    });
  });

  describe('3. Database Performance Instrumentation', () => {
    it('should track database queries, duration, and slow queries without storing query parameters', async () => {
      await pool.query('SELECT 1 AS num');

      const metricsRes = await api.get('/metrics');
      expect(metricsRes.text).toContain('sre_copilot_db_queries_total');
      expect(metricsRes.text).toContain('operation="SELECT"');
      expect(metricsRes.text).toContain('status="success"');
      expect(metricsRes.text).toContain('sre_copilot_db_query_duration_seconds');

      // Must NEVER contain raw SQL values or parameters in labels
      expect(metricsRes.text).not.toContain('AS num');
      expect(metricsRes.text).not.toContain('password');
    });

    it('should detect and track database query errors when query fails', async () => {
      try {
        await pool.query('SELECT * FROM table_that_definitely_does_not_exist_xyz');
      } catch {
        // Expected query error
      }

      const metricsRes = await api.get('/metrics');
      expect(metricsRes.text).toContain('sre_copilot_db_query_errors_total');
      expect(metricsRes.text).toContain('operation="SELECT"');
    });
  });

  describe('4. External Dependencies Instrumentation', () => {
    it('should record external request latency, method, and success', async () => {
      const result = await instrumentExternalCall(
        'kubernetes_api',
        'GET',
        async () => {
          return { ready: true };
        },
        appId,
      );

      expect(result).toEqual({ ready: true });

      const metricsRes = await api.get('/metrics');
      expect(metricsRes.text).toContain('sre_copilot_external_requests_total');
      expect(metricsRes.text).toContain(`app_id="${appId}"`);
      expect(metricsRes.text).toContain('dependency="kubernetes_api"');
      expect(metricsRes.text).toContain('status_code="200"');
    });

    it('should record external request failures and error types', async () => {
      await expect(
        instrumentExternalCall(
          'docker_daemon',
          'POST',
          async () => {
            const err: any = new Error('Connection refused to Docker socket');
            err.code = 'ECONNREFUSED';
            throw err;
          },
          appId,
        ),
      ).rejects.toThrow('Connection refused');

      const metricsRes = await api.get('/metrics');
      expect(metricsRes.text).toContain('sre_copilot_external_request_errors_total');
      expect(metricsRes.text).toContain('dependency="docker_daemon"');
      expect(metricsRes.text).toContain('error_type="ECONNREFUSED"');
    });
  });

  describe('5. PrometheusService APM Methods & Attributed Querying', () => {
    let mockClient: any;
    let service: PrometheusService;

    beforeEach(() => {
      mockClient = {
        get: jest.fn(),
      };
      (axios.create as jest.Mock).mockReturnValue(mockClient);
      service = new PrometheusService('http://mock-prometheus:9090');
    });

    it('should return unavailable status when application has no APM metrics (no false zeroes)', async () => {
      // Health check OK
      mockClient.get.mockResolvedValueOnce({ status: 200, data: 'Healthy' });

      // Queries return empty vector
      mockClient.get.mockResolvedValue({
        status: 200,
        data: { status: 'success', data: { resultType: 'vector', result: [] } },
      });

      const apm = await service.getApmOverview('uninstrumented-app-id', 'Uninstrumented App');
      expect(apm.status).toBe('unavailable');
      expect(apm.requestRate).toBeNull();
      expect(apm.totalRequests).toBeNull();
      expect(apm.latencyP95Ms).toBeNull();
      expect(apm.message).toContain('No APM metrics recorded');
    });

    it('should calculate full APM KPIs when application has telemetry in Prometheus', async () => {
      // Health check
      mockClient.get.mockResolvedValueOnce({ status: 200, data: 'Healthy' });

      // Mock 8 instant queries for APM overview:
      // [requestRate, errorRate, p50, p95, p99, avgLatency, totalRequests, totalErrors]
      mockClient.get.mockResolvedValueOnce({
        status: 200,
        data: { status: 'success', data: { result: [{ value: [1, '25.5'] }] } },
      });
      mockClient.get.mockResolvedValueOnce({
        status: 200,
        data: { status: 'success', data: { result: [{ value: [1, '2.0'] }] } },
      });
      mockClient.get.mockResolvedValueOnce({
        status: 200,
        data: { status: 'success', data: { result: [{ value: [1, '0.015'] }] } },
      });
      mockClient.get.mockResolvedValueOnce({
        status: 200,
        data: { status: 'success', data: { result: [{ value: [1, '0.045'] }] } },
      });
      mockClient.get.mockResolvedValueOnce({
        status: 200,
        data: { status: 'success', data: { result: [{ value: [1, '0.095'] }] } },
      });
      mockClient.get.mockResolvedValueOnce({
        status: 200,
        data: { status: 'success', data: { result: [{ value: [1, '0.020'] }] } },
      });
      mockClient.get.mockResolvedValueOnce({
        status: 200,
        data: { status: 'success', data: { result: [{ value: [1, '2500'] }] } },
      });
      mockClient.get.mockResolvedValueOnce({
        status: 200,
        data: { status: 'success', data: { result: [{ value: [1, '50'] }] } },
      });

      const apm = await service.getApmOverview('demo-app-1', 'Demo App');
      expect(apm.status).toBe('available');
      expect(apm.requestRate).toBe(25.5);
      expect(apm.requestsPerMinute).toBe(1530);
      expect(apm.errorRate).toBe(2.0);
      expect(apm.latencyP50Ms).toBe(15);
      expect(apm.latencyP95Ms).toBe(45);
      expect(apm.latencyP99Ms).toBe(95);
      expect(apm.averageLatencyMs).toBe(20);
      expect(apm.totalRequests).toBe(2500);
      expect(apm.totalErrors).toBe(50);
    });

    it('should retrieve endpoint level performance breakdown', async () => {
      // 4 vector queries: reqVectors, errVectors, avgLatVectors, p95Vectors
      mockClient.get.mockResolvedValueOnce({
        status: 200,
        data: {
          status: 'success',
          data: {
            result: [
              { metric: { method: 'GET', route: '/api/v1/orders' }, value: [1, '100'] },
              { metric: { method: 'POST', route: '/api/v1/orders' }, value: [1, '50'] },
            ],
          },
        },
      });
      mockClient.get.mockResolvedValueOnce({
        status: 200,
        data: {
          status: 'success',
          data: {
            result: [{ metric: { method: 'POST', route: '/api/v1/orders' }, value: [1, '5'] }],
          },
        },
      });
      mockClient.get.mockResolvedValueOnce({
        status: 200,
        data: {
          status: 'success',
          data: {
            result: [
              { metric: { method: 'GET', route: '/api/v1/orders' }, value: [1, '0.012'] },
              { metric: { method: 'POST', route: '/api/v1/orders' }, value: [1, '0.035'] },
            ],
          },
        },
      });
      mockClient.get.mockResolvedValueOnce({
        status: 200,
        data: {
          status: 'success',
          data: {
            result: [
              { metric: { method: 'GET', route: '/api/v1/orders' }, value: [1, '0.025'] },
              { metric: { method: 'POST', route: '/api/v1/orders' }, value: [1, '0.080'] },
            ],
          },
        },
      });

      const endpoints = await service.getApmEndpoints('demo-app-1');
      expect(endpoints).toHaveLength(2);

      const postOrder = endpoints.find((e) => e.method === 'POST');
      expect(postOrder).toBeDefined();
      expect(postOrder?.requestCount).toBe(50);
      expect(postOrder?.errorCount).toBe(5);
      expect(postOrder?.errorRate).toBe(10);
      expect(postOrder?.avgLatencyMs).toBe(35);
      expect(postOrder?.latencyP95Ms).toBe(80);
    });

    it('should retrieve database APM metrics and operations breakdown', async () => {
      // 6 queries: totalQueries, queryRate, avgDuration, slowQueries, queryErrors, opVectors
      mockClient.get.mockResolvedValueOnce({
        status: 200,
        data: { status: 'success', data: { result: [{ value: [1, '450'] }] } },
      });
      mockClient.get.mockResolvedValueOnce({
        status: 200,
        data: { status: 'success', data: { result: [{ value: [1, '5.2'] }] } },
      });
      mockClient.get.mockResolvedValueOnce({
        status: 200,
        data: { status: 'success', data: { result: [{ value: [1, '0.0035'] }] } },
      });
      mockClient.get.mockResolvedValueOnce({
        status: 200,
        data: { status: 'success', data: { result: [{ value: [1, '3'] }] } },
      });
      mockClient.get.mockResolvedValueOnce({
        status: 200,
        data: { status: 'success', data: { result: [{ value: [1, '1'] }] } },
      });
      mockClient.get.mockResolvedValueOnce({
        status: 200,
        data: {
          status: 'success',
          data: {
            result: [
              { metric: { operation: 'SELECT' }, value: [1, '350'] },
              { metric: { operation: 'INSERT' }, value: [1, '100'] },
            ],
          },
        },
      });

      const dbApm = await service.getApmDatabase('demo-app-1');
      expect(dbApm.status).toBe('available');
      expect(dbApm.queryCount).toBe(450);
      expect(dbApm.averageDurationMs).toBe(3.5);
      expect(dbApm.slowQueryCount).toBe(3);
      expect(dbApm.queryFailureCount).toBe(1);
      expect(dbApm.operations).toHaveLength(2);
      expect(dbApm.operations[0]).toEqual({ operation: 'SELECT', count: 350 });
    });

    it('should retrieve external dependencies status and latency', async () => {
      // 3 vector queries: reqVectors, errVectors, avgLatVectors
      mockClient.get.mockResolvedValueOnce({
        status: 200,
        data: {
          status: 'success',
          data: {
            result: [
              { metric: { dependency: 'kubernetes_api' }, value: [1, '80'] },
              { metric: { dependency: 'payment_gateway' }, value: [1, '20'] },
            ],
          },
        },
      });
      mockClient.get.mockResolvedValueOnce({
        status: 200,
        data: {
          status: 'success',
          data: {
            result: [{ metric: { dependency: 'payment_gateway' }, value: [1, '2'] }],
          },
        },
      });
      mockClient.get.mockResolvedValueOnce({
        status: 200,
        data: {
          status: 'success',
          data: {
            result: [
              { metric: { dependency: 'kubernetes_api' }, value: [1, '0.015'] },
              { metric: { dependency: 'payment_gateway' }, value: [1, '0.120'] },
            ],
          },
        },
      });

      const deps = await service.getApmDependencies('demo-app-1');
      expect(deps).toHaveLength(2);

      const k8sDep = deps.find((d) => d.dependency === 'kubernetes_api');
      expect(k8sDep?.requestCount).toBe(80);
      expect(k8sDep?.errorCount).toBe(0);
      expect(k8sDep?.status).toBe('healthy');
      expect(k8sDep?.avgLatencyMs).toBe(15);

      const payDep = deps.find((d) => d.dependency === 'payment_gateway');
      expect(payDep?.status).toBe('degraded');
      expect(payDep?.avgLatencyMs).toBe(120);
    });
  });

  describe('6. Backend APM Endpoints & Tenant Isolation', () => {
    it('GET /api/v1/applications/:id/apm requires authentication', async () => {
      const res = await api.get(`/api/v1/applications/${appId}/apm`);
      expect(res.status).toBe(401);
    });

    it('denies access when querying another user application APM (tenant isolation)', async () => {
      const res = await api
        .get(`/api/v1/applications/${appId}/apm`)
        .set('Authorization', `Bearer ${otherUserToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('GET /api/v1/applications/:id/apm returns APM overview for authorized owner', async () => {
      const res = await api
        .get(`/api/v1/applications/${appId}/apm`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.applicationId).toBe(appId);
      expect(res.body.data).toHaveProperty('status');
      expect(res.body.data).toHaveProperty('collectedAt');
    });

    it('GET /api/v1/applications/:id/apm/endpoints returns endpoints breakdown for authorized owner', async () => {
      const res = await api
        .get(`/api/v1/applications/${appId}/apm/endpoints`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.applicationId).toBe(appId);
      expect(Array.isArray(res.body.data.endpoints)).toBe(true);
    });

    it('GET /api/v1/applications/:id/apm/database returns database telemetry for authorized owner', async () => {
      const res = await api
        .get(`/api/v1/applications/${appId}/apm/database`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.applicationId).toBe(appId);
      expect(res.body.data).toHaveProperty('status');
      expect(Array.isArray(res.body.data.operations)).toBe(true);
    });

    it('GET /api/v1/applications/:id/apm/dependencies returns dependency status for authorized owner', async () => {
      const res = await api
        .get(`/api/v1/applications/${appId}/apm/dependencies`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.applicationId).toBe(appId);
      expect(Array.isArray(res.body.data.dependencies)).toBe(true);
    });

    it('GET /api/v1/applications/:id/apm/history validates start < end and max 30-day range', async () => {
      // Invalid range: start >= end
      const res1 = await api
        .get(`/api/v1/applications/${appId}/apm/history`)
        .query({ start: 1700005000, end: 1700000000 })
        .set('Authorization', `Bearer ${userToken}`);
      expect(res1.status).toBe(400);
      expect(res1.body.error.code).toBe('INVALID_QUERY_RANGE');

      // Invalid range: > 30 days
      const res2 = await api
        .get(`/api/v1/applications/${appId}/apm/history`)
        .query({ start: 1700000000, end: 1700000000 + 31 * 24 * 3600 })
        .set('Authorization', `Bearer ${userToken}`);
      expect(res2.status).toBe(400);
      expect(res2.body.error.code).toBe('INVALID_QUERY_RANGE');

      // Invalid step token
      const res3 = await api
        .get(`/api/v1/applications/${appId}/apm/history`)
        .query({ start: 1700000000, end: 1700003600, step: 'invalid_step' })
        .set('Authorization', `Bearer ${userToken}`);
      expect(res3.status).toBe(400);
      expect(res3.body.error.code).toBe('INVALID_STEP');

      // Valid query
      const res4 = await api
        .get(`/api/v1/applications/${appId}/apm/history`)
        .query({ step: '60s' })
        .set('Authorization', `Bearer ${userToken}`);
      expect(res4.status).toBe(200);
      expect(res4.body.success).toBe(true);
      expect(res4.body.data.applicationId).toBe(appId);
      expect(res4.body.data).toHaveProperty('series');
    });
  });
});
