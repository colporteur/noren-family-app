import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export interface Announcement {
  id: string;
  source: string;
  source_id: string | null;
  sender_id: string | null;
  emoji: string | null;
  message: string;
  variant: string;             // 'info' | 'late' | 'early' | 'on_time' | 'warning' | 'success'
  link_path: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

interface Dismissal {
  announcement_id: string;
  profile_id: string;
}

const variantClass: Record<string, string> = {
  late: 'border-amber-300 bg-amber-50 text-amber-900',
  early: 'border-sky-300 bg-sky-50 text-sky-900',
  on_time: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  info: 'border-primary-200 bg-primary-50 text-primary-900',
  warning: 'border-warm-500/50 bg-warm-50 text-warm-600',
  success: 'border-emerald-300 bg-emerald-50 text-emerald-900',
};

export default function AnnouncementBanner() {
  const { profile, isDictator } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [dismissals, setDismissals] = useState<Dismissal[]>([]);

  const load = useCallback(async () => {
    const nowIso = new Date().toISOString();
    const [aRes, dRes] = await Promise.all([
      supabase
        .from('announcements')
        .select('*')
        .eq('is_active', true)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
        .order('created_at', { ascending: false }),
      supabase.from('announcement_dismissals').select('announcement_id, profile_id'),
    ]);
    if (!aRes.error) setAnnouncements((aRes.data ?? []) as Announcement[]);
    if (!dRes.error) setDismissals((dRes.data ?? []) as Dismissal[]);
  }, []);

  useEffect(() => {
    load();
    // Refresh every 30s so new banners arrive without manual reload.
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  // Compute what's actually visible to the current user
  const visible = useMemo(() => {
    if (!profile) return [];
    const myDismissed = new Set(
      dismissals.filter((d) => d.profile_id === profile.id).map((d) => d.announcement_id),
    );
    return announcements.filter((a) => !myDismissed.has(a.id));
  }, [announcements, dismissals, profile]);

  const dismissForMe = async (id: string) => {
    if (!profile) return;
    // Optimistic update: hide locally first.
    setDismissals((prev) => [
      ...prev,
      { announcement_id: id, profile_id: profile.id },
    ]);
    const { error } = await supabase
      .from('announcement_dismissals')
      .upsert({ announcement_id: id, profile_id: profile.id });
    if (error) {
      // Roll back on failure.
      setDismissals((prev) =>
        prev.filter((d) => !(d.announcement_id === id && d.profile_id === profile.id)),
      );
      alert(error.message);
    }
  };

  const rescindForAll = async (id: string) => {
    if (!confirm('Take this banner down for everyone?')) return;
    // Optimistic: remove from local list.
    setAnnouncements((prev) => prev.filter((a) => a.id !== id));
    const { error } = await supabase
      .from('announcements')
      .update({ is_active: false })
      .eq('id', id);
    if (error) {
      // Reload to recover state.
      load();
      alert(error.message);
    }
  };

  if (visible.length === 0) return null;

  return (
    <ul className="space-y-2">
      {visible.map((a) => {
        const cls = variantClass[a.variant] ?? variantClass.info;
        const canRescind = profile?.id === a.sender_id || isDictator;
        const Inner = (
          <div className="flex items-start gap-3 flex-1 min-w-0">
            {a.emoji && <span className="text-2xl shrink-0 leading-none">{a.emoji}</span>}
            <p className="text-sm font-medium leading-relaxed flex-1 min-w-0">
              {a.message}
            </p>
          </div>
        );
        return (
          <li
            key={a.id}
            className={`rounded-xl border-2 px-4 py-3 flex items-center gap-3 ${cls}`}
          >
            {a.link_path ? (
              <Link to={a.link_path} className="flex-1 min-w-0 hover:opacity-80 transition">
                {Inner}
              </Link>
            ) : (
              <div className="flex-1 min-w-0">{Inner}</div>
            )}
            <div className="flex items-center gap-1 shrink-0">
              {canRescind && (
                <button
                  type="button"
                  onClick={() => rescindForAll(a.id)}
                  className="text-[10px] uppercase tracking-wide px-2 py-1 rounded bg-white/60 hover:bg-white/90 text-current border border-current/20"
                  title="Take this banner down for everyone"
                >
                  Rescind
                </button>
              )}
              <button
                type="button"
                onClick={() => dismissForMe(a.id)}
                className="w-7 h-7 rounded hover:bg-white/40 grid place-items-center text-current/70 hover:text-current"
                aria-label="Dismiss for me"
                title="Dismiss for me"
              >
                ✕
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
