import { Router } from 'express';
import {
  createApplication,
  listApplications,
  getApplication,
  updateApplication,
  deleteApplication,
  getApplicationMetrics,
} from './applications.controller';
import { authenticate } from '../../middleware/authenticate';
import {validate} from '../../middleware/validate';
import {createApplicationSchema, updateApplicationSchema} from './applications.types';

const router = Router();

router.use(authenticate);

router.post('/',validate(createApplicationSchema), createApplication);
router.get('/', listApplications);
router.get('/:id', getApplication);
router.get('/:id/metrics', getApplicationMetrics);
router.patch('/:id',validate(updateApplicationSchema), updateApplication);
router.delete('/:id', deleteApplication);

export { router as applicationsRouter };
