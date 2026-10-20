/** Audit probe B: lifecycle & reconnection. Run: npx tsx scripts/playtest/probeB-lifecycle.ts (server on :3001) */
import { io, Socket } from 'socket.io-client'
import { REGIONS } from '../../shared/data'

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
    if (s.connected) return res()
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
function watch(s: Socket) {
  s.on('state', (st) => latestState.set(s, st))
}

async function setupGame(tag: string, cfg: any) {
  const host = client(`pk-audit-b-${tag}-h`)
  const guest = client(`pk-audit-b-${tag}-g`)
  watch(host)
  watch(guest)
  await connect(host)
  await connect(guest)
  const created = await emit<any>(host, 'room:create', { name: 'BH' })
  const code = created.code
  await emit<any>(guest, 'room:join', { code, name: 'BG' })
  await emit<any>(host, 'room:config', { cfg })
  await emit<any>(host, 'room:start', {})
  await sleep(200)
  return { host, guest, code }
}

function bfsPath(from: string, to: string): string[] {
  const q: string[] = [from]
  const prev: Record<string, string | null> = { [from]: null }
  while (q.length) {
    const cur = q.shift()!
    if (cur === to) break
    for (const n of REGIONS[cur].neighbors) {
      if (!(n in prev)) {
        prev[n] = cur
        q.push(n)
      }
    }
  }
  const path: string[] = []
  let cur = to
  while (cur !== from) {
    path.unshift(cur)
    cur = prev[cur]!
  }
  return path
}

