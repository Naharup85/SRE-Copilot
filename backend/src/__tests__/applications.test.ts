import request from 'supertest';
import { createApplication } from '../app';
import { cleanDb } from './setup';
import { pool } from '../db/connection';

const app = createApplication();
const api = request(app);

async function createUserAndToken(
  email = 'user@example.com',
  name = 'Test User',
): Promise<string> {
  const res = await api.post('/api/v1/auth/register').send({
    email,
    password: 'Test1234!',
    name,
  });
  return res.body.data.token;
}

const validAppPayload = {
  name: 'test-api',
  description: 'Test API app',
  repositoryUrl: 'https://github.com/example/test-api',
  repositoryOwner: 'example',
  repositoryName: 'test-api',
  defaultBranch: 'main',
};

describe('Applications', () => {
  let token: string;

  beforeEach(async () => {
    await cleanDb();
    token = await createUserAndToken();
  });

  afterAll(async () => {
    await cleanDb();
    await pool.end();
  });

  describe('POST /api/v1/applications', () => {
    it('should create an application', async () => {
      const res = await api
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${token}`)
        .send(validAppPayload);

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('test-api');
      expect(res.body.data.repositoryUrl).toBe(validAppPayload.repositoryUrl);
    });

    it('should reject invalid application name', async () => {
      const res = await api
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...validAppPayload, name: 'Invalid Name With Spaces!' });

      expect(res.status).toBe(400);
    });

    it('should reject invalid repository URL', async () => {
      const res = await api
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...validAppPayload, repositoryUrl: 'not-a-url' });

      expect(res.status).toBe(400);
    });

    it('should require authentication', async () => {
      const res = await api.post('/api/v1/applications').send(validAppPayload);
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/applications', () => {
    it('should list user applications', async () => {
      await api
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${token}`)
        .send(validAppPayload);

      const res = await api
        .get('/api/v1/applications')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('should not show other users applications', async () => {
      // Create app with user 1
      await api
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${token}`)
        .send(validAppPayload);

      // Login as user 2
      const token2 = await createUserAndToken('user2@example.com', 'User 2');
      const res = await api
        .get('/api/v1/applications')
        .set('Authorization', `Bearer ${token2}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });
  });

  describe('GET /api/v1/applications/:id', () => {
    it('should get application by id', async () => {
      const createRes = await api
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${token}`)
        .send(validAppPayload);

      const { id } = createRes.body.data;
      const res = await api
        .get(`/api/v1/applications/${id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(id);
    });

    it('should not allow access to another user application', async () => {
      const createRes = await api
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${token}`)
        .send(validAppPayload);

      const { id } = createRes.body.data;
      const token2 = await createUserAndToken('user2@example.com', 'User 2');

      const res = await api
        .get(`/api/v1/applications/${id}`)
        .set('Authorization', `Bearer ${token2}`);

      expect(res.status).toBe(404);
    });

    it('should reject invalid UUID', async () => {
      const res = await api
        .get('/api/v1/applications/not-a-uuid')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(400);
    });
  });
});

