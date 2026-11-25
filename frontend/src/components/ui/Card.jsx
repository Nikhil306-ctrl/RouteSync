export function Card({ children, className = '', as: Component = 'section' }) {
  return (
    <Component className={`rs-panel ${className}`}>
      {children}
    </Component>
  );
}

export function CardHeader({ title, description, action, className = '' }) {
  return (
    <div className={`rs-panel-header sm:flex-row sm:items-center sm:justify-between ${className}`}>
      <div className="min-w-0">
        <h2 className="font-display text-sm font-bold text-ink">{title}</h2>
        {description ? <p className="mt-0.5 text-xs leading-5 text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ children, className = '' }) {
  return <div className={`rs-panel-body ${className}`}>{children}</div>;
}

export function StatCard({ label, value, helper, icon: Icon, tone = 'default' }) {
  const tones = {
    default: 'rs-panel',
    orange: 'rs-panel border-orange-200 bg-warm',
    green: 'rs-panel border-emerald-200 bg-[#f0f8f4]',
    ink: 'rs-panel border-ink bg-ink text-white',
  };
  const iconTones = {
    default: 'bg-[#eef2f0] text-[#4b5a5f]',
    orange: 'bg-orange-100 text-accent',
    green: 'bg-emerald-100 text-emerald-800',
    ink: 'bg-white/10 text-orange-300',
  };
  return (
    <div className={`min-w-0 p-4 ${tones[tone] ?? tones.default}`}>
      <div className="flex items-start justify-between gap-3">
        <p className={`text-xs font-semibold ${tone === 'ink' ? 'text-slate-400' : 'text-muted'}`}>
          {label}
        </p>
        {Icon ? (
          <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${iconTones[tone] ?? iconTones.default}`}>
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        ) : null}
      </div>
      <p className={`rs-num mt-2.5 font-display text-[1.7rem] font-bold leading-none ${tone === 'ink' ? 'text-white' : 'text-ink'}`}>
        {value}
      </p>
      {helper ? (
        <p className={`mt-2 text-xs leading-5 ${tone === 'ink' ? 'text-slate-400' : 'text-muted'}`}>{helper}</p>
      ) : null}
    </div>
  );
}

export function SectionHeading({ eyebrow, title, description, action, className = '' }) {
  return (
    <div className={`flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between ${className}`}>
      <div className="max-w-2xl">
        {eyebrow ? <p className="rs-eyebrow text-accent">{eyebrow}</p> : null}
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
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-1 text-sm leading-6 text-ink">{children ?? '—'}</dd>
    </div>
  );
}
