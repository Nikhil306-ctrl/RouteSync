import { useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import Button from '../ui/Button.jsx';
import { Select } from '../ui/Field.jsx';
import { InlineNotice } from '../ui/States.jsx';

export default function OrderStatusForm({
  order,
  options,
  onUpdate,
  label = 'Update order status',
  showCancelReason = false,
  disabled = false,
}) {
  const [status, setStatus] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const needsReason = status === 'cancelled' || status === 'rejected';

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (!status) {
      setError('Choose a status first.');
      return;
    }
    if (needsReason && showCancelReason && !reason.trim()) {
      setError('Add a reason for the cancellation.');
      return;
    }
    setSaving(true);
    try {
      await onUpdate(status, reason);
      setSuccess(`Order moved to ${status.replaceAll('_', ' ')}.`);
      setStatus('');
      setReason('');
    } catch (updateError) {
      setError(updateError.message ?? 'Unable to update this order.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
      {success ? <InlineNotice tone="success">{success}</InlineNotice> : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor={`status-${order.id}`}>{label}</label>
        <Select
          id={`status-${order.id}`}
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          disabled={saving || disabled}
          className="flex-1"
        >
          <option value="">Choose next status…</option>
          {options
            .filter((option) => option !== order.status)
            .map((option) => (
              <option key={option} value={option}>
                {option.replaceAll('_', ' ')}
              </option>
            ))}
        </Select>
        <Button type="submit" disabled={saving || disabled || !status} loading={saving}>
          {saving ? 'Saving…' : label}
        </Button>
      </div>
      {needsReason && showCancelReason ? (
        <div>
          <label htmlFor={`reason-${order.id}`} className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
            Cancellation reason
          </label>
          <textarea
            id={`reason-${order.id}`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={2}
            className="w-full rounded-lg border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-orange-100"
            placeholder="Explain why this order cannot continue."
          />
        </div>
      ) : null}
      {saving ? <span className="sr-only" role="status"><LoaderCircle className="h-4 w-4" /> Saving order</span> : null}
    </form>
  );
}
