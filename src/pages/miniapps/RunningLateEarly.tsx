import ComingSoon from '../../components/ComingSoon';

export default function RunningLateEarly() {
  return (
    <ComingSoon
      emoji="⏱️"
      title="I'm Running Late / Early"
      blurb="One tap to let everyone know your ETA — gracefully."
      features={[
        'Pick: late, early, or on-time.',
        'Pick a duration: 5, 10, 15, 30, 60+ minutes.',
        'Optional event tag ("Sunday dinner") and a free-text note.',
        'Posts to a family feed visible to everyone signed in.',
        'Optional push notifications via the browser PWA badge.',
        '"My latest ETA" sticky card so you can update it as plans change.',
      ]}
      notes="Schema: late_pings already created."
    />
  );
}
