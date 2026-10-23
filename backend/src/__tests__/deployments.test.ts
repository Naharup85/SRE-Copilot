import request from 'supertest';
import app from '../index';
import { cleanDb } from './setup';
import { pool } from '../db/connection';

const api = request(app);

async function setupAll(): Promise<{ token: string; appId: string; envId: string }> {
  const userRes = await api.post('/api/v1/auth/register').send({
    email: 'user@example.com',
    password: 'Test1234!',
    name: 'Test User',
  });
  const token = userRes.body.data.token;

  const appRes = await api
    .post('/api/v1/applications')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: 'test-api',
      repositoryUrl: 'https://github.com/example/test-api',
      repositoryOwner: 'example',
      repositoryName: 'test-api',
      defaultBranch: 'main',
    });
  const appId = appRes.body.data.id;

  const envRes = await api
    .post(`/api/v1/applications/${appId}/environments`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: 'development',
      clusterName: 'local-cluster',
      namespace: 'sre-demo',
      deploymentName: 'test-api',
      containerName: 'api',
    });
  const envId = envRes.body.data.id;

  return { token, appId, envId };
}

describe('Deployments', () => {
  let token: string;
  let envId: string;

  beforeEach(async () => {
    await cleanDb();
    const setup = await setupAll();
    token = setup.token;
    envId = setup.envId;
  });

  afterAll(async () => {
    await cleanDb();
    await pool.end();
  });

  describe('POST /api/v1/environments/:environmentId/deployments', () => {
    it('should create a deployment', async () => {
      const res = await api
        .post(`/api/v1/environments/${envId}/deployments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ version: 'v1.0.0', commitSha: 'abc1234' });

      expect(res.status).toBe(201);
      expect(res.body.data.version).toBe('v1.0.0');
      expect(res.body.data.status).toBe('PENDING');
    });

    it('should reject invalid commit SHA', async () => {
      const res = await api
        .post(`/api/v1/environments/${envId}/deployments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ version: 'v1.0.0', commitSha: 'xyz' }); // < 7 chars

      expect(res.status).toBe(400);
    });

    it('should reject non-hex commit SHA', async () => {
      const res = await api
        .post(`/api/v1/environments/${envId}/deployments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ version: 'v1.0.0', commitSha: 'gggggggg' });

      expect(res.status).toBe(400);
    });

    it('should validate environment ownership', async () => {
      const user2Res = await api.post('/api/v1/auth/register').send({
        email: 'user2@example.com',
        password: 'Test1234!',
        name: 'User 2',
      });
      const token2 = user2Res.body.data.token;

      const res = await api
        .post(`/api/v1/environments/${envId}/deployments`)
        .set('Authorization', `Bearer ${token2}`)
        .send({ version: 'v1.0.0', commitSha: 'abc1234' });

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/v1/environments/:environmentId/deployments', () => {
    it('should list deployments', async () => {
      await api
        .post(`/api/v1/environments/${envId}/deployments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ version: 'v1.0.0', commitSha: 'abc1234' });

      const res = await api
        .get(`/api/v1/environments/${envId}/deployments`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /api/v1/deployments/:id', () => {
    it('should get deployment by id with details', async () => {
      const createRes = await api
        .post(`/api/v1/environments/${envId}/deployments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ version: 'v1.0.0', commitSha: 'abc1234' });

      const deploymentId = createRes.body.data.id;

      const res = await api
        .get(`/api/v1/deployments/${deploymentId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(deploymentId);
      expect(res.body.data.applicationName).toBeDefined();
      expect(res.body.data.environmentName).toBe('development');
    });

    it('should deny access to another user deployment', async () => {
      const createRes = await api
        .post(`/api/v1/environments/${envId}/deployments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ version: 'v1.0.0', commitSha: 'abc1234' });

      const deploymentId = createRes.body.data.id;
      const token2Res = await api.post('/api/v1/auth/register').send({
        email: 'user2@example.com',
        password: 'Test1234!',
        name: 'User 2',
      });
      const token2 = token2Res.body.data.token;

      const res = await api
        .get(`/api/v1/deployments/${deploymentId}`)
        .set('Authorization', `Bearer ${token2}`);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/v1/deployments/:id/logs', () => {
    it('should get deployment logs', async () => {
      const createRes = await api
        .post(`/api/v1/environments/${envId}/deployments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ version: 'v1.0.0', commitSha: 'abc1234' });

      const deploymentId = createRes.body.data.id;

      // Wait a bit for the mock worker to run
      await new Promise((r) => setTimeout(r, 3000));

      const res = await api
        .get(`/api/v1/deployments/${deploymentId}/logs`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    }, 10000);
  });
});

