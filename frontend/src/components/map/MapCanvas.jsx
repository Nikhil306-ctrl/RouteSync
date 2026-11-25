import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { BELAGAVI_CENTER } from '../../lib/routing.js';
import { coordinatePoint } from '../../lib/addressCoordinates.js';

const iconCache = new Map();

function safeLabel(label) {
  const text = String(label ?? '').slice(0, 2).toUpperCase();
  return text.replace(/[^A-Z0-9]/g, '') || '•';
}

function pinIcon(color = '#f97316', label = '') {
  const key = `${color}:${label}`;
  if (iconCache.has(key)) return iconCache.get(key);
  const icon = L.divIcon({
    className: 'routesync-map-pin',
    html: `<span style="display:grid;place-items:center;width:28px;height:28px;border-radius:9999px;background:${color};border:3px solid #fff;box-shadow:0 2px 8px rgba(15,23,42,.35);color:#fff;font:700 10px/1 system-ui,sans-serif">${safeLabel(
      label,
    )}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
  iconCache.set(key, icon);
  return icon;
}

function FitBounds({ coordinates, enabled }) {
  const map = useMap();
  const coordinatesRef = useRef(coordinates);
  coordinatesRef.current = coordinates;
  const signature = coordinates
    .map(([latitude, longitude]) => `${latitude.toFixed(5)},${longitude.toFixed(5)}`)
    .join(';');

  useEffect(() => {
    const next = coordinatesRef.current;
    if (!enabled || !next.length) return;
    if (next.length === 1) {
      map.setView(next[0], Math.max(map.getZoom(), 14));
      return;
    }
    map.fitBounds(L.latLngBounds(next), { padding: [28, 28], maxZoom: 15 });
  }, [map, signature, enabled]);

  return null;
}

function PickHandler({ onPick }) {
  useMapEvents({
    click(event) {
      onPick?.(Number(event.latlng.lat), Number(event.latlng.lng));
    },
  });
  return null;
}

function ResizeFix() {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 120);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

export default function MapCanvas({
  points = [],
  path = [],
  center,
  zoom = 13,
  height = 320,
  fit = true,
  interactive = true,
  scrollWheelZoom = false,
  onPick,
  description = 'Map of the delivery area',
  className = '',
}) {
  const markerPoints = points.flatMap((point) => {
    const coordinates = coordinatePoint(point);
    return coordinates ? [{ ...point, ...coordinates }] : [];
  });

  const coordinates = useMemo(() => {
    const list = markerPoints.map((point) => [Number(point.latitude), Number(point.longitude)]);
    if (path.length) list.push(...path);
    return list;
  }, [markerPoints, path]);

  const initialCenter = center
    ? [Number(center.latitude), Number(center.longitude)]
    : markerPoints[0]
      ? [Number(markerPoints[0].latitude), Number(markerPoints[0].longitude)]
      : [BELAGAVI_CENTER.latitude, BELAGAVI_CENTER.longitude];

  return (
    <div className={`relative overflow-hidden rounded-xl border border-line bg-slate-100 ${className}`}>
      <span className="sr-only">{description}</span>
      <MapContainer
        center={initialCenter}
        zoom={zoom}
        style={{ height, width: '100%' }}
        scrollWheelZoom={scrollWheelZoom}
        dragging={interactive}
        doubleClickZoom={interactive}
        zoomControl={interactive}
        attributionControl
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <ResizeFix />
        <FitBounds coordinates={coordinates} enabled={fit} />
        {onPick ? <PickHandler onPick={onPick} /> : null}
        {path.length > 1 ? (
          <Polyline positions={path} pathOptions={{ color: '#f97316', weight: 4, opacity: 0.85 }} />
        ) : null}
        {markerPoints.map((point) => (
          <Marker
            key={point.id ?? `${point.latitude},${point.longitude}`}
            position={[Number(point.latitude), Number(point.longitude)]}
            icon={pinIcon(point.color, point.label)}
            title={point.title ?? point.label}
          >
            {point.popup ? <Popup>{point.popup}</Popup> : null}
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
