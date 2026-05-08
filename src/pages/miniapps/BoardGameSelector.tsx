import ComingSoon from '../../components/ComingSoon';

export default function BoardGameSelector() {
  return (
    <ComingSoon
      emoji="🎲"
      title="Board Game Picker"
      blurb="Pick a game from Mom's 100+ collection — random, filtered, or by mood."
      features={[
        'Add, edit, and tag games (player count, weight, time, owned vs. not).',
        'Pure-random pick from the whole shelf with one tap.',
        'Filtered pick: by player count, time available, complexity, tags.',
        '"Surprise but fair": each game weighted by how recently it was played.',
        '"Bracket / playoff" mode: rapid-fire elimination between picks.',
        'Mark a game as just-played to feed the records mini-app.',
      ]}
      notes="Schema: board_games table is ready."
    />
  );
}
