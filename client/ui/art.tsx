import React from 'react'

// ---------------------------------------------------------------------------
// Kingdom crests — small royal seals drawn in a 24×24 box.
// Only four kingdoms exist per table (k0–k3), but all eight named realms map
// to a crest so the seat colour always has an emblem.
// ---------------------------------------------------------------------------

export type CrestId = 'trident' | 'lotus' | 'elephant' | 'horse' | 'bull' | 'sun' | 'bow' | 'chakra'

const CREST_BY_KINGDOM: Record<string, CrestId> = {
  Kashi: 'trident',
  Kosala: 'lotus',
  Magadha: 'elephant',
  Avanti: 'horse',
  Vatsa: 'bull',
  Shurasena: 'sun',
  Panchala: 'bow',
  Kuru: 'chakra',
}

/** k0..k3 get four distinct emblems; named kingdoms keep their traditional crest. */
const CREST_BY_SLOT: CrestId[] = ['trident', 'lotus', 'elephant', 'horse', 'bull', 'sun', 'bow', 'chakra']

export function crestForKingdom(seed: string): CrestId {
  const slot = /^k(\d)$/.exec(seed)
  if (slot) return CREST_BY_SLOT[Number(slot[1]) % CREST_BY_SLOT.length]
  return CREST_BY_KINGDOM[seed] ?? 'chakra'
}

const STROKE = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

