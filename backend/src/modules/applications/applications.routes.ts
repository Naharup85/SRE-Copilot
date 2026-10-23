import { Router } from 'express';
import {
  createApplication,
  listApplications,
  getApplication,
  updateApplication,
  deleteApplication,
} from './applications.controller';
import { authenticate } from '../../middleware/authenticate';

const router = Router();

router.use(authenticate);

router.post('/', createApplication);
router.get('/', listApplications);
router.get('/:id', getApplication);
router.patch('/:id', updateApplication);
router.delete('/:id', deleteApplication);

export { router as applicationsRouter };
