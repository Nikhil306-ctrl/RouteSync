export function TableShell({ children, className = '', label }) {
  return (
    <div className={`rs-panel overflow-hidden ${className}`}>
      <div className="overflow-x-auto">
        <table className="rs-table w-full min-w-[680px] border-collapse text-left" aria-label={label}>
          {children}
        </table>
      </div>
    </div>
  );
}

export function THead({ children }) {
  return <thead className="border-b border-line bg-slate-50/80">{children}</thead>;
}

export function TBody({ children }) {
  return <tbody className="divide-y divide-line">{children}</tbody>;
}

export function TR({ children, className = '', onClick, ...props }) {
  return (
    <tr className={`${onClick ? 'cursor-pointer transition hover:bg-slate-50/80' : ''} ${className}`} onClick={onClick} {...props}>
      {children}
    </tr>
  );
}

export function TH({ children, className = '' }) {
  return (
    <th scope="col" className={`whitespace-nowrap px-4 py-3 text-xs font-semibold text-muted ${className}`}>
      {children}
    </th>
  );
}

export function TD({ children, className = '' }) {
  return <td className={`px-4 py-3 align-middle text-sm text-slate-700 ${className}`}>{children}</td>;
}