const CREST_ART: Record<CrestId, React.ReactNode> = {
  trident: (
    <>
      <path {...STROKE} d="M12 7v14" />
      <path {...STROKE} d="M7 3v5c0 2.6 2 4.2 5 4.2s5-1.6 5-4.2V3" />
      <path {...STROKE} d="M7 3 5 5M17 3l2 2M12 3v4" />
    </>
  ),
  lotus: (
    <>
      {/* side petals open the bloom outwards */}
      <path
        {...STROKE}
        fill="currentColor"
        fillOpacity={0.12}
        d="M12 16.4C8.2 16.8 5 15 4 11.8c3-.8 6 .6 8 3"
      />
      <path
        {...STROKE}
        fill="currentColor"
        fillOpacity={0.12}
        d="M12 16.4c3.8.4 7-1.4 8-4.6-3-.8-6 .6-8 3"
      />
      {/* upper outer petals */}
      <path
        {...STROKE}
        fill="currentColor"
        fillOpacity={0.14}
        d="M12 16.2C8.6 14.6 6.8 11.4 7.4 7.8c2.8 1.2 4.2 3.8 4.6 6.6"
      />
      <path
        {...STROKE}
        fill="currentColor"
        fillOpacity={0.14}
        d="M12 16.2c3.4-1.6 5.2-4.8 4.6-8.4-2.8 1.2-4.2 3.8-4.6 6.6"
      />
      {/* inner petals and bud */}
      <path
        {...STROKE}
        fill="currentColor"
        fillOpacity={0.18}
        d="M12 15.8c-2-2-2.6-4.8-1.6-7.4 1.2 1.8 1.6 4 1.6 6.2"
      />
      <path
        {...STROKE}
        fill="currentColor"
        fillOpacity={0.18}
        d="M12 15.8c2-2 2.6-4.8 1.6-7.4-1.2 1.8-1.6 4-1.6 6.2"
      />
      <path
        {...STROKE}
        fill="currentColor"
        fillOpacity={0.3}
        d="M12 15.6c-1-2.2-.8-4.6 0-6.8.8 2.2 1 4.6 0 6.8Z"
      />
      <ellipse cx="12" cy="13.9" rx="1.9" ry="1.2" fill="currentColor" />
      <path {...STROKE} d="M12 15.2v.8M10.3 14.6l-.6.6M13.7 14.6l.6.6" strokeWidth={0.8} />
      <path {...STROKE} d="M12 16.4v2.1" strokeWidth={1.2} />
      <path {...STROKE} d="M4.6 20.5c4.8-1.8 9.8-1.8 14.8 0" strokeWidth={1.1} />
    </>
  ),
  elephant: (
    <>
      {/* fan ears; the inner folds keep them from reading as petals */}
      <path
        {...STROKE}
        fill="currentColor"
        fillOpacity={0.18}
        d="M8.8 7.6C5.2 6.7 3.7 9.2 4.2 12.4c.4 2.9 2 4.5 4.6 4.1 1.1-.2 1.9-1 2.2-2.1"
      />
      <path
        {...STROKE}
        fill="currentColor"
        fillOpacity={0.18}
        d="M15.2 7.6c3.6-.9 5.1 1.6 4.6 4.8-.4 2.9-2 4.5-4.6 4.1-1.1-.2-1.9-1-2.2-2.1"
      />
      <path {...STROKE} d="M7.8 9.8c-1.4-.2-2.2.8-2 2.1M16.2 9.8c1.4-.2 2.2.8 2 2.1" strokeWidth={1.1} />
      {/* domed forehead */}
      <path
        {...STROKE}
        fill="currentColor"
        fillOpacity={0.14}
        d="M8.8 7.2C8.8 4.9 10.1 3.3 12 3.3s3.2 1.6 3.2 3.9v3.5c0 2.1-1.3 3.5-3.2 3.5s-3.2-1.4-3.2-3.5V7.2Z"
      />
      <path {...STROKE} d="M9.8 5.1c.8-.7 2.2-.7 3 0" strokeWidth={1} />
      {/* trunk curls to one side like a living elephant, not a straight line */}
      <path
        {...STROKE}
        d="M11.6 13.8c.4 2.4 1.4 4.2 3 5.2 1.2.8 2.4.4 2.8-.8.3-1-.2-1.8-1.2-2.2"
        strokeWidth={2}
      />
      <path {...STROKE} d="M12.6 15.3c.2 1.6.9 2.9 2 3.6" strokeWidth={1} />
      {/* tusks */}
      <path {...STROKE} d="M10.2 14.2c-1 1.9-.8 3.6.4 4.6M13.8 14.2c1 1.9.8 3.6-.4 4.6" strokeWidth={1.9} />
      <circle cx="10.4" cy="8.2" r="0.65" fill="currentColor" />
      <circle cx="13.6" cy="8.2" r="0.65" fill="currentColor" />
    </>
  ),
  horse: (
    <>
      {/* mane flows down the back of the neck */}
      <path
        fill="currentColor"
        opacity={0.24}
        d="M10.8 8.2c2.4-.4 4.2 1.2 5 3.6l1 6.2 1.6 2-2.4.4-1.2-6.4c-.8-2.8-2.2-4.8-4-5.8Z"
      />
      <path {...STROKE} d="M12.4 9.4c1.6.8 2.6 2.4 3 4.6M13.6 9.8c1.4 1 2.2 2.8 2.4 4.8" strokeWidth={1} />
      <path
        {...STROKE}
        fill="currentColor"
        fillOpacity={0.08}
        d="M5.2 14.4c-.4-1.6.2-3 1.4-3.8L7.2 7.4c.2-.8 1-1 1.4-.2l1 1.6 1.2-.6c2.8-.4 4.8 1.6 5.6 4.4l1.6 7.2-3.4.4-1.4-5.4c-1.2-.6-2.2-1.6-3-2.8L9.4 14.6l.2 2.2H6.4c-.6-.6-1-1.4-1.2-2.4Z"
      />
      {/* two ears and a forelock */}
      <path {...STROKE} d="M7.2 7.4C7 6 7.6 5.2 8.6 5.4l1 3.4" strokeWidth={1.3} />
      <path {...STROKE} d="M9.6 8.8c.2-1.6 1-2.4 2-2l.4 3" strokeWidth={1.2} />
      <path {...STROKE} d="M9.8 6.2c.4-.8 1-.8 1.4 0" strokeWidth={1} />
      {/* muzzle, eye, nostril */}
      <path {...STROKE} d="M5.4 14.4c.8.6 1.8.8 2.8.4" strokeWidth={1.2} />
      <circle cx="9" cy="10.4" r="0.65" fill="currentColor" />
      <circle cx="6.2" cy="14" r="0.5" fill="currentColor" />
    </>
  ),
  bull: (
    <>
      {/* zebu hump and sweeping horns */}
      <path {...STROKE} d="M6.8 8.2C7 4.6 9.2 2.4 12 2.4s5 2.2 5.2 5.8" strokeWidth={1.4} />
      <path
        {...STROKE}
        fill="currentColor"
        fillOpacity={0.14}
        d="M8.4 7.2C5.8 6.9 3.6 5.5 2.4 3.1c2.6.1 4.8 1.2 6.4 3.2"
      />
      <path
        {...STROKE}
        fill="currentColor"
        fillOpacity={0.14}
        d="M15.6 7.2c2.6-.3 4.8-1.7 6-4.1-2.6.1-4.8 1.2-6.4 3.2"
      />
      {/* head and ears */}
      <path
        {...STROKE}
        fill="currentColor"
        fillOpacity={0.08}
        d="M8.2 8.8c0-2 1.4-3.4 3.8-3.4s3.8 1.4 3.8 3.4v3.6c0 2.6-1.6 4.4-3.8 4.4s-3.8-1.8-3.8-4.4V8.8Z"
      />
      <path {...STROKE} d="M8.2 9.6c-1.8 0-3 1-3 2.4 0 1 .8 1.6 2 1.4" />
      <path {...STROKE} d="M15.8 9.6c1.8 0 3 1 3 2.4 0 1-.8 1.6-2 1.4" />
      {/* broad muzzle */}
      <ellipse cx="12" cy="14.8" rx="2.9" ry="1.6" fill="currentColor" opacity={0.2} />
      <path {...STROKE} d="M9.4 14.2c1.2.6 4 .6 5.2 0" strokeWidth={1.1} />
      <circle cx="10.9" cy="14.8" r="0.45" fill="currentColor" />
      <circle cx="13.1" cy="14.8" r="0.45" fill="currentColor" />
      <circle cx="10" cy="8.6" r="0.6" fill="currentColor" />
      <circle cx="14" cy="8.6" r="0.6" fill="currentColor" />
      <path {...STROKE} d="M9.2 16.6c-.8 1.2-1 2.6-.4 3.8M14.8 16.6c.8 1.2 1 2.6.4 3.8" strokeWidth={1} />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4.2" fill="currentColor" />
      <circle cx="12" cy="12" r="7.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
      {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((d) => (
        <path key={d} transform={`rotate(${d} 12 12)`} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" d="M12 1.6v2.6" />
      ))}
    </>
  ),
  bow: (
    <>
      {/* recurve stave with tip curls */}
      <path {...STROKE} d="M9.2 3.2c-1-.6-2.1 0-1.8 1.2" strokeWidth={1.4} />
      <path {...STROKE} d="M7.4 4.4C4.6 6.2 3.2 9 3.2 12s1.4 5.8 4.2 7.6" />
      <path {...STROKE} d="M7.4 19.6c-.3 1.2.8 1.8 1.8 1.2" strokeWidth={1.4} />
      {/* string, nock and arrow */}
      <path {...STROKE} d="M7.4 4.4 9.4 12 7.4 19.6" strokeWidth={1} />
      <path {...STROKE} d="M9.4 12H21M18.4 9.6 21 12l-2.6 2.4M9.4 12l-1.6-1.4M9.4 12l-1.6 1.4" strokeWidth={1.35} />
      <path {...STROKE} d="M3.2 10.4v3.2" strokeWidth={1.2} />
    </>
  ),
  chakra: (
    <>
      <circle cx="12" cy="12" r="8.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="2.2" fill="currentColor" />
      {[0, 45, 90, 135].map((d) => (
        <path key={d} transform={`rotate(${d} 12 12)`} stroke="currentColor" strokeWidth="1.4" d="M12 3.4v17.2" />
      ))}
    </>
  ),
}

