import { Registry, collectDefaultMetrics, Counter, Histogram } from 'prom-client';
import type { Request, Response, NextFunction } from 'express';

// Ensure singleton across module reloads in dev/test
const globalForMetrics = globalThis as unknown as {
  __sre_metrics_registry__?: Registry;
  __sre_http_requests_total__?: Counter<string>;
  __sre_http_duration_seconds__?: Histogram<string>;
  __sre_http_errors_total__?: Counter<string>;
  __sre_db_queries_total__?: Counter<string>;
  __sre_db_duration_seconds__?: Histogram<string>;
  __sre_db_slow_queries_total__?: Counter<string>;
  __sre_db_query_errors_total__?: Counter<string>;
  __sre_ext_requests_total__?: Counter<string>;
  __sre_ext_duration_seconds__?: Histogram<string>;
  __sre_ext_errors_total__?: Counter<string>;
};

export const register = globalForMetrics.__sre_metrics_registry__ || new Registry();
if (!globalForMetrics.__sre_metrics_registry__) {
  globalForMetrics.__sre_metrics_registry__ = register;
  collectDefaultMetrics({ register, prefix: 'sre_copilot_' });
}

// ---------------------------------------------------------------------------
// 1. HTTP Request Performance Metrics (with app_id attribution)
// ---------------------------------------------------------------------------
export const httpRequestsTotal =
  globalForMetrics.__sre_http_requests_total__ ||
  new Counter({
    name: 'sre_copilot_http_requests_total',
    help: 'Total number of HTTP requests processed',
    labelNames: ['app_id', 'method', 'route', 'status_code'],
    registers: [register],
  });
if (!globalForMetrics.__sre_http_requests_total__) {
  globalForMetrics.__sre_http_requests_total__ = httpRequestsTotal;
}

export const httpRequestDurationSeconds =
  globalForMetrics.__sre_http_duration_seconds__ ||
  new Histogram({
    name: 'sre_copilot_http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['app_id', 'method', 'route', 'status_code'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [register],
  });
if (!globalForMetrics.__sre_http_duration_seconds__) {
  globalForMetrics.__sre_http_duration_seconds__ = httpRequestDurationSeconds;
}

export const httpErrorsTotal =
  globalForMetrics.__sre_http_errors_total__ ||
  new Counter({
    name: 'sre_copilot_http_errors_total',
    help: 'Total number of HTTP error responses (status >= 400)',
    labelNames: ['app_id', 'method', 'route', 'status_code'],
    registers: [register],
  });
if (!globalForMetrics.__sre_http_errors_total__) {
  globalForMetrics.__sre_http_errors_total__ = httpErrorsTotal;
}

// ---------------------------------------------------------------------------
// 2. Database Performance Metrics
// ---------------------------------------------------------------------------
export const dbQueriesTotal =
  globalForMetrics.__sre_db_queries_total__ ||
  new Counter({
    name: 'sre_copilot_db_queries_total',
    help: 'Total number of database queries executed',
    labelNames: ['app_id', 'operation', 'status'],
    registers: [register],
  });
if (!globalForMetrics.__sre_db_queries_total__) {
  globalForMetrics.__sre_db_queries_total__ = dbQueriesTotal;
}

export const dbQueryDurationSeconds =
  globalForMetrics.__sre_db_duration_seconds__ ||
  new Histogram({
    name: 'sre_copilot_db_query_duration_seconds',
    help: 'Duration of database queries in seconds',
    labelNames: ['app_id', 'operation'],
    buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
    registers: [register],
  });
if (!globalForMetrics.__sre_db_duration_seconds__) {
  globalForMetrics.__sre_db_duration_seconds__ = dbQueryDurationSeconds;
}

export const dbSlowQueriesTotal =
  globalForMetrics.__sre_db_slow_queries_total__ ||
  new Counter({
    name: 'sre_copilot_db_slow_queries_total',
    help: 'Total number of slow database queries exceeding threshold',
    labelNames: ['app_id', 'operation'],
    registers: [register],
  });
if (!globalForMetrics.__sre_db_slow_queries_total__) {
  globalForMetrics.__sre_db_slow_queries_total__ = dbSlowQueriesTotal;
}

export const dbQueryErrorsTotal =
  globalForMetrics.__sre_db_query_errors_total__ ||
  new Counter({
    name: 'sre_copilot_db_query_errors_total',
    help: 'Total number of database query errors',
    labelNames: ['app_id', 'operation', 'error_type'],
    registers: [register],
  });
if (!globalForMetrics.__sre_db_query_errors_total__) {
  globalForMetrics.__sre_db_query_errors_total__ = dbQueryErrorsTotal;
}

// ---------------------------------------------------------------------------
// 3. External Dependency Performance Metrics
// ---------------------------------------------------------------------------
export const externalRequestsTotal =
  globalForMetrics.__sre_ext_requests_total__ ||
  new Counter({
    name: 'sre_copilot_external_requests_total',
    help: 'Total number of outbound external service requests',
    labelNames: ['app_id', 'dependency', 'method', 'status_code'],
    registers: [register],
  });
