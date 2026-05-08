import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { NcaaPoolYear, NcaaStanding } from '../../lib/ncaaPool';
import { withDenseRanks } from '../../lib/ncaaPool';
import type { Profile } from '../../lib/types';
import { displayName } from '../../lib/types';
import StandingsTable from '../../components/ncaa/StandingsTable';
import StandingsEditor from '../../components/ncaa/StandingsEditor';
import AllTimeStats from '../../components/ncaa/AllTimeStats';

type Tab = 'current' | 'history' | 'all_time';

export default function NCAAPool() {
  const { isDictator } = useAuth();
  const [years, setYears] = useState<NcaaPoolYear[]>([]);
  const [standings, setStandings] = useState<NcaaStanding[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>('current');
  const [editing, setEditing] = useState(false);
  const [showFinalize, setShowFinalize] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [yearsRes, standingsRes, profRes] = await Promise.all([
      supabase.from('ncaa_pool_years').select('*').order('pool_year', { ascending: false }),
      supabase.from('ncaa_pool_standings').select('*'),
      supabase.from('profiles').select('*'),
    ]);

    let firstError: string | null = null;
    const setErr = (e: { message: string } | null) => {
      if (e && !firstError) firstError = e.message;
    };

    setErr(yearsRes.error);
    if (!yearsRes.error) setYears((yearsRes.data ?? []) as NcaaPoolYear[]);
    setErr(standingsRes.error);
    if (!standingsRes.error) setStandings((standingsRes.data ?? []) as NcaaStanding[]);
    setErr(profRes.error);
    if (!profRes.error) setProfiles((profRes.data ?? []) as Profile[]);

    setError(firstError);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Default-select the most recent year
  useEffect(() => {
    if (selectedYear == null && years.length > 0) {
      setSelectedYear(years[0].pool_year);
    }
  }, [years, selectedYear]);

  const yearMeta = years.find((y) => y.pool_year === selectedYear) ?? null;
  const yearStandings = useMemo(
    () => standings.filter((s) => s.pool_year === selectedYear),
    [standings, selectedYear],
  );

  /* ---------------- Dictator: create new year ---------------- */

  const createYear = async () => {
    const yStr = window.prompt('Pool year (e.g. 2027):');
    if (!yStr) return;
    const y = parseInt(yStr, 10);
    if (!Number.isFinite(y) || y < 1900 || y > 3000) {
      alert('Year must be a number like 2027.');
      return;
    }
    if (years.some((yy) => yy.pool_year === y)) {
      alert(`Year ${y} already exists.`);
      return;
    }
    const { error: insErr } = await supabase
      .from('ncaa_pool_years')
      .insert({ pool_year: y, title: `March Madness ${y}` });
    if (insErr) {
      alert(insErr.message);
      return;
    }
    setSelectedYear(y);
    setTab('current');
    setEditing(true);
    load();
  };

  const finalizeYear = async () => {
    if (!yearMeta) return;
    const ranked = withDenseRanks(yearStandings);
    if (ranked.length === 0) {
      alert('No standings to finalize. Add some first.');
      return;
    }
    const winner = ranked[0];
    const loser = ranked[ranked.length - 1];
    const { error: upErr } = await supabase
      .from('ncaa_pool_years')
      .update({
        is_finalized: true,
        winner_profile_id: winner.profile_id,
        winner_bracket_name: winner.profile_id ? null : winner.bracket_name,
        loser_profile_id: loser.profile_id,
        loser_bracket_name: loser.profile_id ? null : loser.bracket_name,
      })
      .eq('pool_year', yearMeta.pool_year);
    if (upErr) {
      alert(upErr.message);
      return;
    }
    // Banner
    const winnerName =
      winner.profile_id
        ? displayName(profiles.find((p) => p.id === winner.profile_id) ?? ({ email: '?' } as Profile))
        : winner.bracket_name ?? '?';
    await supabase.from('announcements').insert({
      source: 'ncaa_pool',
      source_id: null,
      sender_id: null,
      emoji: '🏀',
      message: `${yearMeta.title ?? `NCAA Pool ${yearMeta.pool_year}`} finalized! 🏆 ${winnerName} won with ${winner.points} pts.`,
      variant: 'success',
      link_path: '/apps/ncaa',
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
    setShowFinalize(false);
    load();
  };

  const unfinalize = async () => {
    if (!yearMeta) return;
    if (!confirm('Re-open this year? Stats will revert.')) return;
    await supabase
      .from('ncaa_pool_years')
      .update({
        is_finalized: false,
        winner_profile_id: null,
        winner_bracket_name: null,
        loser_profile_id: null,
        loser_bracket_name: null,
      })
      .eq('pool_year', yearMeta.pool_year);
    load();
  };

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <Link to="/" className="text-sm text-primary-700 hover:underline">
        ← Back to home
      </Link>

      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 text-white grid place-items-center text-3xl shrink-0">
            🏀
          </div>
          <div>
            <h1 className="font-display text-3xl text-primary-900">NCAA Tournament Pool</h1>
            <p className="text-slate-600">
              Live standings for the family bracket pool — by year and all-time.
            </p>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 bg-white border border-primary-100 rounded-lg p-1 shadow-soft w-fit overflow-x-auto max-w-full">
        {(
          [
            ['current', 'This year'],
            ['history', 'By year'],
            ['all_time', 'All-time'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-1.5 text-sm rounded-md transition ${
              tab === id ? 'bg-primary-600 text-white' : 'text-primary-800 hover:bg-primary-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="card border-red-300 text-red-700 bg-red-50">{error}</div>
      )}

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <>
          {tab !== 'all_time' && years.length === 0 && (
            <div className="card text-center text-slate-500 text-sm space-y-3">
              <p>No pool years on record yet.</p>
              {isDictator && (
                <button type="button" className="btn-primary" onClick={createYear}>
                  + Create the first year
                </button>
              )}
            </div>
          )}

          {tab === 'current' && yearMeta && (
            <>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="font-display text-xl text-primary-900">
                    {yearMeta.title ?? `Pool ${yearMeta.pool_year}`}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {yearMeta.is_finalized ? '✓ Finalized' : 'In progress'} ·{' '}
                    {yearStandings.length} bracket{yearStandings.length === 1 ? '' : 's'}
                  </p>
                </div>
                {isDictator && (
                  <div className="flex gap-2 flex-wrap">
                    {!editing && (
                      <button type="button" className="btn-secondary text-sm" onClick={() => setEditing(true)}>
                        ✏️ Edit standings
                      </button>
                    )}
                    {!yearMeta.is_finalized && yearStandings.length > 0 && (
                      <button
                        type="button"
                        className="btn-primary text-sm"
                        onClick={() => setShowFinalize(true)}
                      >
                        🏆 Finalize year
                      </button>
                    )}
                    {yearMeta.is_finalized && (
                      <button type="button" className="btn-secondary text-sm" onClick={unfinalize}>
                        Re-open
                      </button>
                    )}
                    <button type="button" className="btn-secondary text-sm" onClick={createYear}>
                      + New year
                    </button>
                  </div>
                )}
              </div>

              {editing ? (
                <StandingsEditor
                  poolYear={yearMeta.pool_year}
                  standings={yearStandings}
                  profiles={profiles}
                  onChanged={load}
                  onClose={() => setEditing(false)}
                />
              ) : (
                <StandingsTable standings={yearStandings} profiles={profiles} />
              )}

              {showFinalize && (
                <FinalizeConfirm
                  yearMeta={yearMeta}
                  yearStandings={yearStandings}
                  profiles={profiles}
                  onConfirm={finalizeYear}
                  onCancel={() => setShowFinalize(false)}
                />
              )}
            </>
          )}

          {tab === 'history' && (
            <div className="space-y-3">
              {years.length === 0 ? (
                <div className="card text-center text-slate-500 text-sm">No years on record yet.</div>
              ) : (
                <div className="flex gap-1 flex-wrap">
                  {years.map((y) => (
                    <button
                      key={y.pool_year}
                      onClick={() => {
                        setSelectedYear(y.pool_year);
                        setTab('current');
                      }}
                      className={`px-3 py-1.5 text-sm rounded-md border transition ${
                        selectedYear === y.pool_year
                          ? 'bg-primary-600 text-white border-primary-700'
                          : 'bg-white text-primary-800 border-primary-200 hover:bg-primary-50'
                      }`}
                    >
                      {y.pool_year}
                      {y.is_finalized && ' 🏆'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'all_time' && (
            <AllTimeStats years={years} standings={standings} profiles={profiles} />
          )}
        </>
      )}
    </div>
  );
}

/* ---------------- Finalize-confirm modal ---------------- */

function FinalizeConfirm({
  yearMeta,
  yearStandings,
  profiles,
  onConfirm,
  onCancel,
}: {
  yearMeta: NcaaPoolYear;
  yearStandings: NcaaStanding[];
  profiles: Profile[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ranked = withDenseRanks(yearStandings);
  if (ranked.length === 0) return null;
  const winner = ranked[0];
  const loser = ranked[ranked.length - 1];
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const nameOf = (s: NcaaStanding) =>
    s.profile_id && profileById.get(s.profile_id)
      ? displayName(profileById.get(s.profile_id) as Profile)
      : s.bracket_name ?? '?';

  return (
    <div className="card border-amber-300 bg-amber-50/60 space-y-3">
      <h3 className="font-display text-lg text-primary-900">Finalize {yearMeta.pool_year}?</h3>
      <p className="text-sm text-slate-700">
        🏆 <strong>{nameOf(winner)}</strong> wins with <strong>{winner.points}</strong> points.
      </p>
      {loser.id !== winner.id && (
        <p className="text-sm text-slate-700">
          🪦 <strong>{nameOf(loser)}</strong> finishes last with <strong>{loser.points}</strong> points.
        </p>
      )}
      <p className="text-xs text-slate-500">
        Finalizing posts a banner to home and feeds these into the Virtual Plaques mini-app.
      </p>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary text-sm" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn-primary text-sm" onClick={onConfirm}>
          🏆 Finalize
        </button>
      </div>
    </div>
  );
}
