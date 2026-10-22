import type { GameState } from '../../shared/types'

export type SeatStatKey = 'coins' | 'iron' | 'wood' | 'food' | 'trade' | 'medicine' | 'vp'
export type SeatDelta = Partial<Record<SeatStatKey, number>>

export interface MoveFx {
  id: string
  from: string
  to: string
  color: string
}

export interface TileFx {
  id: string
  regionId: string
  kind: 'conquest' | 'event' | 'clear' | 'reveal'
  color: string
}

export interface GameFx {
  id: string
  deltas: Record<string, SeatDelta>
  moves: MoveFx[]
  tiles: TileFx[]
}

let seq = 0
const nonEmpty = (o: object) => Object.keys(o).length > 0

/**
 * Compare two consecutive authoritative states and derive short-lived visual
 * cues. The UI never animates the initial state — only real transitions.
 */
export function diffStates(prev: GameState, next: GameState): GameFx | null {
  const id = `fx-${++seq}`
  const deltas: Record<string, SeatDelta> = {}

  for (const [seatId, seat] of Object.entries(next.seats)) {
    const before = prev.seats[seatId]
    if (!before) continue
    const delta: SeatDelta = {}
    for (const key of ['coins', 'iron', 'wood', 'food', 'trade', 'medicine', 'vp'] as const) {
      const a = (before as unknown as Record<string, number>)[key]
      const b = (seat as unknown as Record<string, number>)[key]
      if (typeof a === 'number' && typeof b === 'number' && a !== b) delta[key] = b - a
    }
    if (nonEmpty(delta)) deltas[seatId] = delta
  }

  const moves: MoveFx[] = []
  for (const army of next.armies) {
    const before = prev.armies.find((a) => a.id === army.id)
    if (
      before &&
      before.alive &&
      army.alive &&
      before.regionId &&
      army.regionId &&
      before.regionId !== army.regionId
    ) {
      moves.push({
        id: `${id}-m-${army.id}`,
        from: before.regionId,
        to: army.regionId,
        color: next.seats[army.ownerId]?.color ?? '#c99b3f',
      })
    }
  }

  const tiles: TileFx[] = []
  for (const regionId of Object.keys(next.regions)) {
    const before = prev.regions[regionId]
    const after = next.regions[regionId]
    if (!before || !after) continue

    const owner = next.regionControl[regionId]
    if (owner && owner !== prev.regionControl[regionId]) {
      tiles.push({
        id: `${id}-c-${regionId}`,
        regionId,
        kind: 'conquest',
        color: next.kingdoms[owner]?.color ?? '#c99b3f',
      })
    }

    const known = new Set((before.eventTokens ?? []).map((t) => t.id))
    if ((after.eventTokens ?? []).some((t) => !known.has(t.id))) {
      tiles.push({ id: `${id}-e-${regionId}`, regionId, kind: 'event', color: '#b03a2e' })
    } else if ((after.eventTokens?.length ?? 0) < (before.eventTokens?.length ?? 0)) {
      tiles.push({ id: `${id}-x-${regionId}`, regionId, kind: 'clear', color: '#4d6b34' })
    }

    if (before.hiddenToken && !after.hiddenToken) {
      tiles.push({ id: `${id}-r-${regionId}`, regionId, kind: 'reveal', color: '#e6bd63' })
    }
  }

  if (!nonEmpty(deltas) && moves.length === 0 && tiles.length === 0) return null
  return { id, deltas, moves, tiles }
}
