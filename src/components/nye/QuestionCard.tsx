import { useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { NyePrediction, NyeQuestion } from '../../lib/nye';
import { isRevealed } from '../../lib/nye';
import type { Profile } from '../../lib/types';
import { displayName } from '../../lib/types';

interface Props {
  question: NyeQuestion;
  predictions: NyePrediction[];   // already filtered to this question
  profiles: Profile[];
  onChanged: () => void;
}

export default function QuestionCard({ question, predictions, profiles, onChanged }: Props) {
  const { profile, isDictator } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editPrediction, setEditPrediction] = useState(false);
  const [predictionDraft, setPredictionDraft] = useState('');
  const [revealing, setRevealing] = useState(false);
  const [answerDraft, setAnswerDraft] = useState('');

  const profileById = useMemo(
    () => new Map(profiles.map((p) => [p.id, p])),
    [profiles],
  );

  const myPrediction = predictions.find((p) => p.predictor_id === profile?.id) ?? null;
  const revealed = isRevealed(question);

  const askerName = question.asked_by
    ? displayName(profileById.get(question.asked_by) ?? ({ email: '?' } as Profile))
    : '(unknown)';

  /* ---------------- Predictions ---------------- */

  const submitPrediction = async () => {
    if (!profile) return;
    if (!predictionDraft.trim()) {
      setError('Type a prediction first.');
      return;
    }
    setBusy(true);
    setError(null);
    if (myPrediction) {
      const { error } = await supabase
        .from('nye_predictions')
        .update({ prediction: predictionDraft.trim() })
        .eq('id', myPrediction.id);
      setBusy(false);
      if (error) setError(error.message);
      else {
        setEditPrediction(false);
        onChanged();
      }
    } else {
      const { error } = await supabase.from('nye_predictions').insert({
        question_id: question.id,
        predictor_id: profile.id,
        prediction: predictionDraft.trim(),
      });
      setBusy(false);
      if (error) setError(error.message);
      else {
        setEditPrediction(false);
        setPredictionDraft('');
        onChanged();
      }
    }
  };

  /* ---------------- Reveal ---------------- */

  const reveal = async () => {
    if (!isDictator) return;
    if (!answerDraft.trim()) {
      setError('Type the answer first.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase
      .from('nye_questions')
      .update({
        revealed_answer: answerDraft.trim(),
        answer_revealed_at: new Date().toISOString(),
      })
      .eq('id', question.id);
    setBusy(false);
    if (error) setError(error.message);
    else {
      setRevealing(false);
      setAnswerDraft('');
      onChanged();
    }
  };

  const unreveal = async () => {
    if (!isDictator) return;
    if (!confirm('Hide the answer again? Predictions go back to sealed.')) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase
      .from('nye_questions')
      .update({ revealed_answer: null, answer_revealed_at: null })
      .eq('id', question.id);
    setBusy(false);
    if (error) setError(error.message);
    else onChanged();
  };

  /* ---------------- Scoring ---------------- */

  const score = async (predictionId: string, isCorrect: boolean | null) => {
    if (!isDictator) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase
      .from('nye_predictions')
      .update({ is_correct: isCorrect })
      .eq('id', predictionId);
    setBusy(false);
    if (error) setError(error.message);
    else onChanged();
  };

  /* ---------------- Delete ---------------- */

  const deleteQuestion = async () => {
    if (!isDictator && profile?.id !== question.asked_by) return;
    if (!confirm('Delete this question and all predictions on it?')) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.from('nye_questions').delete().eq('id', question.id);
    setBusy(false);
    if (error) setError(error.message);
    else onChanged();
  };

  /* ---------------- Render ---------------- */

  return (
    <div className={`card space-y-3 ${revealed ? 'border-emerald-200 bg-emerald-50/30' : ''}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
            From {askerName}
          </p>
          <h3 className="font-display text-lg text-primary-900 mt-0.5">{question.question}</h3>
          {revealed && (
            <p className="text-sm text-emerald-800 mt-1">
              <span className="font-semibold">✨ Answer:</span> {question.revealed_answer}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {revealed ? (
            <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
              Revealed
            </span>
          ) : (
            <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">
              🤐 Sealed
            </span>
          )}
        </div>
      </div>

      {/* My prediction (sealed phase) */}
      {!revealed && (
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
          {myPrediction && !editPrediction ? (
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
                  Your prediction (kept private)
                </p>
                <p className="text-sm text-primary-900 mt-1">{myPrediction.prediction}</p>
              </div>
              <button
                type="button"
                className="text-xs text-primary-700 hover:underline"
                onClick={() => {
                  setEditPrediction(true);
                  setPredictionDraft(myPrediction.prediction);
                }}
              >
                Change
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
                {myPrediction ? 'Update your prediction' : 'Your prediction'}
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="input flex-1 text-sm"
                  value={predictionDraft}
                  onChange={(e) => setPredictionDraft(e.target.value)}
                  placeholder='e.g. "Yes", "12-5", "Cleveland"'
                />
                <button
                  type="button"
                  className="btn-primary text-sm"
                  onClick={submitPrediction}
                  disabled={busy}
                >
                  {busy ? 'Saving…' : myPrediction ? 'Update' : 'Submit'}
                </button>
                {editPrediction && (
                  <button
                    type="button"
                    className="btn-secondary text-sm"
                    onClick={() => setEditPrediction(false)}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sealed-phase counts (let people see how many have predicted) */}
      {!revealed && (
        <p className="text-xs text-slate-500">
          {predictions.length} of {profiles.length} family members have predicted (predictions stay private until reveal).
        </p>
      )}

      {/* Reveal interface */}
      {!revealed && isDictator && (
        <div className="border-t border-primary-100 pt-3">
          {revealing ? (
            <div className="space-y-2">
              <label className="label">The actual answer</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="input flex-1 text-sm"
                  value={answerDraft}
                  onChange={(e) => setAnswerDraft(e.target.value)}
                  placeholder='e.g. "Yes — went to Italy", "11-6", "Pittsburgh"'
                  autoFocus
                />
                <button type="button" className="btn-primary text-sm" onClick={reveal} disabled={busy}>
                  {busy ? 'Revealing…' : '✨ Reveal & open predictions'}
                </button>
                <button
                  type="button"
                  className="btn-secondary text-sm"
                  onClick={() => setRevealing(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="btn-secondary text-sm"
              onClick={() => setRevealing(true)}
            >
              ✨ Reveal answer (Dictator)
            </button>
          )}
        </div>
      )}

      {/* Revealed: show all predictions with scoring */}
      {revealed && (
        <div className="border-t border-primary-100 pt-3 space-y-2">
          <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
            All predictions ({predictions.length})
          </p>
          {predictions.length === 0 ? (
            <p className="text-sm text-slate-500 italic">No one made a prediction.</p>
          ) : (
            <ul className="space-y-1.5">
              {predictions.map((p) => {
                const who = profileById.get(p.predictor_id);
                return (
                  <li
                    key={p.id}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-md border ${
                      p.is_correct === true
                        ? 'border-emerald-300 bg-emerald-50'
                        : p.is_correct === false
                          ? 'border-red-200 bg-red-50/60'
                          : 'border-slate-200 bg-white'
                    }`}
                  >
                    <span className="text-sm font-medium text-primary-900 w-32 truncate">
                      {who ? displayName(who) : '?'}
                    </span>
                    <span className="text-sm text-slate-700 flex-1 min-w-0 truncate">
                      {p.prediction}
                    </span>
                    {isDictator ? (
                      <div className="flex gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => score(p.id, true)}
                          disabled={busy}
                          className={`text-xs px-2 py-0.5 rounded-md border ${
                            p.is_correct === true
                              ? 'bg-emerald-500 text-white border-emerald-600'
                              : 'bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50'
                          }`}
                          title="Correct"
                        >
                          ✓
                        </button>
                        <button
                          type="button"
                          onClick={() => score(p.id, false)}
                          disabled={busy}
                          className={`text-xs px-2 py-0.5 rounded-md border ${
                            p.is_correct === false
                              ? 'bg-red-500 text-white border-red-600'
                              : 'bg-white text-red-700 border-red-300 hover:bg-red-50'
                          }`}
                          title="Incorrect"
                        >
                          ✗
                        </button>
                        <button
                          type="button"
                          onClick={() => score(p.id, null)}
                          disabled={busy}
                          className={`text-xs px-2 py-0.5 rounded-md border ${
                            p.is_correct == null
                              ? 'bg-slate-200 text-slate-700 border-slate-400'
                              : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                          }`}
                          title="Clear scoring"
                        >
                          —
                        </button>
                      </div>
                    ) : (
                      <span className="text-base shrink-0">
                        {p.is_correct === true && '✅'}
                        {p.is_correct === false && '❌'}
                        {p.is_correct == null && <span className="text-xs text-slate-400">unscored</span>}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {isDictator && (
            <div className="flex gap-2 pt-2">
              <button type="button" className="btn-secondary text-xs" onClick={unreveal} disabled={busy}>
                Unreveal (re-seal)
              </button>
            </div>
          )}
        </div>
      )}

      {/* Delete (asker or dictator) */}
      {(isDictator || profile?.id === question.asked_by) && (
        <div className="flex justify-end pt-2 border-t border-primary-100">
          <button
            type="button"
            onClick={deleteQuestion}
            className="text-xs text-red-600 hover:underline"
            disabled={busy}
          >
            Delete question
          </button>
        </div>
      )}

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </div>
      )}
    </div>
  );
}
