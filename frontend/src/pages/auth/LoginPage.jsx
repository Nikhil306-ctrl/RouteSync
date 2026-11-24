import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, LogIn, ShieldCheck } from 'lucide-react';
import AuthLayout from '../../components/auth/AuthLayout.jsx';
import { LabeledInput, LabeledPassword } from '../../components/ui/Field.jsx';
import Button from '../../components/ui/Button.jsx';
import { InlineNotice } from '../../components/ui/States.jsx';
import FullPageLoading from '../../components/FullPageLoading.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import { getPortalPath } from '../../lib/roles.js';
import { useDocumentTitle } from '../../hooks/useAsyncData.js';

export default function LoginPage() {
  const { signIn, session, profile, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message] = useState(location.state?.message ?? '');
  useDocumentTitle('Sign in');

  useEffect(() => {
    if (!loading && session && profile) {
      navigate(getPortalPath(profile.role), { replace: true });
    }
  }, [loading, session, profile, navigate]);

  if (loading) return <FullPageLoading />;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('Enter your email address and password.');
      return;
    }
    setSubmitting(true);
    try {
      const loadedProfile = await signIn(email.trim(), password);
      if (loadedProfile) navigate(getPortalPath(loadedProfile.role), { replace: true });
    } catch (signInError) {
      setError(signInError.message ?? 'Unable to sign in. Check your email and password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Secure access"
      title="Welcome back"
      subtitle="Sign in to the workspace assigned to your RouteSync account."
      footer={
        <p className="mt-5 text-center text-sm text-muted">
          New customer?{' '}
          <Link to="/register" className="font-bold text-accent hover:text-accent-strong">
            Create an account
          </Link>
        </p>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        {message ? <InlineNotice tone="success">{message}</InlineNotice> : null}
        {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}

        <LabeledInput
          label="Email address"
          type="email"
          autoComplete="email"
          required
          autoFocus
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
        />

        <div>
          <LabeledPassword
            label="Password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter your password"
          />
          <div className="-mt-0.5 text-right">
            <Link to="/forgot-password" className="text-xs font-bold text-slate-500 hover:text-accent">
              Forgot password?
            </Link>
          </div>
        </div>

        <Button type="submit" size="lg" loading={submitting} icon={LogIn} className="w-full">
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>

        <p className="flex items-start gap-2 border-t border-line pt-4 text-xs leading-5 text-muted">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          Your role is read from your secure profile, never from the login form. Staff accounts are
          provisioned by an administrator.
        </p>
      </form>

      <div className="mt-5 grid grid-cols-2 gap-2 text-center">
        <Link to="/" className="rounded-lg border border-line px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
          Explore RouteSync
        </Link>
        <Link to="/register" className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-warm px-3 py-2 text-xs font-bold text-orange-900 hover:bg-orange-100">
          Customer sign-up <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    </AuthLayout>
  );
}
