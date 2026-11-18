import { Router } from 'express';
import { getPrometheusHealth, getGrafanaHealth } from './monitoring.controller';
import { authenticate } from '../../middleware/authenticate';

const router = Router();
router.use(authenticate);

router.get('/prometheus/health', getPrometheusHealth);
router.get('/grafana/health', getGrafanaHealth);

export { router as monitoringRouter };
