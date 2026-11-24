import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import AuthLayout from '../../components/auth/AuthLayout.jsx';
import { LabeledPassword } from '../../components/ui/Field.jsx';
import Button from '../../components/ui/Button.jsx';
import { InlineNotice } from '../../components/ui/States.jsx';
import FullPageLoading from '../../components/FullPageLoading.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useDocumentTitle } from '../../hooks/useAsyncData.js';

export default function ResetPasswordPage() {
  const { session, loading, updatePassword, signOut } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  useDocumentTitle('Choose a new password');

  if (loading) return <FullPageLoading label="Validating your recovery link…" />;

  if (!session) {
    return (
      <AuthLayout
        eyebrow="Recovery link"
        title="This link is no longer valid"
        subtitle="Recovery links expire. Request a new one to continue."
        footer={
          <p className="mt-5 text-center text-sm text-muted">
            <Link to="/forgot-password" className="font-bold text-accent hover:text-accent-strong">Request a new link</Link>
          </p>
        }
      >
        <InlineNotice tone="warning" title="Recovery session missing">
          Open the latest recovery email, or request a fresh reset link.
        </InlineNotice>
      </AuthLayout>
    );
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Use a password of at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await updatePassword(password);
      await signOut();
      navigate('/login', {
        replace: true,
        state: { message: 'Password updated. Sign in with your new password.' },
      });
    } catch (updateError) {
      setError(updateError.message ?? 'Unable to update the password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="New password"
      title="Choose a new password"
      subtitle="Your recovery session is active. Set a strong password to finish."
    >
      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
        <LabeledPassword
          label="New password"
          autoComplete="new-password"
          minLength={8}
          required
          autoFocus
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="At least 8 characters"
        />
        <LabeledPassword
          label="Confirm new password"
          autoComplete="new-password"
          minLength={8}
          required
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          placeholder="Repeat your password"
        />
        <Button type="submit" size="lg" loading={submitting} icon={KeyRound} className="w-full">
          {submitting ? 'Updating password…' : 'Update password'}
        </Button>
      </form>
    </AuthLayout>
  );
}
