import { Router } from 'express';
import { getPrometheusHealth } from './monitoring.controller';
import { authenticate } from '../../middleware/authenticate';

const router = Router();
router.use(authenticate);

router.get('/prometheus/health', getPrometheusHealth);

export { router as monitoringRouter };
