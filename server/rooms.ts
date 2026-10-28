import crypto from 'crypto'
import { GameConfig, GameState, GameAction, AbilityId, PersonalityId } from '../shared/types'
import { createGame, handleAction, GameError, sanitizeState, eventTargetsFor } from '../shared/engine'
import { PERSONALITIES, ABILITIES } from '../shared/data'
import type { SeatInfo } from '../shared/engine'

export interface PlayerConn {
  socketId: string | null
  playerKey: string
  seatId: string
  name: string
  connected: boolean
  token: string
  disconnectedAt: number | null
  lastEmoteAt?: number
}

export interface UndoSnapshot {
  state: GameState
  seatId: string
  logSeq: number
  battleSeq: number
}

export interface Room {
  code: string
  players: PlayerConn[] // seat order
  watchers: Set<string> // socket ids of spectators
  hostKey: string
  cfg: Partial<GameConfig>
  state: GameState | null
  createdAt: number
  undoSnapshot: UndoSnapshot | null
}

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export function makeCode(len = 5): string {
  let s = ''
  for (let i = 0; i < len; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  return s
}

/** host-provided config is whitelisted & range-checked before touching a room */
const CFG_LIMITS: Record<string, [number, number]> = {
  vpTarget: [5, 100],
  hiddenTokens: [0, 10],
  resourceCap: [1, 20],
  fortSupply: [1, 20],
  sellRate: [1, 5],
  tradeValue: [0, 10],
  armyCardCost: [0, 20],
  freeActions: [1, 5],
  extraActionCost: [0, 10],
  startResources: [0, 10],
}
export function sanitizeCfg(cfg: Record<string, unknown>): Partial<GameConfig> {
  const out: Partial<GameConfig> = {}
  if (typeof cfg.advanced === 'boolean') out.advanced = cfg.advanced
  if (cfg.eventFrequency === 'off' || cfg.eventFrequency === 'every' || cfg.eventFrequency === 'alternate' || cfg.eventFrequency === 'every3') {
    out.eventFrequency = cfg.eventFrequency
  }
  for (const [key, [lo, hi]] of Object.entries(CFG_LIMITS)) {
    const n = Number(cfg[key])
    if (Number.isFinite(n)) (out as Record<string, unknown>)[key] = Math.min(hi, Math.max(lo, Math.round(n)))
  }
  return out
}

export class RoomManager {
  rooms = new Map<string, Room>()

  createRoom(hostKey: string): Room {
    let code = makeCode()
    while (this.rooms.has(code)) code = makeCode()
    const room: Room = {
      code,
      players: [],
      watchers: new Set(),
      hostKey,
      cfg: {},
      state: null,
      createdAt: Date.now(),
      undoSnapshot: null,
    }
    this.rooms.set(code, room)
    return room
  }

  getRoom(code: string): Room | null {
    if (typeof code !== 'string') return null
    return this.rooms.get(code.trim().toUpperCase()) ?? null
  }

  private markSeatConnected(room: Room, player: PlayerConn, connected: boolean) {
    if (room.state?.seats[player.seatId]) room.state.seats[player.seatId].connected = connected
  }

  joinRoom(code: string, name: string, playerKey: string, token?: string, socketId?: string): { room: Room; player: PlayerConn } {
    const room = this.getRoom(code)
    if (!room) throw new GameError('Room not found')
    // a seat token reclaims a specific seat — even from a fresh browser (disconnect recovery)
    if (token) {
      const seated = room.players.find((p) => p.token === token)
      if (seated) {
        seated.playerKey = playerKey
        seated.connected = true
        seated.disconnectedAt = null
        this.markSeatConnected(room, seated, true)
        return { room, player: seated }
      }
    }
    const existing = room.players.find((p) => p.playerKey === playerKey)
    if (existing) {
      if (socketId && existing.connected && existing.socketId && existing.socketId !== socketId) {
        throw new GameError('That seat is already connected in another tab')
      }
      existing.name = name
      existing.connected = true
      existing.disconnectedAt = null
      this.markSeatConnected(room, existing, true)
      return { room, player: existing }
    }
    if (room.state) throw new GameError('Game already in progress')
    if (room.players.length >= 8) throw new GameError('Room is full (8 players max)')
    const seatId = `s${room.players.length}`
    const player: PlayerConn = {
      socketId: null,
      playerKey,
      seatId,
      name,
      connected: true,
      token: crypto.randomBytes(12).toString('hex'),
      disconnectedAt: null,
    }
    room.players.push(player)
    return { room, player }
  }

  /** reclaim a seat via its secret token (returns null when unknown) */
  rejoin(code: string, playerKey: string, token: string): { room: Room; player: PlayerConn } | null {
    const room = this.getRoom(code)
    if (!room) return null
    const seated = room.players.find((p) => p.token === token)
    if (!seated) return null
    seated.playerKey = playerKey
    seated.connected = true
    seated.disconnectedAt = null
    this.markSeatConnected(room, seated, true)
    return { room, player: seated }
  }

  startGame(room: Room): GameState {
    if (room.state) throw new GameError('Already started')
    if (room.players.length < 2) throw new GameError('Need at least 2 rulers')
    const seatInfos: SeatInfo[] = room.players.map((p) => ({ id: p.seatId, name: p.name }))
    room.state = createGame(room.cfg, seatInfos)
    room.undoSnapshot = null
    for (const p of room.players) p.disconnectedAt = null
    return room.state
  }

  applyAction(room: Room, playerKey: string, action: GameAction): void {
    if (!room.state) throw new GameError('Game not started')
    const player = room.players.find((p) => p.playerKey === playerKey)
    if (!player) throw new GameError('You are not seated in this room')
    if (action.type === 'undoMove') {
      this.undoMove(room, playerKey)
      return
    }
    // a march is undoable until anything else happens — snapshot it
    // Snapshot a march, but clear the old snapshot only after the action
    // succeeds. A rejected action must not destroy a legal undo.
    const moveSnapshot =
      action.type === 'moveArmy'
        ? {
            state: structuredClone(room.state),
            seatId: player.seatId,
            logSeq: room.state.logSeq,
            battleSeq: room.state.battleSeq,
          }
        : null
    handleAction(room.state, player.seatId, action)
    room.undoSnapshot = moveSnapshot
  }

  /** roll back the last march — only while it is still the freshest thing that happened */
  undoMove(room: Room, playerKey: string): void {
    const snap = room.undoSnapshot
    if (!snap) throw new GameError('Nothing to undo')
    const player = room.players.find((p) => p.playerKey === playerKey)
    if (!player || player.seatId !== snap.seatId) throw new GameError('Only the marching ruler can undo')
    const s = room.state!
    if (s.pendingBattle) throw new GameError('Too late — the battle has begun')
    if (s.phase !== 'action' || s.activeSeat !== snap.seatId) throw new GameError('Too late — the moment has passed')
    if (s.battleSeq !== snap.battleSeq || s.logSeq !== snap.logSeq + 1) {
      throw new GameError('Too late — other orders were given')
    }
    room.state = snap.state
    room.undoSnapshot = null
  }

  /**
   * one minimal auto-action per tick for each disconnected seat, so a dropped
   * ruler never stalls the table (draw, clear afflictions, commit 1 card, pass)
   */
  zombieStep(room: Room): boolean {
    const state = room.state
    if (!state || state.phase === 'gameover') return false
    const now = Date.now()
    let acted = false
    const tryA = (sid: string, a: GameAction): boolean => {
      try {
        handleAction(state, sid, a)
        acted = true
        return true
      } catch {
        return false
      }
    }
    for (const p of room.players) {
      if (p.connected) continue
      if (!p.disconnectedAt || now - p.disconnectedAt < 12_000) continue
      const sid = p.seatId
      if (state.pendingBattle && state.pendingBattle.awaiting.includes(sid)) {
        const isAtk = state.pendingBattle.attackerSeat === sid
        const armies = state.armies
          .filter((a) => a.ownerId === sid && a.alive && a.cards.length > 0)
          .sort((a, b) => b.cards.length - a.cards.length)
        const army = isAtk ? armies[0] : armies.find((a) => a.armyId === state.seats[sid].armiesOwned[0]) ?? armies[0]
        if (army) {
          const weakest = [...army.cards].sort((x, y) => x.value - y.value)[0]
          tryA(sid, { type: 'battleCommit', cards: [{ armyId: army.armyId, cardId: weakest.id }] })
        }
        continue
      }
      if (state.pendingPrize && state.pendingPrize.seatId === sid) {
        tryA(sid, { type: 'choosePrize', optionIndex: 0 })
        continue
      }
      if (state.phase === 'draft' && !state.seats[sid].personality) {
        const ps = Object.keys(PERSONALITIES) as PersonalityId[]
        const abs = Object.keys(ABILITIES) as AbilityId[]
        const pick = () => ps[Math.floor(Math.random() * ps.length)]
        const pickAb = () => abs[Math.floor(Math.random() * abs.length)]
        const a = pickAb()
        let b = pickAb()
        while (b === a) b = pickAb()
        tryA(sid, { type: 'draft', personality: pick(), abilities: state.config.advanced ? [a, b] : [] })
        continue
      }
      if (state.activeSeat !== sid) continue
      if (state.phase === 'resource') {
        if (!state.resourceCardDrawn) tryA(sid, { type: 'drawResource' })
        else tryA(sid, { type: 'endResource' })
        continue
      }
      if (state.phase === 'action') {
        const k = state.kingdoms[state.seats[sid].kingdomId]
        const afflicted = Object.entries(k.forts).find(([rid, kk]) => kk === k.id && state.regions[rid].eventTokens.length > 0)
        if (afflicted) {
          const rid = afflicted[0]
          if (!tryA(sid, { type: 'removeEvent', regionId: rid })) {
            if (!tryA(sid, { type: 'removeEvent', regionId: rid, useCoins: true })) {
              tryA(sid, { type: 'removeEvent', regionId: rid, useMedicine: true })
            }
          }
          continue
        }
        tryA(sid, { type: 'endTurn' })
        continue
      }
      if (state.phase === 'event' && state.pendingEventPlacement && state.activeSeat === sid) {
        const first = [...eventTargetsFor(state, sid)][0] as string | undefined
        tryA(sid, { type: 'placeEventTarget', regionId: first ?? '__skip__' })
        continue
      }
    }
    return acted
  }

  /** rooms idle for >12h (or empty lobbies >30min) are swept */
  sweep(): void {
    const now = Date.now()
    for (const [code, room] of this.rooms) {
      const allGone = room.players.every((p) => !p.connected)
      if (now - room.createdAt > 12 * 3600 * 1000) this.rooms.delete(code)
      else if (allGone && !room.state && now - room.createdAt > 30 * 60 * 1000) this.rooms.delete(code)
    }
  }
}
