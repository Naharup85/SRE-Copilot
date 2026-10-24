import { Router } from 'express';
import {
  createDeployment,
  listDeployments,
  listAllDeployments,
  getDeployment,
  getDeploymentLogs,
  getDashboardStats,
} from './deployments.controller';
import { authenticate } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import { createDeploymentSchema } from './deployments.types';

const router = Router();

router.use(authenticate);

// Nested under /environments/:environmentId/deployments
router.post('/',validate(createDeploymentSchema), createDeployment);
router.get('/', listDeployments);

// Standalone deployment routes
export const deploymentStandaloneRouter = Router();
deploymentStandaloneRouter.use(authenticate);
deploymentStandaloneRouter.get('/', listAllDeployments);
deploymentStandaloneRouter.get('/dashboard', getDashboardStats);
deploymentStandaloneRouter.get('/:id', getDeployment);
deploymentStandaloneRouter.get('/:id/logs', getDeploymentLogs);

export { router as deploymentsRouter };
