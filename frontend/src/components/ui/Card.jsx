export function Card({ children, className = '', as: Component = 'section' }) {
  return (
    <Component className={`rounded-xl border border-line bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${className}`}>
      {children}
    </Component>
  );
}

export function CardHeader({ title, description, action, className = '' }) {
  return (
    <div className={`flex flex-col gap-3 border-b border-line px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5 ${className}`}>
      <div className="min-w-0">
        <h2 className="font-display text-sm font-bold text-ink">{title}</h2>
        {description ? <p className="mt-0.5 text-xs leading-5 text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ children, className = '' }) {
  return <div className={`p-4 sm:p-5 ${className}`}>{children}</div>;
}

export function StatCard({ label, value, helper, icon: Icon, tone = 'default' }) {
  const tones = {
    default: 'border-line bg-white',
    orange: 'border-orange-200 bg-warm',
    green: 'border-emerald-200 bg-emerald-50/70',
    ink: 'border-slate-700 bg-ink text-white',
  };
  const iconTones = {
    default: 'bg-slate-100 text-slate-600',
    orange: 'bg-orange-100 text-accent',
    green: 'bg-emerald-100 text-emerald-700',
    ink: 'bg-white/10 text-orange-300',
  };
  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <p className={`text-xs font-bold uppercase tracking-[0.12em] ${tone === 'ink' ? 'text-slate-400' : 'text-muted'}`}>
          {label}
        </p>
        {Icon ? (
          <span className={`grid h-8 w-8 place-items-center rounded-lg ${iconTones[tone]}`}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        ) : null}
      </div>
      <p className={`mt-3 font-display text-2xl font-bold tracking-tight ${tone === 'ink' ? 'text-white' : 'text-ink'}`}>
        {value}
      </p>
      {helper ? (
        <p className={`mt-1 text-xs leading-5 ${tone === 'ink' ? 'text-slate-400' : 'text-muted'}`}>{helper}</p>
      ) : null}
    </div>
  );
}

export function SectionHeading({ eyebrow, title, description, action, className = '' }) {
  return (
    <div className={`flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between ${className}`}>
      <div className="max-w-2xl">
        {eyebrow ? <p className="text-[0.68rem] font-extrabold uppercase tracking-[0.16em] text-accent">{eyebrow}</p> : null}
        <h2 className="mt-1 font-display text-lg font-bold text-ink">{title}</h2>
        {description ? <p className="mt-1 text-sm leading-6 text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function DefinitionItem({ label, children, className = '' }) {
  return (
    <div className={className}>
      <dt className="text-[0.68rem] font-bold uppercase tracking-[0.1em] text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm leading-6 text-ink">{children ?? '—'}</dd>
    </div>
  );
}
