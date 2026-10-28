import http from 'http'
import fs from 'fs'
import path from 'path'
import express from 'express'
import { Server } from 'socket.io'
import { fileURLToPath } from 'url'
import { RoomManager, sanitizeCfg } from './rooms'
import { GameError } from '../shared/engine'
import { sanitizeState } from '../shared/engine'
import type { GameAction } from '../shared/types'

const EMOTES = new Set(['👋', '👍', '🔥', '😮', '😅', '🙏', '⚔️', '👑'])
const EMOTE_COOLDOWN_MS = 1500

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 3001
// cross-origin socket access is closed by default (the server serves its own client);
// hosted deployments may open it up: ALLOWED_ORIGINS="https://a.example,https://b.example"
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const app = express()
const httpServer = http.createServer(app)

app.get('/health', (_req, res) => res.json({ ok: true }))

const dist = path.join(__dirname, '..', 'dist')
app.use(express.static(dist))
app.get('*', (_req, res) => {
  if (fs.existsSync(path.join(dist, 'index.html'))) return res.sendFile(path.join(dist, 'index.html'))
  res.status(503).send('Client not built yet — run `npm run build`')
})

const io = new Server(httpServer, {
  cors: { origin: ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS : false },
})

const manager = new RoomManager()
setInterval(() => manager.sweep(), 10 * 60 * 1000).unref()
// disconnected rulers auto-play one minimal action per tick — the table never stalls
setInterval(() => {
  for (const room of manager.rooms.values()) {
    if (room.state && manager.zombieStep(room)) {
      for (const p of room.players) {
        if (p.socketId) {
          io.to(p.socketId).emit('state', sanitizeState(room.state, p.seatId))
        }
      }
      for (const watcherId of room.watchers) {
        io.to(watcherId).emit('state', sanitizeState(room.state, null))
      }
    }
  }
}, 3 * 1000).unref()

// simple per-IP throttle on room create/join — only failed attempts count (brute-force guard)
const failedAttempts = new Map<string, number[]>()
function tooManyFailures(ip: string): boolean {
  const now = Date.now()
  return (failedAttempts.get(ip) ?? []).filter((t) => now - t < 60_000).length >= 20
}
function recordFailure(ip: string) {
  const now = Date.now()
  const arr = (failedAttempts.get(ip) ?? []).filter((t) => now - t < 60_000)
  arr.push(now)
  failedAttempts.set(ip, arr)
}

interface SocketData {
  playerKey: string
  roomCode: string | null
  seatId: string | null
}

