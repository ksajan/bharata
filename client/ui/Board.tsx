import React, { useMemo } from 'react'
import { HEX_SIZE, REGIONS, RIVER_PATHS, hexCenter, hexPolygon } from '../../shared/data'
import type { GameState } from '../../shared/types'
import { EVENT_GLYPHS, ICON_SHAPES, type IconKind } from './icons'

export function Board(props: {
  state: GameState
  selectedRegion: string | null
  moveTargets: Set<string>
  evtTargets: Set<string>
  onRegion: (rid: string) => void
}) {
  const { state, selectedRegion, moveTargets, evtTargets, onRegion } = props

  const { minX, minY, maxX, maxY } = useMemo(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const r of Object.values(REGIONS)) {
      for (const [x, y] of hexPolygon(r.pos.q, r.pos.r)) {
        minX = Math.min(minX, x); minY = Math.min(minY, y)
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
      }
    }
    const pad = 96
    return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad }
  }, [])

  const seatColor = (seatId: string) => state.seats[seatId]?.color ?? '#888'

  return (
    <svg
      className="board-frame"
      viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
      style={{ width: '100%', minWidth: 880, maxWidth: 1500, height: '100%', maxHeight: '82vh', margin: '0 auto', display: 'block', background: 'linear-gradient(170deg,#e8d5ab,#dcc392 60%,#d2b47f)' }}
      role="img"
      aria-label="Map of Bharata"
    >
      <defs>
        <radialGradient id="sea" cx="50%" cy="40%" r="75%">
          <stop offset="0%" stopColor="#d9c59a" />
          <stop offset="78%" stopColor="#cdb684" />
          <stop offset="100%" stopColor="#b99a63" />
        </radialGradient>
        {/* painted-manuscript grain over the whole board */}
        <filter id="paperGrain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.35  0 0 0 0 0.25  0 0 0 0 0.12  0 0 0 0.6 0" />
          <feComposite operator="in" in2="SourceGraphic" />
        </filter>
        {/* gentle ink-wash mottling for the land */}
        <filter id="inkWash" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.015" numOctaves="3" seed="7" stitchTiles="stitch" result="w" />
          <feDisplacementMap in="SourceGraphic" in2="w" scale="6" />
        </filter>
        <radialGradient id="badge" cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#a84a38" />
          <stop offset="100%" stopColor="#6e1f14" />
        </radialGradient>
        <radialGradient id="armyDisc" cx="35%" cy="30%" r="85%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.45" />
          <stop offset="45%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <pattern id="waves" width="86" height="26" patternUnits="userSpaceOnUse">
          <path d="M0,13 Q10.75,4 21.5,13 T43,13 T64.5,13 T86,13" fill="none" stroke="#8a6b3a" strokeOpacity="0.16" strokeWidth="1.6" />
          <path d="M-6,22 Q4.5,14 15,22 T36,22 T57,22 T78,22 T99,22" fill="none" stroke="#8a6b3a" strokeOpacity="0.10" strokeWidth="1.2" />
        </pattern>
      </defs>
      <rect x={minX} y={minY} width={maxX - minX} height={maxY - minY} fill="url(#sea)" />
      <rect x={minX} y={minY} width={maxX - minX} height={maxY - minY} fill="url(#waves)" />

      {/* ornate map frame with corner ornaments */}
      <g pointerEvents="none">
        <rect x={minX + 10} y={minY + 10} width={maxX - minX - 20} height={maxY - minY - 20} fill="none" stroke="#7a5a24" strokeWidth="2.5" strokeOpacity="0.8" rx="14" />
        <rect x={minX + 17} y={minY + 17} width={maxX - minX - 34} height={maxY - minY - 34} fill="none" stroke="#a8842f" strokeWidth="1" strokeOpacity="0.7" rx="9" />
        {[
          [minX + 10, minY + 10, 1, 1],
          [maxX - 10, minY + 10, -1, 1],
          [minX + 10, maxY - 10, 1, -1],
          [maxX - 10, maxY - 10, -1, -1],
        ].map(([x, y, sx, sy], i) => (
          <g key={i} transform={`translate(${x},${y}) scale(${sx},${sy})`} stroke="#7a5a24" strokeWidth="2" fill="none" strokeOpacity="0.85">
            <path d="M0,34 Q2,10 34,0" />
            <path d="M6,26 Q9,9 26,6" strokeOpacity="0.6" />
            <circle cx={7} cy={7} r={2.4} fill="#a8842f" stroke="none" />
          </g>
        ))}
      </g>

      {/* title cartouche */}
      <g pointerEvents="none">
        <rect x={minX + 34} y={minY + 30} width={252} height={64} rx={9} fill="#f7ecd2" fillOpacity="0.55" stroke="#8a6a30" strokeOpacity="0.8" />
        <rect x={minX + 39} y={minY + 35} width={242} height={54} rx={6} fill="none" stroke="#7a5a24" strokeOpacity="0.45" />
        <text x={minX + 52} y={minY + 62} fontFamily="Rozha One, serif" fontSize="28" fontWeight="400" fill="rgba(90,62,28,0.75)" letterSpacing="6">
          BHĀRATA
        </text>
        <text x={minX + 53} y={minY + 80} fontFamily="Cormorant Garamond, serif" fontStyle="italic" fontSize="14.5" fill="rgba(90,62,28,0.7)">
          the sixteen realms · 600 BC
        </text>
      </g>

      {/* compass rose */}
      <g transform={`translate(${minX + 96}, ${maxY - 96})`} pointerEvents="none" opacity="0.85">
        <circle r="30" fill="none" stroke="#7a5a24" strokeWidth="1.6" strokeOpacity="0.7" />
        <circle r="23" fill="none" stroke="#7a5a24" strokeWidth="0.8" strokeOpacity="0.55" />
        <circle r="3.2" fill="#7a5a24" fillOpacity="0.9" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
          <g key={deg} transform={`rotate(${deg})`}>
            <path d="M0,-30 L5,-7 L0,-11 L-5,-7 Z" fill={deg % 90 === 0 ? '#8a4a28' : '#7a5a24'} fillOpacity={deg % 90 === 0 ? 0.85 : 0.6} />
          </g>
        ))}
        <text y="-36" textAnchor="middle" fontFamily="Rozha One, serif" fontSize="11" fontWeight="400" fill="#7a5a24" fillOpacity="0.8">
          उ
        </text>
      </g>
      <text x={maxX - 30} y={maxY - 16} textAnchor="end" fontFamily="Cormorant Garamond, serif" fontStyle="italic" fontSize="18" fill="rgba(38,74,102,0.8)" letterSpacing="3">
        MAHĀSĀGARA — the Great Ocean
      </text>

      {/* rivers — dark bed under a bright thread */}
      {RIVER_PATHS.map((rv) => {
        const pts = rv.via.map((rid) => {
          const reg = REGIONS[rid]
          const c = hexCenter(reg.pos.q, reg.pos.r)
          return `${c.x},${c.y}`
        })
        return (
          <g key={rv.name} pointerEvents="none">
            <polyline className="river-line" points={pts.join(' ')} />
            <polyline points={pts.join(' ')} fill="none" stroke="#bcd8e4" strokeOpacity="0.5" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        )
      })}

      {/* regions */}
      {Object.values(REGIONS).map((region) => {
        const { q, r } = region.pos
        const poly = hexPolygon(q, r)
        const c = hexCenter(q, r)
        const owner = state.regionControl[region.id]
        const ownerKingdom = owner ? state.kingdoms[owner] : null
        const bstate = state.regions[region.id]
        // derive armies straight from the army list — never depend on cached occupation
        const armies = state.armies
          .filter((a) => a.alive && a.regionId === region.id)
          .map((a) => ({ seatId: a.ownerId, armyId: a.armyId, armyRef: a.id }))
        const hasArmies = armies.length > 0
        const isSel = selectedRegion === region.id
        const canMove = moveTargets.has(region.id)
        const canEvt = evtTargets.has(region.id)
        const yieldEntries = Object.entries(region.yields).filter(([, n]) => n) as [string, number][]
        const subLabel = region.isCapitalOf ?? ''
        return (
          <g
            key={region.id}
            className={`region ${region.kind === 'mahajanapada' ? 'maha' : ''} ${isSel ? 'selected' : ''} ${canMove ? 'moveable' : ''}`}
            onClick={() => onRegion(region.id)}
          >
            <polygon
              className="region-shape"
              points={poly.map((p) => p.join(',')).join(' ')}
              fill={region.kind === 'mahajanapada' ? (region.arid ? '#d3b478' : '#c8a76b') : region.arid ? '#ddc48f' : '#d8c49c'}
            />
            {/* bevel: soft inner highlight ring gives the hex a raise */}
            <g transform={`translate(${c.x},${c.y}) scale(0.93) translate(${-c.x},${-c.y})`} pointerEvents="none">
              <polygon points={poly.map((p) => p.join(',')).join(' ')} fill="none" stroke="rgba(255,246,220,0.5)" strokeWidth="2" />
            </g>
            {ownerKingdom && (
              <polygon
                className="owner-tint"
                points={poly.map((p) => p.join(',')).join(' ')}
                fill={ownerKingdom.color}
                fillOpacity={0.38}
                pointerEvents="none"
              />
            )}
            {canEvt && (
              <polygon points={poly.map((p) => p.join(',')).join(' ')} fill="#b03a2e" fillOpacity={0.3} stroke="#b03a2e" strokeWidth={3.5} pointerEvents="none" />
            )}

            {/* value badge */}
            <circle className="value-badge" cx={c.x} cy={c.y - HEX_SIZE + 22} r={11} fill="url(#badge)" />
            <text className="value-text" x={c.x} y={c.y - HEX_SIZE + 26.5} textAnchor="middle">
              {region.value}
            </text>

            {/* fort banner: mast, waving pennant, ground shadow */}
            {ownerKingdom && (
              <g className="fort-flag" transform={`translate(${c.x - HEX_SIZE * 0.62 + 8}, ${c.y - 32})`}>
                <g className="fort-pop">
                  <ellipse cx={0} cy={1.5} rx={7} ry={2.2} fill="rgba(40,24,8,0.35)" />
                  <line x1={0} y1={0} x2={0} y2={-24} stroke="#3a2812" strokeWidth="2.8" strokeLinecap="round" />
                  <path d={`M0,-24 C7,-25 12,-21 19,-18.5 C12,-16.5 7,-15.5 0,-14 Z`} fill={ownerKingdom.color} stroke="#221609" strokeWidth="1.1" />
                  <circle cx={0} cy={-25.5} r={1.8} fill="#e6bd63" stroke="#7a5a1c" strokeWidth="0.6" />
                </g>
              </g>
            )}

            {/* armies */}
            {armies.map((a, i) => {
              const total = armies.length
              const spread = (i - (total - 1) / 2) * 27
              const army = state.armies.find((x) => x.ownerId === a.seatId && x.armyId === a.armyId)
              const power = army ? army.cards.reduce((t, cc) => t + cc.value, 0) : 0
              return (
                <g
                  key={a.armyRef}
                  className="army-glide"
                  transform={`translate(${c.x + spread}, ${c.y + 2})`}
                  pointerEvents="none"
                >
                  <circle
                    r={12.5}
                    fill={seatColor(a.seatId)}
                    stroke="#ffe9b8"
                    strokeWidth={2.5}
                    style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.45))' }}
                  />
                  <circle r={12.5} fill="url(#armyDisc)" pointerEvents="none" />
                  <text x={0} y={-1} textAnchor="middle" fontSize={11} fontWeight={900} fill="#fff" fontFamily="Rozha One, serif">
                    {a.armyId === 1 ? 'I' : 'II'}
                  </text>
                  {drawIcon('sword', -5.5, 6, 9)}
                  <text x={3} y={10} textAnchor="middle" fontSize={8.5} fontWeight={700} fill="#ffe9b8" fontFamily="Cormorant Garamond, serif">
                    {power}
                  </text>
                </g>
              )
            })}

            {/* event tokens — bottom-left diagonal, clear of fort flag (top-left), badge & label */}
            {(bstate?.eventTokens ?? []).map((t, i) => {
              const glyph = EVENT_GLYPHS[t.kind] ?? EVENT_GLYPHS.riot
              return (
                <g key={t.id} className="event-token" transform={`translate(${c.x - HEX_SIZE * 0.72 + i * 5}, ${c.y + HEX_SIZE * 0.42 + i * 23})`}>
                  <g className="token-pop">
                    <circle r={12} fill="#7b1d12" stroke="#ffd98c" strokeWidth={1.6} />
                    {glyph.map((s, j) => (
                      <path key={j} d={s.d} fill="none" stroke="#ffe9b8" strokeWidth={1.6} strokeLinecap="round" transform="translate(3, 3) scale(0.62)" />
                    ))}
                  </g>
                </g>
              )
            })}

            {/* hidden token marker — gold, reads as treasure not error */}
            {bstate?.hiddenToken && (
              <g className="hidden-marker marker-in" transform={`translate(${c.x + HEX_SIZE * 0.5 - 2}, ${c.y + HEX_SIZE * 0.52 - 6})`}>
                <circle r={10} fill="#f3e2b3" stroke="#a07c28" strokeWidth={1.8} strokeDasharray="3.5 2.2" />
                <text x={0} y={4.5} textAnchor="middle" fontSize={12} fontWeight={900} fill="#7a5a1c" fontFamily="Rozha One, serif">
                  ?
                </text>
              </g>
            )}

            {/* labels — shift rows clear of army discs */}
            <text
              className="region-label"
              x={c.x}
              y={c.y + (hasArmies ? -18 : -2)}
              textAnchor="middle"
              fontSize={region.kind === 'mahajanapada' ? 13 : 12}
            >
              {region.name}
            </text>
            {subLabel && (
              <text className="region-sub" x={c.x} y={c.y + (hasArmies ? 32 : 12)} textAnchor="middle" fontSize={10} fontStyle="italic">
                ⭐{subLabel}
              </text>
            )}
            {/* yields / trade / harbor row — drawn icons + counts */}
            {(() => {
              const items: { kind: IconKind; n?: number }[] = yieldEntries.map(([res, n]) => ({ kind: YIELD_ICON[res] ?? 'food', n }))
              if (region.trade) items.push({ kind: 'trade', n: region.trade })
              if (region.harbor) items.push({ kind: 'harbor' })
              if (items.length === 0) return null
              const w = 16
              const startX = c.x - ((items.length - 1) * w) / 2
              const rowY = c.y + (subLabel ? (hasArmies ? 44 : 24) : hasArmies ? 32 : 12)
              return items.map((it, i) => (
                <g key={`${it.kind}-${i}`} pointerEvents="none">
                  {drawIcon(it.kind, startX + i * w - (it.n !== undefined ? 3 : 0), rowY - 3, 12)}
                  {it.n !== undefined && (
                    <text className="region-sub" x={startX + i * w + 5} y={rowY + 1} textAnchor="middle" fontSize={10.5} fontWeight={700}>
                      {it.n}
                    </text>
                  )}
                </g>
              ))
             })()}
          </g>
        )
      })}

      {/* unified manuscript grain over everything */}
      <rect
        x={minX}
        y={minY}
        width={maxX - minX}
        height={maxY - minY}
        filter="url(#paperGrain)"
        opacity="0.14"
        pointerEvents="none"
      />
    </svg>
  )
}

const YIELD_ICON: Record<string, IconKind> = { iron: 'iron', wood: 'wood', food: 'food' }

function drawIcon(kind: IconKind, x: number, y: number, size = 11) {
  const scale = size / 16
  return (
    <g key={`${kind}-${x}-${y}`} transform={`translate(${x - size / 2}, ${y - size / 2}) scale(${scale})`}>
      {ICON_SHAPES[kind].map((s, i) => (
        <path key={i} d={s.d} fill={s.fill} stroke={s.stroke ?? 'none'} strokeWidth={s.stroke ? 0.7 : 0} />
      ))}
    </g>
  )
}
