import { Link } from 'react-router-dom';
import { LoaderCircle } from 'lucide-react';

const variants = {
  primary: 'rs-btn--primary',
  dark: 'rs-btn--dark',
  secondary: 'rs-btn--secondary',
  ghost: 'rs-btn--ghost',
  danger: 'rs-btn--danger',
  success: 'rs-btn--success',
};

const sizes = {
  sm: 'rs-btn--sm',
  md: 'rs-btn--md',
  lg: 'rs-btn--lg',
};

export function buttonClass({ variant = 'primary', size = 'md', className = '' } = {}) {
  return `rs-btn ${variants[variant] ?? variants.primary} ${sizes[size] ?? sizes.md} ${className}`;
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
