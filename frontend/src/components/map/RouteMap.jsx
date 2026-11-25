import { useEffect, useMemo, useState } from 'react';
import { LoaderCircle, Route as RouteIcon } from 'lucide-react';
import MapCanvas from './MapCanvas.jsx';
import { fetchRoadRoute, routeSummary } from '../../lib/routing.js';
import { coordinatePoint } from '../../lib/addressCoordinates.js';

export default function RouteMap({
  restaurant,
  dropoff,
  rider,
  height = 320,
  className = '',
  description = 'Delivery route map',
}) {
  const pickup = coordinatePoint(restaurant);
  const destination = coordinatePoint(dropoff);
  const riderPoint = coordinatePoint(rider);

  const signature = useMemo(
    () =>
      [pickup, destination, riderPoint]
        .map((point) => (point ? `${point.latitude.toFixed(5)},${point.longitude.toFixed(5)}` : '-'))
        .join(';'),
    [pickup, destination, riderPoint],
  );

  const [state, setState] = useState({ route: null, loading: false });

  useEffect(() => {
    if (!pickup || !destination) {
      setState({ route: null, loading: false });
      return undefined;
    }

    const controller = new AbortController();
    let active = true;
    setState({ route: null, loading: true });

    fetchRoadRoute([pickup, destination], { signal: controller.signal })
      .then((route) => {
        if (active) setState({ route, loading: false });
      })
      .catch((error) => {
        if (active && error?.name !== 'AbortError') {
          setState({ route: null, loading: false });
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
    // Signature captures every coordinate value used above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const summary = routeSummary(state.route);
  const points = [];

  if (pickup) {
    points.push({
      id: 'pickup',
      ...pickup,
      label: 'P',
      color: '#ea580c',
      title: restaurant?.name ? `Pickup: ${restaurant.name}` : 'Pickup',
      popup: <span className="text-xs font-semibold">{restaurant?.name ?? 'Pickup'}</span>,
    });
  }
  if (destination) {
    points.push({
      id: 'dropoff',
      ...destination,
      label: 'D',
      color: '#059669',
      title: 'Drop-off',
      popup: <span className="text-xs font-semibold">Drop-off</span>,
    });
  }
  if (riderPoint) {
    points.push({
      id: 'rider',
      ...riderPoint,
      label: 'R',
      color: '#2563eb',
      title: 'Delivery partner',
      popup: <span className="text-xs font-semibold">Delivery partner</span>,
    });
  }

  return (
    <div className={className}>
      <div className="relative">
        <MapCanvas
          points={points}
          path={state.route?.coordinates ?? []}
          height={height}
          description={description}
        />
        {state.loading ? (
          <div className="absolute inset-x-3 bottom-3 z-[400] flex items-center gap-2 rounded-lg bg-white/95 px-3 py-2 text-xs font-semibold text-slate-700 shadow">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            Looking up the road route…
          </div>
        ) : null}
      </div>

      {summary ? (
        <p
          className={`mt-2 flex items-start gap-1.5 text-[0.68rem] leading-4 ${
            summary.fallback ? 'text-amber-800' : 'text-slate-600'
          }`}
        >
          <RouteIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-bold">{summary.label}</span>
            {' · '}
            {(summary.distanceMeters / 1000).toFixed(1)} km · {Math.max(1, Math.round(summary.durationSeconds / 60))} min
            {summary.fallback ? ' (not a road route)' : ''}
          </span>
        </p>
      ) : null}
    </div>
  );
}
