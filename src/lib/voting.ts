// Pure logic + types for the Voting Portal.
// No React, no Supabase — easy to reason about and unit-test.

export type PollMode = 'single' | 'multi' | 'ranked';

export interface Poll {
  id: string;
  title: string;
  description: string | null;
  mode: PollMode;
  created_by: string | null;
  closes_at: string | null;
  is_open: boolean;
  hide_results_until_close: boolean;
  created_at: string;
}

export interface PollOption {
  id: string;
  poll_id: string;
  label: string;
  sort_order: number;
}

export interface Ballot {
  id: string;
  poll_id: string;
  option_id: string;
  voter_id: string;
  rank: number | null;
  created_at: string;
}

export interface OptionResult {
  option_id: string;
  label: string;
  /** For single/multi: voter count. For ranked: Borda score. */
  score: number;
  /** Distinct voters who included this option. */
  voter_count: number;
  /** Average rank among voters who ranked it (ranked mode only). */
  avg_rank: number | null;
  /** True if this option is currently a winner (top score; multiple if tied). */
  is_winner: boolean;
}

/* ---------------- Tallying ---------------- */

export function tallyPoll(
  poll: Poll,
  options: PollOption[],
  ballots: Ballot[],
): OptionResult[] {
  const N = options.length;
  const sorted = [...options].sort((a, b) => a.sort_order - b.sort_order);

  const results: OptionResult[] = sorted.map((o) => {
    const myBallots = ballots.filter((b) => b.option_id === o.id);

    if (poll.mode === 'ranked') {
      // Borda count: rank 1 = N points, rank 2 = N-1, etc.
      let scoreSum = 0;
      let rankSum = 0;
      let rankCount = 0;
      for (const b of myBallots) {
        if (b.rank == null) continue;
        scoreSum += Math.max(0, N - b.rank + 1);
        rankSum += b.rank;
        rankCount++;
      }
      return {
        option_id: o.id,
        label: o.label,
        score: scoreSum,
        voter_count: myBallots.length,
        avg_rank: rankCount > 0 ? rankSum / rankCount : null,
        is_winner: false,
      };
    }

    // single / multi
    return {
      option_id: o.id,
      label: o.label,
      score: myBallots.length,
      voter_count: myBallots.length,
      avg_rank: null,
      is_winner: false,
    };
  });

  // Sort by score desc, mark winner(s)
  results.sort((a, b) => b.score - a.score);
  const top = results[0]?.score ?? 0;
  for (const r of results) {
    if (r.score > 0 && r.score === top) r.is_winner = true;
  }
  return results;
}

/* ---------------- Helpers ---------------- */

export function isOpenNow(poll: Poll, now: Date = new Date()): boolean {
  if (!poll.is_open) return false;
  if (!poll.closes_at) return true;
  return new Date(poll.closes_at) > now;
}

export function modeLabel(mode: PollMode): string {
  switch (mode) {
    case 'single':
      return 'Single choice';
    case 'multi':
      return 'Multi-select';
    case 'ranked':
      return 'Ranked choice';
  }
}

export function distinctVoterCount(ballots: Ballot[]): number {
  const set = new Set<string>();
  for (const b of ballots) set.add(b.voter_id);
  return set.size;
}
