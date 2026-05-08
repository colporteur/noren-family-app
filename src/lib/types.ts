// Shared TypeScript types for the Noren Family App.

export type FamilyRole = 'dictator' | 'family' | 'guest';

export interface Profile {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  role: FamilyRole;
  is_deceased: boolean;
  deceased_on: string | null;
  guest_expires_at: string | null;
  phone: string | null;
  birthday: string | null;
  location: string | null;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
  updated_at: string;
}

/** Display label for a role — Dictators get the prominent treatment. */
export const roleLabel = (role: FamilyRole): string => {
  switch (role) {
    case 'dictator':
      return 'Dictator';
    case 'family':
      return 'Family Member';
    case 'guest':
      return 'Guest';
  }
};

/** Pretty name for a profile, falling back gracefully. */
export const displayName = (p: Pick<Profile, 'first_name' | 'last_name' | 'nickname' | 'email'>): string => {
  if (p.nickname && p.nickname.trim()) return p.nickname.trim();
  const full = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
  if (full) return full;
  return p.email;
};
