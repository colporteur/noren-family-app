import { FormEvent, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export default function ProfilePage() {
  const { profile, refreshProfile } = useAuth();
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    nickname: '',
    phone: '',
    birthday: '',
    location: '',
    bio: '',
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setForm({
      first_name: profile.first_name ?? '',
      last_name: profile.last_name ?? '',
      nickname: profile.nickname ?? '',
      phone: profile.phone ?? '',
      birthday: profile.birthday ?? '',
      location: profile.location ?? '',
      bio: profile.bio ?? '',
    });
  }, [profile]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setBusy(true);
    setMsg(null);
    setErr(null);
    const { error } = await supabase
      .from('profiles')
      .update({
        first_name: form.first_name || null,
        last_name: form.last_name || null,
        nickname: form.nickname || null,
        phone: form.phone || null,
        birthday: form.birthday || null,
        location: form.location || null,
        bio: form.bio || null,
      })
      .eq('id', profile.id);
    setBusy(false);
    if (error) setErr(error.message);
    else {
      setMsg('Saved.');
      refreshProfile();
    }
  };

  if (!profile) return <p>Loading your profile…</p>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="font-display text-3xl text-primary-900">Your profile</h1>
      <p className="text-slate-600">
        Signed in as <strong>{profile.email}</strong>
      </p>
      <form onSubmit={onSubmit} className="card grid gap-4 sm:grid-cols-2">
        <Field
          label="First name"
          value={form.first_name}
          onChange={(v) => setForm({ ...form, first_name: v })}
        />
        <Field
          label="Last name"
          value={form.last_name}
          onChange={(v) => setForm({ ...form, last_name: v })}
        />
        <Field
          label="Nickname"
          value={form.nickname}
          onChange={(v) => setForm({ ...form, nickname: v })}
        />
        <Field
          label="Phone"
          value={form.phone}
          onChange={(v) => setForm({ ...form, phone: v })}
        />
        <Field
          label="Birthday"
          type="date"
          value={form.birthday}
          onChange={(v) => setForm({ ...form, birthday: v })}
        />
        <Field
          label="Location (city / state)"
          value={form.location}
          onChange={(v) => setForm({ ...form, location: v })}
        />
        <div className="sm:col-span-2">
          <label className="label">A little about you</label>
          <textarea
            className="input min-h-[80px]"
            value={form.bio}
            onChange={(e) => setForm({ ...form, bio: e.target.value })}
          />
        </div>
        <div className="sm:col-span-2 flex items-center gap-3">
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
          {msg && <span className="text-sm text-emerald-700">{msg}</span>}
          {err && <span className="text-sm text-red-700">{err}</span>}
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        className="input"
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
