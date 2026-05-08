import ComingSoon from '../../components/ComingSoon';

export default function BoardGameRecords() {
  return (
    <ComingSoon
      emoji="📓"
      title="Game Record Book"
      blurb="Log scores from each game. See trends, rivalries, and reigning champions."
      features={[
        'Log a session: which game, who played, scores, placements, notes.',
        'Per-game leaderboards (highest score, win count, recent winner).',
        'Per-player stats: win rate, favorite games, biggest blowouts.',
        'Head-to-head records: pick two family members, see history.',
        'Optional photo attached to each session.',
      ]}
      notes="Schema: game_sessions and game_session_scores already created."
    />
  );
}
