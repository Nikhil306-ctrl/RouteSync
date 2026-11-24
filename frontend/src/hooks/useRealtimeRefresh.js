import { useEffect } from 'react';
import { getSupabaseClient } from '../lib/supabase.js';

const configuredInterval = Number(import.meta.env.VITE_POLL_INTERVAL_MS ?? 20_000);
const POLL_INTERVAL = Number.isFinite(configuredInterval) && configuredInterval >= 5_000
  ? configuredInterval
  : 20_000;
const REALTIME_ENABLED = String(import.meta.env.VITE_REALTIME_ENABLED ?? 'true') !== 'false';

/**
 * Keeps a portal view fresh with an authorized Supabase Realtime subscription.
 *
 * Realtime only delivers rows the signed-in user may read under RLS, so the
 * subscription uses the same publishable browser client as the rest of the app.
 * A capped interval refresh is always installed: if Realtime is not enabled on
 * the Supabase project (or a socket drops) the page still reconciles state.
 *
 * Pass the quiet refresher from useAsyncData so live updates never replace the
 * visible board with a loading skeleton. Realtime bursts are debounced and each
 * refresh is scoped to the caller's authorized rows by the Worker API.
 */
export function useRealtimeRefresh({
  channelName,
  tables = [],
  refresh,
  enabled = true,
  intervalMs = POLL_INTERVAL,
}) {
  const tablesKey = JSON.stringify(tables);

  useEffect(() => {
    if (!enabled || typeof refresh !== 'function') return undefined;

    const client = getSupabaseClient();
    let channel = null;
    let debounce = null;
    let disposed = false;

    const schedule = () => {
      if (disposed) return;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        if (!disposed && document.visibilityState === 'visible') refresh();
      }, 300);
    };

    if (REALTIME_ENABLED && client) {
      try {
        channel = client.channel(channelName);
        for (const entry of JSON.parse(tablesKey)) {
          const tableName = typeof entry === 'string' ? entry : entry.table;
          if (!tableName) continue;
          const config = { event: '*', schema: 'public', table: tableName };
          if (typeof entry === 'object' && entry.filter) config.filter = entry.filter;
          channel.on('postgres_changes', config, schedule);
        }
        channel.subscribe();
      } catch {
        // Realtime is an enhancement. Polling below remains the fallback.
        channel = null;
      }
    }

    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, Math.max(5_000, Number(intervalMs) || POLL_INTERVAL));

    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      disposed = true;
      if (debounce) clearTimeout(debounce);
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisibility);
      if (channel && client) {
        try {
          client.removeChannel(channel);
        } catch {
          // The socket may already be closed; nothing else to clean up.
        }
      }
    };
    // refresh is stable (useCallback) in every caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, tablesKey, refresh, enabled, intervalMs]);
}
