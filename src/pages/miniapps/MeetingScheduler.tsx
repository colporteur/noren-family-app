import ComingSoon from '../../components/ComingSoon';

export default function MeetingScheduler() {
  return (
    <ComingSoon
      emoji="📅"
      title="Family Meeting Scheduler"
      blurb="Propose options, see what works for everyone."
      features={[
        'Propose a meeting: title, purpose, location, candidate times.',
        'Mode: ranked-choice (rank options 1-N).',
        'Mode: available/unavailable (just check the slots that work).',
        'Mode: simple voting (one tap, most votes wins).',
        'Live "who hasn\'t responded yet?" panel for the proposer.',
        'Auto-close when all members have responded, or by a deadline.',
      ]}
      notes="Schema: meeting_proposals, meeting_responses already created."
    />
  );
}
