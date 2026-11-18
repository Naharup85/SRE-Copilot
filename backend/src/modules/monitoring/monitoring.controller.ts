import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { prometheusService } from '../../services/prometheus.service';
import { sendSuccess } from '../../utils/response';
import { env } from '../../config/env';

export const getPrometheusHealth = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const health = await prometheusService.checkHealth();
    sendSuccess(res, health);
  } catch (error) {
    next(error);
  }
};

export const getGrafanaHealth = async (_req: Request, res: Response, _next?: NextFunction): Promise<void> => {
  const dashboards = {
    infrastructure: `${env.GRAFANA_URL}/d/sre-copilot-infra/infrastructure-overview`,
    dockerRuntime: `${env.GRAFANA_URL}/d/sre-copilot-docker/docker-runtime`,
    kubernetesRuntime: `${env.GRAFANA_URL}/d/sre-copilot-k8s/kubernetes-runtime`,
    applicationApm: `${env.GRAFANA_URL}/d/sre-copilot-apm/application-performance-monitoring`,
    applicationLogs: `${env.GRAFANA_URL}/d/sre-copilot-logs/application-logs`,
  };

  if (!env.GRAFANA_ENABLED) {
    sendSuccess(res, {
      enabled: false,
      connected: false,
      status: 'disabled',
      url: env.GRAFANA_URL,
      dashboards,
      message: 'Grafana integration is disabled in configuration',
    });
    return;
  }

  try {
    const response = await axios.get(`${env.GRAFANA_URL}/api/health`, { timeout: 3000 });
    const isOk = response.status === 200 && response.data?.database === 'ok';

    sendSuccess(res, {
      enabled: true,
      connected: isOk,
      status: isOk ? 'connected' : 'disconnected',
      url: env.GRAFANA_URL,
      version: response.data?.version || '11.1.0',
      dashboards,
    });
  } catch (error: any) {
    sendSuccess(res, {
      enabled: true,
      connected: false,
      status: 'disconnected',
      url: env.GRAFANA_URL,
      dashboards,
      error: error.message || 'Could not connect to Grafana server',
    });
  }
};

export const getLokiHealth = async (_req: Request, res: Response, _next?: NextFunction): Promise<void> => {
  const dashboardUrl = `${env.GRAFANA_URL}/d/sre-copilot-logs/application-logs`;

  if (!env.LOKI_ENABLED) {
    sendSuccess(res, {
      enabled: false,
      connected: false,
      status: 'disabled',
      url: env.LOKI_URL,
      dashboardUrl,
      message: 'Loki integration is disabled in configuration',
    });
    return;
  }

  try {
    const response = await axios.get(`${env.LOKI_URL}/ready`, { timeout: 3000 });
    const isReady = response.status === 200 && (typeof response.data === 'string' ? response.data.trim() === 'ready' : true);

    sendSuccess(res, {
      enabled: true,
      connected: isReady,
      status: isReady ? 'connected' : 'disconnected',
      url: env.LOKI_URL,
      dashboardUrl,
    });
  } catch (error: any) {
    sendSuccess(res, {
      enabled: true,
      connected: false,
      status: 'disconnected',
      url: env.LOKI_URL,
      dashboardUrl,
      error: error.message || 'Could not connect to Loki server',
    });
  }
};
