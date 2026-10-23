import { Router } from 'express';
import {
  createEnvironment,
  listEnvironments,
  getEnvironment,
  updateEnvironment,
  deleteEnvironment,
} from './environments.controller';
import { authenticate } from '../../middleware/authenticate';

const router = Router();

router.use(authenticate);

// Nested under /applications/:applicationId/environments
router.post('/', createEnvironment);
router.get('/', listEnvironments);

// Standalone environment routes (no applicationId needed)
export const environmentStandaloneRouter = Router();
environmentStandaloneRouter.use(authenticate);
environmentStandaloneRouter.get('/:id', getEnvironment);
environmentStandaloneRouter.patch('/:id', updateEnvironment);
environmentStandaloneRouter.delete('/:id', deleteEnvironment);

export { router as environmentsRouter };
