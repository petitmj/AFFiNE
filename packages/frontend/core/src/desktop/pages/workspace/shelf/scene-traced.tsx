import type { Tones } from './scene-room';
import { TRACE, TRACE_SCALE, type TraceRegion } from './scene-trace';

/** a tone name is looked up in the palette; anything else is a literal colour */
const paint = (t: Tones, tone: string): string =>
  tone.startsWith('#') ? tone : (t as unknown as Record<string, string>)[tone];

const SEAM = 1.6; // in trace units (1/3 scene unit): hides hairlines between shapes

function Region({ t, r }: { t: Tones; r: TraceRegion }) {
  const [x, y, w, h] = r.box;
  const k = TRACE_SCALE;
  return (
    <g transform={`scale(${1 / k})`}>
      {r.base ? (
        <rect
          x={x * k}
          y={y * k}
          width={w * k}
          height={h * k}
          fill={paint(t, r.base)}
        />
      ) : null}
      {r.layers.map((l, i) => {
        const c = paint(t, l.tone);
        return (
          <path
            key={i}
            d={l.d}
            fill={c}
            fillRule="evenodd"
            stroke={c}
            strokeWidth={SEAM}
            strokeLinejoin="round"
          />
        );
      })}
    </g>
  );
}

/** the traced regions named in `ids`, in the order given */
export function Traced({ t, ids }: { t: Tones; ids: readonly string[] }) {
  return (
    <g>
      {ids.map(id => {
        const r = TRACE.find(region => region.id === id);
        return r ? <Region key={id} t={t} r={r} /> : null;
      })}
    </g>
  );
}
