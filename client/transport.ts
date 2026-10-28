import { io, Socket } from 'socket.io-client'
import type { GameAction, GameConfig, GameState } from '../shared/types'
import { createGame, handleAction, sanitizeState, GameError } from '../shared/engine'
import type { Room } from '../server/rooms'

export interface LobbySnapshot {
  code: string
  players: { seatId: string; name: string; connected: boolean }[]
  isHost: boolean
  cfg: Partial<GameConfig>
  started: boolean
}

export interface Transport {
  mode: 'online' | 'hotseat'
  code: string | null
  seatId: string | null
  isHost: boolean
  playerKey: string
  onRoom(cb: (room: LobbySnapshot | null) => void): void
  onState(cb: (state: GameState | null) => void): void
  onError(cb: (message: string) => void): void
  /** hot-seat only: fires with the *full* engine state after every action */
  onSnapshot?(cb: (state: GameState) => void): void
  /** online only: enter a room as a spectator */
  watch?(code: string): Promise<void>
  /** online only: quick table emotes */
  sendEmote?(emote: string): Promise<void>
  onEmote?(cb: (e: { seatId: string; name: string; emote: string; at: number }) => void): () => void
  create(name: string): Promise<void>
  join(code: string, name: string): Promise<void>
  setConfig(cfg: Partial<GameConfig>): Promise<void>
  start(): Promise<void>
  reset(): Promise<void>
  send(action: GameAction): Promise<void>
  /** true while the last march can still be rolled back */
  canUndo(view: GameState): boolean
  dispose(): void
}

function getPlayerKey(): string {
  let k = localStorage.getItem('bharata-player-key')
  if (!k) {
    k = `pk-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`
    localStorage.setItem('bharata-player-key', k)
  }
  return k
}

const seatTokenKey = (code: string) => `bharata-seat:${code.toUpperCase()}`

/** last room this browser held a seat token for — powers the Rejoin button */
export function lastSeat(): { code: string; token: string } | null {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith('bharata-seat:')) {
      const token = localStorage.getItem(key)
      if (token) return { code: key.slice('bharata-seat:'.length), token }
    }
  }
  return null
}

const HOTSEAT_KEY = 'bharata-hotseat-v1'
const SNAPSHOT_LOG_LIMIT = 120

interface HotseatSnapshot {
  v: 1
  savedAt: number
  state: GameState
}

export function loadHotseat(): HotseatSnapshot | null {
  try {
    const raw = localStorage.getItem(HOTSEAT_KEY)
    if (!raw) return null
    const snap = JSON.parse(raw) as HotseatSnapshot
    if (snap.v !== 1 || !snap.state?.seats || !snap.state.kingdoms) return null
    return snap
  } catch {
    return null
  }
}

export function saveHotseat(state: GameState) {
  try {
    const pruned: GameState = { ...state, log: state.log.slice(-SNAPSHOT_LOG_LIMIT) }
    localStorage.setItem(HOTSEAT_KEY, JSON.stringify({ v: 1, savedAt: Date.now(), state: pruned }))
  } catch {
    /* quota or private mode — a refresh simply starts fresh */
  }
}

export function clearHotseat() {
  localStorage.removeItem(HOTSEAT_KEY)
}

export function hotseatSeatNames(state: GameState): string[] {
  return Object.values(state.seats)
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
    .map((s) => s.name)
}

interface UndoMark {
  seatId: string
  logLen: number
  battleSeq: number
}

/** the march is undoable until anything else happens on the table */
function undoOpen(view: GameState, mark: UndoMark | null): boolean {
  return (
    !!mark &&
    !view.pendingBattle &&
    view.phase === 'action' &&
    view.activeSeat === mark.seatId &&
    view.battleSeq === mark.battleSeq &&
    view.log.length === mark.logLen + 1
  )
}

// ---------------------------------------------------------------------------
// Online transport (authoritative server)
// ---------------------------------------------------------------------------

export class OnlineTransport implements Transport {
  mode = 'online' as const
  code: string | null = null
  seatId: string | null = null
  isHost = false
  playerKey = getPlayerKey()
  private socket: Socket
  private roomCbs: ((r: LobbySnapshot | null) => void)[] = []
  private stateCbs: ((s: GameState | null) => void)[] = []
  private errorCbs: ((m: string) => void)[] = []
  private watchMode = false
  private emoteCbs: ((e: { seatId: string; name: string; emote: string; at: number }) => void)[] = []
  private lastView: GameState | null = null
  private undoMark: UndoMark | null = null

