import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { NyePrediction, NyeQuestion } from '../../lib/nye';
import { defaultSeasonYear, isRevealed, listSeasonYears } from '../../lib/nye';
import type { Profile } from '../../lib/types';
import QuestionCard from '../../components/nye/QuestionCard';
import SubmitQuestionForm from '../../components/nye/SubmitQuestionForm';
import Leaderboard from '../../components/nye/Leaderboard';

export default function NewYearsPredictions() {
  const { profile } = useAuth();
  const [questions, setQuestions] = useState<NyeQuestion[]>([]);
  const [predictions, setPredictions] = useState<NyePrediction[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [year, setYear] = useState<number>(defaultSeasonYear());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSubmit, setShowSubmit] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [qRes, pRes, profRes] = await Promise.all([
      supabase.from('nye_questions').select('*').order('created_at', { ascending: true }),
      supabase.from('nye_predictions').select('*'),
      supabase.from('profiles').select('*').eq('is_deceased', false),
    ]);

    let firstError: string | null = null;
    const setErr = (e: { message: string } | null) => {
      if (e && !firstError) firstError = e.message;
    };

    setErr(qRes.error);
    if (!qRes.error) setQuestions((qRes.data ?? []) as NyeQuestion[]);
    setErr(pRes.error);
    if (!pRes.error) setPredictions((pRes.data ?? []) as NyePrediction[]);
    setErr(profRes.error);
    if (!profRes.error) setProfiles((profRes.data ?? []) as Profile[]);

    setError(firstError);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const yearOptions = useMemo(() => {
    const known = listSeasonYears(questions);
    const here = defaultSeasonYear();
    const set = new Set<number>([here, here + 1, ...known]);
    return Array.from(set).sort((a, b) => b - a);
  }, [questions]);

  const yearQuestions = useMemo(
    () => questions.filter((q) => q.season_year === year),
    [questions, year],
  );

  const myExistingQuestion = useMemo(
    () => yearQuestions.find((q) => q.asked_by === profile?.id) ?? null,
    [yearQuestions, profile],
  );

  const stats = useMemo(() => {
    let pending = 0,
      revealed = 0,
      unscored = 0;
    for (const q of yearQuestions) {
      if (isRevealed(q)) {
        revealed += 1;
        const ps = predictions.filter((p) => p.question_id === q.id);
        if (ps.some((p) => p.is_correct == null)) unscored += 1;
      } else {
        pending += 1;
      }
    }
    return { pending, revealed, unscored };
  }, [yearQuestions, predictions]);

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <Link to="/" className="text-sm text-primary-700 hover:underline">
        ← Back to home
      </Link>

      <header className="flex items-start gap-4">
        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 text-white grid place-items-center text-3xl shrink-0">
          🎆
        </div>
        <div>
          <h1 className="font-display text-3xl text-primary-900">New Year's Eve Predictions</h1>
          <p className="text-slate-600">
            Submit a question on NYE. Predict the future. Score points next year.
          </p>
        </div>
      </header>

      {/* Year selector */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-slate-600">Season year:</label>
        <select
          className="input w-32 text-sm py-1"
          value={year}
          onChange={(e) => {
            setYear(parseInt(e.target.value, 10));
            setShowSubmit(false);
          }}
        >
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <p className="text-xs text-slate-500">
          {yearQuestions.length} question{yearQuestions.length === 1 ? '' : 's'} ·{' '}
          {stats.revealed} revealed · {stats.pending} sealed
          {stats.unscored > 0 && ` · ${stats.unscored} need scoring`}
        </p>
      </div>

      {error && (
        <div className="card border-red-300 text-red-700 bg-red-50">{error}</div>
      )}

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <>
          {/* Submit your question form / button */}
          {!showSubmit && !myExistingQuestion && (
            <div className="card text-center">
              <p className="text-sm text-slate-600 mb-2">
                You haven't submitted a question for {year} yet.
              </p>
              <button type="button" className="btn-primary" onClick={() => setShowSubmit(true)}>
                🎆 Submit your question
              </button>
            </div>
          )}
          {!showSubmit && myExistingQuestion && (
            <p className="text-xs text-emerald-700 italic">
              ✓ You've submitted a question for {year}. (Want to add more? Most families do one per person — but you can submit multiple if you want.)
            </p>
          )}

          {showSubmit && (
            <SubmitQuestionForm
              seasonYear={year}
              onCreated={() => {
                setShowSubmit(false);
                load();
              }}
              onCancel={() => setShowSubmit(false)}
            />
          )}

          {!showSubmit && (
            <button type="button" className="btn-secondary text-sm" onClick={() => setShowSubmit(true)}>
              + Submit another question for {year}
            </button>
          )}

          {/* Questions list */}
          <div className="space-y-3">
            <h2 className="font-display text-xl text-primary-900">
              The slate for {year}
            </h2>
            {yearQuestions.length === 0 ? (
              <div className="card text-center text-slate-500 text-sm">
                No questions yet for {year}. Be the first!
              </div>
            ) : (
              <ul className="space-y-3">
                {yearQuestions.map((q) => (
                  <li key={q.id}>
                    <QuestionCard
                      question={q}
                      predictions={predictions.filter((p) => p.question_id === q.id)}
                      profiles={profiles}
                      onChanged={load}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Leaderboard */}
          <Leaderboard
            questions={questions}
            predictions={predictions}
            profiles={profiles}
          />
        </>
      )}
    </div>
  );
}
