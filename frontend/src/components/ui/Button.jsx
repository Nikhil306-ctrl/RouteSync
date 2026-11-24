import { Link } from 'react-router-dom';
import { LoaderCircle } from 'lucide-react';

const variants = {
  primary:
    'bg-accent text-white shadow-sm hover:bg-accent-strong focus-visible:outline-accent disabled:bg-orange-300',
  dark: 'bg-ink text-white shadow-sm hover:bg-ink-soft focus-visible:outline-ink disabled:bg-slate-500',
  secondary:
    'border border-line bg-white text-ink hover:border-slate-300 hover:bg-slate-50 disabled:text-slate-400',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-ink disabled:text-slate-300',
  danger:
    'border border-red-200 bg-red-50 text-red-700 hover:border-red-300 hover:bg-red-100 disabled:text-red-300',
  success:
    'bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-300',
};

const sizes = {
  sm: 'min-h-9 px-3 py-1.5 text-xs gap-1.5',
  md: 'min-h-10 px-4 py-2 text-sm gap-2',
  lg: 'min-h-12 px-5 py-3 text-sm gap-2',
};

export function buttonClass({ variant = 'primary', size = 'md', className = '' } = {}) {
  return `inline-flex items-center justify-center rounded-lg font-semibold transition-colors disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`;
}

export default function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  loading = false,
  icon: Icon,
  children,
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      className={buttonClass({ variant, size, className })}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? (
        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : Icon ? (
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      ) : null}
      {children}
    </button>
  );
}

export function LinkButton({
  to,
  variant = 'primary',
  size = 'md',
  className = '',
  icon: Icon,
  children,
  ...props
}) {
  return (
    <Link to={to} className={buttonClass({ variant, size, className })} {...props}>
      {Icon ? <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
      {children}
    </Link>
  );
}
