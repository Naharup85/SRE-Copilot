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
  environmentId: string;
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
      timeout: 5000, // 5s query timeout
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
      // Prometheus provides GET /-/healthy as standard health endpoint
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
   * Retrieves aggregated application metrics from Prometheus for a specific application.
   */
  async getApplicationMetrics(
    applicationId: string,
    applicationName: string,
  ): Promise<ApplicationMetricsResult> {
    const collectedAt = new Date().toISOString();

    const health = await this.checkHealth();
    if (!health.connected) {
      return {
        applicationId,
        applicationName,
        requestRate: null,
        errorRate: null,
        latencyP50Ms: null,
        latencyP95Ms: null,
        latencyP99Ms: null,
        totalRequests: null,
        totalErrors: null,
        status: 'unavailable',
        collectedAt,
      };
    }

    try {
      // Predefined PromQL queries
      const [
        requestRate,
        errorRateRaw,
        latencyP50Sec,
        latencyP95Sec,
        latencyP99Sec,
        totalRequests,
        totalErrors,
      ] = await Promise.all([
        this.queryInstant('sum(rate(sre_copilot_http_requests_total[5m]))'),
        this.queryInstant(
          'sum(rate(sre_copilot_http_errors_total[5m])) / sum(rate(sre_copilot_http_requests_total[5m])) * 100',
        ),
        this.queryInstant(
          'histogram_quantile(0.50, sum(rate(sre_copilot_http_request_duration_seconds_bucket[5m])) by (le))',
        ),
        this.queryInstant(
          'histogram_quantile(0.95, sum(rate(sre_copilot_http_request_duration_seconds_bucket[5m])) by (le))',
        ),
        this.queryInstant(
          'histogram_quantile(0.99, sum(rate(sre_copilot_http_request_duration_seconds_bucket[5m])) by (le))',
        ),
        this.queryInstant('sum(sre_copilot_http_requests_total)'),
        this.queryInstant('sum(sre_copilot_http_errors_total)'),
      ]);

      const latencyP50Ms = latencyP50Sec !== null ? Number((latencyP50Sec * 1000).toFixed(2)) : null;
      const latencyP95Ms = latencyP95Sec !== null ? Number((latencyP95Sec * 1000).toFixed(2)) : null;
      const latencyP99Ms = latencyP99Sec !== null ? Number((latencyP99Sec * 1000).toFixed(2)) : null;

      // Error rate handling: if total requests has 0 errors or no rate, set 0
      let errorRate = errorRateRaw;
      if (errorRate === null && requestRate !== null && requestRate > 0) {
        errorRate = 0;
      }

      const hasAnyMetric =
        requestRate !== null || totalRequests !== null || latencyP95Ms !== null;

      return {
        applicationId,
        applicationName,
        requestRate,
        errorRate,
        latencyP50Ms,
        latencyP95Ms,
        latencyP99Ms,
        totalRequests,
        totalErrors,
        status: hasAnyMetric ? 'available' : 'partial',
        collectedAt,
      };
    } catch (err: any) {
      logger.error({ applicationId, error: err.message }, 'Failed to compute application metrics from Prometheus');
      return {
        applicationId,
        applicationName,
        requestRate: null,
        errorRate: null,
        latencyP50Ms: null,
        latencyP95Ms: null,
        latencyP99Ms: null,
        totalRequests: null,
        totalErrors: null,
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
