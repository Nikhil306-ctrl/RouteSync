import { useState } from 'react';
import { Crosshair, Info } from 'lucide-react';
import MapCanvas from './MapCanvas.jsx';
import { BELAGAVI_CENTER } from '../../lib/routing.js';
import { coordinatePoint } from '../../lib/addressCoordinates.js';

export default function LocationPicker({ value, onChange, height = 280 }) {
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState('');
  const point = coordinatePoint(value);
  const center = point ?? BELAGAVI_CENTER;

  const handlePick = (latitude, longitude) => {
    setMessage('');
    onChange?.({ latitude: Number(latitude.toFixed(6)), longitude: Number(longitude.toFixed(6)) });
  };

  const handleBrowserLocation = () => {
    setMessage('');
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setMessage('This browser does not provide a foreground location.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        handlePick(position.coords.latitude, position.coords.longitude);
        setMessage('Browser location used. Adjust the pin if it is not the exact door.');
      },
      (error) => {
        setLocating(false);
        setMessage(
          error?.code === error?.PERMISSION_DENIED
            ? 'Location permission was denied. Tap the map to place the pin instead.'
            : 'The browser could not determine a location. Tap the map instead.',
        );
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  };

  return (
    <div className="space-y-2">
      <MapCanvas
        points={
          point
            ? [{ id: 'selected', ...point, label: 'D', color: '#ea580c', title: 'Delivery pin' }]
            : []
        }
        center={center}
        zoom={point ? 15 : 13}
        height={height}
        onPick={handlePick}
        description="Tap the map to set the delivery coordinates"
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-1.5 text-[0.68rem] leading-4 text-slate-600">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
          Tap the map to place the delivery pin. {point ? `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}` : 'No pin set yet.'}
        </p>
        <button
          type="button"
          onClick={handleBrowserLocation}
          disabled={locating}
          className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-bold text-ink hover:bg-slate-50 disabled:text-slate-400"
        >
          <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
          {locating ? 'Locating…' : 'Use my location'}
        </button>
      </div>
      {message ? (
        <p className="rounded-lg border border-line bg-slate-50 px-2.5 py-2 text-[0.68rem] leading-4 text-slate-600">
          {message}
        </p>
      ) : null}
    </div>
  );
}
