// Pure logic + types for the New Year's Eve Predictions mini-app.

export interface NyeQuestion {
  id: string;
  season_year: number;        // the year being predicted (e.g. 2026)
  asked_by: string | null;
  question: string;
  revealed_answer: string | null;
  answer_revealed_at: string | null;
  created_at: string;
}

export interface NyePrediction {
  id: string;
  question_id: string;
  predictor_id: string;
  prediction: string;
  is_correct: boolean | null;  // null = unscored, true/false = scored
  created_at: string;
}

export interface YearScore {
  season_year: number;
  correct: number;
  scored: number;             // total predictions scored (correct + incorrect)
  unscored: number;           // total predictions still unscored
  questions_asked: number;    // how many questions this person *asked* that year
}

export interface LeaderboardRow {
  profile_id: string;
  total_correct: number;
  total_scored: number;
  total_questions_asked: number;
  by_year: Map<number, YearScore>;
  rank: number;
}

/* ---------------- Scoring ---------------- */

export function computeLeaderboard(
  questions: NyeQuestion[],
  predictions: NyePrediction[],
  profileIds: string[],
): LeaderboardRow[] {
  const qById = new Map(questions.map((q) => [q.id, q]));
  const rows = new Map<string, LeaderboardRow>();

  for (const pid of profileIds) {
    rows.set(pid, {
      profile_id: pid,
      total_correct: 0,
      total_scored: 0,
      total_questions_asked: 0,
      by_year: new Map(),
      rank: 0,
    });
  }

  // Tally questions asked
  for (const q of questions) {
    if (!q.asked_by) continue;
    const r = rows.get(q.asked_by);
    if (!r) continue;
    r.total_questions_asked += 1;
    const ys = r.by_year.get(q.season_year) ?? blankYear(q.season_year);
    ys.questions_asked += 1;
    r.by_year.set(q.season_year, ys);
  }

  // Tally predictions
  for (const p of predictions) {
    const q = qById.get(p.question_id);
    if (!q) continue;
    const r = rows.get(p.predictor_id);
    if (!r) continue;
    const ys = r.by_year.get(q.season_year) ?? blankYear(q.season_year);
    if (p.is_correct === true) {
      r.total_correct += 1;
      r.total_scored += 1;
      ys.correct += 1;
      ys.scored += 1;
    } else if (p.is_correct === false) {
      r.total_scored += 1;
      ys.scored += 1;
    } else {
      ys.unscored += 1;
    }
    r.by_year.set(q.season_year, ys);
  }

  const arr = Array.from(rows.values());
  arr.sort((a, b) => {
    if (b.total_correct !== a.total_correct) return b.total_correct - a.total_correct;
    return b.total_scored - a.total_scored;
  });

  // Dense rank
  let lastCorrect: number | null = null;
  let r = 0;
  for (const row of arr) {
    if (lastCorrect == null || row.total_correct !== lastCorrect) {
      r += 1;
      lastCorrect = row.total_correct;
    }
    row.rank = r;
  }
  return arr;
}

function blankYear(year: number): YearScore {
  return {
    season_year: year,
    correct: 0,
    scored: 0,
    unscored: 0,
    questions_asked: 0,
  };
}

/* ---------------- Year helpers ---------------- */

export function defaultSeasonYear(now: Date = new Date()): number {
  return now.getFullYear();
}

export function listSeasonYears(questions: NyeQuestion[]): number[] {
  const set = new Set<number>();
  for (const q of questions) set.add(q.season_year);
  return Array.from(set).sort((a, b) => b - a);
}

/* ---------------- State helpers ---------------- */

export function isRevealed(q: NyeQuestion): boolean {
  return q.revealed_answer != null && q.revealed_answer.trim().length > 0;
}
