import { Link } from 'react-router-dom';
import BrandMark from '../BrandMark.jsx';

export default function PublicFooter() {
  return (
    <footer className="border-t border-slate-800 bg-ink text-slate-300">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr] lg:px-8">
        <div>
          <BrandMark dark />
          <p className="mt-5 max-w-xs text-sm leading-6 text-slate-400">
            Constraint-aware delivery operations for restaurants, dispatchers, delivery partners
            and customers.
          </p>
          <p className="mt-5 text-xs text-slate-500">
            Built with React, Hono on Cloudflare Workers and Supabase.
          </p>
        </div>

        <div>
          <h2 className="text-xs font-extrabold uppercase tracking-[0.16em] text-white">Platform</h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li><a href="/#how-it-works" className="hover:text-white">How it works</a></li>
            <li><a href="/#roles" className="hover:text-white">Role workspaces</a></li>
            <li><a href="/#constraints" className="hover:text-white">Constraint scheduling</a></li>
            <li><a href="/#platform" className="hover:text-white">Capabilities</a></li>
          </ul>
        </div>

        <div>
          <h2 className="text-xs font-extrabold uppercase tracking-[0.16em] text-white">Access</h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li><Link to="/login" className="hover:text-white">Sign in</Link></li>
            <li><Link to="/register" className="hover:text-white">Customer registration</Link></li>
            <li><Link to="/forgot-password" className="hover:text-white">Account recovery</Link></li>
          </ul>
        </div>

        <div>
          <h2 className="text-xs font-extrabold uppercase tracking-[0.16em] text-white">Project</h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li><a href="/#constraints" className="hover:text-white">Four-engine architecture</a></li>
            <li><span className="text-slate-500">Academic mini-project</span></li>
            <li><span className="text-slate-500">Belagavi, Karnataka</span></li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>© {new Date().getFullYear()} RouteSync. Delivery operations concept project.</p>
          <p>Food photography via Unsplash contributors.</p>
        </div>
      </div>
    </footer>
  );
}
