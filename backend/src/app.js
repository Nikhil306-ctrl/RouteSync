import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import apiRouter from './routes/index.js';

const app = new Hono();

const allowedOrigins = (env) =>
  (env?.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

// Restricted CORS for /api. Requests without an Origin header (curl, Workers)
// are allowed; browser origins must be explicitly listed in CORS_ORIGIN.
app.use('/api/*', async (c, next) => {
  const origin = c.req.header('Origin');
  if (!origin || allowedOrigins(c.env).includes(origin)) return next();

  return c.json(
    { error: { code: 'CORS_NOT_ALLOWED', message: 'Origin not allowed.' } },
    403,
  );
});

app.use(
  '/api/*',
  cors({
    origin: (origin) => origin || '*',
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'apikey'],
  }),
);

app.route('/api', apiRouter);

app.notFound(notFoundHandler);
app.onError(errorHandler);

export default app;
