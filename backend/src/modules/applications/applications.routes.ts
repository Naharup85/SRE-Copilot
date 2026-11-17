import { Router } from 'express';
import {
  createApplication,
  listApplications,
  getApplication,
  updateApplication,
  deleteApplication,
  getApplicationMetrics,
  getApplicationApm,
  getApplicationApmEndpoints,
  getApplicationApmDatabase,
  getApplicationApmDependencies,
  getApplicationApmHistory,
} from './applications.controller';
import { authenticate } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import { createApplicationSchema, updateApplicationSchema } from './applications.types';

const router = Router();

router.use(authenticate);

router.post('/', validate(createApplicationSchema), createApplication);
router.get('/', listApplications);
router.get('/:id', getApplication);
router.get('/:id/metrics', getApplicationMetrics);
router.get('/:id/apm', getApplicationApm);
router.get('/:id/apm/endpoints', getApplicationApmEndpoints);
router.get('/:id/apm/database', getApplicationApmDatabase);
router.get('/:id/apm/dependencies', getApplicationApmDependencies);
router.get('/:id/apm/history', getApplicationApmHistory);
router.patch('/:id', validate(updateApplicationSchema), updateApplication);
router.delete('/:id', deleteApplication);

export { router as applicationsRouter };
