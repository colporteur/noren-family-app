import { FormEvent, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const { session } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session) return <Navigate to="/" replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="card w-full max-w-md text-center">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-600 to-warm-500 text-white grid place-items-center font-display font-bold text-2xl mb-3">
          N
        </div>
        <h1 className="font-display text-2xl text-primary-900">
          The Noren Family App
        </h1>
        <p className="text-slate-500 text-sm mt-1 mb-6">
          A private space for the family. Sign in with your email to continue.
        </p>

        {sent ? (
          <div className="text-left space-y-3">
            <p className="text-primary-900 font-medium">Check your email!</p>
            <p className="text-sm text-slate-600">
              We sent a magic link to <strong>{email}</strong>. Click it on this
              device and you'll be signed in.
            </p>
            <button
              type="button"
              className="btn-secondary w-full"
              onClick={() => {
                setSent(false);
                setEmail('');
              }}
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3 text-left">
            <div>
              <label className="label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="input"
              />
            </div>
            {error && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {error}
              </div>
            )}
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? 'Sending…' : 'Send magic link'}
            </button>
            <p className="text-xs text-slate-500 text-center pt-2">
              Don't have an account yet? Ask a Dictator to add you.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
