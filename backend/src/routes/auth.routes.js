import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = new Hono();

router.get('/me', requireAuth, (c) => {
  const user = c.get('authUser');
  const profile = c.get('profile');

  return c.json({
    user: {
      id: user.id,
      email: user.email,
      fullName: profile.full_name,
      role: profile.role,
    },
  });
});

export default router;
