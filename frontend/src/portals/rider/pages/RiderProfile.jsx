import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bike, LocateFixed, Save, ShieldCheck, Signal, UserRound } from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader.jsx';
import { Card, CardBody, CardHeader, DefinitionItem } from '../../../components/ui/Card.jsx';
import { StatusBadge } from '../../../components/ui/Badge.jsx';
import { EmptyState, ErrorState, InlineNotice, LoadingState } from '../../../components/ui/States.jsx';
import { LabeledInput, LabeledSelect } from '../../../components/ui/Field.jsx';
import Button from '../../../components/ui/Button.jsx';
import { useAsyncData, useDocumentTitle } from '../../../hooks/useAsyncData.js';
import { useAuth } from '../../../auth/AuthContext.jsx';
import { formatDateTime, titleCase } from '../../../lib/format.js';
import { updateOwnProfile } from '../../../services/profiles.js';
import { getRider, updateRiderVehicle } from '../../../services/riders.js';
import { setRiderAvailability } from '../../../services/lifecycle.js';

const vehicleTypes = ['bike', 'scooter', 'bicycle', 'car', 'on_foot'];

export default function RiderProfile() {
  useDocumentTitle('Profile & vehicle');
  const { user, profile, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [vehicleType, setVehicleType] = useState('bike');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingVehicle, setSavingVehicle] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const { data, loading, error: loadError, reload, setData } = useAsyncData(
    () => getRider(user.id),
    [user.id],
  );

  useEffect(() => {
    setFullName(profile?.full_name ?? '');
    setPhone(profile?.phone ?? '');
  }, [profile]);

  useEffect(() => {
    if (data) {
      setVehicleType(data.vehicle_type ?? 'bike');
      setVehicleNumber(data.vehicle_number ?? '');
    }
  }, [data]);

  if (loading) return <LoadingState rows={4} label="Loading rider profile" />;
  if (loadError) return <ErrorState error={loadError} onRetry={reload} />;

  if (!data) {
    return (
      <div className="space-y-4">
        <PageHeader eyebrow="Delivery partner" title="Profile & vehicle" />
        <EmptyState
          icon={Bike}
          title="Rider profile not provisioned"
          description="Ask a dispatcher to link a rider record to your account before updating vehicle details."
        />
      </div>
    );
  }

  const handleProfileSave = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (!fullName.trim()) {
      setError('Full name cannot be empty.');
      return;
    }
    setSavingProfile(true);
    try {
      await updateOwnProfile(user.id, { full_name: fullName, phone });
      await refreshProfile();
      setSuccess('Profile details saved.');
    } catch (saveError) {
      setError(saveError.message ?? 'Unable to save profile details.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleVehicleSave = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (!vehicleType) {
      setError('Choose a vehicle type.');
      return;
    }
    if (vehicleNumber && vehicleNumber.trim().length < 4) {
      setError('Enter a valid vehicle number or leave it blank.');
      return;
    }
    setSavingVehicle(true);
    try {
      const updated = await updateRiderVehicle(data.id, { vehicle_type: vehicleType, vehicle_number: vehicleNumber });
      setData(updated);
      setSuccess('Vehicle details saved.');
    } catch (saveError) {
      setError(saveError.message ?? 'Unable to save vehicle details.');
    } finally {
      setSavingVehicle(false);
    }
  };

  const toggleAvailability = async () => {
    setToggling(true);
    setError('');
    setSuccess('');
    try {
      const { rider: updated } = await setRiderAvailability(!data.is_available);
      setData(updated);
      setSuccess(updated.is_available ? 'You are now marked available.' : 'You are now marked unavailable.');
    } catch (availabilityError) {
      setError(availabilityError.message ?? 'Unable to update availability.');
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Delivery partner"
        title="Profile & vehicle"
        description="Your account details and the rider fields you are permitted to change. Verification and capacity are trusted dispatch values."
        actions={
          <Link
            to="/delivery-partner/settings"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            Account settings
          </Link>
        }
      />

      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
      {success ? <InlineNotice tone="success">{success}</InlineNotice> : null}

      <div className={`rounded-xl border p-4 ${data.is_available ? 'border-emerald-200 bg-emerald-50/70' : 'border-line bg-white'}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${data.is_available ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
              <Signal className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-bold text-ink">{data.is_available ? 'Available for assignments' : 'Currently unavailable'}</p>
              <p className="mt-0.5 text-xs text-muted">Availability can be changed here at any time.</p>
            </div>
          </div>
          <Button
            variant={data.is_available ? 'secondary' : 'primary'}
            onClick={toggleAvailability}
            loading={toggling}
          >
            {data.is_available ? 'Go unavailable' : 'Go available'}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Account details" description="Only full name and phone are writable profile fields." />
          <CardBody>
            <form onSubmit={handleProfileSave} className="space-y-4">
              <LabeledInput label="Full name" required autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} />
              <LabeledInput label="Phone" type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+91" />
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium text-muted">Email</p>
                  <p className="mt-1.5 rounded-lg border border-line bg-slate-50 px-3 py-2.5 text-sm text-slate-600">{user?.email}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted">Rider ID</p>
                  <p className="mt-1.5 truncate rounded-lg border border-line bg-slate-50 px-3 py-2.5 font-mono text-xs text-slate-600">{data.id}</p>
                </div>
              </div>
              <Button type="submit" icon={Save} loading={savingProfile}>Save profile</Button>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Vehicle" description="Vehicle type and number are self-service rider fields." />
          <CardBody>
            <form onSubmit={handleVehicleSave} className="space-y-4">
              <LabeledSelect label="Vehicle type" value={vehicleType} onChange={(event) => setVehicleType(event.target.value)}>
                {vehicleTypes.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}
              </LabeledSelect>
              <LabeledInput
                label="Vehicle number"
                value={vehicleNumber}
                onChange={(event) => setVehicleNumber(event.target.value.toUpperCase())}
                placeholder="KA-00-AB-0000"
                hint="Must be unique. Leave blank if you do not have a registered vehicle number."
              />
              <Button type="submit" icon={Bike} loading={savingVehicle}>Save vehicle</Button>
            </form>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Protected rider record" description="Values you can see but not change." />
        <CardBody>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <DefinitionItem label="Verification"><StatusBadge status={data.verification_status} /></DefinitionItem>
            <DefinitionItem label="Concurrent capacity">{data.max_concurrent_orders} orders</DefinitionItem>
            <DefinitionItem label="Rating">{Number(data.rating).toFixed(1)}</DefinitionItem>
            <DefinitionItem label="Last stored location">
              <span className="inline-flex items-center gap-1.5">
                <LocateFixed className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                {data.last_location_at ? formatDateTime(data.last_location_at) : 'None recorded'}
              </span>
            </DefinitionItem>
          </dl>
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-line bg-slate-50 p-3 text-xs leading-5 text-slate-600">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
            Verification, capacity and location writes belong to trusted operational flows. Changing your availability
            does not imply that a live location is being shared.
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Need help?" description="Account and security controls live in settings." />
        <CardBody className="flex flex-wrap items-center gap-3 text-sm">
          <Link to="/delivery-partner/settings" className="inline-flex items-center gap-1.5 font-bold text-accent hover:text-accent-strong">
            <UserRound className="h-4 w-4" aria-hidden="true" /> Open account settings
          </Link>
          <span className="text-xs text-muted">Password changes use the Supabase recovery flow.</span>
        </CardBody>
      </Card>
    </div>
  );
}
