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
      <path fill="currentColor" d="M12 21c-4.4-2.4-6.6-6-5.7-10 2.6 1 4.6 3.4 5.7 6.4 1.1-3 3.1-5.4 5.7-6.4.9 4-1.3 7.6-5.7 10Z" />
      <path fill="currentColor" opacity="0.85" d="M12 17.5c-2.4-2-3.2-5-2.6-8 2 .8 3.3 2.8 3.8 5.2.5-2.4 1.8-4.4 3.8-5.2.6 3-.2 6-2.6 8Z" />
      <path {...STROKE} d="M5 21h14" />
    </>
  ),
  elephant: (
    <>
      <path fill="currentColor" d="M5 20c-1.2-.6-1.6-2.2-.7-3.3-2.4-2.8-2.2-7 .4-9.4C7.2 5.1 10.6 5.2 13 7c2.6 2 3.4 5.4 2.6 8.6l-.7 2.7c-.2.8-1.2 1-1.7.3l-1-1.5-1.6 3H7.3L5 20Z" />
      <path {...STROKE} d="M6 19c-1.6 1.2-1.4 3 .6 3.4M16.6 9.8h2.6l1.6-1.5" />
      <circle cx="15.4" cy="9.4" r="0.9" fill="#f4e7c8" />
      <path fill="currentColor" opacity="0.55" d="M8.4 8.2c2.4-1 5.2-.6 7 1.2-2.6.6-4.8.4-7-1.2Z" />
    </>
  ),
  horse: (
    <>
      <path fill="currentColor" d="M5.4 21c.3-2.6 1.2-4.8 3-6.4l-1.6-2.2 1.2-3.6 3.2-1 1.4-3.2 2.2 1.6 1 3.4 2.8 2.6-1.4 2.4-2.8-.6-.7 7h-3.1l.2-5.2-1.3.2-1.2 5H5.4Z" />
      <circle cx="14.2" cy="7.6" r="0.8" fill="#f4e7c8" />
      <path {...STROKE} d="M10.4 12.4c1.2.8 2.6.8 3.8 0" strokeWidth={1.2} />
    </>
  ),
  bull: (
    <>
      <path fill="currentColor" d="M7 14.6c0-2 1.2-3.6 3.2-4.2V8l-2.6-2.6L5 3.4l3.6.6 2.4 2.6L12 8l1-1.4 2.4-2.6 3.6-.6-2.6 2-2.6 2.6v2.4c2 .6 3.2 2.2 3.2 4.2 0 1.2-.6 2.2-1.6 3L15 21h-2l-1-2-1 2H9l-1.4-3c-1-.8-1.6-1.8-1.6-3Z" />
      <circle cx="9.6" cy="14.2" r="0.8" fill="#f4e7c8" />
      <circle cx="14.4" cy="14.2" r="0.8" fill="#f4e7c8" />
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
      <path {...STROKE} d="M5 3c7 0 12 4.4 12 9s-5 9-12 9" />
      <path {...STROKE} d="M5 3v18" strokeWidth={1.1} />
      <path {...STROKE} d="M9 12h10M16 9.5 19 12l-3 2.5" />
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
        <g stroke="#a8842e" strokeWidth={1.5} strokeLinecap="round">
          <path d="M-10 2 Q0 -1 10 2" fill="none" />
          <path d="M-10 6 Q0 3 10 6" fill="none" opacity={0.85} />
          <path d="M-10 10 Q0 7 10 10" fill="none" opacity={0.7} />
        </g>
      )}
      {kind === 'dunes' && (
        <g stroke="#b07f3e" strokeWidth={1.5} strokeLinecap="round" fill="none">
          <path d="M-11 3 C-5 -2 3 -2 10 3" />
          <path d="M-9 8 C-3 3 5 3 11 8" opacity={0.75} />
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
