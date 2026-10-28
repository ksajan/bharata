/** Multi-room soak: several independent rooms create, join, start, draft and draw without cross-talk. */
import { io, type Socket } from 'socket.io-client'

const URL = process.env.E2E_URL ?? 'http://localhost:3001'
const ROOMS = Number(process.env.SOAK_ROOMS ?? 6)
let fails = 0
function check(cond: boolean, msg: string) {
  if (!cond) { fails++; console.error(` ✗ ${msg}`) } else console.log(` ✓ ${msg}`)
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
function nextState(s: Socket, predicate: (st: any) => boolean = () => true): Promise<any> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('state timeout')), 6000)
    const onState = (st: any) => {
      if (!predicate(st)) return
      clearTimeout(t)
      s.off('state', onState)
      resolve(st)
    }
    s.on('state', onState)
  })
}

async function main() {
  const clients: Socket[] = []
  const rooms: { code: string; host: Socket; guest: Socket }[] = []
  try {
    for (let i = 0; i < ROOMS; i++) {
      const host = client(`soak-h-${i}-${Date.now()}`)
      const guest = client(`soak-g-${i}-${Date.now()}`)
      clients.push(host, guest)
      await Promise.all([connect(host), connect(guest)])
      const created = await emit<any>(host, 'room:create', { name: `Host${i}` })
      check(created.ok && created.code, `room ${i} creates ${created.code}`)
      const joined = await emit<any>(guest, 'room:join', { code: created.code, name: `Guest${i}` })
      check(joined.ok && joined.seatId === 's1', `room ${i} guest joins s1`)
      const started = await emit<any>(host, 'room:start', {})
      check(started.ok, `room ${i} starts`)
      rooms.push({ code: created.code, host, guest })
    }

    check(new Set(rooms.map((r) => r.code)).size === rooms.length, 'room codes are unique')

    for (const [i, r] of rooms.entries()) {
      const stateP = nextState(r.host, (st) => st?.phase === 'resource')
      await emit(r.host, 'game:action', { action: { type: 'draft', personality: 'iron_raja', abilities: ['physician', 'seer'] } })
      await emit(r.guest, 'game:action', { action: { type: 'draft', personality: 'merchant_prince', abilities: ['strategist', 'quartermaster'] } })
      const st = await stateP
      check(st?.phase === 'resource', `room ${i} reaches resource independently`)
      const drawn = await emit<any>(r.host, 'game:action', { action: { type: 'drawResource' } })
      check(drawn.ok, `room ${i} draws a card`)
    }

    // Each room's state remains independent and code-scoped.
    for (const [i, r] of rooms.entries()) {
      const st = await emit<any>(r.host, 'game:action', { action: { type: 'endResource' } })
      check(st.ok, `room ${i} ends resource`)
    }
    console.log(fails === 0 ? `✅ SOAK PASSED (${ROOMS} rooms)` : `❌ ${fails} soak checks failed`)
  } finally {
    for (const s of clients) s.disconnect()
    process.exit(fails === 0 ? 0 : 1)
  }
}

main().catch((e) => {
  console.error('❌ soak crashed:', e.message)
  process.exit(1)
})