io.on('connection', (socket) => {
  const data: SocketData = socket.data as SocketData
  data.playerKey = socket.handshake.auth?.playerKey ?? `pk-${Math.random().toString(36).slice(2)}`
  data.roomCode = null

  const broadcastRoom = (code: string) => {
    const room = manager.getRoom(code)
    if (!room) return
    // lobby snapshot
    const lobby = {
      code: room.code,
      players: room.players.map((p) => ({ seatId: p.seatId, name: p.name, connected: p.connected })),
      cfg: room.cfg,
      started: !!room.state,
    }
    // hostKey is a credential, not a lobby field — send only the derived flag
    for (const p of room.players) {
      if (p.socketId) {
        io.to(p.socketId).emit('room', { ...lobby, isHost: p.playerKey === room.hostKey })
        if (room.state) io.to(p.socketId).emit('state', sanitizeState(room.state, p.seatId))
        else io.to(p.socketId).emit('state', null)
      }
    }
    // spectators get the same lobby and a seat-less, secret-free view
    for (const watcherId of room.watchers) {
      io.to(watcherId).emit('room', { ...lobby, isHost: false })
      io.to(watcherId).emit('state', room.state ? sanitizeState(room.state, null) : null)
    }
  }

  const cleanName = (value: unknown) => {
    const name = typeof value === 'string' ? value.trim().slice(0, 24) : ''
    return name || 'Ruler'
  }

  /** Leave the current Socket.IO room and mark its seat off before switching rooms. */
  const leaveCurrentRoom = (nextCode?: string) => {
    const oldCode = data.roomCode
    if (!oldCode || oldCode === nextCode) return
    const old = manager.getRoom(oldCode)
    if (old) {
      old.watchers.delete(socket.id)
      const oldPlayer = old.players.find((p) => p.socketId === socket.id)
      if (oldPlayer) {
        oldPlayer.connected = false
        oldPlayer.socketId = null
        oldPlayer.disconnectedAt = Date.now()
        if (old.state?.seats[oldPlayer.seatId]) old.state.seats[oldPlayer.seatId].connected = false
      }
      socket.leave(oldCode)
      broadcastRoom(oldCode)
    }
    data.roomCode = null
    data.seatId = null
  }

  socket.on('room:create', ({ name }: { name: string }, ack?: (r: unknown) => void) => {
    try {
      const room = manager.createRoom(data.playerKey)
      leaveCurrentRoom(room.code)
      const { player } = manager.joinRoom(room.code, cleanName(name), data.playerKey, undefined, socket.id)
      player.socketId = socket.id
      data.roomCode = room.code
      data.seatId = player.seatId
      socket.join(room.code)
      ack?.({ ok: true, code: room.code, seatId: player.seatId, token: player.token })
      broadcastRoom(room.code)
    } catch (e) {
      ack?.({ ok: false, error: (e as Error).message })
    }
  })

  socket.on('room:join', ({ code, name }: { code?: unknown; name?: unknown }, ack?: (r: unknown) => void) => {
    let throttled = false
    try {
      if (typeof code !== 'string' || code !== code.trim() || !code) throw new GameError('Invalid room code')
      throttled = tooManyFailures(socket.handshake.address)
      if (throttled) throw new GameError('Too many failed attempts — wait a minute')
      const { room, player } = manager.joinRoom(code.trim().toUpperCase(), cleanName(name), data.playerKey, undefined, socket.id)
      player.socketId = socket.id
      leaveCurrentRoom(room.code)
      data.roomCode = room.code
      data.seatId = player.seatId
      socket.join(room.code)
      ack?.({ ok: true, code: room.code, seatId: player.seatId, token: player.token })
      broadcastRoom(room.code)
    } catch (e) {
      if (!throttled) recordFailure(socket.handshake.address)
      ack?.({ ok: false, error: (e as Error).message })
    }
  })

  socket.on('room:rejoin', ({ code, token }: { code?: unknown; token?: unknown }, ack?: (r: unknown) => void) => {
    try {
      if (typeof code !== 'string' || code !== code.trim() || !code) throw new GameError('Invalid room code')
      if (typeof token !== 'string' || !token) throw new GameError('Invalid seat token')
      const found = manager.rejoin(code.trim().toUpperCase(), data.playerKey, token)
      if (!found) throw new GameError('That seat is gone — join as a new ruler')
      found.player.socketId = socket.id
      leaveCurrentRoom(found.room.code)
      data.roomCode = found.room.code
      data.seatId = found.player.seatId
      socket.join(found.room.code)
      ack?.({ ok: true, code: found.room.code, seatId: found.player.seatId })
      broadcastRoom(found.room.code)
    } catch (e) {
      ack?.({ ok: false, error: (e as Error).message })
    }
  })

  socket.on('room:watch', ({ code }: { code?: unknown }, ack?: (r: unknown) => void) => {
    let throttled = false
    try {
      if (typeof code !== 'string' || code !== code.trim() || !code) throw new GameError('Invalid room code')
      throttled = tooManyFailures(socket.handshake.address)
      if (throttled) throw new GameError('Too many failed attempts — wait a minute')
      const room = manager.getRoom(code.trim().toUpperCase())
      if (!room) throw new GameError('Room not found')
      leaveCurrentRoom(room.code)
      room.watchers.add(socket.id)
      data.roomCode = room.code
      data.seatId = null
      socket.join(room.code)
      ack?.({ ok: true, code: room.code })
      broadcastRoom(room.code)
    } catch (e) {
      if (!throttled) recordFailure(socket.handshake.address)
      ack?.({ ok: false, error: (e as Error).message })
    }
  })

  socket.on('room:emote', ({ emote }: { emote: string }, ack?: (r: unknown) => void) => {
    try {
      const room = data.roomCode ? manager.getRoom(data.roomCode) : null
      if (!room) throw new GameError('Not in a room')
      if (!data.seatId) throw new GameError('Spectators cannot emote')
      if (typeof emote !== 'string' || !EMOTES.has(emote)) throw new GameError('Unknown emote')
      const player = room.players.find((p) => p.seatId === data.seatId)
      if (!player) throw new GameError('You are not seated')
      const now = Date.now()
      if (player.lastEmoteAt && now - player.lastEmoteAt < EMOTE_COOLDOWN_MS) {
        throw new GameError('Easy there — one emote every couple of seconds')
      }
      player.lastEmoteAt = now
      io.to(room.code).emit('emote', { seatId: player.seatId, name: player.name, emote, at: now })
      ack?.({ ok: true })
    } catch (e) {
      ack?.({ ok: false, error: (e as Error).message })
    }
  })

  socket.on('game:undo', (_: unknown, ack?: (r: unknown) => void) => {
    try {
      const room = data.roomCode ? manager.getRoom(data.roomCode) : null
      if (!room || !room.state) throw new GameError('No game running')
      if (!data.seatId) throw new GameError('Spectators cannot act')
      manager.undoMove(room, data.playerKey)
      ack?.({ ok: true })
      broadcastRoom(room.code)
    } catch (e) {
      ack?.({ ok: false, error: (e as Error).message })
    }
  })

  socket.on('room:config', ({ cfg }: { cfg: Record<string, unknown> }, ack?: (r: unknown) => void) => {
    try {
      const room = data.roomCode ? manager.getRoom(data.roomCode) : null
      if (!room) throw new GameError('Not in a room')
      if (room.hostKey !== data.playerKey) throw new GameError('Only the host can change settings')
      if (room.state) throw new GameError('Game already started')
      room.cfg = sanitizeCfg({ ...room.cfg, ...cfg })
      ack?.({ ok: true })
      broadcastRoom(room.code)
    } catch (e) {
      ack?.({ ok: false, error: (e as Error).message })
    }
  })

  socket.on('room:start', (_: unknown, ack?: (r: unknown) => void) => {
    try {
      const room = data.roomCode ? manager.getRoom(data.roomCode) : null
      if (!room) throw new GameError('Not in a room')
      if (room.hostKey !== data.playerKey) throw new GameError('Only the host can start')
      manager.startGame(room)
      ack?.({ ok: true })
      broadcastRoom(room.code)
    } catch (e) {
      ack?.({ ok: false, error: (e as Error).message })
    }
  })

  socket.on('room:reset', (_: unknown, ack?: (r: unknown) => void) => {
    try {
      const room = data.roomCode ? manager.getRoom(data.roomCode) : null
      if (!room) throw new GameError('Not in a room')
      if (room.hostKey !== data.playerKey) throw new GameError('Only the host can reset')
      room.state = null
      room.cfg = {}
      room.undoSnapshot = null
      ack?.({ ok: true })
      broadcastRoom(room.code)
    } catch (e) {
      ack?.({ ok: false, error: (e as Error).message })
    }
  })

  socket.on('game:action', ({ action }: { action: GameAction }, ack?: (r: unknown) => void) => {
    try {
      const room = data.roomCode ? manager.getRoom(data.roomCode) : null
      if (!room || !room.state) throw new GameError('No game running')
      if (!data.seatId) throw new GameError('Spectators cannot act')
      manager.applyAction(room, data.playerKey, action)
      ack?.({ ok: true })
      broadcastRoom(room.code)
    } catch (e) {
      const msg = (e as Error).message || 'Invalid action'
      socket.emit('actionError', { message: msg })
      ack?.({ ok: false, error: msg })
    }
  })

  socket.on('disconnect', () => {
    if (!data.roomCode) return
    const room = manager.getRoom(data.roomCode)
    if (!room) return
    room.watchers.delete(socket.id)
    if (!data.seatId) return
    const player = room.players.find((p) => p.socketId === socket.id)
    if (player) {
      player.connected = false
      player.socketId = null
      player.disconnectedAt = Date.now()
      if (room.state) {
        const seat = room.state.seats[player.seatId]
        if (seat) seat.connected = false
      }
      broadcastRoom(room.code)
    }
  })
})

httpServer.listen(PORT, () => {
  console.log(`⚔  Bharata 600 BC server listening on http://localhost:${PORT}`)
})
