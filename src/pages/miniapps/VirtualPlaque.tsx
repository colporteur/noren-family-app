import ComingSoon from '../../components/ComingSoon';

export default function VirtualPlaque() {
  return (
    <ComingSoon
      emoji="🏆"
      title="Virtual Plaques"
      blurb="A digital version of Mom's wall — winners and losers, immortalized."
      features={[
        'Wall-of-plaques view styled like a hallway: brass for winners, wood for losers.',
        'Plaque types: NCAA Winner, NCAA Loser, NYE Winner, NYE Loser, plus custom.',
        'Auto-populates from the NCAA Pool and NYE Predictions apps.',
        'Each plaque tappable for a full-page detail view (year, photo, story).',
        'Filter by type, year, or family member.',
      ]}
      notes="Schema: plaques table already created."
    />
  );
}
