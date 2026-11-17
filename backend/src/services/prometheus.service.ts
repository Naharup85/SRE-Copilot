import axios, { AxiosInstance } from 'axios';
import { env } from '../config/env';
import { logger } from '../config/logger';

export interface PrometheusHealth {
  enabled: boolean;
  connected: boolean;
  status: 'connected' | 'disconnected' | 'disabled' | 'unavailable';
  lastSuccessfulCheck: string | null;
  error?: string;
}

export interface ApplicationMetricsResult {
  applicationId: string;
  applicationName: string;
  requestRate: number | null;
  errorRate: number | null;
  latencyP50Ms: number | null;
  latencyP95Ms: number | null;
  latencyP99Ms: number | null;
  totalRequests: number | null;
  totalErrors: number | null;
  status: 'available' | 'partial' | 'unavailable';
  collectedAt: string;
  message?: string;
}

export interface ApmOverviewResult {
  applicationId: string;
  applicationName: string;
  requestRate: number | null;
  requestsPerMinute: number | null;
  errorRate: number | null;
  averageLatencyMs: number | null;
  latencyP50Ms: number | null;
  latencyP95Ms: number | null;
  latencyP99Ms: number | null;
  totalRequests: number | null;
  totalErrors: number | null;
  status: 'available' | 'unavailable';
  collectedAt: string;
  message?: string;
}

export interface ApmEndpointMetric {
  endpoint: string;
  method: string;
  requestCount: number;
  errorCount: number;
  errorRate: number;
  avgLatencyMs: number | null;
  latencyP95Ms: number | null;
}

export interface ApmDatabaseResult {
  applicationId: string;
  status: 'available' | 'unavailable';
  queryCount: number | null;
  queryRatePerSec: number | null;
  averageDurationMs: number | null;
  slowQueryCount: number | null;
  queryFailureCount: number | null;
  operations: Array<{ operation: string; count: number }>;
  collectedAt: string;
  message?: string;
}

export interface ApmDependencyMetric {
  dependency: string;
  requestCount: number;
  errorCount: number;
  avgLatencyMs: number | null;
  status: 'healthy' | 'degraded' | 'unavailable';
}

export interface HistoricalMetricPoint {
  timestamp: number;
  value: number;
}

export interface HistoricalMetricsSeries {
  metric: string;
  points: HistoricalMetricPoint[];
}

export interface HistoricalMetricsResult {
  environmentId?: string;
  applicationId?: string;
  start: number;
  end: number;
  step: string;
  series: HistoricalMetricsSeries[];
  status: 'available' | 'empty' | 'unavailable';
  collectedAt: string;
}

export class PrometheusService {
  private readonly client: AxiosInstance;
  private lastSuccessfulCheck: string | null = null;

  constructor(baseURL = env.PROMETHEUS_URL) {
    this.client = axios.create({
      baseURL,
      timeout: 5000,
      headers: {
        Accept: 'application/json',
      },
    });
  }

  /**
   * Checks connectivity and operational health of the Prometheus server.
   */
  async checkHealth(): Promise<PrometheusHealth> {
    if (!env.PROMETHEUS_ENABLED) {
      return {
        enabled: false,
        connected: false,
        status: 'disabled',
        lastSuccessfulCheck: null,
      };
    }

    try {
      const res = await this.client.get('/-/healthy');
      if (res.status === 200) {
        this.lastSuccessfulCheck = new Date().toISOString();
        return {
          enabled: true,
          connected: true,
          status: 'connected',
          lastSuccessfulCheck: this.lastSuccessfulCheck,
        };
      }

      return {
        enabled: true,
        connected: false,
        status: 'disconnected',
        lastSuccessfulCheck: this.lastSuccessfulCheck,
        error: `Unexpected status code: ${res.status}`,
      };
    } catch (err: any) {
      logger.warn({ error: err.message, url: env.PROMETHEUS_URL }, 'Prometheus health check failed');
      return {
        enabled: true,
        connected: false,
        status: 'unavailable',
        lastSuccessfulCheck: this.lastSuccessfulCheck,
        error: err.message || 'Prometheus unreachable',
      };
    }
  }

