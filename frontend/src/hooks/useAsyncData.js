import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Small query helper for Supabase reads. The loader ref keeps the latest
 * closure without retriggering a request on every render.
 */
export function useAsyncData(loader, deps = []) {
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const [state, setState] = useState({ data: null, loading: true, error: null });
  const [tick, setTick] = useState(0);
  const quietRefreshRef = useRef(false);
  const depsKey = JSON.stringify(deps);

  const reload = useCallback(() => {
    quietRefreshRef.current = false;
    setTick((value) => value + 1);
  }, []);

  // Background refresh keeps the current data on screen. Used by Realtime and
  // polling so a live board does not flash a full skeleton every few seconds.
  const reloadQuiet = useCallback(() => {
    quietRefreshRef.current = true;
    setTick((value) => value + 1);
  }, []);

  const setData = useCallback((next) => {
    setState((current) => ({
      ...current,
      data: typeof next === 'function' ? next(current.data) : next,
    }));
  }, []);

  useEffect(() => {
    let active = true;
    const quiet = quietRefreshRef.current;
    quietRefreshRef.current = false;

    setState((current) =>
      quiet
        ? { ...current, error: null }
        : { ...current, loading: true, error: null },
    );

    Promise.resolve()
      .then(() => loaderRef.current())
      .then((data) => {
        if (active) setState({ data, loading: false, error: null });
      })
      .catch((error) => {
        if (active) {
          setState((current) => ({
            data: quiet ? current.data : null,
            loading: false,
            error: error instanceof Error ? error : new Error('Unable to load this data.'),
          }));
        }
      });

    return () => {
      active = false;
    };
  }, [depsKey, tick]);

  return { ...state, reload, reloadQuiet, setData };
}

export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · RouteSync` : 'RouteSync';
    return () => {
      document.title = 'RouteSync';
    };
  }, [title]);
}
