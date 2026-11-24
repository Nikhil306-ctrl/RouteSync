import { probeSupabase } from '../lib/supabase.health.js';

function detectRuntime(assetsBound) {
  const userAgent = globalThis.navigator?.userAgent ?? '';
  const detected =
    userAgent.toLowerCase().includes('workerd') ||
    typeof globalThis.WorkerGlobalScope !== 'undefined';

  return {
    target: 'cloudflare-workers',
    detected,
    assetsBound,
  };
}

/** Live Worker + Supabase status for the frontend foundation page. */
export async function getHealth(c) {
  const supabase = await probeSupabase(c.env);
  const runtime = detectRuntime(Boolean(c.env?.ASSETS));
  const healthy = runtime.detected && runtime.assetsBound && supabase.connected;

  return c.json(
    {
      status: healthy ? 'ok' : 'degraded',
      service: 'routesync-api',
      runtime,
      supabase,
      timestamp: new Date().toISOString(),
    },
    healthy ? 200 : 503,
  );
}