export function KingdomCrest(props: { seed: string; label?: string; size?: number; color?: string; className?: string }) {
  const { seed, label = seed, size = 18, color = 'currentColor', className } = props
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      style={{ color, verticalAlign: '-3px', flexShrink: 0 }}
      role="img"
      aria-label={`${label} crest`}
    >
      {CREST_ART[crestForKingdom(seed)]}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Wooden army pawn — a Channapatna-style turned piece with a power badge.
// Seat patterns make ownership readable without relying on colour.
// ---------------------------------------------------------------------------

const PAWN_BODY =
  'M-7.1 9.8 C-7.1 4.4 -6.2 -1.4 -5.8 -4.4 L5.8 -4.4 C6.2 -1.4 7.1 4.4 7.1 9.8 C4.4 11.2 -4.4 11.2 -7.1 9.8 Z'

export function PawnPatterns() {
  const dark = { stroke: '#2b1c10', strokeWidth: 3, opacity: 0.28, fill: 'none' }
  const light = { stroke: '#fff8e8', strokeWidth: 1.7, opacity: 0.92, fill: 'none' }
  return (
    <>
      <pattern id="seatPat0" width="9" height="9" patternUnits="userSpaceOnUse">
        <circle cx="4.5" cy="4.5" r="2.2" fill="#2b1c10" opacity="0.28" />
        <circle cx="4.5" cy="4.5" r="1.5" fill="#fff8e8" opacity="0.92" />
      </pattern>
      <pattern id="seatPat1" width="9" height="9" patternUnits="userSpaceOnUse">
        <path d="M0 9 L9 0" {...dark} />
        <path d="M0 9 L9 0" {...light} />
      </pattern>
      <pattern id="seatPat2" width="9" height="9" patternUnits="userSpaceOnUse">
        <path d="M0 4.5 H9 M4.5 0 V9" {...dark} />
        <path d="M0 4.5 H9 M4.5 0 V9" {...light} />
      </pattern>
      <pattern id="seatPat3" width="9" height="9" patternUnits="userSpaceOnUse">
        <path d="M2.5 0 V9" {...dark} />
        <path d="M2.5 0 V9" {...light} />
      </pattern>
      <pattern id="seatPat4" width="9" height="9" patternUnits="userSpaceOnUse">
        <path d="M0 2.5 H9" {...dark} />
        <path d="M0 2.5 H9" {...light} />
      </pattern>
      <pattern id="seatPat5" width="9" height="9" patternUnits="userSpaceOnUse">
        <path d="M0 2.5 L4.5 6.5 L9 2.5" {...dark} />
        <path d="M0 2.5 L4.5 6.5 L9 2.5" {...light} />
      </pattern>
      <pattern id="seatPat6" width="9" height="9" patternUnits="userSpaceOnUse">
        <path d="M0 0 H9 M0 4.5 H9 M0 9 H9" {...dark} />
        <path d="M0 4.5 H9" {...light} />
      </pattern>
      <pattern id="seatPat7" width="9" height="9" patternUnits="userSpaceOnUse">
        <circle cx="4.5" cy="4.5" r="2.9" fill="none" stroke="#2b1c10" strokeWidth="2.8" opacity="0.26" />
        <circle cx="4.5" cy="4.5" r="2.4" fill="none" stroke="#fff8e8" strokeWidth="1.5" opacity="0.9" />
      </pattern>
    </>
  )
}

export function Pawn(props: { color: string; label: string; power: number; scale?: number; pattern?: string }) {
  const { color, label, power, scale = 1, pattern } = props
  return (
    <g transform={`scale(${scale})`}>
      {/* ground shadow */}
      <ellipse cx={0} cy={11} rx={9} ry={3.2} fill="rgba(38, 22, 8, 0.38)" />
      {/* turned body */}
      <path d={PAWN_BODY} fill={color} stroke="#2b1c10" strokeWidth={1.1} />
      {pattern && <path d={PAWN_BODY} fill={`url(#${pattern})`} pointerEvents="none" />}
      {/* small specular glint; the seat pattern carries the texture */}
      <ellipse cx={-3.2} cy={-1.2} rx={1.1} ry={3.2} fill="rgba(255, 250, 235, 0.22)" pointerEvents="none" />
      {/* top knob */}
      <ellipse cx={0} cy={-4.6} rx={6} ry={2.7} fill={color} stroke="#2b1c10" strokeWidth={1} />
      <ellipse cx={-1} cy={-5} rx={3.2} ry={1.2} fill="rgba(255, 250, 235, 0.4)" pointerEvents="none" />
      {/* army numeral */}
      <text x={0} y={2.6} textAnchor="middle" fontSize={6.4} fontWeight={900} fill="#fff8e8" fontFamily="Georgia, serif">
        {label}
      </text>
      {/* power badge */}
      <circle cx={9.2} cy={8.6} r={6.9} fill="#241a11" stroke="#f4e7c8" strokeWidth={1.1} />
      <text x={9.2} y={11.3} textAnchor="middle" fontSize={7.6} fontWeight={700} fill="#ffe9b8" fontFamily="Georgia, serif">
        {power}
      </text>
    </g>
  )
}

// ---------------------------------------------------------------------------
// Painted-map terrain motifs
// ---------------------------------------------------------------------------

export type TerrainKind = 'forest' | 'hills' | 'fields' | 'dunes'

export function TerrainMotif(props: { kind: TerrainKind; x: number; y: number; scale?: number }) {
  const { kind, x, y, scale = 1 } = props
  return (
    <g transform={`translate(${x},${y}) scale(${scale})`} pointerEvents="none" opacity={0.62}>
      {kind === 'forest' && (
        <g>
          {[
            [0, 0, 1],
            [7, 2.5, 0.85],
            [-7, 3, 0.9],
          ].map(([dx, dy, s], i) => (
            <g key={i} transform={`translate(${dx},${dy}) scale(${s})`}>
              <line x1={0} y1={4} x2={0} y2={10} stroke="#4a3018" strokeWidth={1.4} />
              <circle cx={0} cy={0} r={4.2} fill="#4e7a46" stroke="#2f4d24" strokeWidth={0.8} />
              <circle cx={-2} cy={-1.4} r={2.2} fill="#6b9460" opacity={0.8} />
            </g>
          ))}
        </g>
      )}
      {kind === 'hills' && (
        <g stroke="#5f4630" strokeWidth={1} strokeLinejoin="round">
          <path d="M-10 9 L-3 -2 L4 9 Z" fill="#a8845a" />
          <path d="M-3 -2 L-1 2 L-3 3 L-5 1 Z" fill="#f4e7c8" stroke="none" opacity={0.85} />
          <path d="M0 9 L7 -4 L14 9 Z" fill="#8f6a45" />
          <path d="M7 -4 L9 1 L7 2 L5 0 Z" fill="#f4e7c8" stroke="none" opacity={0.85} />
        </g>
      )}
      {kind === 'fields' && (
        <g strokeLinecap="round" strokeLinejoin="round">
          {/* two paddy plots, separated by a bund and drained by a channel */}
          <path d="M-13 4.5 -2 2 1 10 -11 13.5Z" fill="#c9cf8a" opacity={0.66} stroke="#8a6a2e" strokeWidth={1} />
          <path d="M0 2.5 10 1 12.5 9 2 11Z" fill="#d8c27a" opacity={0.66} stroke="#8a6a2e" strokeWidth={1} />
          <path d="M-10 6.4Q-5 4.8 0 5.4M-10.5 9.1Q-5 7.5 0 8.1" stroke="#6f8a3a" strokeWidth={1.35} fill="none" />
          <path d="M3 4.1Q7 3 11 4M3.5 6.6Q7 5.6 11 6.6" stroke="#6f8a3a" strokeWidth={1.25} fill="none" />
          <path d="M-13 4.5-11 13.5M10 1l2.5 8" stroke="#7a5a24" strokeWidth={1.3} fill="none" />
          <path d="M-13 4.5-2 2M0 2.5 10 1" stroke="#7a5a24" strokeWidth={1.3} fill="none" />
          {[
            [-8, 6.4], [-4, 5.6], [0, 5.4],
            [4.5, 4.4], [8, 3.8], [10, 4.4],
          ].map(([x, y], i) => (
            <path key={i} d={`M${x} ${y}v-1.4M${x} ${y}l-1-1M${x} ${y}l1-1`} stroke="#4f6a2a" strokeWidth={1.05} fill="none" />
          ))}
          <path d="M-13 13.8Q0 16 12.5 12.8" stroke="#5f8a8a" strokeWidth={1.4} fill="none" opacity={0.8} />
        </g>
      )}
      {kind === 'dunes' && (
        <g strokeLinecap="round" strokeLinejoin="round">
          {/* two crescent dunes: long windward slopes, sharp crests, slip-face shadow */}
          <path d="M-13.5 8.4C-9.4 4.2-3.4 2.4 2.4 4.2L4.4 7.4C-1 5.8-6.8 7-11 10.8Z" fill="#d9b26a" opacity={0.58} stroke="#a9753d" strokeWidth={1} />
          <path d="M-11 10.8C-5.8 6.8 1.2 5.8 7.4 8.2L8.8 11.6C2 9-4.4 10-9.6 13.6Z" fill="#e0ba75" opacity={0.7} stroke="#a9753d" strokeWidth={1} />
          <path d="M-13.5 8.4C-9.4 4.2-3.4 2.4 2.4 4.2" stroke="#7d5222" strokeWidth={1.4} fill="none" />
          <path d="M-11 10.8C-5.8 6.8 1.2 5.8 7.4 8.2" stroke="#7d5222" strokeWidth={1.5} fill="none" />
          <path d="M7.4 8.2 8.8 11.6C4 10-1 10.4-5.8 12.2L-9.6 13.6C-4.4 10 2 9 8.8 11.6" fill="#a9753d" opacity={0.3} />
          <path d="M-10 12.4C-5.4 9.6 0 9 5 10.2" stroke="#b07f3e" strokeWidth={1} opacity={0.8} fill="none" />
          <path d="M-9 6.2C-6 4.8-2.4 4.6 1 5.6" stroke="#f4e7c8" strokeWidth={0.9} opacity={0.65} fill="none" />
        </g>
      )}
    </g>
  )
}

// ---------------------------------------------------------------------------
// Sailing ship for the ocean
// ---------------------------------------------------------------------------

export function Ship(props: { x: number; y: number; scale?: number; flip?: boolean }) {
  const { x, y, scale = 1, flip = false } = props
  return (
    <g transform={`translate(${x},${y}) scale(${flip ? -scale : scale},${scale})`} opacity={0.55} pointerEvents="none">
      <path d="M-30 14 H30 L22 24 H-20 Z" fill="#6b4f2a" stroke="#3a2812" strokeWidth={1.4} />
      <path d="M0 14 V-22" stroke="#3a2812" strokeWidth={2.2} />
      <path d="M2 -20 C14 -14 19 -6 19 11 H2 Z" fill="#f4e7c8" stroke="#8a6a30" strokeWidth={1.2} />
      <path d="M-2 -16 C-13 -11 -17 -3 -17 11 H-2 Z" fill="#efe0bd" stroke="#8a6a30" strokeWidth={1.2} opacity={0.9} />
      <path d="M0 -22 L11 -17 L0 -13 Z" fill="#a03c32" />
      <path d="M-30 14 C-18 18 18 18 30 14" fill="none" stroke="#3a2812" strokeWidth={1} opacity={0.5} />
    </g>
  )
}

// ---------------------------------------------------------------------------
// Peg-hole VP track, like the physical player tracker.
// ---------------------------------------------------------------------------

export function VpTrack(props: { vp: number; target: number; color: string }) {
  const { vp, target, color } = props
  const holes = 10
  const filled = taskProgress(vp, target, holes)
  return (
    <div className="vp-track" title={`${vp} of ${target} victory points`} aria-label={`${vp} of ${target} victory points`}>
      {Array.from({ length: holes }).map((_, i) => (
        <span
          key={i}
          className={`vp-hole ${i < filled ? 'filled' : ''} ${i === filled - 1 ? 'peg' : ''}`}
          style={{ ['--peg' as never]: color }}
        />
      ))}
    </div>
  )
}

function taskProgress(vp: number, target: number, holes: number) {
  if (target <= 0) return 0
  return Math.max(0, Math.min(holes, Math.round((vp / target) * holes)))
}
