import { useEffect, useState } from 'react';
import { Save, Store } from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader.jsx';
import { Card, CardBody, CardHeader, DefinitionItem } from '../../../components/ui/Card.jsx';
import { EmptyState, ErrorState, InlineNotice, LoadingState } from '../../../components/ui/States.jsx';
import { LabeledInput, LabeledTextarea } from '../../../components/ui/Field.jsx';
import Button from '../../../components/ui/Button.jsx';
import { useAsyncData, useDocumentTitle } from '../../../hooks/useAsyncData.js';
import { useAuth } from '../../../auth/AuthContext.jsx';
import { formatTime } from '../../../lib/format.js';
import { getOwnerRestaurant, updateRestaurant } from '../../../services/restaurants.js';

const emptyForm = {
  name: '',
  description: '',
  cuisine_type: '',
  phone: '',
  email: '',
  address_line: '',
  landmark: '',
  city: 'Belagavi',
  state: 'Karnataka',
  pincode: '',
  default_prep_time_minutes: 20,
  opening_time: '09:00',
  closing_time: '22:00',
  is_active: true,
};

function toForm(restaurant) {
  return {
    name: restaurant.name ?? '',
    description: restaurant.description ?? '',
    cuisine_type: restaurant.cuisine_type ?? '',
    phone: restaurant.phone ?? '',
    email: restaurant.email ?? '',
    address_line: restaurant.address_line ?? '',
    landmark: restaurant.landmark ?? '',
    city: restaurant.city ?? 'Belagavi',
    state: restaurant.state ?? 'Karnataka',
    pincode: restaurant.pincode ?? '',
    default_prep_time_minutes: restaurant.default_prep_time_minutes ?? 20,
    opening_time: restaurant.opening_time?.slice(0, 5) ?? '09:00',
    closing_time: restaurant.closing_time?.slice(0, 5) ?? '22:00',
    is_active: restaurant.is_active ?? true,
  };
}

