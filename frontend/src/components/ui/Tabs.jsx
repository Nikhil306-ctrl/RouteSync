export default function Tabs({ tabs, value, onChange, className = '', ariaLabel = 'View options' }) {
  return (
    <div className={`hide-scrollbar overflow-x-auto border-b border-line ${className}`}>
      <div role="tablist" aria-label={ariaLabel} className="flex min-w-max items-center gap-1">
        {tabs.map((tab) => {
          const active = tab.value === value;
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(tab.value)}
              className={`relative inline-flex min-h-10 items-center gap-2 whitespace-nowrap px-3 py-2 text-sm font-semibold transition ${
                active ? 'text-ink' : 'text-muted hover:text-ink'
              }`}
            >
              {tab.label}
              {tab.count !== undefined ? (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[0.62rem] font-bold tabular-nums ${
                    active ? 'bg-orange-100 text-orange-800' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {tab.count}
                </span>
              ) : null}
              {active ? <span className="absolute inset-x-2 bottom-0 h-0.5 bg-accent" aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
