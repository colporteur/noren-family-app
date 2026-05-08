import ComingSoon from '../../components/ComingSoon';

export default function VotingPortal() {
  return (
    <ComingSoon
      emoji="🗳️"
      title="Voting Portal"
      blurb="Dictators seed options. Family members vote. Power to the people."
      features={[
        'Dictators create polls with title, description, and options.',
        'Modes: single-choice, multi-select, ranked-choice.',
        'Optional close date and "results private until close".',
        'Live tally view (or hidden until close, dictator\'s choice).',
        'Audit trail: who voted, when (visible to dictators).',
      ]}
      notes="Schema: votes_polls, votes_options, votes_ballots already created."
    />
  );
}
