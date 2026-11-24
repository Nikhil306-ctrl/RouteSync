import { useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export function Field({ label, hint, error, required, htmlFor, children, className = '' }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {label ? (
        <label htmlFor={htmlFor} className="block text-xs font-bold uppercase tracking-[0.1em] text-slate-600">
          {label}
          {required ? <span className="ml-1 text-accent">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="text-xs font-medium text-red-600" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs leading-5 text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

const inputClass =
  'w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-slate-400 transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-orange-100 disabled:bg-slate-50 disabled:text-slate-500';

export function Input({ className = '', ...props }) {
  return <input className={`${inputClass} ${className}`} {...props} />;
}

export function Textarea({ className = '', ...props }) {
  return <textarea className={`${inputClass} min-h-24 resize-y ${className}`} {...props} />;
}

export function Select({ className = '', children, ...props }) {
  return (
    <select className={`${inputClass} pr-8 ${className}`} {...props}>
      {children}
    </select>
  );
}

export function PasswordInput({ className = '', ...props }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        className={`${inputClass} pr-11 ${className}`}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-lg text-slate-500 hover:text-ink focus-visible:outline-offset-[-2px]"
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
      >
        {visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
      </button>
    </div>
  );
}

export function LabeledInput({ label, hint, error, required, className, ...props }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={props.id ?? id} className={className}>
      <Input id={props.id ?? id} required={required} {...props} />
    </Field>
  );
}

export function LabeledPassword({ label, hint, error, required, className, ...props }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={props.id ?? id} className={className}>
      <PasswordInput id={props.id ?? id} required={required} {...props} />
    </Field>
  );
}

export function LabeledSelect({ label, hint, error, required, className, children, ...props }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={props.id ?? id} className={className}>
      <Select id={props.id ?? id} required={required} {...props}>
        {children}
      </Select>
    </Field>
  );
}

export function LabeledTextarea({ label, hint, error, required, className, ...props }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={props.id ?? id} className={className}>
      <Textarea id={props.id ?? id} required={required} {...props} />
    </Field>
  );
}
