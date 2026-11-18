import { Router } from 'express';
import { getPrometheusHealth, getGrafanaHealth, getLokiHealth } from './monitoring.controller';
import { authenticate } from '../../middleware/authenticate';

const router = Router();
router.use(authenticate);

router.get('/prometheus/health', getPrometheusHealth);
router.get('/grafana/health', getGrafanaHealth);
router.get('/loki/health', getLokiHealth);

export { router as monitoringRouter };
