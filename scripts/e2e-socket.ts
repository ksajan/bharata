/** Network end-to-end: 2 socket clients room flow. Run: npx tsx scripts/e2e-socket.ts (server must be running on :3001) */
import { io } from 'socket.io-client'

type Ack = { ok: boolean; error?: string; code?: string; seatId?: string }
const fails: string[] = []
function assert(cond: boolean, msg: string) {
  if (!cond) fails.push(msg)
  console.log(` ${cond ? '✓' : '✗'} ${msg}`)
}

function client(key?: string) {
  const s = io('http://localhost:3001', {
    auth: { playerKey: key ?? `pk-${Math.random().toString(36).slice(2)}` },
    timeout: 5000,
  })
  const fail = setTimeout(() => {
    console.error('❌ could not connect to server on :3001 — is `npm run serve` running?')
    process.exit(1)
  }, 8000)
  s.on('connect', () => clearTimeout(fail))
  s.on('connect_error', () => {
    clearTimeout(fail)
    console.error('❌ could not connect to server on :3001 — is `npm run serve` running?')
    process.exit(1)
  })
  return s
}

function emit<T extends Ack>(socket: ReturnType<typeof io>, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve, reject) =>
    socket.timeout(5000).emit(event, payload, (err: unknown, res: T) => (err ? reject(err) : resolve(res))),
  )
}

function waitForState(socket: ReturnType<typeof io>, timeout = 6000): Promise<any> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('state timeout')), timeout)
    socket.once('state', (s) => {
      clearTimeout(t)
      resolve(s)
    })
  })
}

async function main() {
  const host = client()
  const guestKey = 'pk-guest-fixed'
  const guest = client(guestKey)
  await new Promise((r) => host.on('connect', r))
  await new Promise((r) => guest.on('connect', r))

  const created = await emit(host, 'room:create', { name: 'Chandra' })
  assert(created.ok && !!created.code, `host creates room ${created.code}`)
  const code = created.code!

  const joined = await emit(guest, 'room:join', { code, name: 'Bindusara' })
  assert(joined.ok && joined.seatId === 's1', `guest joins as s1`)

  const guestBad = client()
  await new Promise((r) => guestBad.on('connect', r))
  const badJoin = await emit(guestBad, 'room:join', { code: 'ZZZZ', name: 'Nobody' })
  assert(!badJoin.ok, 'bogus room code rejected')

  const cfgRes = await emit(host, 'room:config', { cfg: { vpTarget: 8, advanced: true } })
  assert(cfgRes.ok, 'host sets config')

  const guestStart = await emit(guest, 'room:start', {})
  assert(!guestStart.ok, 'non-host cannot start')

  await emit(host, 'room:start', {})
  const st1 = await waitForState(guest)
  assert(st1 && st1.phase === 'draft', 'game started, phase=draft, broadcast received')
  assert(st1.armyDeck.every((c: any) => c.id === '__hidden'), 'deck contents hidden from clients')

  // drafts
  await emit(host, 'game:action', { action: { type: 'draft', personality: 'iron_raja', abilities: ['physician', 'seer'] } })
  await emit(guest, 'game:action', { action: { type: 'draft', personality: 'war_elephants', abilities: ['strategist', 'quartermaster'] } })
  const st2 = await waitForState(guest)
  assert(st2.phase === 'resource', 'draft complete → resource phase')

  // host plays resource phase
  await emit(host, 'game:action', { action: { type: 'drawResource' } })
  let st = await waitForState(host)
  assert(st.resourceCardDrawn === true, 'resource card drawn over network')
  assert(st.lastResourceCard && typeof st.lastResourceCard.title === 'string', 'resource card face is public')

  // guest tries to act out of turn
  const sneaky = await emit(guest, 'game:action', { action: { type: 'drawResource' } })
  assert(!sneaky.ok, 'out-of-turn action rejected')

  await emit(host, 'game:action', { action: { type: 'sellResources', resources: { iron: 2 } } })
  await emit(host, 'game:action', { action: { type: 'endResource' } })
  st = await waitForState(host)
  assert(st.phase === 'action', 'host in action phase')

  // move army I to a neighbor
  const army = st.armies.find((a: any) => a.ownerId === 's0' && a.alive)
  const { REGIONS } = await import('../shared/data')
  const neigh = REGIONS[army.regionId].neighbors[0]
  await emit(host, 'game:action', { action: { type: 'moveArmy', armyId: 1, to: neigh } })
  st = await waitForState(host)
  const movedArmy = st.armies.find((a: any) => a.ownerId === 's0' && a.armyId === 1)
  assert(movedArmy.regionId === neigh, `army I moved to ${neigh} over the network`)

  // rejoin: guest disconnects and comes back with same playerKey
  guest.disconnect()
  await new Promise((r) => setTimeout(r, 300))
  const guest2 = client(guestKey)
  await new Promise((r) => guest2.on('connect', r))
  const rejoined = await emit(guest2, 'room:join', { code, name: 'Bindusara' })
  assert(rejoined.ok && rejoined.seatId === 's1', 'guest reconnects into same seat')
  const st3 = await waitForState(guest2)
  assert(st3 && st3.phase === 'action', 'rejoined client receives live state')

  // spectator: watch the live room without a seat; cannot act or emote
  const watcher = client()
  await new Promise((r) => watcher.on('connect', r))
  const watcherStateP = waitForState(watcher)
  const watched = await emit(watcher, 'room:watch', { code })
  assert(watched.ok, 'watcher enters the room without a seat')
  const wst = await watcherStateP
  assert(wst && wst.phase === 'action', 'watcher receives live state')
  const watchedAct = await emit(watcher, 'game:action', { action: { type: 'drawResource' } })
  assert(!watchedAct.ok, 'watcher cannot act')

  const emoteP = new Promise<any>((resolve) => watcher.once('emote', resolve))
  const emoteRes = await emit(host, 'room:emote', { emote: '👋' })
  assert(emoteRes.ok, 'host sends an emote')
  const emoteEvt = await emoteP
  assert(emoteEvt && emoteEvt.emote === '👋' && emoteEvt.seatId === 's0', 'watcher receives the emote')
  const fastEmote = await emit(host, 'room:emote', { emote: '🔥' })
  assert(!fastEmote.ok, 'emote cooldown rejects a second emote')
  const watcherEmote = await emit(watcher, 'room:emote', { emote: '👋' })
  assert(!watcherEmote.ok, 'watcher cannot emote')

  host.disconnect()
  guest2.disconnect()
  guestBad.disconnect()
  watcher.disconnect()
  console.log(fails.length === 0 ? '✅ NETWORK E2E PASSED' : `❌ ${fails.length} network checks failed`)
  process.exit(fails.length === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('❌ e2e crashed:', e.message)
  process.exit(1)
})
