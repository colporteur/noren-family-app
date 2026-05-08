import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { displayName } from '../lib/types';
import type { Profile } from '../lib/types';
import RoleBadge from '../components/RoleBadge';

type Filter = 'active' | 'all' | 'memorial';

export default function FamilyDirectory() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('active');

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('role', { ascending: true })
        .order('first_name', { ascending: true });
      if (error) console.error(error);
      else setProfiles((data ?? []) as Profile[]);
      setLoading(false);
    })();
  }, []);

  const visible = profiles.filter((p) => {
    if (filter === 'active') return !p.is_deceased;
    if (filter === 'memorial') return p.is_deceased;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl text-primary-900">Family Directory</h1>
          <p className="text-slate-600">{profiles.length} member{profiles.length === 1 ? '' : 's'} on record</p>
        </div>
        <div className="flex gap-1 bg-white border border-primary-100 rounded-lg p-1 shadow-soft">
          {(['active', 'memorial', 'all'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-sm rounded-md capitalize transition ${
                filter === f
                  ? 'bg-primary-600 text-white'
                  : 'text-primary-800 hover:bg-primary-50'
              }`}
            >
              {f === 'memorial' ? 'In Memoriam' : f}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : visible.length === 0 ? (
        <div className="card text-center text-slate-500">
          No members in this view.
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((p) => (
            <li
              key={p.id}
              className={`card flex gap-3 items-start ${
                p.is_deceased ? 'opacity-90' : ''
              }`}
            >
              <Avatar profile={p} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-semibold text-primary-900 truncate">
                    {displayName(p)}
                  </h2>
                  <RoleBadge role={p.role} isDeceased={p.is_deceased} />
                </div>
                {p.location && (
                  <p className="text-xs text-slate-500 mt-1">📍 {p.location}</p>
                )}
                {p.is_deceased && p.deceased_on && (
                  <p className="text-xs text-slate-500 mt-1 italic">
                    Remembered — {new Date(p.deceased_on).toLocaleDateString()}
                  </p>
                )}
                {p.role === 'guest' && p.guest_expires_at && (
                  <p className="text-xs text-warm-600 mt-1">
                    Guest until {new Date(p.guest_expires_at).toLocaleDateString()}
                  </p>
                )}
                {p.bio && (
                  <p className="text-sm text-slate-600 mt-2 line-clamp-3">{p.bio}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Avatar({ profile }: { profile: Profile }) {
  const initials = (() => {
    const parts = [profile.first_name, profile.last_name].filter(Boolean) as string[];
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return profile.email.slice(0, 2).toUpperCase();
  })();
  if (profile.avatar_url) {
    return (
      <img
        src={profile.avatar_url}
        alt=""
        className="w-12 h-12 rounded-full object-cover"
      />
    );
  }
  return (
    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary-500 to-warm-500 text-white grid place-items-center font-semibold">
      {initials}
    </div>
  );
}
