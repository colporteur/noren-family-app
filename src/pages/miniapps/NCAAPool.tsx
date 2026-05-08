import ComingSoon from '../../components/ComingSoon';

export default function NCAAPool() {
  return (
    <ComingSoon
      emoji="🏀"
      title="NCAA Tournament Pool"
      blurb="Live standings for the family's annual bracket pool."
      features={[
        'Dictators post each round\'s point totals (paste from spreadsheet OK).',
        'Every member sees the live standings ranked.',
        'Per-round breakdown and ranking history chart.',
        'End of tournament: winner and "loser" auto-feed the Virtual Plaque app.',
        'Multi-year history: who has the most rings?',
      ]}
      notes="Schema: ncaa_pool_standings already created."
    />
  );
}
