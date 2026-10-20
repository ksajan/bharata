/** Audit probe A: security & state integrity. Run: npx tsx scripts/playtest/probeA-security.ts (server on :3001) */
import { io, Socket } from 'socket.io-client'

const URL = 'http://localhost:3001'
let pass = 0
let fail = 0
const ok = (cond: boolean, msg: string, extra?: string) => {
  console.log(` ${cond ? '✓' : '✗'} ${msg}${extra ? ' — ' + extra : ''}`)
  cond ? pass++ : fail++
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function client(key: string): Socket {
  return io(URL, { auth: { playerKey: key }, timeout: 5000 })
}
const connect = (s: Socket) =>
  new Promise<void>((res, rej) => {
    s.once('connect', () => res())
    s.once('connect_error', (e) => rej(e))
    setTimeout(() => rej(new Error('connect timeout')), 6000)
  })
function emit<T = any>(s: Socket, ev: string, payload: unknown): Promise<T> {
  return new Promise((res, rej) =>
    s.timeout(6000).emit(ev, payload, (err: unknown, r: T) => (err ? rej(new Error('ack timeout')) : res(r))),
  )
}

const latestState = new Map<Socket, any>()
const latestRoom = new Map<Socket, any>()
function watch(s: Socket) {
  s.on('state', (st) => latestState.set(s, st))
  s.on('room', (r) => latestRoom.set(s, r))
}

async function main() {
  const hostKey = 'pk-audit-host-a1'
  const guestKey = 'pk-audit-guest-a1'
  const host = client(hostKey)
  watch(host)
  const guest = client(guestKey)
  watch(guest)
  await connect(host)
  await connect(guest)

  const created = await emit<any>(host, 'room:create', { name: 'AuditHost' })
  ok(created.ok, 'host creates room', `code=${created.code}`)
  const code: string = created.code

  const joined = await emit<any>(guest, 'room:join', { code, name: 'AuditGuest' })
  ok(joined.ok && joined.seatId === 's1', 'guest joins as s1')
  await sleep(150)

  // --- 1) non-host powers ---
  const g1 = await emit<any>(guest, 'room:config', { cfg: { vpTarget: 1 } })
  ok(!g1.ok, 'non-host room:config rejected', g1.error)
  const g2 = await emit<any>(guest, 'room:start', {})
  ok(!g2.ok, 'non-host room:start rejected', g2.error)
  const g3 = await emit<any>(guest, 'room:reset', {})
  ok(!g3.ok, 'non-host room:reset rejected', g3.error)

  // --- 2) never-joined socket cannot act ---
  const outsider = client('pk-audit-outsider')
  watch(outsider)
  await connect(outsider)
  const o1 = await emit<any>(outsider, 'game:action', { action: { type: 'drawResource' } })
  ok(!o1.ok, 'unseated socket cannot act', o1.error)
  outsider.disconnect()

  // --- 3) cfg accepted unvalidated ---
  const cfgRes = await emit<any>(host, 'room:config', {
    cfg: { vpTarget: 99, eventFrequency: 'off', advanced: true, hiddenTokens: 10, armyCardCost: -3, freeActions: 2 },
  })
  ok(cfgRes.ok, 'host config with armyCardCost=-3 ACCEPTED (no validation)')

  const startRes = await emit<any>(host, 'room:start', {})
  ok(startRes.ok, 'game started')
  await sleep(250)
  const gState = latestState.get(guest)
  ok(!!gState, 'guest received sanitized state')

  // --- 4) sanitize leaks ---
  ok(gState?.rngState !== undefined, 'LEAK: sanitized state contains rngState', `rngState=${gState?.rngState}`)
  const hid = Object.entries(gState?.regions ?? {}).filter(([, v]: any) => v.hiddenToken)
  ok(
    hid.length > 0,
    'LEAK: hidden-token ids (kind encoded) visible to every client',
    hid.slice(0, 3).map(([r, v]: any) => `${r}=${v.hiddenToken}`).join(', '),
  )
  ok(gState?.armyDeck?.every((c: any) => c.id === '__hidden'), 'deck contents masked (OK)')

  // --- 5) __proto__ personality accepted ---
  const d1 = await emit<any>(host, 'game:action', {
    action: { type: 'draft', personality: '__proto__', abilities: ['physician', 'seer'] },
  })
  ok(d1.ok, 'draft with personality "__proto__" ACCEPTED')
  await sleep(180)
  ok(
    latestState.get(guest)?.seats?.s0?.personality === '__proto__',
    'seat personality set to "__proto__"',
  )

  // --- 6) guest drafts; phase resource ---
  const d2 = await emit<any>(guest, 'game:action', {
    action: { type: 'draft', personality: 'iron_raja', abilities: ['strategist', 'quartermaster'] },
  })
  ok(d2.ok, 'guest drafts')
  await sleep(180)
  ok(latestState.get(guest)?.phase === 'resource', 'phase=resource')

  // host draws resource card so endResource is legal later
  const dr = await emit<any>(host, 'game:action', { action: { type: 'drawResource' } })
  ok(dr.ok, 'host drawResource')
  await sleep(150)

  // --- 7) string-coin exploit ---
  let st = latestState.get(guest)
  const coinsBefore = st.seats.s0.coins
  const ironBefore = st.seats.s0.iron
  const x1 = await emit<any>(host, 'game:action', { action: { type: 'sellResources', resources: { iron: '1' } } })
  await sleep(180)
  st = latestState.get(guest)
  const dCoins = st.seats.s0.coins - coinsBefore
  ok(
    x1.ok && dCoins >= 50,
    `TYPE-CONFUSION EXPLOIT: sellResources {iron:'1'} → +${dCoins} coins for ${ironBefore - st.seats.s0.iron} iron (legit would be 0-1 coin)`,
  )

  // --- 8) negative armyCardCost ---
  const c2 = st.seats.s0.coins
  const x2 = await emit<any>(host, 'game:action', { action: { type: 'buyArmyCard', armyId: 1 } })
  await sleep(180)
  st = latestState.get(guest)
  const d2c = st.seats.s0.coins - c2
  ok(x2.ok && d2c === 3, `NEGATIVE-COST EXPLOIT: buyArmyCard with armyCardCost=-3 → coins +${d2c}`)

  // --- 9) room-code brute force (small sample, no throttle) ---
  const bf = client('pk-audit-bf')
  await connect(bf)
  const t0 = Date.now()
  let hits = 0
  for (let i = 0; i < 30; i++) {
    let c = ''
    for (let j = 0; j < 4; j++) c += 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 31)]
    const r = await emit<any>(bf, 'room:join', { code: c, name: 'BF' })
    if (r.ok) hits++
  }
  const dt = Date.now() - t0
  ok(
    hits === 0,
    `no rate limit on room:join: 30 guesses answered in ${dt}ms (${(dt / 30).toFixed(1)}ms/attempt); full 31^4=923,521 space ≈ ${Math.round((923521 * dt) / 30 / 1000 / 60)} min sequential`,
  )
  bf.disconnect()

  // --- 10) hijack: same playerKey from a second socket ---
  const hijack = client(hostKey)
  watch(hijack)
  await connect(hijack)
  const h1 = await emit<any>(hijack, 'room:join', { code, name: 'Hijacker' })
  ok(h1.ok && h1.seatId === 's0', 'HIJACK: socket with copied playerKey claims seat s0')
  await sleep(150)
  const hAct = await emit<any>(hijack, 'game:action', { action: { type: 'endResource' } })
  ok(hAct.ok, 'hijacker acts as the host seat (two live sockets on one seat)')
  await sleep(300)
  ok(
    latestState.get(hijack)?.phase === 'action' && latestState.get(host)?.phase === 'resource',
    'HIJACK SIDE-EFFECT: original host socket stopped receiving updates (state stale)',
  )
  hijack.disconnect()
  await sleep(350)
  ok(
    latestRoom.get(guest)?.players?.[0]?.connected === false,
    'after hijacker leaves, seat marked DISCONNECTED while original host socket is still connected',
  )

  // --- 11) host re-join recovers ---
  const rj = await emit<any>(host, 'room:join', { code, name: 'AuditHost' })
  ok(rj.ok && rj.seatId === 's0', 'host re-joins with same playerKey and recovers seat')
  await sleep(150)

  // --- 12) unlimited room creation ---
  let codes = 0
  for (let i = 0; i < 5; i++) {
    const r = await emit<any>(host, 'room:create', { name: 'Spam' })
    if (r.ok) codes++
  }
  ok(codes === 5, 'NO CAP: one socket created 5 extra rooms in ~1s')

  host.disconnect()
  guest.disconnect()
  console.log(`\nprobe A: ${pass} passed, ${fail} flagged`)
  process.exit(0)
}

main().catch((e) => {
  console.error('probe A crashed:', (e as Error).message)
  process.exit(1)
})