  constructor() {
    this.socket = io('/', { auth: { playerKey: this.playerKey } })
    this.socket.on('room', (room: LobbySnapshot | null) => {
      this.isHost = !!room?.isHost
      this.roomCbs.forEach((cb) => cb(room))
    })
    this.socket.on('state', (s: GameState | null) => {
      this.lastView = s
      this.stateCbs.forEach((cb) => cb(s))
    })
    this.socket.on('actionError', (e: { message: string }) => {
      this.errorCbs.forEach((cb) => cb(e.message))
    })
    this.socket.on('emote', (e: { seatId: string; name: string; emote: string; at: number }) => {
      this.emoteCbs.forEach((cb) => cb(e))
    })
    // Socket.IO replaces the socket after a transport blip. Re-bind the seat
    // (or the watcher) before the user can act on a stranger socket.
    this.socket.on('connect', () => {
      if (!this.code) return
      if (this.watchMode) this.watch(this.code).catch(() => {})
      else if (this.seatId) this.rejoin(this.code).catch(() => {})
    })
  }

  private emit<T = { ok: boolean; error?: string; code?: string; seatId?: string; token?: string }>(
    event: string,
    payload: unknown,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      this.socket.timeout(8000).emit(event, payload, (err: unknown, res: T & { ok: boolean; error?: string }) => {
        if (err) return reject(new Error('Connection timed out'))
        if (res && res.ok === false) return reject(new GameError(res.error || 'Action failed'))
        resolve(res)
      })
    })
  }

  onRoom(cb: (room: LobbySnapshot | null) => void) {
    this.roomCbs.push(cb)
  }
  onState(cb: (s: GameState | null) => void) {
    this.stateCbs.push(cb)
  }
  onError(cb: (m: string) => void) {
    this.errorCbs.push(cb)
  }
  onEmote(cb: (e: { seatId: string; name: string; emote: string; at: number }) => void) {
    this.emoteCbs.push(cb)
    return () => {
      this.emoteCbs = this.emoteCbs.filter((x) => x !== cb)
    }
  }

  async watch(code: string) {
    const res = await this.emit('room:watch', { code })
    this.code = res.code ?? code.toUpperCase()
    this.seatId = null
    this.isHost = false
    this.watchMode = true
  }

  async sendEmote(emote: string) {
    await this.emit('room:emote', { emote })
  }

  async create(name: string) {
    const res = await this.emit('room:create', { name })
    this.code = res.code ?? null
    this.seatId = res.seatId ?? null
    this.watchMode = false
    this.isHost = true
    if (res.code && res.token) localStorage.setItem(seatTokenKey(res.code), res.token)
  }

  async join(code: string, name: string) {
    const res = await this.emit('room:join', { code, name })
    this.code = res.code ?? null
    this.seatId = res.seatId ?? null
    if (res.code && res.token) localStorage.setItem(seatTokenKey(res.code), res.token)
  }

  /** reclaim a seat by its stored token after a disconnect / fresh browser */
  async rejoin(code: string) {
    const token = localStorage.getItem(seatTokenKey(code))
    if (!token) throw new GameError('No seat token stored for that room')
    const res = await this.emit('room:rejoin', { code, token })
    this.code = res.code ?? code.toUpperCase()
    this.seatId = res.seatId ?? null
  }

  async setConfig(cfg: Partial<GameConfig>) {
    await this.emit('room:config', { cfg })
  }

  async start() {
    await this.emit('room:start', {})
  }

  async reset() {
    await this.emit('room:reset', {})
  }

  async send(action: GameAction) {
    if (action.type === 'undoMove') {
      await this.emit('game:undo', {})
      this.undoMark = null
      return
    }
    const before = this.lastView
    if (action.type === 'moveArmy' && before) {
      this.undoMark = { seatId: before.activeSeat, logLen: before.log.length, battleSeq: before.battleSeq }
    } else if (before) {
      this.undoMark = null
    }
    try {
      await this.emit('game:action', { action })
    } catch (e) {
      this.undoMark = null
      throw e
    }
  }

  canUndo(view: GameState): boolean {
    return undoOpen(view, this.undoMark)
  }

  dispose() {
    this.socket.disconnect()
  }
}

