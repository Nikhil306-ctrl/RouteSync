import { Link } from 'react-router-dom';

export default function BrandMark({ dark = false, compact = false, to = '/', className = '' }) {
  const content = (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span
        className={`relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl ${
          dark ? 'bg-white/10 ring-1 ring-white/15' : 'bg-ink'
        }`}
        aria-hidden="true"
      >
        <svg viewBox="0 0 40 40" className="h-10 w-10">
          <path
            d="M8 28.5c4.2-7.8 7.9-4.2 11.5-10.2C23.3 12.1 27.4 9 32 9"
            fill="none"
            stroke="#ea580c"
            strokeWidth="2.6"
            strokeLinecap="round"
            className="route-dash"
          />
          <circle cx="8" cy="28.5" r="3" fill="#f8fafc" />
          <circle cx="32" cy="9" r="3" fill="#ea580c" />
          <path d="M17 31h6" stroke="#f8fafc" strokeWidth="2" strokeLinecap="round" opacity=".55" />
        </svg>
      </span>
      {!compact ? (
        <span className="flex flex-col leading-none">
          <span className={`font-display text-[1.15rem] font-bold tracking-tight ${dark ? 'text-white' : 'text-ink'}`}>
            RouteSync
          </span>
          <span
            className={`mt-1 text-[0.58rem] font-bold uppercase tracking-[0.22em] ${
              dark ? 'text-slate-400' : 'text-muted'
            }`}
          >
            Delivery operations
          </span>
        </span>
      ) : null}
    </span>
  );

  if (!to) return content;
  return (
    <Link to={to} className="inline-flex rounded-lg" aria-label="RouteSync home">
      {content}
    </Link>
  );
}
