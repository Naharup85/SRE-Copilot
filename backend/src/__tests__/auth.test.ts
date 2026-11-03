import request from 'supertest';
import { createApplication } from '../app';
import { cleanDb } from './setup';
import { pool } from '../db/connection';

const app = createApplication();
const api = request(app);

describe('Authentication', () => {
  beforeEach(async () => {
    await cleanDb();
  });

  afterAll(async () => {
    await cleanDb();
    await pool.end();
  });

  describe('POST /api/v1/auth/register', () => {
    it('should register a new user', async () => {
      const res = await api.post('/api/v1/auth/register').send({
        email: 'test@example.com',
        password: 'Test1234!',
        name: 'Test User',
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.email).toBe('test@example.com');
      expect(res.body.data.passwordHash).toBeUndefined();
    });

    it('should reject duplicate email', async () => {
      await api.post('/api/v1/auth/register').send({
        email: 'test@example.com',
        password: 'Test1234!',
        name: 'Test User',
      });

      const res = await api.post('/api/v1/auth/register').send({
        email: 'test@example.com',
        password: 'Test1234!',
        name: 'Test User 2',
      });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
    });

    it('should reject invalid email', async () => {
      const res = await api.post('/api/v1/auth/register').send({
        email: 'not-an-email',
        password: 'Test1234!',
        name: 'Test User',
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject weak password', async () => {
      const res = await api.post('/api/v1/auth/register').send({
        email: 'test@example.com',
        password: 'weak',
        name: 'Test User',
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    beforeEach(async () => {
      await api.post('/api/v1/auth/register').send({
        email: 'test@example.com',
        password: 'Test1234!',
        name: 'Test User',
      });
    });

    it('should login with valid credentials', async () => {
      const res = await api.post('/api/v1/auth/login').send({
        email: 'test@example.com',
        password: 'Test1234!',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
    });

    it('should reject invalid password', async () => {
      const res = await api.post('/api/v1/auth/login').send({
        email: 'test@example.com',
        password: 'WrongPassword1!',
      });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('should reject non-existent user', async () => {
      const res = await api.post('/api/v1/auth/login').send({
        email: 'nobody@example.com',
        password: 'Test1234!',
      });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('should return current user with valid token', async () => {
      const registerRes = await api.post('/api/v1/auth/register').send({
        email: 'test@example.com',
        password: 'Test1234!',
        name: 'Test User',
      });
      const { token } = registerRes.body.data;

      const res = await api
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.email).toBe('test@example.com');
    });

    it('should reject unauthorized request', async () => {
      const res = await api.get('/api/v1/auth/me');
      expect(res.status).toBe(401);
    });

    it('should reject invalid token', async () => {
      const res = await api
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid.token.here');
      expect(res.status).toBe(401);
    });
  });
});

