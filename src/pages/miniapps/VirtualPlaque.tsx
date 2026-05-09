import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { CustomPlaqueRow, DisplayPlaque, PlaqueType } from '../../lib/plaques';
import { allPlaques } from '../../lib/plaques';
import type { NcaaPoolYear } from '../../lib/ncaaPool';
import type { NyePrediction, NyeQuestion } from '../../lib/nye';
import type { Profile } from '../../lib/types';
import Plaque from '../../components/plaques/Plaque';
import CustomPlaqueForm from '../../components/plaques/CustomPlaqueForm';

type FilterType = 'all' | 'winners' | 'losers' | 'custom';

export default function VirtualPlaque() {
  const { isDictator } = useAuth();
  const [ncaaYears, setNcaaYears] = useState<NcaaPoolYear[]>([]);
  const [nyeQuestions, setNyeQuestions] = useState<NyeQuestion[]>([]);
  const [nyePredictions, setNyePredictions] = useState<NyePrediction[]>([]);
  const [customRows, setCustomRows] = useState<CustomPlaqueRow[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const [yearFilter, setYearFilter] = useState<number | 'all'>('all');
  const [recipientFilter, setRecipientFilter] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    const [ncaaRes, nyeQRes, nyePRes, plaquesRes, profilesRes] = await Promise.all([
      supabase.from('ncaa_pool_years').select('*'),
      supabase.from('nye_questions').select('*'),
      supabase.from('nye_predictions').select('*'),
      supabase.from('plaques').select('*'),
      supabase.from('profiles').select('*'),
    ]);

    let firstError: string | null = null;
    const setErr = (e: { message: string } | null) => {
      if (e && !firstError) firstError = e.message;
    };

    setErr(ncaaRes.error);
    if (!ncaaRes.error) setNcaaYears((ncaaRes.data ?? []) as NcaaPoolYear[]);
    setErr(nyeQRes.error);
    if (!nyeQRes.error) setNyeQuestions((nyeQRes.data ?? []) as NyeQuestion[]);
    setErr(nyePRes.error);
    if (!nyePRes.error) setNyePredictions((nyePRes.data ?? []) as NyePrediction[]);
    setErr(plaquesRes.error);
    if (!plaquesRes.error) setCustomRows((plaquesRes.data ?? []) as CustomPlaqueRow[]);
    setErr(profilesRes.error);
    if (!profilesRes.error) setProfiles((profilesRes.data ?? []) as Profile[]);

    setError(firstError);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const all = useMemo(
    () =>
      allPlaques({
        ncaaYears,
        nyeQuestions,
        nyePredictions,
        customRows,
        profiles,
      }),
    [ncaaYears, nyeQuestions, nyePredictions, customRows, profiles],
  );

  const allYears = useMemo(() => {
    const set = new Set<number>();
    for (const p of all) set.add(p.year);
    return Array.from(set).sort((a, b) => b - a);
  }, [all]);

  const filtered = useMemo(() => {
    return all.filter((p) => {
      if (filter === 'winners' && p.plaque_type !== 'ncaa_winner' && p.plaque_type !== 'nye_winner')
        return false;
      if (filter === 'losers' && p.plaque_type !== 'ncaa_loser' && p.plaque_type !== 'nye_loser')
        return false;
      if (filter === 'custom' && p.plaque_type !== 'custom') return false;
      if (yearFilter !== 'all' && p.year !== yearFilter) return false;
      if (recipientFilter && p.profile_id !== recipientFilter) return false;
      return true;
    });
  }, [all, filter, yearFilter, recipientFilter]);

  const grouped = useMemo(() => {
    const m = new Map<number, DisplayPlaque[]>();
    for (const p of filtered) {
      const arr = m.get(p.year) ?? [];
      arr.push(p);
      m.set(p.year, arr);
    }
    return Array.from(m.entries()).sort((a, b) => b[0] - a[0]);
  }, [filtered]);

  const deleteCustom = async (plaque: DisplayPlaque) => {
    if (!plaque.is_custom) return;
    // Find original row (key is `custom-<id>`)
    const id = plaque.key.startsWith('custom-') ? plaque.key.slice(7) : null;
    if (!id) return;
    if (!confirm('Take down this custom plaque?')) return;
    const { error } = await supabase.from('plaques').delete().eq('id', id);
    if (error) alert(error.message);
    else load();
  };

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <Link to="/" className="text-sm text-primary-700 hover:underline">
        ← Back to home
      </Link>

      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-yellow-500 to-amber-600 text-white grid place-items-center text-3xl shrink-0">
            🏆
          </div>
          <div>
            <h1 className="font-display text-3xl text-primary-900">Virtual Plaques</h1>
            <p className="text-slate-600">
              Mom's wall — every champion and every cellar-dweller, in one place.
            </p>
          </div>
        </div>
        {isDictator && !showCustomForm && (
          <button type="button" className="btn-primary" onClick={() => setShowCustomForm(true)}>
            + Add custom plaque
          </button>
        )}
      </header>

      {showCustomForm && (
        <CustomPlaqueForm
          profiles={profiles}
          onCreated={() => {
            setShowCustomForm(false);
            load();
          }}
          onCancel={() => setShowCustomForm(false)}
        />
      )}

      {/* Filters */}
      <div className="card flex flex-wrap items-center gap-3">
        <div className="flex gap-1 bg-white border border-primary-100 rounded-lg p-1">
          {(
            [
              ['all', 'All'],
              ['winners', '🏆 Winners'],
              ['losers', '🪦 Last places'],
              ['custom', '✨ Custom'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={`px-3 py-1 text-xs rounded-md transition ${
                filter === id ? 'bg-primary-600 text-white' : 'text-primary-800 hover:bg-primary-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          className="input w-32 text-sm py-1"
          value={yearFilter}
          onChange={(e) => {
            const v = e.target.value;
            setYearFilter(v === 'all' ? 'all' : parseInt(v, 10));
          }}
        >
          <option value="all">All years</option>
          {allYears.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select
          className="input flex-1 min-w-[140px] text-sm py-1"
          value={recipientFilter}
          onChange={(e) => setRecipientFilter(e.target.value)}
        >
          <option value="">Anyone</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.first_name || p.email}
            </option>
          ))}
        </select>
        <p className="text-xs text-slate-500 ml-auto">
          {filtered.length} plaque{filtered.length === 1 ? '' : 's'}
        </p>
      </div>

      {error && (
        <div className="card border-red-300 text-red-700 bg-red-50">{error}</div>
      )}

      {loading ? (
        <p className="text-slate-500">Loading the wall…</p>
      ) : filtered.length === 0 ? (
        <div className="card text-center text-slate-500 py-12">
          <p className="text-lg">The wall is empty.</p>
          <p className="text-sm mt-2">
            Plaques appear automatically when an NCAA Pool year is finalized or NYE
            predictions get scored. Or add a custom plaque to commemorate something special.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map(([year, list]) => (
            <section key={year} className="space-y-3">
              <h2 className="font-display text-xl text-primary-900 border-b border-primary-100 pb-2">
                {year}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((p) => (
                  <Plaque
                    key={p.key}
                    plaque={p}
                    onDelete={isDictator && p.is_custom ? () => deleteCustom(p) : undefined}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
