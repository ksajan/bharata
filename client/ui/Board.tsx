import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HEX_SIZE, REGIONS, RIVER_PATHS, hexCenter, hexPolygon } from '../../shared/data'
import type { GameState } from '../../shared/types'
import { EVENT_GLYPHS, ICON_SHAPES, type IconKind } from './icons'
import { Pawn, Ship, TerrainMotif, type TerrainKind } from './art'

type Box = { x: number; y: number; w: number; h: number }

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export const Board = React.memo(function Board(props: {
  state: GameState
  selectedRegion: string | null
  moveTargets: Set<string>
  evtTargets: Set<string>
  onRegion: (rid: string) => void
  focusMode?: boolean
  onToggleFocus?: () => void
  onClearSelection?: () => void
}) {
  const { state, selectedRegion, moveTargets, evtTargets, onRegion, focusMode, onToggleFocus, onClearSelection } = props

  if (import.meta.env.DEV) {
    const w = window as unknown as { __boardRenders?: number }
    w.__boardRenders = (w.__boardRenders ?? 0) + 1
  }

  const fit = useMemo<Box>(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const r of Object.values(REGIONS)) {
      for (const [x, y] of hexPolygon(r.pos.q, r.pos.r)) {
        minX = Math.min(minX, x); minY = Math.min(minY, y)
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
      }
    }
    const pad = 64
    return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 }
  }, [])

  const [box, setBox] = useState<Box>(fit)
  const svgRef = useRef<SVGSVGElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const drag = useRef<{ startX: number; startY: number; box: Box; moved: boolean; pinchDist: number } | null>(null)
  const suppressClick = useRef(false)
  const pointerFocus = useRef(false)
  const [kbdRid, setKbdRid] = useState<string | null>(null)
  const boxRef = useRef(box)
  boxRef.current = box

  // reset the view when the board remounts (e.g. focus mode toggles)
  useEffect(() => {
    setBox(fit)
  }, [fit])

  const clampBox = useCallback(
    (b: Box): Box => {
      const w = clamp(b.w, fit.w / 4, fit.w)
      const h = w * (fit.h / fit.w)
      const x = clamp(b.x, fit.x, fit.x + fit.w - w)
      const y = clamp(b.y, fit.y, fit.y + fit.h - h)
      return { x, y, w, h }
    },
    [fit],
  )

  const zoomTo = useCallback(
    (factor: number, fx = 0.5, fy = 0.5) => {
      setBox((cur) => {
        const w = clamp(cur.w / factor, fit.w / 4, fit.w)
        const h = w * (fit.h / fit.w)
        const x = cur.x + (cur.w - w) * fx
        const y = cur.y + (cur.h - h) * fy
        return clampBox({ x, y, w, h })
      })
    },
    [fit, clampBox],
  )

  const fitView = useCallback(() => setBox(fit), [fit])

  const zoomPct = Math.round((fit.w / box.w) * 100)

  // wheel zoom, kept non-passive so the page doesn't scroll while zooming the map
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const fx = (e.clientX - rect.left) / rect.width
      const fy = (e.clientY - rect.top) / rect.height
      zoomTo(e.deltaY < 0 ? 1.18 : 1 / 1.18, fx, fy)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomTo])

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    pointerFocus.current = true
    setKbdRid(null) // pointer use dismisses the keyboard ring
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 1 && box.w < fit.w - 0.5) {
      drag.current = { startX: e.clientX, startY: e.clientY, box, moved: false, pinchDist: 0 }
      ;(e.target as Element).setPointerCapture?.(e.pointerId)
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      if (drag.current) drag.current.pinchDist = d
    }
  }

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return

    // pinch zoom
    if (pointers.current.size === 2 && drag.current?.pinchDist) {
      const [a, b] = [...pointers.current.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      const factor = d / drag.current.pinchDist
      if (Number.isFinite(factor) && factor > 0.1 && factor < 10) {
        drag.current.pinchDist = d
        zoomTo(factor)
        suppressClick.current = true
      }
      return
    }

    if (!drag.current) return
    const dxPx = e.clientX - drag.current.startX
    const dyPx = e.clientY - drag.current.startY
    if (Math.abs(dxPx) + Math.abs(dyPx) > 4) drag.current.moved = true
    const scale = drag.current.box.w / rect.width
    const nb = clampBox({
      x: drag.current.box.x - dxPx * scale,
      y: drag.current.box.y - dyPx * scale,
      w: drag.current.box.w,
      h: drag.current.box.h,
    })
    setBox(nb)
  }

  const endPointer = (e: React.PointerEvent<SVGSVGElement>) => {
    pointerFocus.current = false
    pointers.current.delete(e.pointerId)
    if (drag.current?.moved) suppressClick.current = true
    if (pointers.current.size < 2) drag.current = null
  }

  const handleRegion = (rid: string) => {
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }
    onRegion(rid)
  }

  const seatColor = (seatId: string) => state.seats[seatId]?.color ?? '#888'
  const zoomed = zoomPct > 110

  // ----- keyboard navigation: arrows walk the hex lattice -----
  const stepRegion = (from: string, key: string) => {
    const dirs: Record<string, [number, number]> = {
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
    }
    const dir = dirs[key]
    if (!dir) return from
    const origin = hexCenter(REGIONS[from].pos.q, REGIONS[from].pos.r)
    let best: string | null = null
    let bestScore = 0
    for (const n of REGIONS[from].neighbors) {
      const c = hexCenter(REGIONS[n].pos.q, REGIONS[n].pos.r)
      const dx = c.x - origin.x
      const dy = c.y - origin.y
      const len = Math.hypot(dx, dy) || 1
      const score = (dx * dir[0] + dy * dir[1]) / len
      if (score > bestScore) {
        bestScore = score
        best = n
      }
    }
    return best ?? from
  }

  const startRegion = selectedRegion ?? Object.values(state.kingdoms)[0]?.capital ?? Object.keys(REGIONS)[0]
  const focusedRegion = kbdRid ? REGIONS[kbdRid] : null
  const focusedOwner = kbdRid ? state.regionControl[kbdRid] : null
  const focusAnnouncement = focusedRegion
    ? `${focusedRegion.name}. ${focusedRegion.kind === 'province' ? 'Province' : 'Great Kingdom'}. Value ${focusedRegion.value}. ${
        focusedOwner ? `Ruled by ${state.kingdoms[focusedOwner]?.name}` : 'Unclaimed'
      }.`
    : ''

  const onBoardKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' ', 'Escape'].includes(e.key)) return
    e.preventDefault()
    if (e.key === 'Escape') {
      setKbdRid(null)
      onClearSelection?.()
      return
    }
    if (e.key === 'Enter' || e.key === ' ') {
      if (kbdRid) handleRegion(kbdRid)
      return
    }
    setKbdRid((cur) => stepRegion(cur ?? startRegion, e.key))
  }
  // keep the decorative frame aligned with the map bounds
  const minX = fit.x
  const minY = fit.y
  const maxX = fit.x + fit.w
  const maxY = fit.y + fit.h

  return (
    <div className={`board-stage ${zoomed ? 'is-zoomed' : ''} ${focusMode ? 'is-focus' : ''}`}>
      <div className="sr-only" aria-live="polite">{focusAnnouncement}</div>
      <div className="board-controls" role="group" aria-label="Map controls">
        <button className="small" onClick={() => zoomTo(1 / 1.35)} disabled={zoomPct <= 100} aria-label="Zoom out">
          −
        </button>
        <span className="zoom-level" aria-live="polite">{zoomPct}%</span>
        <button className="small" onClick={() => zoomTo(1.35)} disabled={zoomPct >= 400} aria-label="Zoom in">
          +
        </button>
        <button className="small" onClick={fitView} disabled={zoomPct <= 100} aria-label="Fit the whole map">
          Fit
        </button>
        {onToggleFocus && (
          <button className="small" onClick={onToggleFocus} aria-label={focusMode ? 'Exit full board' : 'Show the full board'}>
            {focusMode ? '← Board' : '⛶ Focus'}
          </button>
        )}
      </div>
      <svg
        ref={svgRef}
        className="board-frame"
        viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        tabIndex={0}
        role="application"
        aria-label="Map of Bharata. Use the arrow keys to move between regions, Enter to select, Escape to clear."
        onKeyDown={onBoardKeyDown}
        onFocus={() => {
          // keyboard and assistive-tech focus draw the ring; pointer focus does not
          if (!pointerFocus.current) setKbdRid((cur) => cur ?? startRegion)
        }}
      >
      <defs>
        <radialGradient id="sea" cx="50%" cy="40%" r="75%">
          <stop offset="0%" stopColor="#c9d5ce" />
          <stop offset="78%" stopColor="#b0c1b8" />
          <stop offset="100%" stopColor="#93a79d" />
        </radialGradient>
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
          <path d="M0,13 Q10.75,4 21.5,13 T43,13 T64.5,13 T86,13" fill="none" stroke="#7d9188" strokeOpacity="0.22" strokeWidth="1.6" />
          <path d="M-6,22 Q4.5,14 15,22 T36,22 T57,22 T78,22 T99,22" fill="none" stroke="#7d9188" strokeOpacity="0.14" strokeWidth="1.2" />
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
      <Ship x={minX + 205} y={maxY - 245} scale={1.05} />
      <Ship x={maxX - 165} y={minY + 205} scale={0.85} flip />
      <text x={minX + 150} y={maxY - 105} fontFamily="Cormorant Garamond, serif" fontSize={17} fill="rgba(38,74,102,0.7)" letterSpacing="7" transform={`rotate(-6 ${minX + 150} ${maxY - 105})`}>
        ARABIAN SEA
      </text>
      <text x={maxX - 58} y={maxY - 150} textAnchor="end" fontFamily="Cormorant Garamond, serif" fontSize={17} fill="rgba(38,74,102,0.7)" letterSpacing="7" transform={`rotate(6 ${maxX - 58} ${maxY - 150})`}>
        BAY OF BENGAL
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
        const terrain: TerrainKind | null = region.arid
          ? 'dunes'
          : (region.yields.iron ?? 0) > 0
            ? 'hills'
            : (region.yields.wood ?? 0) > 0
              ? 'forest'
              : (region.yields.food ?? 0) > 0
                ? 'fields'
                : null
        return (
          <g
            key={region.id}
            className={`region ${region.kind === 'mahajanapada' ? 'maha' : ''} ${isSel ? 'selected' : ''} ${canMove ? 'moveable' : ''} ${kbdRid === region.id ? 'kbd-focus' : ''}`}
            onClick={() => handleRegion(region.id)}
            role="button"
            tabIndex={-1}
            aria-pressed={isSel}
            aria-label={`${region.name}, value ${region.value}, ${ownerKingdom?.name ?? 'unclaimed'}${
              armies.length ? `, ${armies.length} arm${armies.length === 1 ? 'y' : 'ies'}` : ''
            }`}
          >
            <polygon
              className="region-shape"
              points={poly.map((p) => p.join(',')).join(' ')}
              fill={LAND_TINT[terrain ?? 'plain'][region.kind === 'mahajanapada' ? 1 : 0]}
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
            {ownerKingdom && (
              <polygon
                points={poly.map((p) => p.join(',')).join(' ')}
                fill="none"
                stroke={ownerKingdom.color}
                strokeWidth={2.6}
                strokeOpacity={0.85}
                pointerEvents="none"
              />
            )}
            {canEvt && (
              <polygon points={poly.map((p) => p.join(',')).join(' ')} fill="#b03a2e" fillOpacity={0.3} stroke="#b03a2e" strokeWidth={3.5} pointerEvents="none" />
            )}
            {terrain && (
              <TerrainMotif
                kind={terrain}
                x={c.x + (q % 2 === 0 ? -15 : 15)}
                y={c.y + (r % 2 === 0 ? 8 : -10)}
                scale={0.9}
              />
            )}

            {/* value badge */}
            <circle className="value-badge" cx={c.x} cy={c.y - HEX_SIZE + 22} r={11} />
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
              const spread = (i - (total - 1) / 2) * 29
              const army = state.armies.find((x) => x.ownerId === a.seatId && x.armyId === a.armyId)
              const power = army ? army.cards.reduce((t, cc) => t + cc.value, 0) : 0
              return (
                <g
                  key={a.armyRef}
                  className="army-glide"
                  transform={`translate(${c.x + spread}, ${c.y + 1})`}
                  pointerEvents="none"
                >
                  <Pawn color={seatColor(a.seatId)} label={a.armyId === 1 ? 'I' : 'II'} power={power} scale={1.06} />
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
              fontSize={region.name.length > 10 ? (region.kind === 'mahajanapada' ? 11 : 10.4) : region.kind === 'mahajanapada' ? 13 : 12}
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

      </svg>
    </div>
  )
})

const YIELD_ICON: Record<string, IconKind> = { iron: 'iron', wood: 'wood', food: 'food' }

/** [province, Mahajanapada] fills — subtle painted-atlas land variety */
const LAND_TINT: Record<string, [string, string]> = {
  plain: ['#d8c49c', '#c8a76b'],
  forest: ['#cfc48d', '#bfae72'],
  hills: ['#d4bc8d', '#c4a877'],
  fields: ['#dcc996', '#ccb57a'],
  dunes: ['#e3ca93', '#d2b57a'],
}

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
