import { createGame, handleAction, GameError } from '../../shared/engine'
import { ABILITIES, REGIONS, ARMY_DECK, RESOURCE_DECK, EVENT_DECK } from '../../shared/data'
import type { GameState } from '../../shared/types'

let fails = 0
function check(st: GameState, tag: string) {
  const armyTotal = st.armyDeck.length + st.armyDiscard.length + st.armies.reduce((t, a) => t + a.cards.length, 0)
  const resTotal = st.resourceDeck.length + st.resourceDiscard.length
  const evTotal = st.eventDeck.length + st.eventDiscard.length
  if (armyTotal !== ARMY_DECK.length) { fails++; console.log(`✗ ${tag}: army cards ${armyTotal} != ${ARMY_DECK.length}`) }
  if (resTotal !== RESOURCE_DECK.length) { fails++; console.log(`✗ ${tag}: resource deck ${resTotal} != ${RESOURCE_DECK.length}`) }
  // event tokens on the board are markers, not cards — deck+discard must stay constant
  if (evTotal !== EVENT_DECK.length) { fails++; console.log(`✗ ${tag}: event deck+discard ${evTotal} != ${EVENT_DECK.length}`) }
  for (const s of Object.values(st.seats)) {
    for (const r of ['iron','wood','food','coins','trade','medicine','vp'] as const) {
      if ((s as any)[r] < 0) { fails++; console.log(`✗ ${tag}: ${s.name} negative ${r}`) }
    }
  }
  for (const [rid, kid] of Object.entries(st.regionControl)) {
    if (kid && st.kingdoms[kid].forts[rid] !== kid) { fails++; console.log(`✗ ${tag}: forts/regionControl mismatch ${rid}`) }
  }
  const occ = new Map<string, number>()
  for (const a of st.armies) if (a.alive) occ.set(a.regionId!, (occ.get(a.regionId!) ?? 0) + 1)
  for (const [rid, list] of Object.entries(st.regions)) {
    if (list.armies.length !== (occ.get(rid) ?? 0)) { fails++; console.log(`✗ ${tag}: occupation stale @${rid}`) }
  }
}

function tryA(st: GameState, sid: string, a: any): boolean {
  if (!a || !a.type) throw new Error('BUG IN HARNESS: undefined action passed')
  try { handleAction(st, sid, a); return true } catch (e) { if (!(e instanceof GameError)) throw e; return false }
}

function pathLen(from: string, to: string): number {
  const d = new Map([[from, 0]]); const q = [from]
  while (q.length) { const c = q.shift()!; if (c === to) return d.get(c)!; for (const n of REGIONS[c].neighbors) if (!d.has(n)) { d.set(n, d.get(c)!+1); q.push(n) } }
  return 99
}
function bfs(from: string, goal: string): string | null {
  if (from === goal) return null
  const prev = new Map([[from, null as string | null]]); const q = [from]
  while (q.length) { const c = q.shift()!; for (const n of REGIONS[c].neighbors) if (!prev.has(n)) { prev.set(n, c); if (n === goal) { let s = n; let p = prev.get(n); while (p !== from && p) { s = p; p = prev.get(p) ?? null } return s } q.push(n) } }
  return null
}
function firstTarget(state: GameState): string | null {
  const pe = state.pendingEventPlacement!; const t = pe.card.target
  for (const r of Object.values(REGIONS)) {
    if (t.river && !r.river) continue; if (t.harbor && !r.harbor) continue; if (t.arid && !r.arid) continue
    if (t.yieldsFood && !(r.yields.food ?? 0)) continue
    if (t.hasArmy && (state.regions[r.id]?.armies.length ?? 0) === 0) continue
    if (t.riot && !state.regionControl[r.id]) continue
    if ((state.regions[r.id]?.eventTokens.length ?? 0) >= 2) continue
    const kid = state.regionControl[r.id]
    if (kid && state.kingdoms[kid].seats.some((sid) => (state.seats[sid]?.abilities ?? []).some((ab) => (ABILITIES[ab].immuneTo ?? []).includes(pe.card.kind)))) continue
    return r.id
  }
  return null
}

const PERSONALITIES = ['merchant_prince','iron_raja','granary_keeper','war_elephants','master_mason','tax_collector'] as const
const AB = Object.keys(ABILITIES) as (keyof typeof ABILITIES)[]

