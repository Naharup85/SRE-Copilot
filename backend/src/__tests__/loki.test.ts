import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import request from 'supertest';
import axios from 'axios';
import { createApplication } from '../app';
import { cleanDb } from './setup';
import { pool } from '../db/connection';
import { env } from '../config/env';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const app = createApplication();
const api = request(app);

async function createUser(email: string): Promise<{ token: string; userId: string }> {
  const res = await api.post('/api/v1/auth/register').send({
    email,
    password: 'Password123!',
    name: 'Loki Tester',
  });
  return { token: res.body.data.token, userId: res.body.data.id };
}

describe('Phase 2.5 — Centralized Log Aggregation with Loki', () => {
  let userToken: string;
  let appId: string;
  let basicEnvId: string;
  let standardEnvId: string;

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser('loki-tester@example.com');
    userToken = user.token;

    const appRes = await api
      .post('/api/v1/applications')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        name: 'loki-test-app',
        description: 'Application for testing Loki log aggregation',
        repositoryUrl: 'https://github.com/example/loki-app',
        repositoryOwner: 'example',
        repositoryName: 'loki-app',
        defaultBranch: 'main',
      });
    appId = appRes.body.data.id;

    const basicEnv = await api
      .post(`/api/v1/applications/${appId}/environments`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        name: 'docker-basic-env',
        sreProfile: 'basic',
        provider: 'docker',
        targetConfig: { containerName: 'test-basic-container' },
      });
    basicEnvId = basicEnv.body.data.id;

    const standardEnv = await api
      .post(`/api/v1/applications/${appId}/environments`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        name: 'k8s-standard-env',
        sreProfile: 'standard',
        provider: 'kubernetes',
        targetConfig: {
          deploymentName: 'test-k8s-dep',
          namespace: 'sre-demo',
        },
      });
    standardEnvId = standardEnv.body.data.id;
  });

  afterAll(async () => {
    await cleanDb();
    await pool.end();
  });

  describe('1. Loki & Fluent Bit Configuration Integrity', () => {
    const lokiConfigPath = path.resolve(__dirname, '../../../infrastructure/loki/loki-config.yml');
    const fluentBitConfigPath = path.resolve(__dirname, '../../../infrastructure/fluent-bit/fluent-bit.conf');
    const fluentBitParsersPath = path.resolve(__dirname, '../../../infrastructure/fluent-bit/parsers.conf');
    const k8sFluentBitPath = path.resolve(__dirname, '../../../infrastructure/kubernetes/fluent-bit-kind.yaml');

    it('should have a valid Loki configuration file with retention and compactor', () => {
      expect(fs.existsSync(lokiConfigPath)).toBe(true);
      const raw = fs.readFileSync(lokiConfigPath, 'utf8');
      const parsed = yaml.load(raw) as any;

      expect(parsed).toBeDefined();
      expect(parsed.auth_enabled).toBe(false);
      expect(parsed.server.http_listen_port).toBe(3100);
      expect(parsed.schema_config.configs.length).toBeGreaterThan(0);
      expect(parsed.limits_config.retention_period).toBe('168h');
      expect(parsed.compactor.retention_enabled).toBe(true);
      expect(parsed.compactor.delete_request_store).toBe('filesystem');
    });

    it('should have a valid Fluent Bit configuration file with parsers and Loki output', () => {
      expect(fs.existsSync(fluentBitConfigPath)).toBe(true);
      expect(fs.existsSync(fluentBitParsersPath)).toBe(true);

      const configRaw = fs.readFileSync(fluentBitConfigPath, 'utf8');
      expect(configRaw).toContain('Name              loki');
      expect(configRaw).toContain('Host              loki');
      expect(configRaw).toContain('Port              3100');
      expect(configRaw).toContain('$app_id');
      expect(configRaw).toContain('$environment_id');
      expect(configRaw).toContain('$deployment_provider');

      const parsersRaw = fs.readFileSync(fluentBitParsersPath, 'utf8');
      expect(parsersRaw).toContain('Name        docker');
      expect(parsersRaw).toContain('Name        json_log');
      expect(parsersRaw).toContain('Name        cri');
    });

    it('should have a valid Kind Kubernetes Fluent Bit manifest', () => {
      expect(fs.existsSync(k8sFluentBitPath)).toBe(true);
      const raw = fs.readFileSync(k8sFluentBitPath, 'utf8');
      expect(raw).toContain('DaemonSet');
      expect(raw).toContain('fluent-bit-logging');
      expect(raw).toContain('Name                loki');
      expect(raw).toContain('Name                kubernetes');
    });
  });

  describe('2. Grafana Loki Datasource & Application Logs Dashboard', () => {
    const datasourcePath = path.resolve(
      __dirname,
      '../../../infrastructure/grafana/provisioning/datasources/loki.yml',
    );
    const dashboardPath = path.resolve(
      __dirname,
      '../../../infrastructure/grafana/dashboards/application-logs.json',
    );

    it('should have a provisioned Loki datasource pointing to http://loki:3100', () => {
      expect(fs.existsSync(datasourcePath)).toBe(true);
      const raw = fs.readFileSync(datasourcePath, 'utf8');
      const parsed = yaml.load(raw) as any;

      expect(parsed.datasources).toBeDefined();
      const lokiDs = parsed.datasources.find((d: any) => d.type === 'loki');
      expect(lokiDs).toBeDefined();
      expect(lokiDs.name).toBe('Loki');
      expect(lokiDs.url).toBe('http://loki:3100');
      expect(lokiDs.uid).toBe('Loki');
    });

    it('should have a valid application-logs.json dashboard with UID sre-copilot-logs', () => {
      expect(fs.existsSync(dashboardPath)).toBe(true);
      const raw = fs.readFileSync(dashboardPath, 'utf8');
      const dashboard = JSON.parse(raw);

      expect(dashboard.uid).toBe('sre-copilot-logs');
      expect(dashboard.title).toBe('SRE Copilot — Application Logs');
      expect(dashboard.tags).toContain('logs');
      expect(dashboard.tags).toContain('loki');

      const variableNames = dashboard.templating.list.map((v: any) => v.name);
      expect(variableNames).toContain('app_id');
      expect(variableNames).toContain('environment_id');
      expect(variableNames).toContain('deployment_provider');
      expect(variableNames).toContain('level');
      expect(variableNames).toContain('search');

      // Verify essential panels
      const panelTitles = dashboard.panels.map((p: any) => p.title);
      expect(panelTitles).toContain('Total Log Entries');
      expect(panelTitles).toContain('Error Log Count');
      expect(panelTitles).toContain('Application & Infrastructure Log Stream');
      expect(panelTitles).toContain('Error & Crash Logs');
    });
  });

  describe('3. Backend Health API (/api/v1/monitoring/loki/health)', () => {
    it('should require authentication for loki health endpoint', async () => {
      const res = await api.get('/api/v1/monitoring/loki/health');
      expect(res.status).toBe(401);
    });

    it('should report connected when Loki returns ready', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: 'ready',
      });

      const res = await api
        .get('/api/v1/monitoring/loki/health')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.enabled).toBe(true);
      expect(res.body.data.connected).toBe(true);
      expect(res.body.data.status).toBe('connected');
      expect(res.body.data.url).toBe(env.LOKI_URL);
      expect(res.body.data.dashboardUrl).toContain('sre-copilot-logs');
    });

    it('should report disconnected gracefully when Loki is unreachable', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Connection refused'));

      const res = await api
        .get('/api/v1/monitoring/loki/health')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.enabled).toBe(true);
      expect(res.body.data.connected).toBe(false);
      expect(res.body.data.status).toBe('disconnected');
      expect(res.body.data.error).toBe('Connection refused');
    });
  });

  describe('4. SRE Profile Decoupling & Independence', () => {
    it('should verify Basic SRE functions without requiring Loki', async () => {
      // Basic SRE environment exists and can retrieve container logs through native provider
      const res = await api
        .get(`/api/v1/environments/${basicEnvId}/container-logs`)
        .set('Authorization', `Bearer ${userToken}`);

      // The call returns success array from native docker/mock provider
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should verify Standard SRE environment has contextual dashboard targets', async () => {
      expect(basicEnvId).toBeDefined();
      expect(standardEnvId).toBeDefined();

      const healthRes = await api
        .get('/api/v1/monitoring/grafana/health')
        .set('Authorization', `Bearer ${userToken}`);

      expect(healthRes.status).toBe(200);
      expect(healthRes.body.data.dashboards.applicationLogs).toBeDefined();
      expect(healthRes.body.data.dashboards.applicationLogs).toContain('sre-copilot-logs');
    });
  });
});
