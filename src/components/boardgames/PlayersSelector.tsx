import type { Profile } from '../../lib/types';
import { displayName } from '../../lib/types';

interface Props {
  profiles: Profile[];           // active (non-deceased) profiles
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

/**
 * A simple multi-select chip list of family members. Used to capture who
 * actually played a game when "Select Game" is clicked.
 */
export default function PlayersSelector({ profiles, selectedIds, onChange }: Props) {
  const selected = new Set(selectedIds);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  };

  if (profiles.length === 0) {
    return (
      <p className="text-sm text-slate-500 italic">
        No active family members on file.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
        Who's playing? ({selectedIds.length})
      </p>
      <div className="flex flex-wrap gap-2">
        {profiles.map((p) => {
          const isOn = selected.has(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => toggle(p.id)}
              className={`px-3 py-1.5 rounded-full border text-sm transition ${
                isOn
                  ? 'bg-primary-600 text-white border-primary-700'
                  : 'bg-white text-slate-700 border-slate-300 hover:border-primary-400'
              }`}
            >
              {isOn ? '✓ ' : ''}{displayName(p)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
