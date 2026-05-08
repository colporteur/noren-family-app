import { FormEvent, useState } from 'react';

/**
 * Inviting a real Supabase user from the browser requires the service role
 * key, which we MUST NOT ship to the client. So this page documents the two
 * supported paths:
 *   1) Just have the guest sign in with their email — they'll appear as a
 *      Family Member; promote/demote/expire from Manage Family.
 *   2) Use the Supabase dashboard's "Invite user" button (Auth → Users) to
 *      send an email invitation. They'll show up here once they accept.
 *
 * Future session: replace this with a Supabase Edge Function that uses the
 * service role key server-side to do the invite + role + expiry in one click.
 */
export default function InviteGuest() {
  const [email, setEmail] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  const onCopy = (e: FormEvent) => {
    e.preventDefault();
    const lines = [
      `Hi! You've been invited as a temporary guest to The Noren Family App.`,
      `\nGo to: ${window.location.origin}/login`,
      `Sign in with this email: ${email}`,
      expiresAt ? `\n(Your guest access is valid until ${expiresAt}.)` : '',
    ].join('\n');
    navigator.clipboard?.writeText(lines).catch(() => {});
    alert('Invitation message copied to your clipboard.');
  };

  return (
    <div className="max-w-xl space-y-6">
      <header>
        <h1 className="font-display text-3xl text-primary-900">Invite a Guest</h1>
        <p className="text-slate-600 mt-1">
          Share the magic-link login with a friend. After they sign in, come
          back to <em>Manage Family</em> and switch their role to{' '}
          <strong>Guest</strong>, then set their expiration if you'd like.
        </p>
      </header>

      <form onSubmit={onCopy} className="card space-y-4">
        <div>
          <label className="label">Guest email</label>
          <input
            type="email"
            required
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="friend@example.com"
          />
        </div>
        <div>
          <label className="label">Access expires (optional)</label>
          <input
            type="date"
            className="input"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
          <p className="text-xs text-slate-500 mt-1">
            This is informational on this page. After the guest signs in, set
            <em> guest_expires_at</em> on their row in <em>Manage Family</em>.
          </p>
        </div>
        <button type="submit" className="btn-primary">Copy invitation message</button>
      </form>

      <details className="card">
        <summary className="font-semibold text-primary-900 cursor-pointer">
          Power-user path: Supabase Dashboard
        </summary>
        <ol className="list-decimal pl-5 text-sm text-slate-600 mt-3 space-y-1">
          <li>Open your Supabase project → Authentication → Users.</li>
          <li>Click <strong>Invite user</strong> and paste the guest's email.</li>
          <li>They'll receive an email with a sign-in link.</li>
          <li>After they accept, return to Manage Family to set role/expiry.</li>
        </ol>
      </details>
    </div>
  );
}
