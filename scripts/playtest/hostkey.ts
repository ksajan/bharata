/**
 * Security regression: the lobby must not expose the host's player key, and a
 * connected seat must not be claimable from a second socket. Run against a live
 * server: `npx tsx scripts/playtest/hostkey.ts` (server on :3001).
 */
import { io, type Socket } from 'socket.io-client'

const URL = process.env.E2E_URL ?? 'http://localhost:3001'
let fails = 0
function assert(cond: boolean, msg: string) {
  console.log(` ${cond ? '✓' : '✗'} ${msg}`)
  if (!cond) fails++
}

function client(key: string) {
  return io(URL, { auth: { playerKey: key }, timeout: 5000 })
}
function connect(s: Socket) {
  return new Promise<void>((resolve, reject) => {
    s.once('connect', resolve)
    s.once('connect_error', reject)
    setTimeout(() => reject(new Error('connect timeout')), 6000)
  })
}
function emit<T = any>(s: Socket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve, reject) =>
    s.timeout(6000).emit(event, payload, (err: unknown, res: T) => (err ? reject(err) : resolve(res))),
  )
}
function waitForRoom(s: Socket): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('room snapshot timeout')), 6000)
    s.once('room', (room) => {
      clearTimeout(timer)
      resolve(room)
    })
  })
}

async function main() {
  const host = client('pk-security-host')
  const guest = client('pk-security-guest')
  const watcher = client('pk-security-watcher')
  await Promise.all([connect(host), connect(guest), connect(watcher)])

  const hostRoomP = waitForRoom(host)
  const created = await emit<any>(host, 'room:create', { name: 'Host' })
  assert(created.ok && !!created.code, 'host creates a room')
  const code = created.code
  const hostRoom = await hostRoomP
  assert(!('hostKey' in hostRoom), 'lobby does not expose hostKey')
  assert(hostRoom.isHost === true, 'host is marked as host')

  const guestRoomP = waitForRoom(guest)
  const joined = await emit<any>(guest, 'room:join', { code, name: 'Guest' })
  assert(joined.ok, 'guest joins')
  const guestRoom = await guestRoomP
  assert(!('hostKey' in guestRoom), 'guest lobby does not expose hostKey')
  assert(guestRoom.isHost === false, 'guest is not marked as host')

  const watcherRoomP = waitForRoom(watcher)
  const watched = await emit<any>(watcher, 'room:watch', { code })
  assert(watched.ok, 'watcher enters the room')
  const watcherRoom = await watcherRoomP
  assert(!('hostKey' in watcherRoom), 'watcher lobby does not expose hostKey')
  assert(watcherRoom.isHost === false, 'watcher is not marked as host')

  const wConfig = await emit<any>(watcher, 'room:config', { cfg: { vpTarget: 1 } })
  const wStart = await emit<any>(watcher, 'room:start', {})
  assert(!wConfig.ok, 'watcher cannot change room config')
  assert(!wStart.ok, 'watcher cannot start the game')

  const hijack = client('pk-security-host')
  await connect(hijack)
  const hijacked = await emit<any>(hijack, 'room:join', { code, name: 'Hijack' })
  assert(!hijacked.ok, 'a second live socket cannot claim the host seat')
  hijack.disconnect()

  host.disconnect()
  guest.disconnect()
  watcher.disconnect()
  console.log(fails === 0 ? '✅ SECURITY E2E PASSED' : `❌ ${fails} security checks failed`)
  process.exit(fails === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('❌ security e2e crashed:', err.message)
  process.exit(1)
})
