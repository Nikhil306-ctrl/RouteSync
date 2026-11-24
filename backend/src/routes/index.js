import { Hono } from 'hono';
import adminRoutes from './admin.routes.js';
import authRoutes from './auth.routes.js';
import customerRoutes from './customer.routes.js';
import healthRoutes from './health.routes.js';
import restaurantRoutes from './restaurant.routes.js';
import riderRoutes from './rider.routes.js';

const apiRouter = new Hono();

apiRouter.route('/', healthRoutes);
apiRouter.route('/auth', authRoutes);
apiRouter.route('/admin', adminRoutes);
apiRouter.route('/customer', customerRoutes);
apiRouter.route('/restaurant', restaurantRoutes);
apiRouter.route('/rider', riderRoutes);

export default apiRouter;
