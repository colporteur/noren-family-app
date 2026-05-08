import { FormEvent, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface Props {
  seasonYear: number;
  onCreated: () => void;
  onCancel: () => void;
}

export default function SubmitQuestionForm({ seasonYear, onCreated, onCancel }: Props) {
  const { profile } = useAuth();
  const [question, setQuestion] = useState('');
  const [prediction, setPrediction] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setBusy(true);
    setError(null);

    if (!question.trim()) {
      setError('Question is required.');
      setBusy(false);
      return;
    }
    if (!prediction.trim()) {
      setError('Add your own prediction too — you predict on your own question.');
      setBusy(false);
      return;
    }

    const qIns = await supabase
      .from('nye_questions')
      .insert({
        season_year: seasonYear,
        asked_by: profile.id,
        question: question.trim(),
      })
      .select('*')
      .single();
    if (qIns.error || !qIns.data) {
      setError(qIns.error?.message ?? 'Failed to submit question.');
      setBusy(false);
      return;
    }
    const questionId = qIns.data.id as string;

    const pIns = await supabase.from('nye_predictions').insert({
      question_id: questionId,
      predictor_id: profile.id,
      prediction: prediction.trim(),
    });
    if (pIns.error) {
      setError(`Question saved but your prediction failed: ${pIns.error.message}`);
      setBusy(false);
      return;
    }

    setBusy(false);
    onCreated();
  };

  return (
    <form onSubmit={submit} className="card space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-xl text-primary-900">
          Submit your question for {seasonYear}
        </h3>
        <button type="button" onClick={onCancel} className="text-sm text-slate-500 hover:underline">
          Cancel
        </button>
      </div>

      <div>
        <label className="label">Your question</label>
        <input
          type="text"
          className="input"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={`e.g. "Will Mom take a vacation overseas in ${seasonYear}?"`}
          autoFocus
          required
        />
        <p className="text-[11px] text-slate-500 mt-1">
          Phrase it so the answer can be evaluated yes/no, a number, a name, etc.
          The answer will be revealed on NYE {seasonYear} when we score everyone's predictions.
        </p>
      </div>

      <div>
        <label className="label">Your own prediction (you predict on your own question too)</label>
        <input
          type="text"
          className="input"
          value={prediction}
          onChange={(e) => setPrediction(e.target.value)}
          placeholder='e.g. "Yes", "12-5", "Cleveland"'
          required
        />
        <p className="text-[11px] text-slate-500 mt-1">
          Other family members won't see anyone's predictions until the answer is revealed.
        </p>
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2 border-t border-primary-100">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Submitting…' : '🎆 Submit question'}
        </button>
      </div>
    </form>
  );
}
