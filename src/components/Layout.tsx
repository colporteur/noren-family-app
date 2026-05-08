import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { displayName } from '../lib/types';

export default function Layout() {
  const { profile, isDictator, signOut } = useAuth();

  const navLink = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-1.5 rounded-md text-sm font-medium transition ${
      isActive
        ? 'bg-primary-600 text-white'
        : 'text-primary-800 hover:bg-primary-100'
    }`;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-primary-100">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2 group">
            <span className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary-600 to-warm-500 text-white grid place-items-center font-display font-bold">
              N
            </span>
            <span className="font-display font-semibold text-primary-900 hidden sm:inline">
              The Noren Family
            </span>
          </Link>

          <nav className="flex items-center gap-1 flex-1 overflow-x-auto">
            <NavLink to="/" end className={navLink}>
              Home
            </NavLink>
            <NavLink to="/family" className={navLink}>
              Family
            </NavLink>
            {isDictator && (
              <NavLink to="/dictator" className={navLink}>
                Dictator Mode
              </NavLink>
            )}
          </nav>

          <div className="flex items-center gap-3">
            <Link
              to="/me"
              className="text-sm text-primary-800 hover:underline hidden sm:inline"
              title="Edit your profile"
            >
              {profile ? displayName(profile) : 'You'}
            </Link>
            <button
              onClick={signOut}
              className="text-xs text-slate-500 hover:text-primary-700"
              aria-label="Sign out"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6">
        <Outlet />
      </main>

      <footer className="text-center text-xs text-slate-400 py-4">
        Made with love for the Noren family.
      </footer>
    </div>
  );
}
