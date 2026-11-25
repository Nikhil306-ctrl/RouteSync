import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Send } from 'lucide-react';
import AuthLayout from '../../components/auth/AuthLayout.jsx';
import { LabeledInput } from '../../components/ui/Field.jsx';
import Button from '../../components/ui/Button.jsx';
import { InlineNotice } from '../../components/ui/States.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useDocumentTitle } from '../../hooks/useAsyncData.js';

export default function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  useDocumentTitle('Reset your password');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (!email.trim().includes('@')) {
      setError('Enter a valid email address.');
      return;
    }
    setSubmitting(true);
    try {
      await requestPasswordReset(email.trim());
      setSuccess('If an account exists for that email, a secure reset link has been sent.');
    } catch (resetError) {
      setError(resetError.message ?? 'Unable to send the reset email.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We'll send a secure link to your email."
      footer={
        <p className="mt-5 text-center text-sm text-muted">
          Remembered it?{' '}
          <Link to="/login" className="font-bold text-accent hover:text-accent-strong">Back to sign in</Link>
        </p>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
        {success ? <InlineNotice tone="success">{success}</InlineNotice> : null}
        <LabeledInput
          label="Email address"
          type="email"
          autoComplete="email"
          required
          autoFocus
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          hint="Use the same address you use to sign in."
        />
        <Button type="submit" size="lg" loading={submitting} icon={Send} className="w-full">
          {submitting ? 'Sending reset link…' : 'Send reset link'}
        </Button>
      </form>
    </AuthLayout>
  );
}
