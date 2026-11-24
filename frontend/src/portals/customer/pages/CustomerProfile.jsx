import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  Home,
  MapPin,
  Pencil,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  UserRound,
} from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader.jsx';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card.jsx';
import Badge from '../../../components/ui/Badge.jsx';
import { EmptyState, ErrorState, InlineNotice, LoadingState } from '../../../components/ui/States.jsx';
import Button, { LinkButton } from '../../../components/ui/Button.jsx';
import { LabeledInput } from '../../../components/ui/Field.jsx';
import Modal from '../../../components/ui/Modal.jsx';
import { useAsyncData, useDocumentTitle } from '../../../hooks/useAsyncData.js';
import { useAuth } from '../../../auth/AuthContext.jsx';
import { ROLE_LABELS } from '../../../lib/roles.js';
import {
  createAddress,
  deleteAddress,
  listAddresses,
  setDefaultAddress,
  updateAddress,
} from '../../../services/addresses.js';
import { updateOwnProfile } from '../../../services/profiles.js';

function formatAddress(address) {
  return [
    address.address_line1,
    address.address_line2,
    address.landmark,
    [address.city, address.state].filter(Boolean).join(', '),
    address.pincode,
  ]
    .filter(Boolean)
    .join(', ');
}

export default function CustomerProfile() {
  useDocumentTitle('Profile & addresses');
  const { user, profile, role, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');

  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState(null);
  const [addressForm, setAddressForm] = useState({
    label: 'Home',
    recipient_name: '',
    phone: '',
    address_line1: '',
    address_line2: '',
    landmark: '',
    city: 'Belagavi',
    state: 'Karnataka',
    pincode: '',
    is_default: false,
  });
  const [formError, setFormError] = useState('');
  const [savingAddress, setSavingAddress] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  const { data, loading, error, reload } = useAsyncData(async () => {
    if (!user) return [];
    return listAddresses(user.id);
  }, [user?.id]);

  const addresses = data ?? [];

  useEffect(() => {
    setFullName(profile?.full_name ?? '');
    setPhone(profile?.phone ?? '');
  }, [profile]);

  const makeBlankAddress = () => ({
    label: 'Home',
    recipient_name: profile?.full_name ?? '',
    phone: profile?.phone ?? '',
    address_line1: '',
    address_line2: '',
    landmark: '',
    city: 'Belagavi',
    state: 'Karnataka',
    pincode: '',
    is_default: addresses.length === 0,
  });

  const openCreate = () => {
    setEditingAddress(null);
    setAddressForm(makeBlankAddress());
    setFormError('');
    setAddressModalOpen(true);
  };

  const openEdit = (address) => {
    setEditingAddress(address);
    setAddressForm({
      label: address.label ?? 'Home',
      recipient_name: address.recipient_name ?? '',
      phone: address.phone ?? '',
      address_line1: address.address_line1 ?? '',
      address_line2: address.address_line2 ?? '',
      landmark: address.landmark ?? '',
      city: address.city ?? 'Belagavi',
      state: address.state ?? 'Karnataka',
      pincode: address.pincode ?? '',
      is_default: Boolean(address.is_default),
    });
    setFormError('');
    setAddressModalOpen(true);
  };

  const handleProfileSave = async (event) => {
    event.preventDefault();
    setProfileError('');
    setProfileSuccess('');
    if (!fullName.trim()) {
      setProfileError('Full name cannot be empty.');
      return;
    }
    setSavingProfile(true);
    try {
      await updateOwnProfile(user.id, { full_name: fullName, phone });
      await refreshProfile();
      setProfileSuccess('Profile details saved.');
    } catch (saveError) {
      setProfileError(saveError.message ?? 'Unable to save profile details.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleAddressSave = async (event) => {
    event.preventDefault();
    setFormError('');
    if (!addressForm.recipient_name.trim()) {
      setFormError('Recipient name is required.');
      return;
    }
    if (!addressForm.address_line1.trim()) {
      setFormError('Address line 1 is required.');
      return;
    }
    if (addressForm.pincode && !/^\d{6}$/.test(addressForm.pincode)) {
      setFormError('Pincode must be exactly 6 digits.');
      return;
    }

    setSavingAddress(true);
    setActionError('');
    setActionSuccess('');
    try {
      if (editingAddress) {
        await updateAddress(editingAddress.id, user.id, addressForm);
        setActionSuccess('Delivery address updated.');
      } else {
        await createAddress(user.id, addressForm);
        setActionSuccess('Delivery address added.');
      }
      setAddressModalOpen(false);
      reload();
    } catch (saveError) {
      setFormError(saveError.message ?? 'Unable to save this address.');
    } finally {
      setSavingAddress(false);
    }
  };

  const handleSetDefault = async (address) => {
    setActionError('');
    setActionSuccess('');
    try {
      await setDefaultAddress(address.id, user.id);
      setActionSuccess(`${address.label} is now the default delivery address.`);
      reload();
    } catch (defaultError) {
      setActionError(defaultError.message ?? 'Unable to set the default address.');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setActionError('');
    setActionSuccess('');
    try {
      await deleteAddress(deleteTarget.id);
      setActionSuccess('Delivery address removed.');
      setDeleteTarget(null);
      reload();
    } catch (deleteError) {
      setActionError(deleteError.message ?? 'Unable to remove this address.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Customer account"
        title="Profile & addresses"
        description="Manage the profile fields and delivery addresses your account is allowed to change. Role and account status remain protected."
        actions={<LinkButton to="/customer/settings" variant="secondary" icon={ShieldCheck}>Account settings</LinkButton>}
      />

      {actionError ? <InlineNotice tone="danger">{actionError}</InlineNotice> : null}
      {actionSuccess ? <InlineNotice tone="success">{actionSuccess}</InlineNotice> : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px] lg:items-start">
        <Card>
          <CardHeader title="Profile details" description="Only full name, phone and avatar are writable profile fields." />
          <CardBody>
            <form onSubmit={handleProfileSave} className="space-y-4">
              {profileError ? <InlineNotice tone="danger">{profileError}</InlineNotice> : null}
              {profileSuccess ? <InlineNotice tone="success">{profileSuccess}</InlineNotice> : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <LabeledInput
                  label="Full name"
                  required
                  autoComplete="name"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                />
                <LabeledInput
                  label="Phone"
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="+91"
                  hint="Used as the default delivery contact when you add an address."
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Email</p>
                  <p className="mt-1.5 truncate rounded-lg border border-line bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
                    {user?.email}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Role</p>
                  <p className="mt-1.5 flex items-center gap-2 rounded-lg border border-line bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
                    <UserRound className="h-4 w-4 text-slate-400" aria-hidden="true" />
                    {ROLE_LABELS[role] ?? 'Customer'}
                  </p>
                </div>
              </div>

              <Button type="submit" icon={Save} loading={savingProfile}>Save profile</Button>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Account & security" description="Protected values and recovery." />
          <CardBody className="space-y-3">
            <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-900">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              Your role and account status are read from the protected profile row. They cannot be changed
              from this page.
            </div>
            <Link
              to="/customer/settings"
              className="inline-flex items-center gap-1.5 text-sm font-bold text-accent hover:text-accent-strong"
            >
              Open account settings
            </Link>
            <p className="text-xs leading-5 text-muted">
              Password changes use the Supabase recovery flow. No password value is stored or read by
              this interface.
            </p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Delivery addresses"
          description={
            loading
              ? 'Loading saved addresses…'
              : `${addresses.length} saved address${addresses.length === 1 ? '' : 'es'} · one can be the default`
          }
          action={<Button size="sm" icon={Plus} onClick={openCreate}>Add address</Button>}
        />

        {loading ? (
          <div className="p-4">
            <LoadingState rows={2} label="Loading delivery addresses" />
          </div>
        ) : error ? (
          <div className="p-4">
            <ErrorState error={error} onRetry={reload} title="We could not load your addresses" />
          </div>
        ) : addresses.length ? (
          <CardBody>
            <div className="grid gap-3 sm:grid-cols-2">
              {addresses.map((address) => (
                <article
                  key={address.id}
                  className={`rounded-xl border p-4 ${
                    address.is_default ? 'border-emerald-200 bg-emerald-50/50' : 'border-line bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${address.is_default ? 'bg-emerald-100 text-emerald-700' : 'bg-warm text-accent'}`}>
                        <Home className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-ink">{address.label}</p>
                        {address.is_default ? <Badge variant="green" className="mt-1">Default</Badge> : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(address)}
                        className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-ink"
                        aria-label={`Edit ${address.label} address`}
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(address)}
                        className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-700"
                        aria-label={`Delete ${address.label} address`}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  <p className="mt-3 text-sm font-semibold text-ink">
                    {address.recipient_name}
                    {address.phone ? <span className="font-normal text-muted"> · {address.phone}</span> : null}
                  </p>
                  <p className="mt-1 flex items-start gap-1.5 text-xs leading-5 text-muted">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                    {formatAddress(address)}
                  </p>

                  {!address.is_default ? (
                    <button
                      type="button"
                      onClick={() => handleSetDefault(address)}
                      className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-accent hover:text-accent-strong"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Set as default
                    </button>
                  ) : null}
                </article>
              ))}
            </div>
          </CardBody>
        ) : (
          <div className="p-4">
            <EmptyState
              compact
              icon={MapPin}
              title="No delivery addresses yet"
              description="Add a delivery address so a trusted checkout can attach it to an order."
              action={<Button size="sm" icon={Plus} onClick={openCreate}>Add your first address</Button>}
            />
          </div>
        )}
      </Card>

      <Modal
        open={addressModalOpen}
        onClose={() => setAddressModalOpen(false)}
        title={editingAddress ? 'Edit delivery address' : 'Add delivery address'}
        description="Addresses are saved to your own customer address rows and filtered by row-level security."
        footer={
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setAddressModalOpen(false)}>Cancel</Button>
            <Button type="submit" form="address-form" icon={Save} loading={savingAddress}>
              {editingAddress ? 'Save changes' : 'Add address'}
            </Button>
          </div>
        }
      >
        <form id="address-form" onSubmit={handleAddressSave} className="space-y-4">
          {formError ? <InlineNotice tone="danger">{formError}</InlineNotice> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <LabeledInput
              label="Label"
              value={addressForm.label}
              onChange={(event) => setAddressForm((current) => ({ ...current, label: event.target.value }))}
              placeholder="Home, Work, Hostel…"
              maxLength={40}
            />
            <LabeledInput
              label="Recipient name"
              required
              autoComplete="name"
              value={addressForm.recipient_name}
              onChange={(event) => setAddressForm((current) => ({ ...current, recipient_name: event.target.value }))}
            />
          </div>

          <LabeledInput
            label="Phone"
            type="tel"
            autoComplete="tel"
            value={addressForm.phone}
            onChange={(event) => setAddressForm((current) => ({ ...current, phone: event.target.value }))}
            placeholder="+91"
          />

          <LabeledInput
            label="Address line 1"
            required
            autoComplete="address-line1"
            value={addressForm.address_line1}
            onChange={(event) => setAddressForm((current) => ({ ...current, address_line1: event.target.value }))}
            placeholder="House / flat, street"
          />
          <LabeledInput
            label="Address line 2"
            autoComplete="address-line2"
            value={addressForm.address_line2}
            onChange={(event) => setAddressForm((current) => ({ ...current, address_line2: event.target.value }))}
            placeholder="Area, building (optional)"
          />
          <LabeledInput
            label="Landmark"
            value={addressForm.landmark}
            onChange={(event) => setAddressForm((current) => ({ ...current, landmark: event.target.value }))}
            placeholder="Near…"
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <LabeledInput
              label="City"
              required
              autoComplete="address-level2"
              value={addressForm.city}
              onChange={(event) => setAddressForm((current) => ({ ...current, city: event.target.value }))}
            />
            <LabeledInput
              label="State"
              required
              autoComplete="address-level1"
              value={addressForm.state}
              onChange={(event) => setAddressForm((current) => ({ ...current, state: event.target.value }))}
            />
            <LabeledInput
              label="Pincode"
              inputMode="numeric"
              autoComplete="postal-code"
              value={addressForm.pincode}
              onChange={(event) =>
                setAddressForm((current) => ({
                  ...current,
                  pincode: event.target.value.replace(/\D/g, '').slice(0, 6),
                }))
              }
              placeholder="590001"
              maxLength={6}
              hint="6 digits"
            />
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line bg-slate-50 p-3">
            <input
              type="checkbox"
              checked={addressForm.is_default}
              onChange={(event) => setAddressForm((current) => ({ ...current, is_default: event.target.checked }))}
              className="mt-0.5 h-4 w-4 shrink-0 accent-orange-600"
            />
            <span>
              <span className="block text-xs font-bold text-ink">Use as my default delivery address</span>
              <span className="mt-0.5 block text-[0.68rem] leading-4 text-muted">
                Setting this address as default clears the default flag on your other addresses.
              </span>
            </span>
          </label>
        </form>
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Remove this address?"
        description={deleteTarget ? `${deleteTarget.label} · ${formatAddress(deleteTarget)}` : ''}
        size="sm"
      >
        <div className="space-y-4">
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-900">
            Existing orders keep their recorded delivery address line. This removes the saved address
            from your profile only.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Keep address</Button>
            <Button variant="danger" icon={Trash2} loading={deleting} onClick={handleDelete}>
              Remove address
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
