import { AlertTriangle, Inbox, RefreshCw, LoaderCircle } from 'lucide-react';
import Button from './Button.jsx';

export function Skeleton({ className = '' }) {
  return <div className={`skeleton-shimmer rounded-lg ${className}`} aria-hidden="true" />;
}

export function LoadingState({ rows = 4, label = 'Loading records' }) {
  return (
    <div className="rs-panel p-5" aria-busy="true" aria-label={label}>
      <div className="mb-5 flex items-center gap-2 text-sm text-muted">
        <LoaderCircle className="h-4 w-4 animate-spin text-accent" aria-hidden="true" />
        {label}
      </div>
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, index) => (
          <Skeleton key={index} className={`h-11 ${index === 0 ? 'w-2/3' : 'w-full'}`} />
        ))}
      </div>
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'We could not load this view' }) {
  return (
    <div className="rounded-xl border border-red-200 bg-[#fff5f3] p-5" role="alert">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-sm font-bold text-red-900">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-red-800">
            {error?.message || 'Check your connection and permissions, then try again.'}
          </p>
          {onRetry ? (
            <Button variant="secondary" size="sm" icon={RefreshCw} onClick={onRetry} className="mt-3">
              Retry
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  secondary,
  compact = false,
}) {
  return (
    <div
      className={`rs-empty flex flex-col items-center justify-center text-center ${
        compact ? 'px-5 py-9' : 'px-6 py-14'
      }`}
    >
      <div className="grid h-12 w-12 place-items-center rounded-xl border border-orange-100 bg-warm text-accent">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <h3 className="mt-4 font-display text-base font-bold text-ink">{title}</h3>
      {description ? <p className="mt-1.5 max-w-md text-sm leading-6 text-muted">{description}</p> : null}
      {action || secondary ? (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondary}
        </div>
      ) : null}
    </div>
  );
}

export function InlineNotice({ tone = 'info', title, children, className = '' }) {
  const tones = {
    info: 'border-sky-200 bg-sky-50 text-sky-950',
    warning: 'border-amber-200 bg-amber-50 text-amber-950',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-950',
    danger: 'border-red-200 bg-red-50 text-red-950',
    neutral: 'border-line bg-slate-50 text-slate-700',
  };
  return (
    <div
      role={tone === 'danger' ? 'alert' : tone === 'success' ? 'status' : undefined}
      className={`rs-notice ${tones[tone]} ${className}`}
    >
      {title ? <p className="mb-0.5 font-bold">{title}</p> : null}
      {children}
    </div>
  );
}

export function SkeletonText({ lines = 3 }) {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton key={index} className={`h-3 ${index === lines - 1 ? 'w-2/3' : 'w-full'}`} />
      ))}
    </div>
  );
}
