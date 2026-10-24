import { Router } from 'express';
import {
  createEnvironment,
  listEnvironments,
  getEnvironment,
  updateEnvironment,
  deleteEnvironment,
} from './environments.controller';
import { authenticate } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import { createEnvironmentSchema } from './environments.types';
import { updateEnvironmentSchema } from './environments.types';

const router = Router();

router.use(authenticate);

// Nested under /applications/:applicationId/environments
router.post('/', validate(createEnvironmentSchema),createEnvironment);
router.get('/', listEnvironments);

// Standalone environment routes (no applicationId needed)
export const environmentStandaloneRouter = Router();
environmentStandaloneRouter.use(authenticate);
environmentStandaloneRouter.get('/:id',getEnvironment);
environmentStandaloneRouter.patch('/:id', validate(updateEnvironmentSchema), updateEnvironment);
environmentStandaloneRouter.delete('/:id', deleteEnvironment);

export { router as environmentsRouter };
