import { useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { compressImage } from '../../lib/imageCompression';
import type { BoardGame } from '../../lib/boardGames';
import type { Profile } from '../../lib/types';
import { matchSession, type MatchedSession, type SuggestedSession } from '../../lib/importMatching';
import ImportPreview from './ImportPreview';

interface Props {
  games: BoardGame[];
  profiles: Profile[];
  onImported: (count: number) => void;
}

interface FunctionResponse {
  sessions: SuggestedSession[];
  confidence: 'high' | 'medium' | 'low';
  source_notes?: string;
}

export default function PhotoImport({ games, profiles, onImported }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [matched, setMatched] = useState<MatchedSession[] | null>(null);
  const [meta, setMeta] = useState<{ confidence?: FunctionResponse['confidence']; source_notes?: string }>({});

  const reset = () => {
    setMatched(null);
    setMeta({});
    setError(null);
    setProgress(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    setProgress('Compressing image…');

    try {
      const compressed = await compressImage(file);
      setProgress('Asking Claude to read the photo…');

      const { data, error: fnErr } = await supabase.functions.invoke<FunctionResponse>(
        'transcribe-game-photo',
        { body: { imageBase64: compressed.base64, mediaType: compressed.mediaType } },
      );

      if (fnErr) throw new Error(fnErr.message ?? 'Function error');
      if (!data) throw new Error('No data returned.');

      const ms = (data.sessions ?? []).map((s) => matchSession(s, games, profiles));
      setMatched(ms);
      setMeta({ confidence: data.confidence, source_notes: data.source_notes });
      setProgress(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setProgress(null);
    }
    setBusy(false);
  };

  if (matched) {
    return (
      <ImportPreview
        source="photo"
        initial={matched}
        games={games}
        profiles={profiles}
        confidence={meta.confidence}
        sourceNotes={meta.source_notes}
        onCancel={reset}
        onImported={(count) => {
          reset();
          onImported(count);
        }}
      />
    );
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onFile}
      />
      <button
        type="button"
        className="btn-secondary"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
      >
        {busy ? '…' : '📷 From photo'}
      </button>
      {progress && (
        <p className="text-xs text-slate-500 italic">{progress}</p>
      )}
      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
          {error}
        </p>
      )}
    </div>
  );
}
