const variants = {
  neutral: 'border-slate-200 bg-slate-50 text-slate-700',
  orange: 'border-orange-200 bg-orange-50 text-orange-800',
  green: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  amber: 'border-amber-200 bg-amber-50 text-amber-800',
  red: 'border-red-200 bg-red-50 text-red-700',
  blue: 'border-sky-200 bg-sky-50 text-sky-800',
  ink: 'border-slate-700 bg-slate-800 text-slate-100',
  purple: 'border-violet-200 bg-violet-50 text-violet-800',
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
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.68rem] font-bold uppercase tracking-wide ${variants[variant]} ${className}`}
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
