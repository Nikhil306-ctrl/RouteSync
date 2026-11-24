import { Link } from 'react-router-dom';
import { ArrowLeft, LockKeyhole, Route, ShieldCheck, TimerReset } from 'lucide-react';
import BrandMark from '../BrandMark.jsx';

const routeSteps = [
  { label: 'Order intake', detail: 'Delivery window captured' },
  { label: 'Constraint model', detail: 'Capacity, prep, distance' },
  { label: 'Feasible plan', detail: 'Assignment with reasons' },
  { label: 'Live operations', detail: 'Update and reschedule' },
];

export default function AuthLayout({ eyebrow, title, subtitle, children, footer, wide = false }) {
  return (
    <main className="min-h-screen bg-canvas text-ink">
      <div className="grid min-h-screen lg:grid-cols-[minmax(360px,0.9fr)_minmax(480px,1.1fr)]">
        <section className="relative hidden overflow-hidden bg-ink p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
          <div className="absolute inset-0 bg-route-grid-dark opacity-70" aria-hidden="true" />
          <div className="relative">
            <BrandMark dark />
            <div className="mt-14 max-w-md">
              <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-orange-400">
                Delivery operations, scheduled with reason
              </p>
              <h2 className="mt-4 font-display text-3xl font-bold leading-tight xl:text-4xl">
                One control plane for time windows, kitchens and riders.
              </h2>
              <p className="mt-4 text-sm leading-7 text-slate-300">
                RouteSync keeps every role in the same operational picture while permissions remain
                scoped by Supabase row-level security.
              </p>
            </div>
          </div>

          <div className="relative my-12">
            <div className="relative ml-2 border-l border-dashed border-slate-600 pl-7">
              {routeSteps.map((step, index) => (
                <div key={step.label} className={index === routeSteps.length - 1 ? '' : 'mb-7'}>
                  <span
                    className={`absolute -left-[7px] mt-1 h-3 w-3 rounded-full border-2 border-ink ${
                      index === 2 ? 'bg-accent' : 'bg-slate-400'
                    }`}
                    aria-hidden="true"
                  />
                  <p className="text-sm font-bold text-white">{step.label}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{step.detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative grid gap-2 text-xs text-slate-300 sm:grid-cols-3">
            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5">
              <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" /> RLS scoped
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5">
              <Route className="h-4 w-4 shrink-0 text-orange-400" aria-hidden="true" /> Four engines
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5">
              <TimerReset className="h-4 w-4 shrink-0 text-sky-400" aria-hidden="true" /> Time aware
            </div>
          </div>
        </section>

        <section className="flex min-h-screen flex-col">
          <div className="flex items-center justify-between border-b border-line px-5 py-4 lg:hidden">
            <BrandMark />
            <Link to="/" className="text-xs font-semibold text-muted hover:text-ink">Back home</Link>
          </div>

          <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
            <div className={`w-full ${wide ? 'max-w-xl' : 'max-w-md'}`}>
              <div className="mb-7">
                {eyebrow ? (
                  <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.16em] text-accent">
                    <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
                    {eyebrow}
                  </p>
                ) : null}
                <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">{title}</h1>
                {subtitle ? <p className="mt-2 text-sm leading-6 text-muted">{subtitle}</p> : null}
              </div>

              <div className="rounded-xl border border-line bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)] sm:p-6">
                {children}
              </div>
              {footer}
              <Link to="/" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-ink">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to RouteSync
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
