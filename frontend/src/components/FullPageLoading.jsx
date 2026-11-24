import { LoaderCircle } from 'lucide-react';
import BrandMark from './BrandMark.jsx';

export default function FullPageLoading({ label = 'Checking your session…' }) {
  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-6">
      <div className="flex flex-col items-center gap-5 text-center">
        <BrandMark />
        <div className="flex items-center gap-2.5 rounded-lg border border-line bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
          <LoaderCircle className="h-4 w-4 animate-spin text-accent" aria-hidden="true" />
          {label}
        </div>
      </div>
    </main>
  );
}
