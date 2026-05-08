import ComingSoon from '../../components/ComingSoon';

export default function NewYearsPredictions() {
  return (
    <ComingSoon
      emoji="🎆"
      title="New Year's Eve Predictions"
      blurb="Submit a question on NYE, predict the future, score points next year."
      features={[
        'Each NYE, every family member submits one question for the group.',
        'Everyone makes a prediction for every question (private until reveal).',
        'On the next NYE, questions are opened and answers revealed.',
        'One point per correct prediction; running scoreboard by year.',
        "All-time leaderboard with multi-year totals and per-member trend chart.",
        "Mom and Dad can lock the question pool, reveal answers, and edit scoring.",
      ]}
      notes="Data tables already created in the schema: nye_questions, nye_predictions."
    />
  );
}
