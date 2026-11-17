import { config } from 'dotenv';
import { z } from 'zod';

config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  ACCESS_TOKEN_SECRET: z.string().min(32, 'ACCESS_TOKEN_SECRET must be at least 32 characters'),
  REFRESH_TOKEN_SECRET: z.string().min(32, 'REFRESH_TOKEN_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_EXPIRES: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES: z.string().default('7d'),
  GITHUB_TOKEN: z.string().optional(),
  KUBERNETES_CONTEXT: z.string().optional(),
  KUBERNETES_NAMESPACE: z.string().optional(),
  KUBERNETES_ROLLOUT_TIMEOUT_MS: z.coerce.number().default(45000),
  KUBERNETES_POLL_INTERVAL_MS: z.coerce.number().default(2000),
  DEPLOYMENT_PROVIDER: z.enum(['mock', 'kubernetes', 'docker', 'dynamic']).default('dynamic'),
  PROMETHEUS_ENABLED: z.coerce.boolean().default(true),
  PROMETHEUS_URL: z.string().default('http://localhost:9090'),
  PROMETHEUS_SCRAPE_INTERVAL: z.string().default('15s'),
  PROMETHEUS_RETENTION_TIME: z.string().default('7d'),
  DB_SLOW_QUERY_THRESHOLD_MS: z.coerce.number().default(100),
  APM_ENABLED: z.coerce.boolean().default(true),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
