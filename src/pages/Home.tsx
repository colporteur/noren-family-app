import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { displayName } from '../lib/types';
import AnnouncementBanner from '../components/AnnouncementBanner';

interface MiniApp {
  to: string;
  title: string;
  blurb: string;
  emoji: string;
  accent: string;
}

const apps: MiniApp[] = [
  {
    to: '/apps/nye',
    title: "New Year's Eve Predictions",
    blurb: 'Submit a question, predict the future, score points next year.',
    emoji: '🎆',
    accent: 'from-purple-500 to-indigo-600',
  },
  {
    to: '/apps/games/picker',
    title: 'Board Game Picker',
    blurb: 'Pick a game from the library. Random, filtered, or by mood.',
    emoji: '🎲',
    accent: 'from-emerald-500 to-teal-600',
  },
  {
    to: '/apps/games/records',
    title: 'Game Record Book',
    blurb: 'Log scores. See who really is the family Catan champion.',
    emoji: '📓',
    accent: 'from-amber-500 to-orange-600',
  },
  {
    to: '/apps/central-location',
    title: 'Central Location Estimator',
    blurb: 'Where should we meet? Claude finds a fair midpoint.',
    emoji: '📍',
    accent: 'from-rose-500 to-red-600',
  },
  {
    to: '/apps/ncaa',
    title: 'NCAA Tournament Pool',
    blurb: 'Live standings for the annual bracket pool.',
    emoji: '🏀',
    accent: 'from-orange-500 to-amber-600',
  },
  {
    to: '/apps/plaques',
    title: 'Virtual Plaques',
    blurb: "Mom's wall of fame and shame, in pixels.",
    emoji: '🏆',
    accent: 'from-yellow-500 to-amber-600',
  },
  {
    to: '/apps/voting',
    title: 'Voting Portal',
    blurb: 'Dictators seed options. The family votes.',
    emoji: '🗳️',
    accent: 'from-blue-500 to-cyan-600',
  },
  {
    to: '/apps/meetings',
    title: 'Meeting Scheduler',
    blurb: 'When works for everyone? Three modes, one decision.',
    emoji: '📅',
    accent: 'from-violet-500 to-purple-600',
  },
  {
    to: '/apps/late',
    title: "I'm Running Late / Early",
    blurb: 'A graceful heads-up to the whole family in one tap.',
    emoji: '⏱️',
    accent: 'from-slate-500 to-slate-700',
  },
];

export default function Home() {
  const { profile } = useAuth();
  return (
    <div className="space-y-8">
      <AnnouncementBanner />

      <section>
        <h1 className="font-display text-3xl text-primary-900">
          Welcome{profile ? `, ${displayName(profile)}` : ''}.
        </h1>
        <p className="text-slate-600 mt-1">
          Pick a mini-app below to get started.
        </p>
      </section>

      <section
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        aria-label="Mini-apps"
      >
        {apps.map((a) => (
          <Link
            key={a.to}
            to={a.to}
            className="card hover:-translate-y-0.5 hover:shadow-lg transition group"
          >
            <div
              className={`w-12 h-12 rounded-xl bg-gradient-to-br ${a.accent} text-white grid place-items-center text-2xl mb-3 group-hover:scale-105 transition`}
              aria-hidden
            >
              {a.emoji}
            </div>
            <h2 className="font-display font-semibold text-lg text-primary-900">
              {a.title}
            </h2>
            <p className="text-sm text-slate-600 mt-1">{a.blurb}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
