import { FormEvent, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Profile } from '../../lib/types';
import { displayName } from '../../lib/types';

interface Props {
  profiles: Profile[];
  onCreated: () => void;
  onCancel: () => void;
}

export default function CustomPlaqueForm({ profiles, onCreated, onCancel }: Props) {
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [profileId, setProfileId] = useState<string>('');
  const [recipientFreetext, setRecipientFreetext] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);

    if (!title.trim()) {
      setError('Title is required.');
      setBusy(false);
      return;
    }
    if (!profileId && !recipientFreetext.trim()) {
      setError('Pick a family member or type a recipient name.');
      setBusy(false);
      return;
    }

    // For custom plaques, we use `subtitle` for the freetext recipient when no
    // family profile is picked — keeps the schema lean.
    const finalSubtitle =
      profileId
        ? subtitle.trim() || null
        : (recipientFreetext.trim() || subtitle.trim() || null);

    const { error: insErr } = await supabase.from('plaques').insert({
      plaque_type: 'custom',
      year,
      profile_id: profileId || null,
      title: title.trim(),
      subtitle: finalSubtitle,
      photo_url: photoUrl.trim() || null,
    });

    setBusy(false);
    if (insErr) {
      setError(insErr.message);
      return;
    }
    onCreated();
  };

  return (
    <form onSubmit={submit} className="card space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-xl text-primary-900">Add a custom plaque</h3>
        <button type="button" onClick={onCancel} className="text-sm text-slate-500 hover:underline">
          Cancel
        </button>
      </div>

      <div>
        <label className="label">Title</label>
        <input
          type="text"
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder='e.g. "Christmas Pie Baking Champion"'
          autoFocus
          required
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Year</label>
          <input
            type="number"
            min={1900}
            max={3000}
            className="input"
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value, 10) || new Date().getFullYear())}
          />
        </div>
        <div>
          <label className="label">Recipient (family)</label>
          <select
            className="input"
            value={profileId}
            onChange={(e) => setProfileId(e.target.value)}
          >
            <option value="">— or freetext below —</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {displayName(p)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!profileId && (
        <div>
          <label className="label">Or recipient (freetext)</label>
          <input
            type="text"
            className="input"
            value={recipientFreetext}
            onChange={(e) => setRecipientFreetext(e.target.value)}
            placeholder='e.g. "Aunt Linda" or "The whole family"'
          />
        </div>
      )}

      <div>
        <label className="label">Subtitle (optional)</label>
        <input
          type="text"
          className="input"
          value={subtitle}
          onChange={(e) => setSubtitle(e.target.value)}
          placeholder="Extra context"
        />
      </div>

      <div>
        <label className="label">Photo URL (optional)</label>
        <input
          type="url"
          className="input"
          value={photoUrl}
          onChange={(e) => setPhotoUrl(e.target.value)}
          placeholder="https://..."
        />
        <p className="text-[11px] text-slate-500 mt-1">
          For now, paste a link to a photo hosted elsewhere (Drive, Imgur, etc.). File upload comes later.
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
          {busy ? 'Saving…' : '🏆 Hang on the wall'}
        </button>
      </div>
    </form>
  );
}
