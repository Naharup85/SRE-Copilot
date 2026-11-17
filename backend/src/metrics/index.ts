import { Registry, collectDefaultMetrics, Counter, Histogram } from 'prom-client';
import type { Request, Response, NextFunction } from 'express';

// Ensure singleton across module reloads in dev/test
const globalForMetrics = globalThis as unknown as {
  __sre_metrics_registry__?: Registry;
  __sre_http_requests_total__?: Counter<string>;
  __sre_http_duration_seconds__?: Histogram<string>;
  __sre_http_errors_total__?: Counter<string>;
};

export const register = globalForMetrics.__sre_metrics_registry__ || new Registry();
if (!globalForMetrics.__sre_metrics_registry__) {
  globalForMetrics.__sre_metrics_registry__ = register;
  // Register default process/runtime metrics with prefix
  collectDefaultMetrics({ register, prefix: 'sre_copilot_' });
}

export const httpRequestsTotal =
  globalForMetrics.__sre_http_requests_total__ ||
  new Counter({
    name: 'sre_copilot_http_requests_total',
    help: 'Total number of HTTP requests processed',
    labelNames: ['method', 'route', 'status_code'],
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
    labelNames: ['method', 'route', 'status_code'],
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
    labelNames: ['method', 'route', 'status_code'],
    registers: [register],
  });
if (!globalForMetrics.__sre_http_errors_total__) {
  globalForMetrics.__sre_http_errors_total__ = httpErrorsTotal;
}

/**
 * Normalizes route path to keep metric cardinality strictly bounded.
 * Replaces UUIDs, arbitrary IDs, and numbers with placeholder `:id`.
 */
export function normalizeRoute(path: string): string {
  if (!path) return 'unknown';
  return path
    .split('?')[0]
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    .replace(/\/\d+/g, '/:id')
    .replace(/\/+$/, '') || '/';
}

/**
 * Express middleware to record request count, latency histogram, and errors.
 * Excludes the /metrics endpoint itself to prevent self-measurement inflation.
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Never measure /metrics endpoint itself
  if (req.path === '/metrics') {
    return next();
  }

  const startTime = process.hrtime.bigint();

  res.once('finish', () => {
    try {
      const durationSeconds = Number(process.hrtime.bigint() - startTime) / 1e9;
      
      // Determine normalized route pattern
      let rawRoute: string = req.route?.path || req.path;
      if (req.baseUrl) {
        rawRoute = req.route?.path ? `${req.baseUrl}${req.route.path}` : `${req.baseUrl}${req.path}`;
      }
      const route = normalizeRoute(rawRoute);
      const method = req.method;
      const statusCode = String(res.statusCode);

      const labels = { method, route, status_code: statusCode };

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
