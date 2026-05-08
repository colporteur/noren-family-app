import ComingSoon from '../../components/ComingSoon';

export default function CentralLocation() {
  return (
    <ComingSoon
      emoji="📍"
      title="Central Location Estimator"
      blurb="Where should we meet? Submit cities, get back a fair midpoint."
      features={[
        'Each family member enters their city (or pulled from their profile).',
        'Server calls Claude API to suggest the most central US city/airport.',
        'Returns a recommended city + reasoning + nearby alt options.',
        'API key lives in a Supabase Edge Function (never on the client).',
        'Save past recommendations for re-use ("we tried Cleveland in 2027").',
      ]}
      notes="Implementation note: Supabase Edge Function `central-location` calls Anthropic with the api key from `supabase secrets`. Frontend calls the function via supabase.functions.invoke()."
    />
  );
}