async function main() {
  // ============ PART 0: draft hang (seat never drafts) ============
  console.log('\n— PART 0: seat never drafts → permanent hang? —')
  const p0 = await setupGame('p0', { advanced: false, eventFrequency: 'off', vpTarget: 99 })
  p0.guest.disconnect()
  await sleep(300)
  const d0 = await emit<any>(p0.host, 'game:action', {
    action: { type: 'draft', personality: 'iron_raja' },
  })
  ok(d0.ok, 'host drafts own seat')
  await sleep(180)
  const st0 = latestState.get(p0.host)
  ok(st0?.phase === 'draft', `phase stuck in "${st0?.phase}" with guest gone (no timeout, no abort)`)
  const d0b = await emit<any>(p0.host, 'game:action', {
    action: { type: 'draft', personality: 'merchant_prince' },
  })
  ok(!d0b.ok, 'host cannot draft for the absent seat either', d0b.error)
  await emit<any>(p0.host, 'room:reset', {})
  p0.host.disconnect()
  await sleep(150)

  // ============ PART 1: malformed draft → non-atomic corruption ============
  console.log('\n— PART 1: malformed draft corrupts seat (non-atomic mutation) —')
  const p1 = await setupGame('p1', { advanced: true, eventFrequency: 'off', vpTarget: 99, hiddenTokens: 0 })
  const d1 = await emit<any>(p1.host, 'game:action', {
    action: { type: 'draft', personality: 'iron_raja', abilities: ['physician', 'bogus_id'] },
  })
  ok(!d1.ok, 'malformed draft rejected by server', d1.error)
  const d2 = await emit<any>(p1.guest, 'game:action', {
    action: { type: 'draft', personality: 'war_elephants', abilities: ['strategist', 'quartermaster'] },
  })
  ok(d2.ok, 'guest drafts valid')
  await sleep(200)
  const st1 = latestState.get(p1.guest)
  ok(st1?.phase === 'resource', 'game advanced to resource (host counts as drafted despite the failed draft)')
  ok(
    st1?.seats?.s0?.personality === 'iron_raja' && (st1?.seats?.s0?.abilities ?? []).includes('bogus_id'),
    `CORRUPTION: s0 personality="${st1?.seats?.s0?.personality}", abilities=${JSON.stringify(st1?.seats?.s0?.abilities)}`,
  )
  const ua = await emit<any>(p1.host, 'game:action', { action: { type: 'useAbility', ability: 'physician' } })
  ok(!ua.ok && /No uses left/i.test(ua.error ?? ''), 'impact: host "owns" physician but has 0 uses — ability lost', ua.error)
  await emit<any>(p1.host, 'room:reset', {})
  p1.host.disconnect()
  p1.guest.disconnect()
  await sleep(150)

  // ============ PART 2: battle chaos + disconnect zombie ============
  console.log('\n— PART 2: pendingBattle has no guard; defender disconnect mid-battle —')
  const p2 = await setupGame('p2', { advanced: false, eventFrequency: 'off', vpTarget: 99, freeActions: 3 })
  const dh = await emit<any>(p2.host, 'game:action', { action: { type: 'draft', personality: 'iron_raja' } })
  const dg = await emit<any>(p2.guest, 'game:action', { action: { type: 'draft', personality: 'war_elephants' } })
  ok(dh.ok && dg.ok, 'both drafted')
  await sleep(180)

  let battle: any = null
  outer: for (let round = 0; round < 30 && !battle; round++) {
    for (const who of ['host', 'guest'] as const) {
      const s = who === 'host' ? p2.host : p2.guest
      if (who === 'host') {
        await emit(s, 'game:action', { action: { type: 'drawResource' } })
        await emit(s, 'game:action', { action: { type: 'endResource' } })
        await sleep(120)
        for (let m = 0; m < 3; m++) {
          const st: any = latestState.get(p2.host)
          if (st?.pendingBattle) {
            battle = st.pendingBattle
            break outer
          }
          if (st?.phase !== 'action') break
          const army = st.armies.find((a: any) => a.ownerId === 's0' && a.armyId === 1 && a.alive)
          const enemyCap = st.kingdoms.k1.capital
          const path = bfsPath(army.regionId, enemyCap)
          if (!path.length) break
          await emit(s, 'game:action', { action: { type: 'moveArmy', armyId: 1, to: path[0] } })
          await sleep(120)
          if (latestState.get(p2.host)?.pendingBattle) {
            battle = latestState.get(p2.host).pendingBattle
            break outer
          }
        }
      } else {
        await emit(s, 'game:action', { action: { type: 'drawResource' } })
        await emit(s, 'game:action', { action: { type: 'endResource' } })
        await sleep(120)
      }
    }
  }
  ok(!!battle, `battle triggered at ${battle?.regionId}`, `awaiting=${JSON.stringify(battle?.awaiting)}`)

  // chaos: attacker takes a NORMAL action while a battle is pending
  let st = latestState.get(p2.host)
  const army2 = st.armies.find((a: any) => a.ownerId === 's0' && a.armyId === 2 && a.alive)
  const safe = REGIONS[army2.regionId].neighbors.find(
    (n: string) => (st.regions[n]?.armies?.length ?? 0) === 0,
  )
  if (safe) {
    const mv = await emit<any>(p2.host, 'game:action', { action: { type: 'moveArmy', armyId: 2, to: safe } })
    await sleep(180)
    st = latestState.get(p2.host)
    const moved = st.armies.find((a: any) => a.ownerId === 's0' && a.armyId === 2).regionId === safe
    ok(
      mv.ok && moved && !!st.pendingBattle,
      `NO GUARD: attacker moved another army to ${safe} while battle unresolved`,
    )
  }

  // attacker commits, then DEFENDER disconnects before committing
  st = latestState.get(p2.host)
  const card = st.armies.find((a: any) => a.ownerId === 's0' && a.armyId === 1).cards[0]
  const cm = await emit<any>(p2.host, 'game:action', {
    action: { type: 'battleCommit', cards: [{ armyId: 1, cardId: card.id }] },
  })
  ok(cm.ok, 'attacker commits')
  await sleep(150)
  p2.guest.disconnect()
  await sleep(350)
  st = latestState.get(p2.host)
  ok(
    st?.pendingBattle && JSON.stringify(st.pendingBattle.awaiting) === JSON.stringify(['s1']),
    `ZOMBIE: battle awaiting ${JSON.stringify(st?.pendingBattle?.awaiting)} with defender gone`,
  )

  // endTurn is ALSO allowed during pending battle → turn passes to the gone seat
  const et = await emit<any>(p2.host, 'game:action', { action: { type: 'endTurn' } })
  await sleep(180)
  st = latestState.get(p2.host)
  ok(
    et.ok && st?.activeSeat === 's1' && !!st?.pendingBattle,
    `endTurn allowed during pending battle → turn passed to absent seat (zombie battle persists)`,
  )
  const stuck = await emit<any>(p2.host, 'game:action', { action: { type: 'drawResource' } })
  ok(
    !stuck.ok && /Not your turn/i.test(stuck.error ?? ''),
    `2P GAME FROZEN: only action left for the server is 'Not your turn' — ${stuck.error}`,
  )
  const rs = await emit<any>(p2.host, 'room:reset', {})
  ok(rs.ok, 'only escape is host room:reset (destroys the whole game)')
  p2.host.disconnect()
  await sleep(150)

  console.log(`\nprobe B: ${pass} passed, ${fail} flagged`)
  process.exit(0)
}

main().catch((e) => {
  console.error('probe B crashed:', (e as Error).message)
  process.exit(1)
})