  /**
   * Executes a safe, predefined instant query via GET /api/v1/query.
   */
  async queryInstant(query: string): Promise<number | null> {
    if (!env.PROMETHEUS_ENABLED) return null;

    try {
      const res = await this.client.get('/api/v1/query', {
        params: { query },
      });

      if (res.data?.status !== 'success' || !res.data?.data) {
        return null;
      }

      const result = res.data.data.result;
      if (Array.isArray(result) && result.length > 0) {
        const val = result[0]?.value?.[1];
        if (val !== undefined && val !== null && !isNaN(Number(val))) {
          const num = Number(val);
          return isFinite(num) ? Number(num.toFixed(4)) : null;
        }
      }

      return null;
    } catch (err: any) {
      logger.debug({ query, error: err.message }, 'Prometheus instant query failed or returned no data');
      return null;
    }
  }

  /**
   * Executes a vector query returning all matched series with their labels and values.
   */
  async queryVector(query: string): Promise<Array<{ metric: Record<string, string>; value: [number, string] }>> {
    if (!env.PROMETHEUS_ENABLED) return [];

    try {
      const res = await this.client.get('/api/v1/query', {
        params: { query },
      });

      if (res.data?.status !== 'success' || !res.data?.data?.result) {
        return [];
      }

      return Array.isArray(res.data.data.result) ? res.data.data.result : [];
    } catch (err: any) {
      logger.debug({ query, error: err.message }, 'Prometheus vector query failed');
      return [];
    }
  }

  /**
   * Executes a safe, predefined range query via GET /api/v1/query_range.
   */
  async queryRange(
    query: string,
    start: number,
    end: number,
    step: string,
  ): Promise<HistoricalMetricPoint[]> {
    if (!env.PROMETHEUS_ENABLED) return [];

    try {
      const res = await this.client.get('/api/v1/query_range', {
        params: {
          query,
          start,
          end,
          step,
        },
      });

      if (res.data?.status !== 'success' || !res.data?.data?.result) {
        return [];
      }

      const result = res.data.data.result;
      if (Array.isArray(result) && result.length > 0) {
        const values = result[0]?.values;
        if (Array.isArray(values)) {
          return values
            .map(([ts, val]: [number, string]) => ({
              timestamp: Number(ts),
              value: Number(val),
            }))
            .filter((pt) => !isNaN(pt.value) && isFinite(pt.value));
        }
      }

      return [];
    } catch (err: any) {
      logger.debug({ query, error: err.message }, 'Prometheus range query failed');
      return [];
    }
  }

  /**
   * Builds an attribution selector filter for PromQL queries.
   * Isolates metrics strictly to the specified application ID or service name.
   */
  private buildAppSelector(appId: string, appName?: string): string {
    if (appName) {
      return `{app_id="${appId}"}`;
    }
    return `{app_id="${appId}"}`;
  }

  /**
   * Retrieves aggregated application metrics from Prometheus for a specific application.
   */
  async getApplicationMetrics(
    applicationId: string,
    applicationName: string,
  ): Promise<ApplicationMetricsResult> {
    const apm = await this.getApmOverview(applicationId, applicationName);
    return {
      applicationId: apm.applicationId,
      applicationName: apm.applicationName,
      requestRate: apm.requestRate,
      errorRate: apm.errorRate,
      latencyP50Ms: apm.latencyP50Ms,
      latencyP95Ms: apm.latencyP95Ms,
      latencyP99Ms: apm.latencyP99Ms,
      totalRequests: apm.totalRequests,
      totalErrors: apm.totalErrors,
      status: apm.status === 'available' ? 'available' : 'unavailable',
      collectedAt: apm.collectedAt,
      message: apm.message,
    };
  }

