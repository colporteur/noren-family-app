import type { FamilyRole } from '../lib/types';
import { roleLabel } from '../lib/types';

const styles: Record<FamilyRole, string> = {
  dictator: 'bg-primary-700 text-white',
  family: 'bg-primary-100 text-primary-800',
  guest: 'bg-warm-100 text-warm-600 border border-warm-500/40',
};

export default function RoleBadge({
  role,
  isDeceased = false,
  className = '',
}: {
  role: FamilyRole;
  isDeceased?: boolean;
  className?: string;
}) {
  if (isDeceased) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-200 text-slate-600 ${className}`}
      >
        <span aria-hidden>✦</span> In Memoriam
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${styles[role]} ${className}`}
    >
      {roleLabel(role)}
    </span>
  );
}
