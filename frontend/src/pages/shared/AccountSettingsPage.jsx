import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound, LogOut, Mail, Save, ShieldCheck, UserRound } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { Card, CardBody, CardHeader, DefinitionItem } from '../../components/ui/Card.jsx';
import { LabeledInput } from '../../components/ui/Field.jsx';
import Button from '../../components/ui/Button.jsx';
import { InlineNotice } from '../../components/ui/States.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useDocumentTitle } from '../../hooks/useAsyncData.js';
import { updateOwnProfile } from '../../services/profiles.js';
import { ROLE_LABELS } from '../../lib/roles.js';

const roleMessages = {
  admin: 'Your dispatcher role and admin-only reads are enforced by database policy. You cannot promote or demote yourself here.',
  restaurant: 'Your restaurant ownership link and service operations are protected by database policy.',
  rider: 'Availability and vehicle updates are separate from your account profile and follow rider-specific grants.',
  customer: 'New accounts are always customers. Delivery addresses are managed alongside your profile.',
};

export default function AccountSettingsPage({ eyebrow = 'Account', title = 'Account settings' }) {
  useDocumentTitle(title);
  const { user, profile, role, updatePassword, requestPasswordReset, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    setFullName(profile?.full_name ?? '');
    setPhone(profile?.phone ?? '');
  }, [profile]);

  const handleSave = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (!fullName.trim()) {
      setError('Full name cannot be empty.');
      return;
    }
    setSaving(true);
    try {
      await updateOwnProfile(user.id, { full_name: fullName, phone });
      await refreshProfile();
      setSuccess('Profile details saved.');
    } catch (saveError) {
      setError(saveError.message ?? 'Unable to save profile details.');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!user?.email) return;
    setResetBusy(true);
    setResetMessage('');
    setError('');
    try {
      await requestPasswordReset(user.email);
      setResetMessage('A password reset link has been sent to your account email.');
    } catch (resetError) {
      setError(resetError.message ?? 'Unable to send a password reset email.');
    } finally {
      setResetBusy(false);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    setError('');
    try {
      await signOut();
      navigate('/login', { replace: true, state: { message: 'You have been signed out.' } });
    } catch (signOutError) {
      setError(signOutError.message ?? 'Sign out failed. Please try again.');
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description="Manage the presentation fields your role can safely change. Email, role and protected operational fields remain read-only."
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_0.7fr]">
        <Card>
          <CardHeader title="Profile details" description="Only full name, phone and avatar are grantable profile fields." />
          <CardBody>
            <form onSubmit={handleSave} className="space-y-4">
              {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
              {success ? <InlineNotice tone="success">{success}</InlineNotice> : null}

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
                hint="Used only where an operational screen is permitted to show it."
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium text-muted">Email</p>
                  <p className="mt-1.5 flex items-center gap-2 rounded-lg border border-line bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
                    <Mail className="h-4 w-4 text-slate-400" aria-hidden="true" /> {user?.email}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted">Role</p>
                  <p className="mt-1.5 flex items-center gap-2 rounded-lg border border-line bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
                    <UserRound className="h-4 w-4 text-slate-400" aria-hidden="true" /> {ROLE_LABELS[role] ?? 'Unknown'}
                  </p>
                </div>
              </div>

              <Button type="submit" icon={Save} loading={saving}>Save profile</Button>
            </form>
          </CardBody>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Account security" description="Your role is sourced from the protected profile row." />
            <CardBody className="space-y-3">
              <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-900">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {roleMessages[role] ?? 'Authorization is enforced by database policy.'}
              </div>
              {resetMessage ? <InlineNotice tone="success">{resetMessage}</InlineNotice> : null}
              <Button variant="secondary" icon={KeyRound} onClick={handlePasswordReset} loading={resetBusy} className="w-full">
                Send password reset email
              </Button>
              <p className="text-xs leading-5 text-muted">
                Password changes use the Supabase recovery flow. No password value is stored or read
                by this interface.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Session" description="Sign out of this browser session." />
            <CardBody>
              <Button variant="danger" icon={LogOut} onClick={handleSignOut} loading={signingOut} className="w-full">
                Sign out
              </Button>
            </CardBody>
          </Card>

          {role === 'customer' ? (
            <Card>
              <CardHeader title="Delivery addresses" description="Manage the addresses used for ordering." />
              <CardBody>
                <Link to="/customer/profile" className="text-sm font-bold text-accent hover:text-accent-strong">
                  Open profile & addresses
                </Link>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader title="Current account record" description="Values visible to your own profile row." />
        <CardBody>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <DefinitionItem label="Profile ID"><span className="font-mono text-xs">{profile?.id}</span></DefinitionItem>
            <DefinitionItem label="Account active">{profile?.is_active ? 'Yes' : 'No'}</DefinitionItem>
            <DefinitionItem label="Role">{ROLE_LABELS[role] ?? role}</DefinitionItem>
            <DefinitionItem label="Phone">{profile?.phone || 'Not set'}</DefinitionItem>
          </dl>
        </CardBody>
      </Card>
    </div>
  );
}
