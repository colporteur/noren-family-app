import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../../lib/supabase';
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

interface SheetForApi {
  name: string;
  cells: (string | number | null)[][];
}

export default function ExcelImport({ games, profiles, onImported }: Props) {
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
    setProgress('Reading spreadsheet…');

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: true });

      const sheets: SheetForApi[] = wb.SheetNames.map((name) => {
        const ws = wb.Sheets[name];
        // Convert to 2D array. Empty cells become empty strings; we map to null below.
        const cells = XLSX.utils.sheet_to_json<(string | number | Date | null)[]>(ws, {
          header: 1,
          defval: null,
          raw: false,    // Preserve formatted dates as strings
          blankrows: false,
        }) as (string | number | Date | null)[][];

        // Coerce Date instances to ISO date strings for transport.
        const normalized: (string | number | null)[][] = cells.map((row) =>
          row.map((cell) => {
            if (cell == null) return null;
            if (cell instanceof Date) return cell.toISOString().slice(0, 10);
            return cell as string | number;
          }),
        );
        return { name, cells: normalized };
      }).filter((s) => s.cells.length > 0);

      if (sheets.length === 0) {
        throw new Error('No data found in any sheet.');
      }

      setProgress(`Asking Claude to parse ${sheets.length} sheet${sheets.length === 1 ? '' : 's'}…`);

      const { data, error: fnErr } = await supabase.functions.invoke<FunctionResponse>(
        'parse-game-spreadsheet',
        { body: { sheets } },
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
        source="excel"
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
        accept=".xlsx,.xls,.xlsm,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        className="hidden"
        onChange={onFile}
      />
      <button
        type="button"
        className="btn-secondary"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        title="Upload Mom's old spreadsheets — Claude takes a best guess at the format"
      >
        {busy ? '…' : '📊 From Excel'}
        <span className="text-[10px] uppercase tracking-wide bg-warm-100 text-warm-600 px-1.5 py-0.5 rounded ml-2">
          Experimental
        </span>
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
