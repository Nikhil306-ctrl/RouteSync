const variants = {
  neutral: 'rs-badge--neutral',
  orange: 'rs-badge--orange',
  green: 'rs-badge--green',
  amber: 'rs-badge--amber',
  red: 'rs-badge--red',
  blue: 'rs-badge--blue',
  ink: 'rs-badge--ink',
  purple: 'rs-badge--purple',
};

export default function Badge({ children, variant = 'neutral', className = '', dot = false }) {
  const dotColor = {
    neutral: 'bg-slate-400',
    orange: 'bg-orange-500',
    green: 'bg-emerald-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
    blue: 'bg-sky-500',
    ink: 'bg-slate-300',
    purple: 'bg-violet-500',
  };

  return (
    <span
      className={`rs-badge ${variants[variant] ?? variants.neutral} ${className}`}
    >
      {dot ? <span className={`h-1.5 w-1.5 rounded-full ${dotColor[variant]}`} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

const statusVariants = {
  draft: 'neutral',
  pending: 'amber',
  confirmed: 'blue',
  preparing: 'orange',
  ready: 'purple',
  assigned: 'blue',
  picked_up: 'orange',
  out_for_delivery: 'orange',
  delivered: 'green',
  cancelled: 'red',
  rejected: 'red',
  proposed: 'amber',
  accepted: 'blue',
  active: 'green',
  completed: 'green',
  reassigned: 'purple',
  scheduled: 'blue',
  verified: 'green',
  suspended: 'red',
  running: 'orange',
  failed: 'red',
  infeasible: 'red',
  planned: 'blue',
  arrived: 'orange',
  skipped: 'neutral',
  resolved: 'green',
  open: 'amber',
  low: 'neutral',
  normal: 'blue',
  high: 'orange',
  urgent: 'red',
};

const labels = {
  picked_up: 'Picked up',
  out_for_delivery: 'Out for delivery',
};

export function StatusBadge({ status, className = '', dot = true }) {
  if (!status) return <Badge variant="neutral">Unknown</Badge>;
  const normalized = String(status).toLowerCase();
  const label = labels[normalized] ?? normalized.replaceAll('_', ' ');
  return (
    <Badge variant={statusVariants[normalized] ?? 'neutral'} className={`capitalize ${className}`} dot={dot}>
      {label}
    </Badge>
  );
}
