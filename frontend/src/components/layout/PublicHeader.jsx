import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Menu, X } from 'lucide-react';
import BrandMark from '../BrandMark.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import { getPortalPath, ROLE_LABELS } from '../../lib/roles.js';

const publicLinks = [
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/#roles', label: 'For every role' },
  { href: '/#platform', label: 'Platform' },
];

export default function PublicHeader() {
  const { session, profile } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-line/80 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <BrandMark />

        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {publicLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-ink"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          {session && profile ? (
            <Link
              to={getPortalPath(profile.role)}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-ink-soft"
            >
              Open {ROLE_LABELS[profile.role]} workspace
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                className="inline-flex min-h-10 items-center rounded-lg px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Sign in
              </Link>
              <Link
                to="/register"
                className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-accent-strong"
              >
                Create account
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          className="grid h-10 w-10 place-items-center rounded-lg border border-line text-slate-700 md:hidden"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-controls="mobile-public-nav"
          aria-label={open ? 'Close navigation' : 'Open navigation'}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open ? (
        <div id="mobile-public-nav" className="border-t border-line bg-white px-4 py-4 md:hidden">
          <nav className="space-y-1" aria-label="Mobile primary">
            {publicLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="mt-4 grid gap-2 border-t border-line pt-4">
            {session && profile ? (
              <Link
                to={getPortalPath(profile.role)}
                onClick={() => setOpen(false)}
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white"
              >
                Open workspace
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  onClick={() => setOpen(false)}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink"
                >
                  Sign in
                </Link>
                <Link
                  to="/register"
                  onClick={() => setOpen(false)}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white"
                >
                  Create customer account
                </Link>
              </>
            )}
          </div>
        </div>
      ) : null}
    </header>
  );
}