  /**
   * 1. GET APM Overview KPI metrics for a specific attributed application
   */
  async getApmOverview(applicationId: string, applicationName: string): Promise<ApmOverviewResult> {
    const collectedAt = new Date().toISOString();

    const health = await this.checkHealth();
    if (!health.connected) {
      return {
        applicationId,
        applicationName,
        requestRate: null,
        requestsPerMinute: null,
        errorRate: null,
        averageLatencyMs: null,
        latencyP50Ms: null,
        latencyP95Ms: null,
        latencyP99Ms: null,
        totalRequests: null,
        totalErrors: null,
        status: 'unavailable',
        collectedAt,
        message: 'Prometheus server is unreachable or disabled',
      };
    }

    try {
      const sel = this.buildAppSelector(applicationId, applicationName);

      // Execute targeted PromQL queries with strict attribution
      const [
        requestRate,
        errorRateRaw,
        latencyP50Sec,
        latencyP95Sec,
        latencyP99Sec,
        avgLatencySec,
        totalRequests,
        totalErrors,
      ] = await Promise.all([
        this.queryInstant(`sum(rate(sre_copilot_http_requests_total${sel}[5m]))`),
        this.queryInstant(
          `sum(rate(sre_copilot_http_errors_total${sel}[5m])) / sum(rate(sre_copilot_http_requests_total${sel}[5m])) * 100`,
        ),
        this.queryInstant(
          `histogram_quantile(0.50, sum(rate(sre_copilot_http_request_duration_seconds_bucket${sel}[5m])) by (le))`,
        ),
        this.queryInstant(
          `histogram_quantile(0.95, sum(rate(sre_copilot_http_request_duration_seconds_bucket${sel}[5m])) by (le))`,
        ),
        this.queryInstant(
          `histogram_quantile(0.99, sum(rate(sre_copilot_http_request_duration_seconds_bucket${sel}[5m])) by (le))`,
        ),
        this.queryInstant(
          `sum(rate(sre_copilot_http_request_duration_seconds_sum${sel}[5m])) / sum(rate(sre_copilot_http_request_duration_seconds_count${sel}[5m]))`,
        ),
        this.queryInstant(`sum(sre_copilot_http_requests_total${sel})`),
        this.queryInstant(`sum(sre_copilot_http_errors_total${sel})`),
      ]);

      const hasMetrics = totalRequests !== null || requestRate !== null;

      if (!hasMetrics) {
        return {
          applicationId,
          applicationName,
          requestRate: null,
          requestsPerMinute: null,
          errorRate: null,
          averageLatencyMs: null,
          latencyP50Ms: null,
          latencyP95Ms: null,
          latencyP99Ms: null,
          totalRequests: null,
          totalErrors: null,
          status: 'unavailable',
          collectedAt,
          message: 'No APM metrics recorded for this application. Ensure application exposes Prometheus metrics or has x-application-id enabled.',
        };
      }

      const latencyP50Ms = latencyP50Sec !== null ? Number((latencyP50Sec * 1000).toFixed(2)) : null;
      const latencyP95Ms = latencyP95Sec !== null ? Number((latencyP95Sec * 1000).toFixed(2)) : null;
      const latencyP99Ms = latencyP99Sec !== null ? Number((latencyP99Sec * 1000).toFixed(2)) : null;
      const averageLatencyMs = avgLatencySec !== null ? Number((avgLatencySec * 1000).toFixed(2)) : null;
      const requestsPerMinute = requestRate !== null ? Number((requestRate * 60).toFixed(2)) : null;

      let errorRate = errorRateRaw;
      if (errorRate === null && requestRate !== null && requestRate > 0) {
        errorRate = 0;
      }

      return {
        applicationId,
        applicationName,
        requestRate,
        requestsPerMinute,
        errorRate,
        averageLatencyMs,
        latencyP50Ms,
        latencyP95Ms,
        latencyP99Ms,
        totalRequests,
        totalErrors: totalErrors ?? 0,
        status: 'available',
        collectedAt,
      };
    } catch (err: any) {
      logger.error({ applicationId, error: err.message }, 'Failed to compute APM overview');
      return {
        applicationId,
        applicationName,
        requestRate: null,
        requestsPerMinute: null,
        errorRate: null,
        averageLatencyMs: null,
        latencyP50Ms: null,
        latencyP95Ms: null,
        latencyP99Ms: null,
        totalRequests: null,
        totalErrors: null,
        status: 'unavailable',
        collectedAt,
        message: err.message,
      };
    }
  }

