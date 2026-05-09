// Pure logic for the Virtual Plaques mini-app.
// Merges auto-computed plaques from NCAA Pool + NYE Predictions with
// custom plaques stored in the `plaques` table.

import type { NcaaPoolYear } from './ncaaPool';
import type { NyePrediction, NyeQuestion } from './nye';
import type { Profile } from './types';
import { displayName } from './types';

export type PlaqueType = 'ncaa_winner' | 'ncaa_loser' | 'nye_winner' | 'nye_loser' | 'custom';

export interface CustomPlaqueRow {
  id: string;
  plaque_type: PlaqueType;     // typically 'custom' from the table; can be other types if seeded
  year: number;
  profile_id: string | null;
  title: string | null;
  subtitle: string | null;
  photo_url: string | null;
  created_at: string;
}

export interface DisplayPlaque {
  /** Stable key for React. For custom plaques it's the row id; for auto it's synthetic. */
  key: string;
  source: 'ncaa' | 'nye' | 'custom';
  plaque_type: PlaqueType;
  year: number;
  profile_id: string | null;
  recipient_name: string;        // resolved name (profile or freetext)
  title: string;
  subtitle: string | null;
  details: string | null;        // extra factoid (e.g., "142 points", "5 of 7 correct")
  photo_url: string | null;
  /** True for the original/persisted variants; false for runtime-computed. */
  is_custom: boolean;
}

/* ---------------- Helpers ---------------- */

function nameFor(profileId: string | null, fallback: string | null, profilesById: Map<string, Profile>): string {
  if (profileId) {
    const p = profilesById.get(profileId);
    if (p) return displayName(p);
  }
  return fallback ?? '(unnamed)';
}

/* ---------------- NCAA plaques ---------------- */

export function ncaaPlaques(years: NcaaPoolYear[], profilesById: Map<string, Profile>): DisplayPlaque[] {
  const out: DisplayPlaque[] = [];
  for (const y of years) {
    if (!y.is_finalized) continue;
    const winnerName = nameFor(y.winner_profile_id, y.winner_bracket_name, profilesById);
    const loserName = nameFor(y.loser_profile_id, y.loser_bracket_name, profilesById);

    if (y.winner_profile_id || y.winner_bracket_name) {
      out.push({
        key: `ncaa-w-${y.pool_year}`,
        source: 'ncaa',
        plaque_type: 'ncaa_winner',
        year: y.pool_year,
        profile_id: y.winner_profile_id,
        recipient_name: winnerName,
        title: 'NCAA Pool Champion',
        subtitle: y.title ?? `March Madness ${y.pool_year}`,
        details: null,
        photo_url: null,
        is_custom: false,
      });
    }
    if (
      (y.loser_profile_id || y.loser_bracket_name) &&
      // Don't show a loser plaque if it's the same person as the winner
      (y.loser_profile_id !== y.winner_profile_id || y.loser_bracket_name !== y.winner_bracket_name)
    ) {
      out.push({
        key: `ncaa-l-${y.pool_year}`,
        source: 'ncaa',
        plaque_type: 'ncaa_loser',
        year: y.pool_year,
        profile_id: y.loser_profile_id,
        recipient_name: loserName,
        title: 'NCAA Pool Last Place',
        subtitle: y.title ?? `March Madness ${y.pool_year}`,
        details: null,
        photo_url: null,
        is_custom: false,
      });
    }
  }
  return out;
}

/* ---------------- NYE plaques ---------------- */

interface YearScores {
  year: number;
  byProfile: Map<string, { correct: number; scored: number }>;
}

function tallyNyeByYear(
  questions: NyeQuestion[],
  predictions: NyePrediction[],
): Map<number, YearScores> {
  const qById = new Map(questions.map((q) => [q.id, q]));
  const out = new Map<number, YearScores>();
  for (const p of predictions) {
    if (p.is_correct == null) continue; // unscored
    const q = qById.get(p.question_id);
    if (!q) continue;
    let bucket = out.get(q.season_year);
    if (!bucket) {
      bucket = { year: q.season_year, byProfile: new Map() };
      out.set(q.season_year, bucket);
    }
    const cur = bucket.byProfile.get(p.predictor_id) ?? { correct: 0, scored: 0 };
    cur.scored += 1;
    if (p.is_correct === true) cur.correct += 1;
    bucket.byProfile.set(p.predictor_id, cur);
  }
  return out;
}

