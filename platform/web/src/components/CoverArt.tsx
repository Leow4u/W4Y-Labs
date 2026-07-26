// Deterministic generative cover art in the Papel & Mata palette.
// Same seed -> same artwork (server-safe, no randomness). Four motifs
// (hills, arcs, grid, stems) x four palettes, picked by a seed hash —
// every blog post / page gets its own recognizable cover, like the
// per-post artwork on the Anthropic and Cursor blogs.

function hash(s: string): number {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

const PALETTES = [
  { bg: "#f1f1ea", a: "#3f5233", b: "#8a9b6e", c: "#dfe3d2" },
  { bg: "#29331f", a: "#8a9b6e", b: "#f4f1e6", c: "#3f5233" },
  { bg: "#f4f1e6", a: "#29331f", b: "#8a9b6e", c: "#e2ddc9" },
  { bg: "#eef1e5", a: "#3f5233", b: "#1a1c18", c: "#c9d2b4" },
];

export default function CoverArt({
  seed,
  className,
}: {
  seed: string;
  className?: string;
}) {
  const h = hash(seed);
  const motif = h % 4;
  const p = PALETTES[((h >>> 3) % 4)];
  const o = (n: number, span: number) => ((h >>> n) % span); // deterministic offset

  return (
    <svg
      viewBox="0 0 640 360"
      className={className}
      role="img"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid slice"
    >
      <rect width="640" height="360" fill={p.bg} />
      {motif === 0 && (
        // layered hills
        <>
          <path d={`M0 ${210 + o(4, 40)} C 140 ${150 + o(6, 60)}, 260 ${260 + o(8, 40)}, 640 ${170 + o(10, 60)} V 360 H 0 Z`} fill={p.c} />
          <path d={`M0 ${260 + o(5, 30)} C 180 ${200 + o(7, 50)}, 340 ${300 + o(9, 30)}, 640 ${230 + o(11, 50)} V 360 H 0 Z`} fill={p.b} />
          <path d={`M0 ${310 + o(6, 20)} C 220 ${260 + o(8, 40)}, 420 ${340 + o(10, 15)}, 640 ${290 + o(12, 40)} V 360 H 0 Z`} fill={p.a} />
          <circle cx={90 + o(13, 460)} cy={70 + o(14, 60)} r={26 + o(15, 14)} fill={p.a} />
        </>
      )}
      {motif === 1 && (
        // concentric arcs (sunrise)
        <>
          {[220, 175, 130, 85, 40].map((r, i) => (
            <circle
              key={r}
              cx={200 + o(5, 240)}
              cy={360}
              r={r}
              fill="none"
              stroke={i % 2 ? p.b : p.a}
              strokeWidth={i === 4 ? 80 : 14}
            />
          ))}
          <circle cx={520 + o(9, 80)} cy={70 + o(11, 50)} r={14} fill={p.a} />
        </>
      )}
      {motif === 2 && (
        // dot grid with a carved shape
        <>
          {Array.from({ length: 8 }, (_, r) =>
            Array.from({ length: 14 }, (_, c) => (
              <circle key={`${r}-${c}`} cx={40 + c * 44} cy={40 + r * 40} r={(r + c + o(4, 3)) % 4 === 0 ? 7 : 3.5} fill={(r + c) % 3 === 0 ? p.a : p.c} />
            )),
          )}
          <rect x={300 + o(7, 200)} y={80 + o(9, 80)} width={150} height={150} rx={75} fill={p.b} opacity="0.92" />
        </>
      )}
      {motif === 3 && (
        // stems and leaves
        <>
          {[0, 1, 2, 3].map((i) => {
            const x = 90 + i * 150 + o(4 + i, 40);
            const top = 60 + o(8 + i, 70);
            return (
              <g key={i}>
                <line x1={x} y1={360} x2={x} y2={top} stroke={p.a} strokeWidth="7" strokeLinecap="round" />
                <path d={`M${x} ${top + 40} q -46 -14 -52 -58 q 48 6 52 58`} fill={i % 2 ? p.b : p.a} />
                <path d={`M${x} ${top + 90} q 46 -14 52 -58 q -48 6 -52 58`} fill={i % 2 ? p.a : p.b} />
                <circle cx={x} cy={top} r={9} fill={p.b} />
              </g>
            );
          })}
        </>
      )}
    </svg>
  );
}