  /**
   * 2. GET APM Endpoint level breakdown
   */
  async getApmEndpoints(applicationId: string): Promise<ApmEndpointMetric[]> {
    const sel = this.buildAppSelector(applicationId);

    try {
      const [reqVectors, errVectors, avgLatVectors, p95Vectors] = await Promise.all([
        this.queryVector(`sum by (method, route) (sre_copilot_http_requests_total${sel})`),
        this.queryVector(`sum by (method, route) (sre_copilot_http_errors_total${sel})`),
        this.queryVector(
          `sum by (method, route) (rate(sre_copilot_http_request_duration_seconds_sum${sel}[5m])) / sum by (method, route) (rate(sre_copilot_http_request_duration_seconds_count${sel}[5m]))`,
        ),
        this.queryVector(
          `histogram_quantile(0.95, sum by (le, method, route) (rate(sre_copilot_http_request_duration_seconds_bucket${sel}[5m])))`,
        ),
      ]);

      const endpointMap = new Map<string, ApmEndpointMetric>();

      for (const item of reqVectors) {
        const method = item.metric?.method || 'GET';
        const endpoint = item.metric?.route || '/';
        const key = `${method} ${endpoint}`;
        const requestCount = Number(item.value?.[1] || 0);

        endpointMap.set(key, {
          endpoint,
          method,
          requestCount,
          errorCount: 0,
          errorRate: 0,
          avgLatencyMs: null,
          latencyP95Ms: null,
        });
      }

      for (const item of errVectors) {
        const key = `${item.metric?.method || 'GET'} ${item.metric?.route || '/'}`;
        const target = endpointMap.get(key);
        if (target) {
          target.errorCount = Number(item.value?.[1] || 0);
          if (target.requestCount > 0) {
            target.errorRate = Number(((target.errorCount / target.requestCount) * 100).toFixed(2));
          }
        }
      }

      for (const item of avgLatVectors) {
        const key = `${item.metric?.method || 'GET'} ${item.metric?.route || '/'}`;
        const target = endpointMap.get(key);
        if (target && item.value?.[1]) {
          const val = Number(item.value[1]);
          if (!isNaN(val) && isFinite(val)) {
            target.avgLatencyMs = Number((val * 1000).toFixed(2));
          }
        }
      }

      for (const item of p95Vectors) {
        const key = `${item.metric?.method || 'GET'} ${item.metric?.route || '/'}`;
        const target = endpointMap.get(key);
        if (target && item.value?.[1]) {
          const val = Number(item.value[1]);
          if (!isNaN(val) && isFinite(val)) {
            target.latencyP95Ms = Number((val * 1000).toFixed(2));
          }
        }
      }

      return Array.from(endpointMap.values());
    } catch (err: any) {
      logger.error({ applicationId, error: err.message }, 'Failed to compute APM endpoints breakdown');
      return [];
    }
  }