export function nyePlaques(
  questions: NyeQuestion[],
  predictions: NyePrediction[],
  profilesById: Map<string, Profile>,
): DisplayPlaque[] {
  const tally = tallyNyeByYear(questions, predictions);
  const out: DisplayPlaque[] = [];

  for (const [year, ys] of tally) {
    if (ys.byProfile.size < 1) continue;

    const ranked = Array.from(ys.byProfile.entries())
      .map(([pid, s]) => ({ pid, ...s }))
      .sort((a, b) => b.correct - a.correct);

    const top = ranked[0];
    const topCorrect = top.correct;

    // Winners: everyone tied for the top score (and at least one correct).
    if (topCorrect > 0) {
      const winners = ranked.filter((r) => r.correct === topCorrect);
      for (const w of winners) {
        out.push({
          key: `nye-w-${year}-${w.pid}`,
          source: 'nye',
          plaque_type: 'nye_winner',
          year,
          profile_id: w.pid,
          recipient_name: nameFor(w.pid, null, profilesById),
          title: "New Year's Predictions Champion",
          subtitle: `Season of ${year}`,
          details: `${w.correct} of ${w.scored} correct`,
          photo_url: null,
          is_custom: false,
        });
      }
    }

    // Loser: only if there's clear separation (more than one participant with
    // scored predictions, and the bottom score is different from the top).
    if (ranked.length >= 2) {
      const bottom = ranked[ranked.length - 1];
      if (bottom.correct < topCorrect) {
        const losers = ranked.filter((r) => r.correct === bottom.correct);
        for (const l of losers) {
          out.push({
            key: `nye-l-${year}-${l.pid}`,
            source: 'nye',
            plaque_type: 'nye_loser',
            year,
            profile_id: l.pid,
            recipient_name: nameFor(l.pid, null, profilesById),
            title: "New Year's Predictions Cellar-Dweller",
            subtitle: `Season of ${year}`,
            details: `${l.correct} of ${l.scored} correct`,
            photo_url: null,
            is_custom: false,
          });
        }
      }
    }
  }

  return out;
}

/* ---------------- Custom plaques ---------------- */

export function customPlaques(
  rows: CustomPlaqueRow[],
  profilesById: Map<string, Profile>,
): DisplayPlaque[] {
  return rows.map((r) => ({
    key: `custom-${r.id}`,
    source: 'custom',
    plaque_type: r.plaque_type,
    year: r.year,
    profile_id: r.profile_id,
    recipient_name: nameFor(r.profile_id, r.subtitle, profilesById),
    title: r.title ?? 'Custom Plaque',
    subtitle: r.subtitle,
    details: null,
    photo_url: r.photo_url,
    is_custom: true,
  }));
}

/* ---------------- Aggregate ---------------- */

export function allPlaques(args: {
  ncaaYears: NcaaPoolYear[];
  nyeQuestions: NyeQuestion[];
  nyePredictions: NyePrediction[];
  customRows: CustomPlaqueRow[];
  profiles: Profile[];
}): DisplayPlaque[] {
  const profilesById = new Map(args.profiles.map((p) => [p.id, p]));
  const out: DisplayPlaque[] = [
    ...ncaaPlaques(args.ncaaYears, profilesById),
    ...nyePlaques(args.nyeQuestions, args.nyePredictions, profilesById),
    ...customPlaques(args.customRows, profilesById),
  ];
  // Sort newest year first; within a year, winners before losers, custom first.
  const typeOrder: Record<PlaqueType, number> = {
    custom: 0,
    ncaa_winner: 1,
    nye_winner: 2,
    ncaa_loser: 3,
    nye_loser: 4,
  };
  out.sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year;
    if (typeOrder[a.plaque_type] !== typeOrder[b.plaque_type]) {
      return typeOrder[a.plaque_type] - typeOrder[b.plaque_type];
    }
    return a.recipient_name.localeCompare(b.recipient_name);
  });
  return out;
}

export function plaqueIsWinner(t: PlaqueType): boolean {
  return t === 'ncaa_winner' || t === 'nye_winner';
}

export function plaqueIsLoser(t: PlaqueType): boolean {
  return t === 'ncaa_loser' || t === 'nye_loser';
}
