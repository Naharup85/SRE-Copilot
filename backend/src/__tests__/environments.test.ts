import request from 'supertest';
import { createApplication } from '../app';
import { cleanDb } from './setup';
import { pool } from '../db/connection';

const app = createApplication();
const api = request(app);

async function setupUserAndApp(): Promise<{ token: string; appId: string }> {
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

  return { token, appId: appRes.body.data.id };
}

const validEnvPayload = {
  name: 'development',
  clusterName: 'local-cluster',
  namespace: 'sre-demo',
  deploymentName: 'test-api',
  containerName: 'api',
};

describe('Environments', () => {
  let token: string;
  let appId: string;

  beforeEach(async () => {
    await cleanDb();
    const setup = await setupUserAndApp();
    token = setup.token;
    appId = setup.appId;
  });

  afterAll(async () => {
    await cleanDb();
    await pool.end();
  });

  describe('POST /api/v1/applications/:applicationId/environments', () => {
    it('should create an environment', async () => {
      const res = await api
        .post(`/api/v1/applications/${appId}/environments`)
        .set('Authorization', `Bearer ${token}`)
        .send(validEnvPayload);

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('development');
      expect(res.body.data.namespace).toBe('sre-demo');
    });

    it('should reject invalid namespace (spaces not allowed)', async () => {
      const res = await api
        .post(`/api/v1/applications/${appId}/environments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ ...validEnvPayload, namespace: 'invalid namespace' });

      expect(res.status).toBe(400);
    });

    it('should reject empty environment name', async () => {
      const res = await api
        .post(`/api/v1/applications/${appId}/environments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ ...validEnvPayload, name: '' });

      expect(res.status).toBe(400);
    });

    it('should validate application ownership', async () => {
      const user2Res = await api.post('/api/v1/auth/register').send({
        email: 'user2@example.com',
        password: 'Test1234!',
        name: 'User 2',
      });
      const token2 = user2Res.body.data.token;

      const res = await api
        .post(`/api/v1/applications/${appId}/environments`)
        .set('Authorization', `Bearer ${token2}`)
        .send(validEnvPayload);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/v1/applications/:applicationId/environments', () => {
    it('should list environments for an application', async () => {
      await api
        .post(`/api/v1/applications/${appId}/environments`)
        .set('Authorization', `Bearer ${token}`)
        .send(validEnvPayload);

      const res = await api
        .get(`/api/v1/applications/${appId}/environments`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });
  });
});