export default function RestaurantProfile() {
  useDocumentTitle('Restaurant profile');
  const { user } = useAuth();
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const { data, loading, error: loadError, reload, setData } = useAsyncData(
    () => getOwnerRestaurant(user.id),
    [user.id],
  );

  useEffect(() => {
    if (data) setForm(toForm(data));
  }, [data]);

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (!form.name.trim() || !form.address_line.trim() || !form.city.trim() || !form.state.trim()) {
      setError('Restaurant name, address line, city and state are required.');
      return;
    }
    if (form.pincode && !/^\d{6}$/.test(form.pincode)) {
      setError('Pincode must contain exactly 6 digits.');
      return;
    }
    if (Number(form.default_prep_time_minutes) < 1 || Number(form.default_prep_time_minutes) > 240) {
      setError('Default preparation time must be between 1 and 240 minutes.');
      return;
    }
    if (!form.opening_time || !form.closing_time) {
      setError('Set both opening and closing times.');
      return;
    }

    setSaving(true);
    try {
      const updated = await updateRestaurant(data.id, {
        name: form.name,
        description: form.description || null,
        cuisine_type: form.cuisine_type || null,
        phone: form.phone || null,
        email: form.email || null,
        address_line: form.address_line,
        landmark: form.landmark || null,
        city: form.city,
        state: form.state,
        pincode: form.pincode || null,
        default_prep_time_minutes: Number(form.default_prep_time_minutes),
        opening_time: form.opening_time,
        closing_time: form.closing_time,
        is_active: form.is_active,
      });
      setData(updated);
      setSuccess('Restaurant profile saved.');
    } catch (saveError) {
      setError(saveError.message ?? 'Unable to save the restaurant profile.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState rows={5} label="Loading restaurant profile" />;
  if (loadError) return <ErrorState error={loadError} onRetry={reload} />;

  if (!data) {
    return (
      <div className="space-y-5">
        <PageHeader eyebrow="Restaurant settings" title="Restaurant profile" />
        <EmptyState
          icon={Store}
          title="No restaurant is linked to this account"
          description="Ask an administrator to provision the restaurant before editing its profile."
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Restaurant settings"
        title="Profile & operating hours"
        description="Keep the public listing, service hours and preparation estimate accurate."
      />

      <div className="grid gap-5 xl:grid-cols-[1fr_0.55fr]">
        <Card>
          <CardHeader title="Restaurant listing" description="Owner-writable presentation and operations fields." />
          <CardBody>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
              {success ? <InlineNotice tone="success">{success}</InlineNotice> : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <LabeledInput label="Restaurant name" required value={form.name} onChange={(event) => update('name', event.target.value)} />
                <LabeledInput label="Cuisine" value={form.cuisine_type} onChange={(event) => update('cuisine_type', event.target.value)} placeholder="North Karnataka" />
              </div>

              <LabeledTextarea label="Description" value={form.description} onChange={(event) => update('description', event.target.value)} rows={3} placeholder="Describe the kitchen for customers." />

              <div className="grid gap-4 sm:grid-cols-2">
                <LabeledInput label="Phone" type="tel" value={form.phone} onChange={(event) => update('phone', event.target.value)} />
                <LabeledInput label="Email" type="email" value={form.email} onChange={(event) => update('email', event.target.value)} />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <LabeledInput label="Address line" required value={form.address_line} onChange={(event) => update('address_line', event.target.value)} />
                <LabeledInput label="Landmark" value={form.landmark} onChange={(event) => update('landmark', event.target.value)} />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <LabeledInput label="City" required value={form.city} onChange={(event) => update('city', event.target.value)} />
                <LabeledInput label="State" required value={form.state} onChange={(event) => update('state', event.target.value)} />
                <LabeledInput label="Pincode" inputMode="numeric" maxLength={6} value={form.pincode} onChange={(event) => update('pincode', event.target.value)} />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <LabeledInput label="Opening time" type="time" required value={form.opening_time} onChange={(event) => update('opening_time', event.target.value)} />
                <LabeledInput label="Closing time" type="time" required value={form.closing_time} onChange={(event) => update('closing_time', event.target.value)} />
                <LabeledInput label="Default prep (min)" type="number" min="1" max="240" required value={form.default_prep_time_minutes} onChange={(event) => update('default_prep_time_minutes', event.target.value)} />
              </div>

              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line p-3">
                <input type="checkbox" checked={form.is_active} onChange={(event) => update('is_active', event.target.checked)} className="mt-0.5 h-4 w-4 accent-orange-600" />
                <span>
                  <span className="block text-sm font-semibold text-ink">Listing active</span>
                  <span className="block text-xs leading-5 text-muted">
                    Inactive restaurants and their unavailable menu items are hidden from customers.
                    Existing orders are not deleted.
                  </span>
                </span>
              </label>

              <Button type="submit" size="lg" icon={Save} loading={saving}>
                {saving ? 'Saving profile…' : 'Save restaurant profile'}
              </Button>
            </form>
          </CardBody>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Current listing" description="Read-only record summary." />
            <CardBody>
              <dl className="space-y-4">
                <DefinitionItem label="Public slug"><span className="font-mono text-xs">{data.slug}</span></DefinitionItem>
                <DefinitionItem label="Rating">{Number(data.rating).toFixed(1)}</DefinitionItem>
                <DefinitionItem label="Hours">{formatTime(data.opening_time)} – {formatTime(data.closing_time)}</DefinitionItem>
                <DefinitionItem label="Preparation">{data.default_prep_time_minutes} minutes</DefinitionItem>
                <DefinitionItem label="Owner profile"><span className="font-mono text-xs">{data.owner_id}</span></DefinitionItem>
              </dl>
            </CardBody>
          </Card>

          <InlineNotice tone="neutral" title="Protected fields">
            Restaurant name, address, hours, cuisine and availability are writable by the owner. The
            owner link, rating and identifiers are not exposed to browser updates.
          </InlineNotice>

          <InlineNotice tone="info" title="Location">
            Stored latitude and longitude are not edited here. A map and coordinate picker belong to a
            later integration and are not simulated.
          </InlineNotice>
        </div>
      </div>
    </div>
  );
}