// ---------------------------------------------------------------------------
// Hot-seat transport (same screen, engine runs locally)
// ---------------------------------------------------------------------------

export class HotseatTransport implements Transport {
  mode = 'hotseat' as const
  code = 'LOCAL'
  seatId = 's0'
  isHost = true
  playerKey = 'hotseat'
  private state: GameState | null = null
  private stateCbs: ((s: GameState | null) => void)[] = []
  private errorCbs: ((m: string) => void)[] = []
  private snapshotCbs: ((s: GameState) => void)[] = []
  private names: string[] = []
  private lastView: GameState | null = null
  private undoMark: UndoMark | null = null
  private undoState: GameState | null = null

  onRoom(_cb: (r: LobbySnapshot | null) => void) {}
  onState(cb: (s: GameState | null) => void) {
    this.stateCbs.push(cb)
  }
  onError(cb: (m: string) => void) {
    this.errorCbs.push(cb)
  }
  onSnapshot(cb: (s: GameState) => void) {
    this.snapshotCbs.push(cb)
  }

  private emitState() {
    if (this.state) this.snapshotCbs.forEach((cb) => cb(this.state as GameState))
    const viewSeat = this.currentViewSeat()
    const sanitized = this.state ? sanitizeState(this.state, viewSeat) : null
    this.lastView = sanitized as GameState | null
    this.stateCbs.forEach((cb) => cb(sanitized as GameState | null))
  }

  currentViewSeat(): string | null {
    if (!this.state) return null
    if (this.state.pendingBattle && this.state.pendingBattle.awaiting.length > 0) {
      return this.state.pendingBattle.awaiting[0]
    }
    if (this.state.pendingPrize) return this.state.pendingPrize.seatId
    if (this.state.phase === 'draft') {
      const undrafted = Object.values(this.state.seats).find((s) => !s.personality)
      return undrafted?.id ?? null
    }
    return this.state.activeSeat
  }

  async create(name: string) {
    void name
  }

  /** hot-seat shortcut: build the whole table at once */
  async startLocal(names: string[], cfg: Partial<GameConfig>) {
    this.names = names
    const seats = names.map((n, i) => ({ id: `s${i}`, name: n }))
    this.state = createGame(cfg, seats)
    this.emitState()
  }

  /** restore a persisted table (refresh / crash recovery) */
  async resume(state: GameState) {
    this.state = structuredClone(state)
    this.names = hotseatSeatNames(state)
    this.emitState()
  }

  async join(_code: string, _name: string) {}
  async setConfig(_cfg: Partial<GameConfig>) {}
  async start() {}

  async reset() {
    this.state = null
    this.emitState()
  }

  async send(action: GameAction) {
    if (!this.state) return
    if (action.type === 'undoMove') {
      if (this.undoState && undoOpen(this.lastView ?? (this.state as GameState), this.undoMark)) {
        this.state = this.undoState
        this.undoState = null
        this.undoMark = null
        this.emitState()
      } else {
        this.errorCbs.forEach((cb) => cb('Too late — the moment has passed'))
      }
      return
    }
    if (action.type === 'moveArmy') {
      this.undoState = structuredClone(this.state)
      this.undoMark = { seatId: this.state.activeSeat, logLen: this.state.log.length, battleSeq: this.state.battleSeq }
    } else {
      this.undoState = null
      this.undoMark = null
    }
    try {
      const s = this.state
      const actingSeat =
        s.pendingBattle && s.pendingBattle.awaiting.length > 0
          ? s.pendingBattle.awaiting[0]
          : s.pendingPrize
            ? s.pendingPrize.seatId
            : s.phase === 'draft'
              ? (Object.values(s.seats).find((x) => !x.personality)?.id ?? s.activeSeat)
              : s.activeSeat
      handleAction(s, actingSeat, action)
    } catch (e) {
      this.undoState = null
      this.undoMark = null
      this.errorCbs.forEach((cb) => cb((e as Error).message))
      return
    }
    this.emitState()
  }

  canUndo(view: GameState): boolean {
    return undoOpen(view, this.undoMark)
  }

  dispose() {}
}

export type { Room }
