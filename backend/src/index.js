import app from './app.js';
import { runPendingSchedulingOnce } from './lib/scheduling-cron.js';

// Cloudflare Workers entry point: the Worker and static assets share one origin.
export default {
  fetch: (request, env, ctx) => app.fetch(request, env, ctx),
  scheduled: (_event, env, ctx) => ctx.waitUntil(runPendingSchedulingOnce(env)),
};