for (let g = 0; g < 4; g++) {
  const state = createGame({ advanced: true, vpTarget: 12 }, Array.from({ length: 4 }, (_, i) => ({ id: `s${i}`, name: `P${i}` })))
  for (let i = 0; i < 4; i++) handleAction(state, `s${i}`, { type: 'draft', personality: PERSONALITIES[i], abilities: [AB[i % AB.length], AB[(i + 1) % AB.length]] })
  let t = 0
  while (state.phase !== "gameover" && t < 120) {
    t++
    const sid = state.activeSeat
    const s = state.seats[sid]
    tryA(state, sid, { type: 'drawResource' })
    tryA(state, sid, { type: 'sellResources', resources: { iron: Math.floor(s.iron/2), wood: Math.floor(s.wood/2), food: Math.max(0, Math.floor(s.food/2)-2) } })
    if (s.coins >= 3) tryA(state, sid, { type: 'buyArmyCard', armyId: s.armiesOwned[0] })
    else if (s.iron >= 2 && s.coins >= 2) tryA(state, sid, { type: 'buyArmyCard', armyId: s.armiesOwned[0], forge: true })
    tryA(state, sid, { type: 'endResource' })
    let guard = 25
    while (state.phase === 'action' && state.activeSeat === sid && guard-- > 0) {
      if (state.pendingBattle && state.pendingBattle.awaiting.includes(sid)) {
        const isAtk = state.pendingBattle.attackerSeat === sid
        const cards = state.armies.filter(a => a.ownerId === sid && a.alive && (isAtk || a.armyId === s.armiesOwned[0])).flatMap(a => a.cards.slice(0, isAtk ? 4 : 3).map(c => ({ armyId: a.armyId, cardId: c.id })))
        tryA(state, sid, { type: 'battleCommit', cards }); continue
      }
      const k = state.kingdoms[s.kingdomId]
      const aff = Object.entries(k.forts).filter(([rid, kk]) => kk === k.id && state.regions[rid].eventTokens.length > 0)
      if (aff.length > 0) {
        const rid = aff[0][0]
        if (tryA(state, sid, { type: 'removeEvent', regionId: rid })) continue
        if (tryA(state, sid, { type: 'removeEvent', regionId: rid, useCoins: true })) continue
        if (tryA(state, sid, { type: 'removeEvent', regionId: rid, useMedicine: true })) continue
        tryA(state, sid, { type: 'endTurn' }); break
      }
      if (state.actionsLeft <= 0) { tryA(state, sid, { type: 'endTurn' }); break }
      const army = state.armies.find(a => a.ownerId === sid && a.alive && a.cards.length > 0)
      if (!army || !army.regionId) { tryA(state, sid, { type: 'endTurn' }); break }
      const start = army.regionId
      const goal = Object.keys(REGIONS).filter(r => state.regionControl[r] !== k.id)
        .sort((a, b) => (pathLen(start, a) - pathLen(start, b)) || (REGIONS[a].value - REGIONS[b].value))[0]
      if (!goal) { tryA(state, sid, { type: 'endTurn' }); break }
      if (start === goal) {
        const enemy = state.regions[start].armies.some(a => state.seats[a.seatId].kingdomId !== k.id)
        if (enemy) { if (!tryA(state, sid, { type: 'battleInit', regionId: start })) { tryA(state, sid, { type: 'endTurn' }); break } continue }
        if (state.regionControl[start] === k.id) { tryA(state, sid, { type: 'endTurn' }); break }
        const rg = REGIONS[start]
        if (rg.kind === 'province') { tryA(state, sid, { type: 'conquer', regionId: start }) }
        else {
          const pay: any[] = []
          for (const a of state.armies.filter(x => x.ownerId === sid && x.alive)) for (const c of a.cards) if (pay.length < rg.value) pay.push({ armyId: a.armyId, cardId: c.id })
          tryA(state, sid, { type: 'conquer', regionId: start, payWithCards: pay })
        }
      } else {
        const step = bfs(start, goal)
        if (!step || !tryA(state, sid, { type: 'moveArmy', armyId: army.armyId, to: step })) { tryA(state, sid, { type: 'endTurn' }); break }
      }
    }
    let inner = 0
    while ((state.pendingEventPlacement || state.pendingPrize) && state.phase !== 'gameover' && inner++ < 8) {
      if (state.pendingEventPlacement) {
        const tgt = firstTarget(state)
        tryA(state, state.activeSeat, { type: 'placeEventTarget', regionId: tgt === null ? '__skip__' : tgt })
      } else if (state.pendingPrize) {
        tryA(state, state.pendingPrize.seatId, { type: 'choosePrize', optionIndex: 0 })
      }
      check(state, `g${g} t${t} pending`)
    }
    check(state, `g${g} t${t}`)
  }
  console.log(`game ${g}: ${state.phase} after ${t} turns`)
}
console.log(fails === 0 ? '✅ STATE INVARIANTS HOLD (checked after every action, no logs)' : `❌ ${fails} invariant violations`)
process.exit(fails ? 1 : 0)
