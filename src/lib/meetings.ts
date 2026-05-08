// Pure logic + types for the Meeting Scheduler.
// No React, no Supabase — easy to reason about and unit-test.

export type MeetingMode = 'available' | 'voting' | 'ranked';
export type AvailabilityResponse = 'yes' | 'no' | 'maybe';

export interface MeetingProposal {
  id: string;
  title: string;
  purpose: string | null;
  mode: MeetingMode;
  created_by: string | null;
  closes_at: string | null;
  is_open: boolean;
  created_at: string;
}

export interface MeetingOption {
  id: string;
  proposal_id: string;
  starts_at: string | null;
  location: string | null;
  label: string | null;
  sort_order: number;
  created_at: string;
}

export interface MeetingResponse {
  id: string;
  option_id: string;
  profile_id: string;
  response: AvailabilityResponse | null;
  rank: number | null;
  note: string | null;
  created_at: string;
}

export interface OptionTally {
  option_id: string;
  yes: number;
  maybe: number;
  no: number;
  votes: number;       // for voting mode (= total responses)
  borda: number;       // for ranked mode
  voter_count: number; // distinct voters who responded to this option
  is_winner: boolean;
}

/* ---------------- Mode helpers ---------------- */

export function modeLabel(mode: MeetingMode): string {
  switch (mode) {
    case 'available':
      return 'Availability';
    case 'voting':
      return 'Voting';
    case 'ranked':
      return 'Ranked';
  }
}

export function modeBlurb(mode: MeetingMode): string {
  switch (mode) {
    case 'available':
      return 'Yes / Maybe / No on each option';
    case 'voting':
      return 'Pick the option(s) you want';
    case 'ranked':
      return 'Order them by preference';
  }
}

export function isOpenNow(p: MeetingProposal, now: Date = new Date()): boolean {
  if (!p.is_open) return false;
  if (!p.closes_at) return true;
  return new Date(p.closes_at) > now;
}

/* ---------------- Tallying ---------------- */

export function tally(
  proposal: MeetingProposal,
  options: MeetingOption[],
  responses: MeetingResponse[],
): OptionTally[] {
  const N = options.length;

  const sorted = [...options].sort((a, b) => a.sort_order - b.sort_order);
  const tallies: OptionTally[] = sorted.map((o) => {
    const myResponses = responses.filter((r) => r.option_id === o.id);
    let yes = 0,
      maybe = 0,
      no = 0,
      borda = 0;
    let rankedCount = 0;
    for (const r of myResponses) {
      if (r.response === 'yes') yes++;
      else if (r.response === 'maybe') maybe++;
      else if (r.response === 'no') no++;
      if (r.rank != null && r.rank > 0) {
        borda += Math.max(0, N - r.rank + 1);
        rankedCount++;
      }
    }
    return {
      option_id: o.id,
      yes,
      maybe,
      no,
      votes: myResponses.length,
      borda,
      voter_count: myResponses.length,
      is_winner: false,
    };
  });

  // Determine winner(s) per mode
  let topScore = 0;
  let getScore: (t: OptionTally) => number;
  if (proposal.mode === 'available') {
    getScore = (t) => t.yes - t.no * 0.5 + t.maybe * 0.25;
  } else if (proposal.mode === 'voting') {
    getScore = (t) => t.votes;
  } else {
    getScore = (t) => t.borda;
  }
  for (const t of tallies) {
    const s = getScore(t);
    if (s > topScore) topScore = s;
  }
  if (topScore > 0) {
    for (const t of tallies) {
      if (getScore(t) === topScore) t.is_winner = true;
    }
  }
  return tallies;
}

/* ---------------- Who hasn't responded ---------------- */

/**
 * Returns the profile IDs of family members who haven't responded to any
 * option in this proposal yet. (For the "still waiting on" panel.)
 */
export function notRespondedYet(
  options: MeetingOption[],
  responses: MeetingResponse[],
  activeProfileIds: string[],
): string[] {
  const optIds = new Set(options.map((o) => o.id));
  const responded = new Set<string>();
  for (const r of responses) {
    if (optIds.has(r.option_id)) responded.add(r.profile_id);
  }
  return activeProfileIds.filter((p) => !responded.has(p));
}

/* ---------------- Display helpers ---------------- */

export function describeOption(o: MeetingOption): string {
  if (o.label && o.label.trim()) return o.label.trim();
  if (o.starts_at) {
    const d = new Date(o.starts_at);
    const dateStr = d.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    const timeStr = d.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
    return `${dateStr} ${timeStr}`;
  }
  return '(unspecified)';
}
