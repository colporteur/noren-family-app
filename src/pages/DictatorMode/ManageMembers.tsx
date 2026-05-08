import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { FamilyRole, Profile } from '../../lib/types';
import { displayName, roleLabel } from '../../lib/types';
import RoleBadge from '../../components/RoleBadge';

export default function ManageMembers() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('first_name', { ascending: true });
    if (error) setError(error.message);
    else setProfiles((data ?? []) as Profile[]);
  };

  useEffect(() => {
    load();
  }, []);

  const updateRole = async (id: string, role: FamilyRole) => {
    setBusyId(id);
    setError(null);
    const { error } = await supabase.from('profiles').update({ role }).eq('id', id);
    setBusyId(null);
    if (error) setError(error.message);
    else load();
  };

  const toggleDeceased = async (p: Profile) => {
    setBusyId(p.id);
    setError(null);
    const newValue = !p.is_deceased;
    const patch: Partial<Profile> = {
      is_deceased: newValue,
      deceased_on: newValue ? new Date().toISOString().slice(0, 10) : null,
    };
    const { error } = await supabase.from('profiles').update(patch).eq('id', p.id);
    setBusyId(null);
    if (error) setError(error.message);
    else load();
  };

  const promptDeceasedDate = async (p: Profile) => {
    const input = window.prompt(
      `Mark ${displayName(p)} as deceased.\n\nEnter date (YYYY-MM-DD), or leave blank for today.\nType "cancel" to cancel.`,
      new Date().toISOString().slice(0, 10),
    );
    if (input === null || input.toLowerCase() === 'cancel') return;
    const dateStr = input.trim() || new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      alert('Please use the format YYYY-MM-DD.');
      return;
    }
    setBusyId(p.id);
    const { error } = await supabase
      .from('profiles')
      .update({ is_deceased: true, deceased_on: dateStr })
      .eq('id', p.id);
    setBusyId(null);
    if (error) setError(error.message);
    else load();
  };

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl text-primary-900">Manage Family</h1>
      {error && (
        <div className="card border-red-300 text-red-700 bg-red-50">{error}</div>
      )}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-primary-100">
              <th className="py-2 pr-3">Name</th>
              <th className="py-2 pr-3">Email</th>
              <th className="py-2 pr-3">Role</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => (
              <tr key={p.id} className="border-b border-primary-50 last:border-b-0">
                <td className="py-2 pr-3 font-medium text-primary-900">
                  {displayName(p)}
                </td>
                <td className="py-2 pr-3 text-slate-600 truncate max-w-[180px]">
                  {p.email}
                </td>
                <td className="py-2 pr-3">
                  <select
                    className="input py-1 text-sm"
                    value={p.role}
                    disabled={busyId === p.id || p.is_deceased}
                    onChange={(e) => updateRole(p.id, e.target.value as FamilyRole)}
                  >
                    {(['dictator', 'family', 'guest'] as FamilyRole[]).map((r) => (
                      <option key={r} value={r}>
                        {roleLabel(r)}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-2 pr-3">
                  <RoleBadge role={p.role} isDeceased={p.is_deceased} />
                </td>
                <td className="py-2 pr-3">
                  {p.is_deceased ? (
                    <button
                      className="btn-secondary text-xs py-1"
                      disabled={busyId === p.id}
                      onClick={() => toggleDeceased(p)}
                      title="Restore active status"
                    >
                      Restore active
                    </button>
                  ) : (
                    <button
                      className="btn-secondary text-xs py-1"
                      disabled={busyId === p.id}
                      onClick={() => promptDeceasedDate(p)}
                    >
                      Mark deceased…
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        Tip: To add a new family member, ask them to sign in with their email
        on the login page. They'll appear here automatically as a Family Member —
        you can promote them to Dictator if desired.
      </p>
    </div>
  );
}