  /**
   * 3. GET Database Performance for attributed application
   */
  async getApmDatabase(applicationId: string): Promise<ApmDatabaseResult> {
    const collectedAt = new Date().toISOString();
    const sel = this.buildAppSelector(applicationId);

    try {
      const [totalQueries, queryRate, avgDurationSec, slowQueries, queryErrors, opVectors] =
        await Promise.all([
          this.queryInstant(`sum(sre_copilot_db_queries_total${sel})`),
          this.queryInstant(`sum(rate(sre_copilot_db_queries_total${sel}[5m]))`),
          this.queryInstant(
            `sum(rate(sre_copilot_db_query_duration_seconds_sum${sel}[5m])) / sum(rate(sre_copilot_db_query_duration_seconds_count${sel}[5m]))`,
          ),
          this.queryInstant(`sum(sre_copilot_db_slow_queries_total${sel})`),
          this.queryInstant(`sum(sre_copilot_db_query_errors_total${sel})`),
          this.queryVector(`sum by (operation) (sre_copilot_db_queries_total${sel})`),
        ]);

      if (totalQueries === null && queryRate === null) {
        return {
          applicationId,
          status: 'unavailable',
          queryCount: null,
          queryRatePerSec: null,
          averageDurationMs: null,
          slowQueryCount: null,
          queryFailureCount: null,
          operations: [],
          collectedAt,
          message: 'No database queries recorded for this application context',
        };
      }

      const operations = opVectors.map((item) => ({
        operation: item.metric?.operation || 'OTHER',
        count: Number(item.value?.[1] || 0),
      }));

      return {
        applicationId,
        status: 'available',
        queryCount: totalQueries ?? 0,
        queryRatePerSec: queryRate !== null ? Number(queryRate.toFixed(2)) : null,
        averageDurationMs: avgDurationSec !== null ? Number((avgDurationSec * 1000).toFixed(2)) : null,
        slowQueryCount: slowQueries ?? 0,
        queryFailureCount: queryErrors ?? 0,
        operations,
        collectedAt,
      };
    } catch (err: any) {
      logger.error({ applicationId, error: err.message }, 'Failed to query APM database performance');
      return {
        applicationId,
        status: 'unavailable',
        queryCount: null,
        queryRatePerSec: null,
        averageDurationMs: null,
        slowQueryCount: null,
        queryFailureCount: null,
        operations: [],
        collectedAt,
        message: err.message,
      };
    }
  }

  /**
   * 4. GET External Dependencies Performance
   */
  async getApmDependencies(applicationId: string): Promise<ApmDependencyMetric[]> {
    const sel = this.buildAppSelector(applicationId);

    try {
      const [reqVectors, errVectors, avgLatVectors] = await Promise.all([
        this.queryVector(`sum by (dependency) (sre_copilot_external_requests_total${sel})`),
        this.queryVector(`sum by (dependency) (sre_copilot_external_request_errors_total${sel})`),
        this.queryVector(
          `sum by (dependency) (rate(sre_copilot_external_request_duration_seconds_sum${sel}[5m])) / sum by (dependency) (rate(sre_copilot_external_request_duration_seconds_count${sel}[5m]))`,
        ),
      ]);

      const depMap = new Map<string, ApmDependencyMetric>();

      for (const item of reqVectors) {
        const dependency = item.metric?.dependency || 'unknown';
        const requestCount = Number(item.value?.[1] || 0);

        depMap.set(dependency, {
          dependency,
          requestCount,
          errorCount: 0,
          avgLatencyMs: null,
          status: 'healthy',
        });
      }

      for (const item of errVectors) {
        const dependency = item.metric?.dependency || 'unknown';
        const target = depMap.get(dependency);
        if (target) {
          target.errorCount = Number(item.value?.[1] || 0);
          if (target.errorCount > 0 && target.requestCount > 0) {
            const errRatio = target.errorCount / target.requestCount;
            target.status = errRatio > 0.5 ? 'unavailable' : 'degraded';
          }
        }
      }

      for (const item of avgLatVectors) {
        const dependency = item.metric?.dependency || 'unknown';
        const target = depMap.get(dependency);
        if (target && item.value?.[1]) {
          const val = Number(item.value[1]);
          if (!isNaN(val) && isFinite(val)) {
            target.avgLatencyMs = Number((val * 1000).toFixed(2));
          }
        }
      }

      return Array.from(depMap.values());
    } catch (err: any) {
      logger.error({ applicationId, error: err.message }, 'Failed to compute external dependencies');
      return [];
    }
  }