if (!globalForMetrics.__sre_ext_requests_total__) {
  globalForMetrics.__sre_ext_requests_total__ = externalRequestsTotal;
}

export const externalRequestDurationSeconds =
  globalForMetrics.__sre_ext_duration_seconds__ ||
  new Histogram({
    name: 'sre_copilot_external_request_duration_seconds',
    help: 'Duration of external service requests in seconds',
    labelNames: ['app_id', 'dependency'],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [register],
  });
if (!globalForMetrics.__sre_ext_duration_seconds__) {
  globalForMetrics.__sre_ext_duration_seconds__ = externalRequestDurationSeconds;
}

export const externalRequestErrorsTotal =
  globalForMetrics.__sre_ext_errors_total__ ||
  new Counter({
    name: 'sre_copilot_external_request_errors_total',
    help: 'Total number of outbound external service failures',
    labelNames: ['app_id', 'dependency', 'error_type'],
    registers: [register],
  });
if (!globalForMetrics.__sre_ext_errors_total__) {
  globalForMetrics.__sre_ext_errors_total__ = externalRequestErrorsTotal;
}

// ---------------------------------------------------------------------------
// Route Normalization & Cardinality Bounding
// ---------------------------------------------------------------------------
export function normalizeRoute(path: string): string {
  if (!path) return 'unknown';
  return path
    .split('?')[0]
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    .replace(/\/\d+/g, '/:id')
    .replace(/\/+$/, '') || '/';
}

/**
 * Extracts and bounds the SQL operation (SELECT, INSERT, UPDATE, DELETE, OTHER)
 * Never exposes raw SQL or dynamic values.
 */
export function extractSqlOperation(queryText: string): 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'OTHER' {
  if (!queryText || typeof queryText !== 'string') return 'OTHER';
  const trimmed = queryText.trim().toUpperCase();
  if (trimmed.startsWith('SELECT')) return 'SELECT';
  if (trimmed.startsWith('INSERT')) return 'INSERT';
  if (trimmed.startsWith('UPDATE')) return 'UPDATE';
  if (trimmed.startsWith('DELETE')) return 'DELETE';
  return 'OTHER';
}

/**
 * Express middleware to record request count, latency histogram, and errors.
 * Distinguishes platform requests from specific application requests using x-application-id header.
 * Excludes the /metrics endpoint itself to prevent self-measurement inflation.
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Never measure /metrics endpoint itself
  if (req.path === '/metrics') {
    return next();
  }

  const startTime = process.hrtime.bigint();

  // Extract application attribution if provided via header or route
  const rawAppId = (req.headers['x-application-id'] as string) || (req.params as any)?.applicationId;
  const appId = rawAppId ? String(rawAppId).trim() : 'sre-copilot-backend';

  res.once('finish', () => {
    try {
      const durationSeconds = Number(process.hrtime.bigint() - startTime) / 1e9;
      
      let rawRoute: string = req.route?.path || req.path;
      if (req.baseUrl) {
        rawRoute = req.route?.path ? `${req.baseUrl}${req.route.path}` : `${req.baseUrl}${req.path}`;
      }
      const route = normalizeRoute(rawRoute);
      const method = req.method;
      const statusCode = String(res.statusCode);

      const labels = { app_id: appId, method, route, status_code: statusCode };

      httpRequestsTotal.inc(labels);
      httpRequestDurationSeconds.observe(labels, durationSeconds);

      if (res.statusCode >= 400) {
        httpErrorsTotal.inc(labels);
      }
    } catch {
      // Best effort telemetry recording, never disrupt request lifecycle
    }
  });

  next();
}

/**
 * Helper to instrument outbound external service calls.
 * Records latency, success count, error count, and categorizes by bounded dependency name.
 */
export async function instrumentExternalCall<T>(
  dependency: 'kubernetes_api' | 'docker_daemon' | 'prometheus' | 'github_api' | 'external_http',
  method: string,
  fn: () => Promise<T>,
  appId = 'sre-copilot-backend',
): Promise<T> {
  const start = process.hrtime.bigint();
  const safeMethod = (method || 'GET').toUpperCase();

  try {
    const result = await fn();
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;

    externalRequestsTotal.inc({
      app_id: appId,
      dependency,
      method: safeMethod,
      status_code: '200',
    });
    externalRequestDurationSeconds.observe({ app_id: appId, dependency }, durationSeconds);

    return result;
  } catch (err: any) {
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
    const statusCode = err?.response?.status ? String(err.response.status) : '500';
    const errorType = err?.code || err?.name || 'ERROR';

    externalRequestsTotal.inc({
      app_id: appId,
      dependency,
      method: safeMethod,
      status_code: statusCode,
    });
    externalRequestDurationSeconds.observe({ app_id: appId, dependency }, durationSeconds);
    externalRequestErrorsTotal.inc({
      app_id: appId,
      dependency,
      error_type: errorType,
    });

    throw err;
  }
}
