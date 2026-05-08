import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/**
 * Wraps any route that should only be visible to Dictators.
 * Quietly redirects non-dictators home rather than showing a 403 —
 * regular family members shouldn't even know what they're missing.
 */
export default function DictatorOnly({ children }: { children: JSX.Element }) {
  const { isDictator, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-primary-700">
        Loading…
      </div>
    );
  }

  if (!isDictator) {
    return <Navigate to="/" replace />;
  }

  return children;
}