  /**
   * 5. GET Historical Time Series for APM
   */
  async getApmHistory(
    applicationId: string,
    options: { start: number; end: number; step?: string },
  ): Promise<HistoricalMetricsResult> {
    const { start, end } = options;
    const step = options.step || '60s';
    const collectedAt = new Date().toISOString();
    const sel = this.buildAppSelector(applicationId);

    const health = await this.checkHealth();
    if (!health.connected) {
      return {
        applicationId,
        start,
        end,
        step,
        series: [],
        status: 'unavailable',
        collectedAt,
      };
    }

    try {
      const [reqRatePoints, errRatePoints, latencyPoints] = await Promise.all([
        this.queryRange(`sum(rate(sre_copilot_http_requests_total${sel}[1m]))`, start, end, step),
        this.queryRange(
          `sum(rate(sre_copilot_http_errors_total${sel}[1m])) / sum(rate(sre_copilot_http_requests_total${sel}[1m])) * 100`,
          start,
          end,
          step,
        ),
        this.queryRange(
          `histogram_quantile(0.95, sum(rate(sre_copilot_http_request_duration_seconds_bucket${sel}[1m])) by (le))`,
          start,
          end,
          step,
        ),
      ]);

      const series: HistoricalMetricsSeries[] = [
        { metric: 'request_rate', points: reqRatePoints },
        { metric: 'error_rate', points: errRatePoints },
        {
          metric: 'latency_p95_ms',
          points: latencyPoints.map((pt) => ({
            timestamp: pt.timestamp,
            value: Number((pt.value * 1000).toFixed(2)),
          })),
        },
      ];

      const hasPoints = series.some((s) => s.points.length > 0);

      return {
        applicationId,
        start,
        end,
        step,
        series,
        status: hasPoints ? 'available' : 'empty',
        collectedAt,
      };
    } catch (err: any) {
      logger.error({ applicationId, error: err.message }, 'Failed to query APM history');
      return {
        applicationId,
        start,
        end,
        step,
        series: [],
        status: 'unavailable',
        collectedAt,
      };
    }
  }

  /**
   * Retrieves historical time-series metrics for an environment over [start, end].
   */
  async getHistoricalMetrics(
    environmentId: string,
    options: { start: number; end: number; step?: string },
  ): Promise<HistoricalMetricsResult> {
    const { start, end } = options;
    const step = options.step || '60s';
    const collectedAt = new Date().toISOString();

    const health = await this.checkHealth();
    if (!health.connected) {
      return {
        environmentId,
        start,
        end,
        step,
        series: [],
        status: 'unavailable',
        collectedAt,
      };
    }

    try {
      const [reqRatePoints, errRatePoints, latencyPoints] = await Promise.all([
        this.queryRange('sum(rate(sre_copilot_http_requests_total[1m]))', start, end, step),
        this.queryRange('sum(rate(sre_copilot_http_errors_total[1m]))', start, end, step),
        this.queryRange(
          'histogram_quantile(0.95, sum(rate(sre_copilot_http_request_duration_seconds_bucket[1m])) by (le))',
          start,
          end,
          step,
        ),
      ]);

      const series: HistoricalMetricsSeries[] = [
        { metric: 'request_rate', points: reqRatePoints },
        { metric: 'error_count', points: errRatePoints },
        {
          metric: 'latency_p95_ms',
          points: latencyPoints.map((pt) => ({
            timestamp: pt.timestamp,
            value: Number((pt.value * 1000).toFixed(2)),
          })),
        },
      ];

      const hasPoints = series.some((s) => s.points.length > 0);

      return {
        environmentId,
        start,
        end,
        step,
        series,
        status: hasPoints ? 'available' : 'empty',
        collectedAt,
      };
    } catch (err: any) {
      logger.error({ environmentId, error: err.message }, 'Failed to query historical metrics');
      return {
        environmentId,
        start,
        end,
        step,
        series: [],
        status: 'unavailable',
        collectedAt,
      };
    }
  }
}

export const prometheusService = new PrometheusService();
