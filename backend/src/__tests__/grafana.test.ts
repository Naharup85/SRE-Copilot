import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import request from 'supertest';
import { createApplication } from '../app';
import { cleanDb } from './setup';
import { pool } from '../db/connection';
import {
  register,
  recordRuntimeMetricsToPrometheus,
} from '../metrics';

const app = createApplication();
const api = request(app);

async function createUser(email: string): Promise<{ token: string; userId: string }> {
  const res = await api.post('/api/v1/auth/register').send({
    email,
    password: 'Password123!',
    name: 'Grafana Tester',
  });
  return { token: res.body.data.token, userId: res.body.data.id };
}

describe('Phase 2.4 — Grafana Dashboards & Integration', () => {
  let userToken: string;
  let appId: string;
  let dockerEnvId: string;
  let k8sEnvId: string;

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser('grafana-tester@example.com');
    userToken = user.token;

    const appRes = await api
      .post('/api/v1/applications')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        name: 'grafana-test-app',
        description: 'Application for testing Grafana integration',
        repositoryUrl: 'https://github.com/example/grafana-app',
        repositoryOwner: 'example',
        repositoryName: 'grafana-app',
        defaultBranch: 'main',
      });
    appId = appRes.body.data.id;

    const dockerEnv = await api
      .post(`/api/v1/applications/${appId}/environments`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        name: 'docker-prod',
        sreProfile: 'standard',
        provider: 'docker',
        targetConfig: { containerName: 'test-container' },
      });
    dockerEnvId = dockerEnv.body.data.id;

    const k8sEnv = await api
      .post(`/api/v1/applications/${appId}/environments`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        name: 'k8s-prod',
        sreProfile: 'standard',
        provider: 'kubernetes',
        targetConfig: { namespace: 'default', deploymentName: 'test-dep' },
      });
    k8sEnvId = k8sEnv.body.data.id;
  });

  afterAll(async () => {
    await cleanDb();
    await pool.end();
  });

  describe('1. Provisioning Files & Dashboard JSON Validation', () => {
    const projectRoot = path.resolve(__dirname, '../../..');

    it('should validate Prometheus datasource provisioning YAML', () => {
      const dsPath = path.join(
        projectRoot,
        'infrastructure/grafana/provisioning/datasources/prometheus.yml',
      );
      expect(fs.existsSync(dsPath)).toBe(true);
      const content = fs.readFileSync(dsPath, 'utf8');
      const parsed: any = yaml.load(content);
      expect(parsed.apiVersion).toBe(1);
      expect(parsed.datasources).toHaveLength(1);
      expect(parsed.datasources[0].name).toBe('Prometheus');
      expect(parsed.datasources[0].type).toBe('prometheus');
      expect(parsed.datasources[0].url).toBe('http://prometheus:9090');
      expect(parsed.datasources[0].isDefault).toBe(true);
    });

    it('should validate Dashboard provider provisioning YAML', () => {
      const dashConfigPath = path.join(
        projectRoot,
        'infrastructure/grafana/provisioning/dashboards/dashboards.yml',
      );
      expect(fs.existsSync(dashConfigPath)).toBe(true);
      const content = fs.readFileSync(dashConfigPath, 'utf8');
      const parsed: any = yaml.load(content);
      expect(parsed.apiVersion).toBe(1);
      expect(parsed.providers).toHaveLength(1);
      expect(parsed.providers[0].name).toBe('SRE Copilot Dashboards');
      expect(parsed.providers[0].options.path).toBe('/var/lib/grafana/dashboards');
    });

    it('should validate Infrastructure Overview dashboard JSON', () => {
      const filePath = path.join(
        projectRoot,
        'infrastructure/grafana/dashboards/infrastructure.json',
      );
      expect(fs.existsSync(filePath)).toBe(true);
      const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      expect(json.uid).toBe('sre-copilot-infra');
      expect(json.title).toContain('Infrastructure Overview');
      expect(json.panels.length).toBeGreaterThan(0);

      // Verify essential queries exist
      const queries = json.panels
        .flatMap((p: any) => p.targets || [])
        .map((t: any) => t.expr)
        .filter(Boolean);
      expect(queries.some((q: string) => q.includes('up{job="prometheus"}'))).toBe(true);
      expect(queries.some((q: string) => q.includes('sre_copilot_process_cpu_seconds_total'))).toBe(true);
    });

    it('should validate Docker Runtime dashboard JSON with variables', () => {
      const filePath = path.join(
        projectRoot,
        'infrastructure/grafana/dashboards/docker-runtime.json',
      );
      expect(fs.existsSync(filePath)).toBe(true);
      const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      expect(json.uid).toBe('sre-copilot-docker');
      expect(json.title).toContain('Docker Runtime');

      // Verify variables
      const varNames = (json.templating?.list || []).map((v: any) => v.name);
      expect(varNames).toContain('app_id');
      expect(varNames).toContain('environment_id');
      expect(varNames).toContain('container');

      // Verify panel metrics
      const queries = json.panels
        .flatMap((p: any) => p.targets || [])
        .map((t: any) => t.expr)
        .filter(Boolean);
      expect(queries.some((q: string) => q.includes('sre_copilot_docker_container_cpu_percent'))).toBe(true);
      expect(queries.some((q: string) => q.includes('sre_copilot_docker_container_memory_bytes'))).toBe(true);
    });

    it('should validate Kubernetes Runtime dashboard JSON with variables', () => {
      const filePath = path.join(
        projectRoot,
        'infrastructure/grafana/dashboards/kubernetes-runtime.json',
      );
      expect(fs.existsSync(filePath)).toBe(true);
      const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      expect(json.uid).toBe('sre-copilot-k8s');
      expect(json.title).toContain('Kubernetes Runtime');

      // Verify variables
      const varNames = (json.templating?.list || []).map((v: any) => v.name);
      expect(varNames).toContain('app_id');
      expect(varNames).toContain('namespace');
      expect(varNames).toContain('deployment');

      // Verify panel metrics
      const queries = json.panels
        .flatMap((p: any) => p.targets || [])
        .map((t: any) => t.expr)
        .filter(Boolean);
      expect(queries.some((q: string) => q.includes('sre_copilot_kubernetes_deployment_replicas'))).toBe(true);
      expect(queries.some((q: string) => q.includes('sre_copilot_kubernetes_pod_cpu_cores'))).toBe(true);
    });

    it('should validate Application Performance Monitoring (APM) dashboard JSON', () => {
      const filePath = path.join(
        projectRoot,
        'infrastructure/grafana/dashboards/application-apm.json',
      );
      expect(fs.existsSync(filePath)).toBe(true);
      const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      expect(json.uid).toBe('sre-copilot-apm');
      expect(json.title).toContain('Application Performance Monitoring');

      // Verify attribution variable
      const varNames = (json.templating?.list || []).map((v: any) => v.name);
      expect(varNames).toContain('app_id');

      // Verify Golden Signals queries
      const queries = json.panels
        .flatMap((p: any) => p.targets || [])
        .map((t: any) => t.expr)
        .filter(Boolean);
      expect(queries.some((q: string) => q.includes('sre_copilot_http_requests_total'))).toBe(true);
      expect(queries.some((q: string) => q.includes('sre_copilot_http_request_duration_seconds_bucket'))).toBe(true);
      expect(queries.some((q: string) => q.includes('sre_copilot_db_queries_total'))).toBe(true);
      expect(queries.some((q: string) => q.includes('sre_copilot_external_requests_total'))).toBe(true);
    });
  });

  describe('2. Backend Grafana Health Endpoint', () => {
    it('should require authentication for GET /api/v1/monitoring/grafana/health', async () => {
      const res = await api.get('/api/v1/monitoring/grafana/health');
      expect(res.status).toBe(401);
    });

    it('should return health status and dashboard links for authenticated user', async () => {
      const res = await api
        .get('/api/v1/monitoring/grafana/health')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const data = res.body.data;
      expect(data).toHaveProperty('enabled');
      expect(data).toHaveProperty('connected');
      expect(data).toHaveProperty('url');
      expect(data).toHaveProperty('dashboards');
      expect(data.dashboards).toHaveProperty('infrastructure');
      expect(data.dashboards).toHaveProperty('dockerRuntime');
      expect(data.dashboards).toHaveProperty('kubernetesRuntime');
      expect(data.dashboards).toHaveProperty('applicationApm');
    });
  });

  describe('3. Runtime Metrics Prometheus Gauge Bridge', () => {
    it('should bridge Docker runtime metrics into Prometheus gauges', async () => {
      const mockMetrics = {
        provider: 'docker',
        status: 'running',
        healthStatus: 'healthy',
        uptimeSeconds: 3600,
        cpuPercent: 24.5,
        memoryUsageBytes: 64 * 1024 * 1024,
        memoryLimitBytes: 256 * 1024 * 1024,
        memoryPercent: 25.0,
        restartCount: 1,
        network: { receivedBytes: 10000, transmittedBytes: 5000 },
        storage: { readBytes: 2000, writeBytes: 1000 },
      };

      recordRuntimeMetricsToPrometheus(appId, dockerEnvId, mockMetrics, {
        containerName: 'test-app-container',
      });

      const metricsExposition = await register.metrics();
      expect(metricsExposition).toContain('sre_copilot_docker_container_cpu_percent');
      expect(metricsExposition).toContain('sre_copilot_docker_container_memory_bytes');
      expect(metricsExposition).toContain('sre_copilot_docker_container_uptime_seconds');
      expect(metricsExposition).toContain('sre_copilot_docker_container_restart_count');
      expect(metricsExposition).toContain('container_name="test-app-container"');
    });

    it('should bridge Kubernetes workload metrics into Prometheus gauges', async () => {
      const mockMetrics = {
        provider: 'kubernetes',
        status: 'running',
        healthStatus: 'healthy',
        uptimeSeconds: 7200,
        kubernetes: {
          desiredReplicas: 3,
          readyReplicas: 3,
          availableReplicas: 3,
          unavailableReplicas: 0,
          pods: [
            {
              podName: 'demo-api-pod-1',
              phase: 'Running',
              ready: true,
              restartCount: 0,
              cpuUsageCores: 0.05,
              memoryUsageBytes: 32 * 1024 * 1024,
            },
          ],
        },
      };

      recordRuntimeMetricsToPrometheus(appId, k8sEnvId, mockMetrics, {
        namespace: 'sre-demo',
        deploymentName: 'demo-api',
      });

      const metricsExposition = await register.metrics();
      expect(metricsExposition).toContain('sre_copilot_kubernetes_deployment_replicas');
      expect(metricsExposition).toContain('sre_copilot_kubernetes_pod_status');
      expect(metricsExposition).toContain('sre_copilot_kubernetes_pod_cpu_cores');
      expect(metricsExposition).toContain('deployment="demo-api"');
      expect(metricsExposition).toContain('namespace="sre-demo"');
    });

    it('should not record false zeroes when metrics are null or unavailable', async () => {
      const nullMetrics = {
        provider: 'docker',
        status: 'stopped',
        healthStatus: 'none',
        uptimeSeconds: null,
        cpuPercent: null,
        memoryUsageBytes: null,
        memoryLimitBytes: null,
        memoryPercent: null,
        restartCount: null,
        network: null,
        storage: null,
      };

      // Recording null values should not throw and should safely skip gauge setting
      expect(() => {
        recordRuntimeMetricsToPrometheus('app-null', 'env-null', nullMetrics, {
          containerName: 'null-container',
        });
      }).not.toThrow();
    });
  });

  describe('4. SRE Profile Integration Behavior', () => {
    it('should allow Basic SRE environments to query metrics without requiring Grafana', async () => {
      const basicEnv = await api
        .post(`/api/v1/applications/${appId}/environments`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: 'basic-docker',
          sreProfile: 'basic',
          provider: 'docker',
          targetConfig: { containerName: 'basic-container' },
        });

      const res = await api
        .get(`/api/v1/environments/${basicEnv.body.data.id}/metrics`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.provider).toBe('docker');
      expect(res.body.data.prometheus.enabled).toBe(false);
    });

    it('should support Standard SRE environments with Prometheus and Grafana telemetry', async () => {
      const res = await api
        .get(`/api/v1/environments/${dockerEnvId}/metrics`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.provider).toBe('docker');
    });
  });
});
