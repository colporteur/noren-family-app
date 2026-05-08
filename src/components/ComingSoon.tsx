import { Link } from 'react-router-dom';

interface Props {
  emoji: string;
  title: string;
  blurb: string;
  features: string[];
  notes?: string;
}

/**
 * Used as the placeholder body for every mini-app we haven't built yet.
 * Lists the planned features so future sessions have a working spec
 * embedded in the app itself.
 */
export default function ComingSoon({ emoji, title, blurb, features, notes }: Props) {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link to="/" className="text-sm text-primary-700 hover:underline">
        ← Back to home
      </Link>
      <header className="flex items-start gap-4">
        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary-600 to-warm-500 text-white grid place-items-center text-3xl">
          {emoji}
        </div>
        <div>
          <h1 className="font-display text-3xl text-primary-900">{title}</h1>
          <p className="text-slate-600">{blurb}</p>
        </div>
      </header>

      <div className="card">
        <h2 className="font-semibold text-primary-900 mb-2">Planned features</h2>
        <ul className="list-disc pl-5 text-sm text-slate-700 space-y-1">
          {features.map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ul>
        {notes && (
          <p className="text-xs text-slate-500 mt-4 border-t border-primary-100 pt-3">
            {notes}
          </p>
        )}
      </div>

      <div className="card bg-warm-50 border-warm-500/30">
        <p className="text-sm text-warm-600">
          🚧 This mini-app is on the build list. We'll flesh it out in a
          future session.
        </p>
      </div>
    </div>
  );
}
