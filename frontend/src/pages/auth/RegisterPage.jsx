import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, MailCheck, UserPlus } from 'lucide-react';
import AuthLayout from '../../components/auth/AuthLayout.jsx';
import { LabeledInput, LabeledPassword } from '../../components/ui/Field.jsx';
import Button from '../../components/ui/Button.jsx';
import { InlineNotice } from '../../components/ui/States.jsx';
import FullPageLoading from '../../components/FullPageLoading.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useDocumentTitle } from '../../hooks/useAsyncData.js';

export default function RegisterPage() {
  const { supabase, session, profile, loading } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  useDocumentTitle('Create a customer account');

  useEffect(() => {
    if (!loading && session && profile) navigate('/customer', { replace: true });
  }, [loading, session, profile, navigate]);

  if (loading) return <FullPageLoading />;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!supabase) {
      setError('Authentication is not configured.');
      return;
    }
    if (!fullName.trim()) {
      setError('Enter your full name.');
      return;
    }
    if (!email.trim().includes('@')) {
      setError('Enter a valid email address.');
      return;
    }
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
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: fullName.trim() } },
      });

      if (signUpError) throw signUpError;

      if (data.session) {
        navigate('/customer', { replace: true });
        return;
      }

      setSuccess('Account created. Check your email for the confirmation link, then sign in.');
      setPassword('');
      setConfirmPassword('');
    } catch (signUpError) {
      setError(signUpError.message ?? 'Unable to create the account.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      wide
      title="Create your account"
      subtitle="Order from local kitchens and follow every delivery."
      footer={
        <p className="mt-5 text-center text-sm text-muted">
          Already have an account?{' '}
          <Link to="/login" className="font-bold text-accent hover:text-accent-strong">Sign in</Link>
        </p>
      }
    >
      {success ? (
        <div className="space-y-4">
          <InlineNotice tone="success" title="Check your inbox">
            <span className="flex items-start gap-2">
              <MailCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {success}
            </span>
          </InlineNotice>
          <Link
            to="/login"
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-white hover:bg-accent-strong"
          >
            Continue to sign in <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}

          <LabeledInput
            label="Full name"
            autoComplete="name"
            required
            autoFocus
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="Your name"
          />
          <LabeledInput
            label="Email address"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <LabeledPassword
              label="Password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="8+ characters"
              hint="At least 8 characters."
            />
            <LabeledPassword
              label="Confirm password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Repeat password"
            />
          </div>

          <Button type="submit" size="lg" loading={submitting} icon={UserPlus} className="w-full">
            {submitting ? 'Creating account…' : 'Create customer account'}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
