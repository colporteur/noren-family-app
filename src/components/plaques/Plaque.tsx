import type { DisplayPlaque } from '../../lib/plaques';
import { plaqueIsLoser, plaqueIsWinner } from '../../lib/plaques';

interface Props {
  plaque: DisplayPlaque;
  onDelete?: () => void;     // shown only for custom + dictator
}

/**
 * Visual treatment is brass for winners, weathered dark wood for losers,
 * and amber-gold for custom plaques. Built with Tailwind gradients +
 * inset shadows to evoke an engraved wall plaque.
 */
export default function Plaque({ plaque, onDelete }: Props) {
  const isWinner = plaqueIsWinner(plaque.plaque_type);
  const isLoser = plaqueIsLoser(plaque.plaque_type);

  const style = isWinner
    ? // Brass / gold
      'bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-600 text-amber-950 border-amber-700 shadow-[inset_0_2px_4px_rgba(255,255,255,0.4),inset_0_-2px_6px_rgba(0,0,0,0.3),0_4px_12px_rgba(120,53,15,0.3)]'
    : isLoser
      ? // Weathered dark wood
        'bg-gradient-to-br from-stone-800 via-stone-700 to-stone-900 text-amber-100 border-stone-900 shadow-[inset_0_2px_4px_rgba(255,255,255,0.05),inset_0_-2px_6px_rgba(0,0,0,0.6),0_4px_12px_rgba(28,25,23,0.5)]'
      : // Custom — warm amber
        'bg-gradient-to-br from-amber-100 via-amber-200 to-amber-400 text-amber-900 border-amber-600 shadow-[inset_0_2px_4px_rgba(255,255,255,0.5),inset_0_-2px_6px_rgba(120,53,15,0.2),0_4px_12px_rgba(120,53,15,0.2)]';

  const accent = isWinner
    ? 'border-amber-800/40 text-amber-900/80'
    : isLoser
      ? 'border-amber-200/20 text-amber-200/70'
      : 'border-amber-700/30 text-amber-700/80';

  const titlePrefix = isWinner ? '🏆' : isLoser ? '🪦' : '✨';

  return (
    <article
      className={`relative rounded-md border-4 px-4 py-3 ${style} font-display`}
      style={{
        // Slight rotation for hand-on-wall vibes
        // (kept subtle so reading is easy)
      }}
    >
      <div className={`text-[10px] uppercase tracking-widest pb-1 mb-2 border-b ${accent}`}>
        {titlePrefix} {plaque.title}
      </div>
      <div className="text-2xl leading-tight font-bold tracking-tight text-center mb-1">
        {plaque.recipient_name}
      </div>
      {plaque.details && (
        <div className={`text-xs text-center italic ${accent}`}>{plaque.details}</div>
      )}
      <div className={`text-[11px] uppercase tracking-widest text-center mt-2 pt-2 border-t ${accent}`}>
        {plaque.subtitle ?? `Season of ${plaque.year}`}
      </div>
      {plaque.photo_url && (
        <img
          src={plaque.photo_url}
          alt=""
          className="w-full h-32 object-cover rounded mt-3 border border-current/10"
        />
      )}
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="absolute top-1 right-1 text-[10px] px-1.5 py-0.5 rounded bg-white/40 hover:bg-white/80 text-current"
          title="Remove this custom plaque"
        >
          ✕
        </button>
      )}
    </article>
  );
}
