const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const timeFormatter = new Intl.DateTimeFormat('en-IN', {
  hour: 'numeric',
  minute: '2-digit',
});

const dateTimeFormatter = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

export function formatCurrency(minorUnits = 0, currency = 'INR') {
  const amount = Number(minorUnits) / 100;
  if (currency !== 'INR') {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  }
  return currencyFormatter.format(Number.isFinite(amount) ? amount : 0);
}

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateFormatter.format(date);
}

export function formatTime(value) {
  if (!value) return '—';
  if (typeof value === 'string' && /^\d{2}:\d{2}/.test(value) && !value.includes('T')) {
    const [hours, minutes] = value.split(':');
    const date = new Date();
    date.setHours(Number(hours), Number(minutes), 0, 0);
    return timeFormatter.format(date);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : timeFormatter.format(date);
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateTimeFormatter.format(date);
}

export function formatWindow(start, end) {
  if (!start && !end) return 'Not scheduled';
  return `${formatTime(start)} – ${formatTime(end)}`;
}

export function formatRelative(value) {
  if (!value) return '—';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '—';
  const diffMinutes = Math.round((then - Date.now()) / 60_000);
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (Math.abs(diffMinutes) < 60) return formatter.format(diffMinutes, 'minute');
  const hours = Math.round(diffMinutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, 'hour');
  return formatter.format(Math.round(hours / 24), 'day');
}

export function titleCase(value = '') {
  return String(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function initials(name = '') {
  const letters = String(name)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase());
  return letters.join('') || 'RS';
}

export function todayLabel() {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());
}

export function isSameDay(value, compare = new Date()) {
  if (!value) return false;
  const date = new Date(value);
  return (
    date.getFullYear() === compare.getFullYear() &&
    date.getMonth() === compare.getMonth() &&
    date.getDate() === compare.getDate()
  );
}
