export default function PageHeader({ eyebrow, title, description, actions, className = '' }) {
  return (
    <header className={`flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between ${className}`}>
      <div className="min-w-0 max-w-3xl">
        {eyebrow ? (
          <p className="text-[0.7rem] font-extrabold uppercase tracking-[0.18em] text-accent">{eyebrow}</p>
        ) : null}
        <h1 className="mt-1.5 font-display text-2xl font-bold tracking-tight text-ink sm:text-[1.75rem]">{title}</h1>
        {description ? <p className="mt-2 text-sm leading-6 text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
