import { useEffect, useState } from 'react';
import { CheckCircle2, Crosshair, MapPin, Radio, ShieldAlert } from 'lucide-react';
import Button from '../ui/Button.jsx';
import { LabeledInput } from '../ui/Field.jsx';
import { InlineNotice } from '../ui/States.jsx';
import { BELAGAVI_CENTER } from '../../lib/routing.js';
import { shareRiderLocation } from '../../services/lifecycle.js';
import { coordinatePoint } from '../../lib/addressCoordinates.js';

export default function RiderLocationPanel({ assignmentId = null, defaultPoint, onShared }) {
  const fallback = coordinatePoint(defaultPoint) ?? BELAGAVI_CENTER;
  const [latitude, setLatitude] = useState(String(fallback.latitude));
  const [longitude, setLongitude] = useState(String(fallback.longitude));
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    const next = coordinatePoint(defaultPoint);
    if (next) {
      setLatitude(String(next.latitude));
      setLongitude(String(next.longitude));
    }
  }, [defaultPoint?.latitude, defaultPoint?.longitude]);

  const send = async (source, point, accuracyMeters = null) => {
    setBusy(source);
    setError('');
    setSuccess(null);
    try {
      const response = await shareRiderLocation({
        latitude: point.latitude,
        longitude: point.longitude,
        accuracyMeters,
        source,
        assignmentId,
      });
      setSuccess(response.location);
      onShared?.(response.location);
    } catch (shareError) {
      setError(shareError.message ?? 'Your location could not be shared.');
    } finally {
      setBusy('');
    }
  };

  const handleBrowserLocation = () => {
    setError('');
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('This browser does not provide a foreground location.');
      return;
    }
    setBusy('browser');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setBusy('');
        send('gps', {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }, Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null);
      },
      (geoError) => {
        setBusy('');
        setError(
          geoError?.code === geoError?.PERMISSION_DENIED
            ? 'Location permission was denied. Share a simulated position or allow location access.'
            : 'The browser could not determine a location. Try a simulated position.',
        );
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  };

  const handleSimulated = () => {
    const base = coordinatePoint({ latitude, longitude });
    if (!base) {
      setError('Enter valid simulation coordinates before sharing.');
      return;
    }
    const jitter = () => (Math.random() - 0.5) * 0.0016;
    send('simulated', {
      latitude: Number((base.latitude + jitter()).toFixed(6)),
      longitude: Number((base.longitude + jitter()).toFixed(6)),
    });
  };

  return (
    <div className="space-y-3">
      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
      {success ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-900">
          <p className="flex items-center gap-1.5 font-bold">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            Location shared · {success.source === 'simulated' ? 'simulated' : success.source === 'gps' ? 'browser GPS' : 'manual'}
          </p>
          <p className="mt-1 tabular-nums">
            {Number(success.latitude).toFixed(5)}, {Number(success.longitude).toFixed(5)}
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          variant="dark"
          icon={Crosshair}
          loading={busy === 'browser'}
          disabled={Boolean(busy)}
          onClick={handleBrowserLocation}
          className="flex-1"
        >
          Share browser location
        </Button>
        <Button
          variant="secondary"
          icon={Radio}
          loading={busy === 'simulated'}
          disabled={Boolean(busy)}
          onClick={handleSimulated}
          className="flex-1"
        >
          Share simulated location
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <LabeledInput
          label="Simulation latitude"
          type="number"
          step="any"
          min="-90"
          max="90"
          value={latitude}
          onChange={(event) => setLatitude(event.target.value)}
          hint="Used only when you tap the simulated button."
        />
        <LabeledInput
          label="Simulation longitude"
          type="number"
          step="any"
          min="-180"
          max="180"
          value={longitude}
          onChange={(event) => setLongitude(event.target.value)}
        />
      </div>

      <p className="flex items-start gap-1.5 text-[0.68rem] leading-4 text-slate-600">
        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
        Browser location is a foreground reading only. RouteSync does not track a rider in the background.
      </p>
      <p className="flex items-start gap-1.5 text-[0.68rem] leading-4 text-amber-800">
        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        A simulated position is stored with source “simulated” and is labelled that way to the dispatcher and customer.
      </p>
    </div>
  );
}
