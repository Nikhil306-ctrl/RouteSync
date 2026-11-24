import { Hono } from 'hono';
import { getHealth } from '../controllers/health.controller.js';

const router = new Hono();

router.get('/health', getHealth);

export default router;
